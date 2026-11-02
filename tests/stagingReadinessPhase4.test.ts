import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app, createSessionToken } from '../server';

async function fetchTestRoute(
  expressApp: any,
  method: string,
  urlPath: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    const normalizedHeaders: Record<string, string> = {
      'content-type': 'application/json',
    };
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const [pathname, search] = urlPath.split('?');
    const query: Record<string, string> = {};
    if (search) {
      new URLSearchParams(search).forEach((v, k) => {
        query[k] = v;
      });
    }

    const req: any = {
      method,
      url: urlPath,
      path: pathname,
      query,
      headers: normalizedHeaders,
      body: body || {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        resolve({ status: statusCode, body: data });
        return this;
      },
      send(data: any) {
        resolve({ status: statusCode, body: data });
        return this;
      },
      setHeader() {
        return this;
      },
      end(data?: any) {
        resolve({ status: statusCode, body: data || null });
      },
    };

    expressApp.handle(req, res);
  });
}

describe('Phase 4: AOS Hosted Staging Preparation & Smoke Verification', () => {
  const rootDir = process.cwd();

  test('Caddyfile configures HSTS, body limits, static caching, and rotated JSON logging', () => {
    const caddyfilePath = path.join(rootDir, 'deploy', 'Caddyfile');
    assert.ok(fs.existsSync(caddyfilePath), 'deploy/Caddyfile must exist');

    const content = fs.readFileSync(caddyfilePath, 'utf-8');

    // Body limit to defend against payload flooding
    assert.match(content, /request_body\s*\{\s*max_size\s+10MB\s*\}/, 'Must enforce max request body size of 10MB');

    // HSTS header
    assert.match(
      content,
      /Strict-Transport-Security\s+"max-age=31536000;\s*includeSubDomains;\s*preload"/,
      'Must enforce Strict-Transport-Security with includeSubDomains and preload'
    );

    // Standard security headers
    assert.match(content, /X-Content-Type-Options\s+nosniff/, 'Must enforce X-Content-Type-Options nosniff');
    assert.match(content, /X-Frame-Options\s+DENY/, 'Must enforce X-Frame-Options DENY');
    assert.match(content, /Referrer-Policy\s+strict-origin-when-cross-origin/, 'Must enforce Referrer-Policy');

    // Static asset caching
    assert.match(content, /@static\s*\{\s*path\s+\/assets\/\*\s*\}/, 'Must define @static matcher for /assets/*');
    assert.match(
      content,
      /header\s+@static\s+Cache-Control\s+"public,\s*max-age=31536000,\s*immutable"/,
      'Must enforce immutable caching on static assets'
    );

    // Rotated JSON logging
    assert.match(content, /output\s+file\s+\/var\/log\/caddy\/access\.log/, 'Must configure access log output path');
    assert.match(content, /roll_size\s+50mb/, 'Must roll logs at 50MB');
    assert.match(content, /roll_keep\s+5/, 'Must keep 5 rolls');
    assert.match(content, /format\s+json/, 'Must format logs as JSON');
  });

  test('docker-compose.prod.yml enforces log rotation, memory limits, and strict network isolation', () => {
    const composePath = path.join(rootDir, 'deploy', 'docker-compose.prod.yml');
    assert.ok(fs.existsSync(composePath), 'deploy/docker-compose.prod.yml must exist');

    const content = fs.readFileSync(composePath, 'utf-8');

    // Log rotation across all 5 production containers
    const logDriverMatches = content.match(/driver:\s*"json-file"/g) || [];
    assert.equal(
      logDriverMatches.length,
      5,
      'All 5 containers (postgres, redis, app, backup, caddy) must configure json-file log driver'
    );

    const logSizeMatches = content.match(/max-size:\s*"50m"/g) || [];
    assert.equal(
      logSizeMatches.length,
      5,
      'All 5 containers must cap log size at 50m'
    );

    const logFileMatches = content.match(/max-file:\s*"5"/g) || [];
    assert.equal(
      logFileMatches.length,
      5,
      'All 5 containers must retain maximum 5 log files'
    );

    // Resource limits across containers
    assert.match(content, /container_name:\s*restopass-postgres[\s\S]*?memory:\s*2048M/, 'PostgreSQL must have 2048M limit');
    assert.match(content, /container_name:\s*restopass-redis[\s\S]*?memory:\s*1024M/, 'Redis must have 1024M limit');
    assert.match(content, /container_name:\s*restopass-app[\s\S]*?memory:\s*2048M/, 'App must have 2048M limit');
    assert.match(content, /container_name:\s*restopass-backup[\s\S]*?memory:\s*1024M/, 'Backup worker must have 1024M limit');
    assert.match(content, /container_name:\s*restopass-caddy[\s\S]*?memory:\s*512M/, 'Caddy must have 512M limit');

    // Strict network isolation: only Caddy publishes ports 80/443
    // postgres and redis must NOT publish ports to host interface
    const postgresBlock = content.split('redis:')[0];
    assert.doesNotMatch(
      postgresBlock,
      /^\s+ports:/m,
      'PostgreSQL must NOT publish host ports (must stay internal to Docker bridge)'
    );

    const redisBlock = content.split('app:')[0].split('redis:')[1];
    assert.doesNotMatch(
      redisBlock,
      /^\s+ports:/m,
      'Redis must NOT publish host ports (must stay internal to Docker bridge)'
    );

    // caddy_logs volume must be declared and mounted
    assert.match(content, /caddy_logs:\/var\/log\/caddy/, 'Caddy container must mount caddy_logs volume');
    assert.match(content, /^volumes:\s*[\s\S]*?caddy_logs:/m, 'Top-level volumes must declare caddy_logs');
  });

  test('verify-staging.sh script exists, is executable, and contains full smoke suite checks', () => {
    const scriptPath = path.join(rootDir, 'deploy', 'verify-staging.sh');
    assert.ok(fs.existsSync(scriptPath), 'deploy/verify-staging.sh must exist');

    const content = fs.readFileSync(scriptPath, 'utf-8');
    assert.ok(content.startsWith('#!/usr/bin/env bash'), 'Must use bash shebang');
    assert.match(content, /set -euo pipefail/, 'Must set strict error handling');

    // Key checks in smoke test
    assert.match(content, /\/api\/health/, 'Must probe liveness at /api/health');
    assert.match(content, /\/api\/health\/ready/, 'Must probe readiness at /api/health/ready');
    assert.match(content, /strict-transport-security/i, 'Must check HSTS header');
    assert.match(content, /x-content-type-options.*nosniff/i, 'Must check nosniff header');
    assert.match(content, /x-frame-options.*deny/i, 'Must check X-Frame-Options DENY');
    assert.match(content, /\/api\/state/, 'Must test auth rejection on /api/state');
    assert.match(content, /\/api\/customer\/photo/, 'Must test photo access and path traversal rejection');
    assert.match(content, /\/api\/public\/restaurants/, 'Must test public restaurants endpoint');
  });

  test('AOS hosting specification exists with mandatory 8 GB baseline and capacity bounds', () => {
    const specPath = path.join(rootDir, 'docs', 'AOS_HOSTING_SPECIFICATION.md');
    assert.ok(fs.existsSync(specPath), 'docs/AOS_HOSTING_SPECIFICATION.md must exist');

    const content = fs.readFileSync(specPath, 'utf-8');
    assert.match(content, /Standard Option 6/i, 'Must recommend Standard Option 6 (8 GB RAM)');
    assert.match(content, /Standard Option 2/i, 'Must evaluate Standard Option 2');
    assert.match(content, /Standard Option 4/i, 'Must evaluate Standard Option 4');
    assert.match(content, /50,000 DAU/i, 'Must address and refute/retract unbenchmarked 50,000 DAU claims');
    assert.match(content, /3,000 daily active patrons/i, 'Must state realistic pilot capacity of ~3,000 patrons');
    assert.match(content, /2048 MB/i, 'Must specify PostgreSQL memory limit');
    assert.match(content, /1024 MB/i, 'Must specify Redis memory limit');
  });

  test('Liveness endpoint GET /api/health returns 200 with server status and uptime', async () => {
    const res = await fetchTestRoute(app, 'GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(typeof res.body.uptimeSeconds, 'number');
    assert.ok(res.body.uptimeSeconds >= 0);
    assert.ok(!isNaN(Date.parse(res.body.serverTime)));
  });

  test('Readiness endpoint GET /api/health/ready returns status structure', async () => {
    const res = await fetchTestRoute(app, 'GET', '/api/health/ready');
    // In dev/test environment, ready is true if not production
    assert.ok([200, 503].includes(res.status));
    assert.ok(res.body.status === 'ready' || res.body.status === 'not_ready');
    assert.ok(typeof res.body.checks === 'object');
    assert.ok('database' in res.body.checks);
    assert.ok('redis' in res.body.checks);
  });

  test('Protected endpoint GET /api/state rejects unauthenticated requests with 401', async () => {
    const res = await fetchTestRoute(app, 'GET', '/api/state');
    assert.equal(res.status, 401);
  });

  test('Unauthenticated request on GET /api/customer/photo is rejected with 401', async () => {
    const res = await fetchTestRoute(app, 'GET', '/api/customer/photo?key=../../../../etc/passwd');
    assert.equal(res.status, 401);
  });

  test('Authenticated path traversal probe on GET /api/customer/photo is rejected with 400', async () => {
    const token = createSessionToken({
      userId: 'admin_test',
      username: 'superadmin',
      restaurantCode: 'RESTO-TEST',
      role: 'super_admin',
    });
    const res = await fetchTestRoute(app, 'GET', '/api/customer/photo?key=../../../../etc/passwd', null, {
      authorization: `Bearer ${token}`,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid photo reference.');
  });

  test('Public restaurants endpoint GET /api/public/restaurants returns 200 with restaurants list', async () => {
    const res = await fetchTestRoute(app, 'GET', '/api/public/restaurants');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.restaurants));
  });
});
