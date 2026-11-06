import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dockerAvailable = process.env.CI === 'true' &&
  spawnSync('docker', ['info'], { encoding: 'utf8', stdio: 'ignore' }).status === 0;

function runDocker(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', env, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

test('encrypted PostgreSQL backup can be decrypted and restored into an isolated database', {
  skip: !dockerAvailable || !process.env.TEST_DATABASE_URL
    ? 'CI Docker daemon and TEST_DATABASE_URL are required'
    : false,
}, () => {
  const script = path.resolve(process.cwd(), 'deploy/test-postgres-backup-restore.sh');
  runDocker([
    'run', '--rm', '--network', 'host',
    '-e', 'PGHOST=127.0.0.1',
    '-e', 'PGPORT=5432',
    '-e', 'PGUSER=postgres',
    '-e', 'PGPASSWORD=postgres',
    '-v', `${script}:/test-postgres-backup-restore.sh:ro`,
    'postgres:16-alpine',
    'sh', '-ec', 'apk add --no-cache openssl coreutils; sh /test-postgres-backup-restore.sh',
  ]);
});

test('production Docker Compose boots with PostgreSQL and Redis and survives app restart', {
  skip: !dockerAvailable ? 'CI Docker daemon is required' : false,
}, async () => {
  const project = `restopass-ci-${process.pid}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    POSTGRES_DB: 'restopass_ci',
    POSTGRES_USER: 'restopass_ci',
    POSTGRES_PASSWORD: 'ci-postgres-' + process.pid + '-secret',
    REDIS_PASSWORD: 'ci-redis-' + process.pid + '-secret',
    SESSION_SECRET: 'ci-session-secret-' + process.pid + '-'.repeat(40),
    RESTOPASS_MASTER_SECRET: 'ci-master-secret-' + process.pid + '-'.repeat(40),
    RESTOPASS_SUPERADMIN_PASSWORD: 'ci-super-admin-' + process.pid + '-secret',
    RESTOPASS_RESTAURANT_ADMIN_ACCOUNTS: JSON.stringify({
      RW01: {
        username: 'manager@rw01.test',
        password: 'ci_unique_admin_password_rw01_2026',
      },
    }),
  };
  const composeArgs = ['compose', '-p', project, '-f', 'deploy/docker-compose.prod.yml'];

  const waitForReady = async (): Promise<void> => {
    let lastError = 'No readiness response received';
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch('http://127.0.0.1:3000/api/ready');
        if (response.ok) {
          const body = await response.json() as { status?: string };
          if (body.status === 'ready') return;
          lastError = JSON.stringify(body);
        } else {
          lastError = `HTTP ${response.status}`;
        }
      } catch (error) {
        lastError = String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`Production Compose did not become ready: ${lastError}`);
  };

  try {
    runDocker([...composeArgs, 'up', '-d', '--build'], env);
    await waitForReady();

    const tableCount = runDocker([
      ...composeArgs,
      'exec', '-T', 'postgres', 'sh', '-ec',
      'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema()"',
    ], env);
    assert.ok(Number(tableCount) >= 10, `expected initialized PostgreSQL schema, received ${tableCount} tables`);

    runDocker([...composeArgs, 'restart', 'app'], env);
    await waitForReady();
  } finally {
    const cleanup = spawnSync('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans'], {
      encoding: 'utf8',
      env,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (cleanup.status !== 0) {
      process.stderr.write(cleanup.stderr || cleanup.stdout || 'Docker Compose cleanup failed.\n');
    }
  }
});
