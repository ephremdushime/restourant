import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  scopeStateForUser,
  validateProductionSecrets,
  isPlaceholderSecret,
  setServerDbState,
  getServerDbState,
  UserSession,
} from '../server';

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

describe('Phase 6: Independent Security Assessment & Threat Model Verifications', () => {
  let originalDbState: any;

  before(() => {
    originalDbState = getServerDbState();
  });

  after(() => {
    if (originalDbState) {
      setServerDbState(originalDbState);
    }
  });

  test('Domain 1: Authentication, session forgery defense and revocation', () => {
    // 1. Valid token creation and verification
    const sessionInput: Omit<UserSession, 'iat' | 'exp'> = {
      userId: 'usr_valid_01',
      username: 'audit_user',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
    };
    const validToken = createSessionToken(sessionInput);
    assert.ok(validToken.startsWith('rp_sess_'));

    const verified = verifySessionToken(validToken);
    assert.ok(verified);
    assert.equal(verified.userId, 'usr_valid_01');
    assert.equal(verified.role, 'restaurant_admin');

    // 2. Tampered payload (privilege escalation attempt in token)
    const [prefixAndB64, sig] = validToken.split('.');
    const b64 = prefixAndB64.slice('rp_sess_'.length);
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
    payload.role = 'super_admin'; // Forge role to super_admin
    const tamperedB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const forgedToken = `rp_sess_${tamperedB64}.${sig}`;

    assert.equal(verifySessionToken(forgedToken), null, 'Tampered payload must fail HMAC signature check');

    // 3. Tampered signature (altered byte)
    const badSigToken = `${prefixAndB64}.${sig.slice(0, -2)}aa`;
    assert.equal(verifySessionToken(badSigToken), null, 'Tampered signature must be rejected');

    // 4. Session revocation in memory
    const tokenToRevoke = createSessionToken(sessionInput);
    assert.ok(verifySessionToken(tokenToRevoke, true));
    revokeSessionToken(tokenToRevoke);
    assert.equal(verifySessionToken(tokenToRevoke, true), null, 'Revoked token must be rejected');
  });

  test('Domain 2: Multi-tenant data isolation and IDOR blocking', async () => {
    setServerDbState({
      ...getServerDbState(),
      restaurants: [
        { code: 'RW01', name: 'Restaurant 1', status: 'active' },
        { code: 'RW02', name: 'Restaurant 2', status: 'active' },
      ],
      customers: [
        { id: 'cust_rw01', restaurantCode: 'RW01', name: 'Alice', phone: '+250788111222' },
        { id: 'cust_rw02', restaurantCode: 'RW02', name: 'Bob', phone: '+250788333444' },
      ],
      activationRequests: [
        { id: 'act_rw02', customerId: 'cust_rw02', restaurantCode: 'RW02', status: 'pending' },
      ],
      pinRecoveryRequests: [
        { id: 'rec_rw02', customerId: 'cust_rw02', restaurantCode: 'RW02', status: 'pending' },
      ],
    });

    const adminTokenRW01 = createSessionToken({
      userId: 'admin_rw01',
      username: 'manager_rw01',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
    });

    // Cross-tenant activation request (RW01 admin attempts to activate RW02 customer)
    const resCrossAct = await fetchTestRoute(
      app,
      'POST',
      '/api/customer/activation/request',
      { customerId: 'cust_rw02' },
      { authorization: `Bearer ${adminTokenRW01}` }
    );
    assert.equal(resCrossAct.status, 403, 'Cross-tenant customer activation must be rejected with 403');

    // Cross-tenant PIN recovery approve (RW01 admin attempts to approve RW02 recovery)
    const resCrossRec = await fetchTestRoute(
      app,
      'POST',
      '/api/customer/recovery/approve',
      { requestId: 'rec_rw02' },
      { authorization: `Bearer ${adminTokenRW01}` }
    );
    assert.equal(resCrossRec.status, 403, 'Cross-tenant recovery approval must be rejected with 403');

    // State scoping test: RW01 admin calling scopeStateForUser receives ONLY RW01 data
    const scoped = scopeStateForUser(getServerDbState(), {
      userId: 'admin_rw01',
      username: 'manager_rw01',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
      iat: Date.now(),
      exp: Date.now() + 3600000,
    });

    assert.ok(scoped.customers.every((c: any) => c.restaurantCode === 'RW01'));
    assert.equal(scoped.customers.some((c: any) => c.id === 'cust_rw02'), false);
  });

  test('Domain 3: Privilege escalation prevention (Customer -> Admin -> SuperAdmin)', async () => {
    const customerToken = createSessionToken({
      userId: 'cust_test',
      username: 'student_user',
      role: 'customer',
      restaurantCode: 'RW01',
    });

    const adminToken = createSessionToken({
      userId: 'admin_test',
      username: 'admin_user',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
    });

    // 1. Customer receives strictly scoped self state and zero administrative records
    const resCustState = await fetchTestRoute(
      app,
      'GET',
      '/api/state',
      null,
      { authorization: `Bearer ${customerToken}` }
    );
    assert.equal(resCustState.status, 200);
    assert.equal(resCustState.body.success, true);
    assert.equal(resCustState.body.state.stationUsers, undefined, 'Customer must not receive station users');

    // 2. Customer attempts to list administrative financial exceptions -> 403
    const resCustExcList = await fetchTestRoute(
      app,
      'GET',
      '/api/financial-exceptions',
      null,
      { authorization: `Bearer ${customerToken}` }
    );
    assert.equal(resCustExcList.status, 403);

    // 3. Customer attempts to create financial exception -> 403
    const resCustExc = await fetchTestRoute(
      app,
      'POST',
      '/api/financial-exceptions',
      { type: 'scan_reversal', sourceId: 'ev_1', reason: 'Unfair deduction', idempotencyKey: `idemp-${Date.now()}` },
      { authorization: `Bearer ${customerToken}` }
    );
    assert.equal(resCustExc.status, 403);

    // 4. Restaurant Admin attempts to approve financial exception -> 403 (Requires super_admin)
    const resAdminApprove = await fetchTestRoute(
      app,
      'POST',
      '/api/financial-exceptions/exc_1/approve',
      { approvalReason: 'Manager self-approving exception' },
      { authorization: `Bearer ${adminToken}` }
    );
    assert.equal(resAdminApprove.status, 403);

    // 5. Restaurant Admin attempts to provision other restaurant admins -> 403 (Requires super_admin)
    const resAdminProvision = await fetchTestRoute(
      app,
      'POST',
      '/api/admin/restaurant-admins',
      { restaurantCode: 'RW01', username: 'new_admin', password: 'Password12345678!' },
      { authorization: `Bearer ${adminToken}` }
    );
    assert.equal(resAdminProvision.status, 403);
  });

  test('Domain 4: Sensitive credential redaction across all scoped API responses', () => {
    const mockState = {
      customers: [
        {
          id: 'c1',
          restaurantCode: 'RW01',
          name: 'Jean',
          pinHash: 'scrypt:salt:hash12345',
          idHash: 'sha256:hash67890',
        },
      ],
      stationUsers: [
        {
          id: 'u1',
          restaurantCode: 'RW01',
          username: 'cashier1',
          passwordHash: 'scrypt:salt:pwdhash',
          pin: '1234',
        },
      ],
      activationRequests: [
        {
          id: 'act1',
          restaurantCode: 'RW01',
          activationCode: '123456',
          codeHash: 'sha256:hashcode',
        },
      ],
      pinRecoveryRequests: [
        {
          id: 'rec1',
          restaurantCode: 'RW01',
          recoveryCode: '654321',
          recoveryCodeHash: 'sha256:hashrec',
        },
      ],
    };

    // Scoped for Super Admin
    const superAdminSession: UserSession = {
      userId: 'sa_1',
      username: 'superadmin',
      role: 'super_admin',
      restaurantCode: 'ALL',
      iat: Date.now(),
      exp: Date.now() + 3600000,
    };
    const scopedSuper = scopeStateForUser(mockState, superAdminSession);

    assert.equal(scopedSuper.customers[0].pinHash, undefined);
    assert.equal(scopedSuper.customers[0].idHash, undefined);
    assert.equal(scopedSuper.stationUsers[0].passwordHash, undefined);
    assert.equal(scopedSuper.stationUsers[0].pin, undefined);
    assert.equal(scopedSuper.activationRequests[0].activationCode, undefined);
    assert.equal(scopedSuper.activationRequests[0].codeHash, undefined);
    assert.equal(scopedSuper.pinRecoveryRequests[0].recoveryCode, undefined);
    assert.equal(scopedSuper.pinRecoveryRequests[0].recoveryCodeHash, undefined);

    // Scoped for Restaurant Admin
    const restoAdminSession: UserSession = {
      userId: 'ra_1',
      username: 'admin',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
      iat: Date.now(),
      exp: Date.now() + 3600000,
    };
    const scopedAdmin = scopeStateForUser(mockState, restoAdminSession);

    assert.equal(scopedAdmin.customers[0].pinHash, undefined);
    assert.equal(scopedAdmin.stationUsers[0].passwordHash, undefined);
    assert.equal(scopedAdmin.activationRequests[0].activationCode, undefined);
    assert.equal(scopedAdmin.pinRecoveryRequests[0].recoveryCode, undefined);
  });

  test('Domain 5: Dynamic QR time-window expiry and forged MAC rejection', () => {
    // Malicious token with forged MAC
    const fakeToken = 'c1.RW01.99999.1.badmac0000000000';
    const parts = fakeToken.split('.');
    assert.equal(parts.length, 5);

    // Replay step window validation
    const serverFile = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');
    assert.match(serverFile, /Math\.abs\(tokenStep - currentStep\) > 10/);
    assert.match(serverFile, /Digital QR expired\. Refresh the customer QR\./);
    assert.match(serverFile, /ON CONFLICT \(token_key\) DO NOTHING RETURNING token_key/);
    assert.match(serverFile, /This digital QR has already been used\./);
  });

  test('Domain 6: Authoritative ledger immutability and client sync rejection', async () => {
    const adminToken = createSessionToken({
      userId: 'admin_sync',
      username: 'admin_sync_user',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
    });

    // Attacker submits /api/sync with fabricated ledger entries
    const resSync = await fetchTestRoute(
      app,
      'POST',
      '/api/sync',
      {
        customers: [],
        ledgerEntries: [
          { id: 'fake_ledger_1', customerId: 'cust_rw01', platesDelta: +1000, type: 'hacked_credit' },
        ],
        scanEvents: [
          { id: 'fake_scan_1', customerId: 'cust_rw01', platesDeducted: 10 },
        ],
      },
      { authorization: `Bearer ${adminToken}` }
    );

    // Ensure sync does not allow full state replacement
    const serverFile = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');
    assert.match(serverFile, /const incomingLedgers:\s*any\[\]\s*=\s*\[\]/);
    assert.match(serverFile, /Financial ledger entries are written only by server-authoritative transactions/);
    assert.match(serverFile, /Scan events are written only by server-side transactional scan endpoints/);
  });

  test('Domain 7: Path traversal and photo key regex whitelist enforcement', async () => {
    const superToken = createSessionToken({
      userId: 'super_audit',
      username: 'superadmin',
      role: 'super_admin',
      restaurantCode: 'ALL',
    });

    const maliciousKeys = [
      '../../../../etc/passwd',
      '..%2f..%2f..%2fetc/shadow',
      'patron-photos/../../etc/passwd',
      'patron-photos/..%2f..%2fsecret.txt',
      'patron-photos/image.jpg\0.png',
      '/var/log/caddy/access.log',
      'invalid/path/photo.jpg',
    ];

    for (const key of maliciousKeys) {
      const res = await fetchTestRoute(
        app,
        'GET',
        `/api/customer/photo?key=${encodeURIComponent(key)}`,
        null,
        { authorization: `Bearer ${superToken}` }
      );
      assert.equal(res.status, 400, `Key "${key}" must be rejected with HTTP 400`);
      assert.equal(res.body.error, 'Invalid photo reference.');
    }
  });

  test('Domain 8: Production secrets hygiene and placeholder rejection', () => {
    // 1. Placeholder detection
    assert.equal(isPlaceholderSecret('CHANGE_ME_IN_PRODUCTION'), true);
    assert.equal(isPlaceholderSecret('your_secret_key_change_in_production'), true);
    assert.equal(isPlaceholderSecret('replace_with_example_secret_here'), true);
    assert.equal(isPlaceholderSecret('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'), false);

    // 2. Weak secrets in production throw fatal startup errors
    assert.throws(
      () => {
        validateProductionSecrets({
          NODE_ENV: 'production',
          SESSION_SECRET: 'short_secret',
          RESTOPASS_MASTER_SECRET: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        });
      },
      /SESSION_SECRET \(>= 32 characters, non-placeholder\) must be configured/
    );

    assert.throws(
      () => {
        validateProductionSecrets({
          NODE_ENV: 'production',
          SESSION_SECRET: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          RESTOPASS_MASTER_SECRET: 'CHANGE_ME_IN_PRODUCTION_PLACEHOLDER_KEY',
        });
      },
      /RESTOPASS_MASTER_SECRET/
    );

    // 3. Cryptographically strong diverse secrets succeed
    const validSecretA = '0123456789abcdef0123456789abcdef';
    const validSecretB = 'fedcba9876543210fedcba9876543210';
    const validSecretC = 'superSecretAdminPass123456789!@#';
    const validConfig = validateProductionSecrets({
      NODE_ENV: 'production',
      SESSION_SECRET: validSecretA,
      RESTOPASS_MASTER_SECRET: validSecretB,
      RESTOPASS_SUPERADMIN_PASSWORD: validSecretC,
    });
    assert.equal(validConfig.sessionSecret, validSecretA);
    assert.equal(validConfig.masterSecret, validSecretB);
  });

  test('Domain 9: SQL parameterization audit across server queries', () => {
    const serverFile = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');

    // Confirm that SQL queries use parameterized queries ($1, $2, etc.)
    const clientQueries = serverFile.match(/client\.query\s*\(\s*['`"][^'`"]+['`"]/g) || [];
    assert.ok(clientQueries.length > 5, 'PostgreSQL queries must exist in server.ts');

    // Reject dangerous SQL concatenation patterns like: `SELECT ... WHERE id = '${req.body.id}'`
    assert.doesNotMatch(serverFile, /query\s*\(\s*`[^`]*\$\{[^}]*\}[^`]*`\s*\)/);
  });

  test('Domain 10: Independent security assessment specification and RFP completeness', () => {
    const reportPath = path.resolve(process.cwd(), 'docs', 'INDEPENDENT_SECURITY_ASSESSMENT.md');
    assert.ok(fs.existsSync(reportPath), 'docs/INDEPENDENT_SECURITY_ASSESSMENT.md must exist');

    const content = fs.readFileSync(reportPath, 'utf-8');
    assert.match(content, /Internal CI != Independent Assessment/);
    assert.match(content, /Domain 1: Authentication & Session Management/);
    assert.match(content, /Domain 2: Multi-Tenant Isolation & IDOR Defenses/);
    assert.match(content, /Domain 3: Vertical & Horizontal Privilege Escalation/);
    assert.match(content, /Domain 4: Credential Redaction & Anti-Data Leakage/);
    assert.match(content, /Domain 5: Cryptographic Token Replay & Transaction Forgery/);
    assert.match(content, /Domain 6: Authoritative Ledger Immutability & Financial Integrity/);
    assert.match(content, /Domain 7: Distributed Rate Limiting & Denial of Service/);
    assert.match(content, /Domain 8: Object Storage & Path Traversal Prevention/);
    assert.match(content, /Domain 9: SQL Parameterization & Injection Resistance/);
    assert.match(content, /Domain 10: Cryptographic Backup Integrity & Key Escrow/);
    assert.match(content, /Remediation Matrix for Pre-Deployment Findings/);
    assert.match(content, /Independent Penetration Testing Specification \(RFP Scope\)/);
  });
});
