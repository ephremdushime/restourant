import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';

const server = fs.readFileSync('server.ts', 'utf8');
const schema = fs.readFileSync('src/services/db/schema.sql', 'utf8');

test('customer transfers are disabled by default and require a customer session', () => {
  assert.match(server, /RESTOPASS_CUSTOMER_TRANSFERS_ENABLED !== 'true'/);
  assert.match(server, /app\.post\('\/api\/customer\/transfers'.*?requireAuth\(\['customer'\]\)/s);
  assert.match(server, /customer-transfer:' \+ user\.restaurantCode \+ ':' \+ idempotencyKey/);
  assert.match(server, /SELECT id,member_no,name,card_status FROM customers WHERE restaurant_code=\$1 AND member_no=\$2/);
  assert.match(server, /INSUFFICIENT_BALANCE/);
  assert.match(schema, /uq_transfer_idempotency/);
  assert.match(server, /CUSTOMER_PLATE_TRANSFER/);
});

test('transfer implementation locks both customers and commits both ledger sides atomically', () => {
  assert.match(server, /ORDER BY id FOR UPDATE/);
  assert.match(server, /transfer_out/);
  assert.match(server, /transfer_in/);
  assert.match(server, /transfer:' \+ transferId \+ ':debit/);
  assert.match(server, /transfer:' \+ transferId \+ ':credit/);
  assert.match(server, /await client\.query\('COMMIT'\);\s*return res\.status\(201\)/);
  assert.match(schema, /CONSTRAINT chk_transfer_distinct_customers CHECK \(sender_customer_id <> recipient_customer_id\)/);
});

test('supervisor overrides require separate requester and super-admin approval and are disabled by default', () => {
  assert.match(server, /RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED !== 'true'/);
  assert.match(server, /requireAuth\(\['stand_staff','restaurant_admin'\]\)/);
  assert.match(server, /requireAuth\(\['super_admin'\]\)/);
  assert.match(server, /requester cannot approve their own override/i);
  assert.match(server, /status='consumed',consumed_at=NOW\(\),consumed_scan_id=\$2/);
  assert.match(server, /SUPERVISOR_OVERRIDE_CONSUMED/);
  assert.match(schema, /uq_scan_supervisor_override_key/);
  assert.match(schema, /expires_at TIMESTAMPTZ NOT NULL/);
});

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL customer transfers and supervisor overrides live integration', { skip: !databaseUrl }, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl!;
  process.env.RESTOPASS_CUSTOMER_TRANSFERS_ENABLED = 'true';
  process.env.RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED = 'true';

  const serverModule = await import('../server.ts');
  const adapter = await import('../src/services/db/postgresAdapter.ts');
  assert.equal(await adapter.initPostgres(), true);
  const pool = adapter.getPostgresPool();
  assert.ok(pool);

  const rCode1 = 'TR' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const rCode2 = 'TR' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const stationId = 'station_' + rCode1;

  for (const rc of [rCode1, rCode2]) {
    await pool!.query(
      'INSERT INTO restaurants (code,name,status,data) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [rc, 'Transfer Test ' + rc, 'active', JSON.stringify({ code: rc, name: 'Transfer Test ' + rc, status: 'active' })]
    );
  }

  const licenseFixtures = [rCode1, rCode2].map((restaurantCode) => ({
    id: 'license_' + restaurantCode,
    restaurantCode,
    planId: 'plan_' + restaurantCode,
    validUntil: new Date(Date.now() + 365 * 86400000).toISOString(),
  }));
  for (const license of licenseFixtures) {
    await pool!.query(
      'INSERT INTO licenses (id,restaurant_code,plan_id,valid_until,data) VALUES ($1,$2,$3,$4,$5)',
      [license.id, license.restaurantCode, license.planId, license.validUntil, JSON.stringify({ ...license, status: 'active' })]
    );
    await pool!.query(
      "UPDATE restaurants SET data=data || jsonb_build_object('currentLicenseId',$2::text,'planId',$3::text) WHERE code=$1",
      [license.restaurantCode, license.id, license.planId]
    );
    await pool!.query(
      "INSERT INTO restaurant_subscriptions (id,restaurant_code,status,price_rwf,current_period_start,current_period_end) VALUES ($1,$2,'active',60000,NOW(),$3)",
      ['sub_' + license.restaurantCode, license.restaurantCode, license.validUntil]
    );
  }

  serverModule.setServerDbState({
    restaurants: [
      { code: rCode1, name: 'Transfer Test ' + rCode1, status: 'active', currentLicenseId: licenseFixtures[0].id, planId: licenseFixtures[0].planId },
      { code: rCode2, name: 'Transfer Test ' + rCode2, status: 'active', currentLicenseId: licenseFixtures[1].id, planId: licenseFixtures[1].planId },
    ],
    scanPoints: [
      { id: stationId, restaurantCode: rCode1, status: 'active', isPaired: true, name: 'Transfer Station 1' },
    ],
    studentSubscriptionSettings: { enabled: false },
    licenses: licenseFixtures.map((license) => ({ ...license, status: 'active' })),
    plans: licenseFixtures.map((license) => ({ id: license.planId, terms: { servingWindowMinutes: 120, plateLimitPerWindow: 3 } })),
    customers: [], pendingApprovals: [], ledgerEntries: [], payments: [], auditLogs: [], stationUsers: [],
  });

  const custA_id = 'cust_a_' + rCode1;
  const custA_member = '10001';
  const custB_id = 'cust_b_' + rCode1;
  const custB_member = '10002';
  const custC_id = 'cust_c_' + rCode2;
  const custC_member = '20001';

  await pool!.query(
    `INSERT INTO customers (id, restaurant_code, member_no, name, card_status, is_student, data)
     VALUES ($1,$2,$3,$4,'active',true,$5),
            ($6,$7,$8,$9,'active',true,$10),
            ($11,$12,$13,$14,'active',true,$15)`,
    [
      custA_id, rCode1, custA_member, 'Customer A', JSON.stringify({ id: custA_id, restaurantCode: rCode1, memberNo: custA_member, name: 'Customer A', cardStatus: 'active' }),
      custB_id, rCode1, custB_member, 'Customer B', JSON.stringify({ id: custB_id, restaurantCode: rCode1, memberNo: custB_member, name: 'Customer B', cardStatus: 'active' }),
      custC_id, rCode2, custC_member, 'Customer C', JSON.stringify({ id: custC_id, restaurantCode: rCode2, memberNo: custC_member, name: 'Customer C', cardStatus: 'active' }),
    ]
  );

  // Seed Customer A with 10 plates via ledger_entries
  await pool!.query(
    `INSERT INTO ledger_entries (id, restaurant_code, customer_id, type, plates_delta, idempotency_key, timestamp, data)
     VALUES ($1,$2,$3,'purchase',10,$4,NOW(),$5)`,
    [
      'led_seed_' + custA_id, rCode1, custA_id, 'idemp_seed_' + custA_id,
      JSON.stringify({ id: 'led_seed_' + custA_id, customerId: custA_id, platesDelta: 10, type: 'purchase' }),
    ]
  );

  const tokenCustA = serverModule.createSessionToken({
    userId: custA_id, username: custA_member, role: 'customer', restaurantCode: rCode1,
  });
  const tokenStaff = serverModule.createSessionToken({
    userId: 'staff_' + rCode1, username: 'operator1', role: 'stand_staff', restaurantCode: rCode1, stationId,
  });
  const tokenBoss = serverModule.createSessionToken({
    userId: 'boss_' + rCode1, username: 'boss1', role: 'restaurant_admin', restaurantCode: rCode1,
  });
  const tokenSuper = serverModule.createSessionToken({
    userId: 'super_admin_principal', username: 'superadmin', role: 'super_admin', restaurantCode: 'ALL',
  });
  const tokenSuperSameAsStaff = serverModule.createSessionToken({
    userId: 'staff_' + rCode1, username: 'impersonating_super', role: 'super_admin', restaurantCode: 'ALL',
  });

  const httpServer = createServer(serverModule.app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = 'http://127.0.0.1:' + address.port;

  const post = async (path: string, token: string, body: unknown) => {
    const res = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  const getCardPayload = async (memberNo: string) => {
    const issued = await post('/api/qr/token/card', tokenStaff, { restaurantCode: rCode1, memberNo });
    assert.equal(issued.status, 200, JSON.stringify(issued.body));
    return issued.body.token as string;
  };

  try {
    // 1. Cross-restaurant transfer rejection
    await t.test('rejects transfer between different restaurants', async () => {
      const res = await post('/api/customer/transfers', tokenCustA, {
        recipientMemberNo: custC_member,
        plates: 3,
        idempotencyKey: 'idemp_cross_' + Date.now(),
      });
      assert.equal(res.status, 404);
      assert.match(res.body.error, /Recipient was not found or is not active in this restaurant/i);
    });

    // 2. Transfer to self rejection
    await t.test('rejects transfer to self', async () => {
      const res = await post('/api/customer/transfers', tokenCustA, {
        recipientMemberNo: custA_member,
        plates: 2,
        idempotencyKey: 'idemp_self_' + Date.now(),
      });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /cannot transfer plates to yourself/i);
    });

    // 3. Insufficient balance rejection
    await t.test('rejects transfer when balance is insufficient', async () => {
      const res = await post('/api/customer/transfers', tokenCustA, {
        recipientMemberNo: custB_member,
        plates: 15,
        idempotencyKey: 'idemp_insuf_' + Date.now(),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'INSUFFICIENT_BALANCE');
    });

    // 4. Concurrency: Two simultaneous transfers attempting to spend the same balance
    await t.test('concurrent transfers overspending balance: exactly one commits and one fails', async () => {
      const p1 = post('/api/customer/transfers', tokenCustA, {
        recipientMemberNo: custB_member,
        plates: 6,
        idempotencyKey: 'idemp_race_1_' + Date.now(),
      });
      const p2 = post('/api/customer/transfers', tokenCustA, {
        recipientMemberNo: custB_member,
        plates: 6,
        idempotencyKey: 'idemp_race_2_' + Date.now(),
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      const statuses = [r1.status, r2.status].sort();
      assert.deepEqual(statuses, [201, 409]);

      const failed = r1.status === 409 ? r1 : r2;
      assert.equal(failed.body.code, 'INSUFFICIENT_BALANCE');

      const balA = await pool!.query('SELECT COALESCE(SUM(plates_delta),0)::int as bal FROM ledger_entries WHERE customer_id=$1', [custA_id]);
      const balB = await pool!.query('SELECT COALESCE(SUM(plates_delta),0)::int as bal FROM ledger_entries WHERE customer_id=$1', [custB_id]);
      assert.equal(Number(balA.rows[0].bal), 4);
      assert.equal(Number(balB.rows[0].bal), 6);
    });

    // 5. Idempotency: Duplicate request returns identical response without re-debiting
    await t.test('idempotency: retrying identical transfer returns 200 without second deduction', async () => {
      const key = 'idemp_repeat_' + Date.now();
      const first = await post('/api/customer/transfers', tokenCustA, {
        recipientMemberNo: custB_member,
        plates: 2,
        idempotencyKey: key,
      });
      assert.equal(first.status, 201);
      assert.equal(first.body.transfer.plates, 2);

      const repeat = await post('/api/customer/transfers', tokenCustA, {
        recipientMemberNo: custB_member,
        plates: 2,
        idempotencyKey: key,
      });
      assert.equal(repeat.status, 200);
      assert.equal(repeat.body.idempotent, true);
      assert.equal(repeat.body.transfer.id, first.body.transfer.id);

      const conflict = await post('/api/customer/transfers', tokenCustA, {
        recipientMemberNo: custB_member,
        plates: 1,
        idempotencyKey: key,
      });
      assert.equal(conflict.status, 409);
      assert.match(conflict.body.error, /already bound to a different transfer/i);

      const balA = await pool!.query('SELECT COALESCE(SUM(plates_delta),0)::int as bal FROM ledger_entries WHERE customer_id=$1', [custA_id]);
      const balB = await pool!.query('SELECT COALESCE(SUM(plates_delta),0)::int as bal FROM ledger_entries WHERE customer_id=$1', [custB_id]);
      assert.equal(Number(balA.rows[0].bal), 2);
      assert.equal(Number(balB.rows[0].bal), 8);
    });

    // 6. Supervisor Overrides: Request and approval authority
    await t.test('supervisor overrides: unauthorized approvers and self-approval are rejected', async () => {
      const key = 'idemp_sov_' + Date.now();
      const reqRes = await post('/api/scans/supervisor-overrides', tokenStaff, {
        customerId: custA_id,
        stationId,
        reason: 'Serving window limit exceeded during sports event lunch',
        idempotencyKey: key,
      });
      assert.equal(reqRes.status, 201);
      assert.equal(reqRes.body.override.status, 'pending');
      const overrideId = reqRes.body.override.id;

      const staffApprove = await post(`/api/scans/supervisor-overrides/${overrideId}/approve`, tokenStaff, {
        approvalReason: 'Staff self-approving emergency serving',
      });
      assert.equal(staffApprove.status, 403);

      const bossApprove = await post(`/api/scans/supervisor-overrides/${overrideId}/approve`, tokenBoss, {
        approvalReason: 'Boss attempting supervisor override approval',
      });
      assert.equal(bossApprove.status, 403);

      const selfSuperApprove = await post(`/api/scans/supervisor-overrides/${overrideId}/approve`, tokenSuperSameAsStaff, {
        approvalReason: 'Requester with super-admin session approving own request',
      });
      assert.equal(selfSuperApprove.status, 403);
      assert.match(selfSuperApprove.body.error, /Requester cannot approve their own override/i);

      const genuineApprove = await post(`/api/scans/supervisor-overrides/${overrideId}/approve`, tokenSuper, {
        approvalReason: 'Authorized by campus dining director for valid tournament exception',
      });
      assert.equal(genuineApprove.status, 200);
      assert.equal(genuineApprove.body.override.status, 'approved');
    });

    // 7. Expired override rejection and repeated consumption guard
    // Seed three recent successful meals on a different station so the next scan
    // must present an override, without triggering the consecutive-same-station guard.
    for (let i = 1; i <= 3; i += 1) {
      const event = { id: 'prior_a_' + rCode1 + '_' + i, customerId: custA_id, platesDeducted: 1, status: 'approved' };
      await pool!.query(
        "INSERT INTO scan_events (id,restaurant_code,customer_id,station_id,status,data,created_at) VALUES ($1,$2,$3,$4,'approved',$5,NOW()-($6::int * INTERVAL '1 minute'))",
        [event.id, rCode1, custA_id, 'historical_station_' + rCode1, JSON.stringify(event), 10 + i]
      );
    }
    await t.test('supervisor overrides: expired override cannot be consumed', async () => {
      const key = 'idemp_sov_exp_' + Date.now();
      const reqRes = await post('/api/scans/supervisor-overrides', tokenStaff, {
        customerId: custA_id,
        stationId,
        reason: 'Authorized tournament participant second meal in window',
        idempotencyKey: key,
      });
      const overrideId = reqRes.body.override.id;
      await post(`/api/scans/supervisor-overrides/${overrideId}/approve`, tokenSuper, {
        approvalReason: 'Super admin approval for tournament exception',
      });

      await pool!.query('UPDATE scan_supervisor_overrides SET expires_at=NOW()-INTERVAL \'5 minutes\' WHERE id=$1', [overrideId]);

      const payload = await getCardPayload(custA_member);
      const scanRes = await post('/api/scans/consume', tokenStaff, {
        payload,
        stationId,
        supervisorOverrideId: overrideId,
        idempotencyKey: 'scan_idemp_exp_' + Date.now(),
      });
      assert.equal(scanRes.status, 403, JSON.stringify(scanRes.body));
      assert.equal(scanRes.body.code, 'SUPERVISOR_OVERRIDE_INVALID');
    });

    // 8. Concurrent attempts to consume the same supervisor override
    // Give Customer B an available meal balance and three recent meals, so the
    // one-time override is the only path to a successful next scan.
    await pool!.query(
      "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'purchase',10,$4,NOW(),$5)",
      ['led_seed_' + custB_id, rCode1, custB_id, 'idemp_seed_' + custB_id,
       JSON.stringify({ id: 'led_seed_' + custB_id, customerId: custB_id, platesDelta: 10, type: 'purchase' })]
    );
    for (let i = 1; i <= 3; i += 1) {
      const event = { id: 'prior_b_' + rCode1 + '_' + i, customerId: custB_id, platesDeducted: 1, status: 'approved' };
      await pool!.query(
        "INSERT INTO scan_events (id,restaurant_code,customer_id,station_id,status,data,created_at) VALUES ($1,$2,$3,$4,'approved',$5,NOW()-($6::int * INTERVAL '1 minute'))",
        [event.id, rCode1, custB_id, 'historical_station_' + rCode1, JSON.stringify(event), 10 + i]
      );
    }
    await t.test('concurrent consumption of same override: exactly one succeeds and second is rejected', async () => {
      const key = 'idemp_sov_concur_' + Date.now();
      const reqRes = await post('/api/scans/supervisor-overrides', tokenStaff, {
        customerId: custB_id,
        stationId,
        reason: 'Authorized second lunch plate for double-shift lab student',
        idempotencyKey: key,
      });
      const overrideId = reqRes.body.override.id;
      await post(`/api/scans/supervisor-overrides/${overrideId}/approve`, tokenSuper, {
        approvalReason: 'Super admin approval for lab student double shift',
      });

      const payload = await getCardPayload(custB_member);
      const pScan1 = post('/api/scans/consume', tokenStaff, {
        payload,
        stationId,
        supervisorOverrideId: overrideId,
        idempotencyKey: 'scan_race_1_' + Date.now(),
      });
      const pScan2 = post('/api/scans/consume', tokenStaff, {
        payload,
        stationId,
        supervisorOverrideId: overrideId,
        idempotencyKey: 'scan_race_2_' + Date.now(),
      });

      const [s1, s2] = await Promise.all([pScan1, pScan2]);
      const statuses = [s1.status, s2.status].sort();
      assert.deepEqual(statuses, [200, 403]);
      const failedScan = s1.status === 403 ? s1 : s2;
      assert.equal(failedScan.body.code, 'SUPERVISOR_OVERRIDE_INVALID');

      const repeatScan = await post('/api/scans/consume', tokenStaff, {
        payload,
        stationId,
        supervisorOverrideId: overrideId,
        idempotencyKey: 'scan_race_3_' + Date.now(),
      });
      assert.equal(repeatScan.status, 403);
      assert.equal(repeatScan.body.code, 'SUPERVISOR_OVERRIDE_INVALID');
    });

  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    delete process.env.RESTOPASS_CUSTOMER_TRANSFERS_ENABLED;
    delete process.env.RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED;
  }
});
