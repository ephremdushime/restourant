import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL approval workflow integration', { skip: !databaseUrl }, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl!;
  const serverModule = await import('../server.ts');
  const adapter = await import('../src/services/db/postgresAdapter.ts');
  assert.equal(await adapter.initPostgres(), true);
  const pool = adapter.getPostgresPool();
  assert.ok(pool);

  const restaurantCode = 'IT' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const stationId = 'station_' + restaurantCode;
  const bossId = 'boss_' + restaurantCode;
  const bossToken = serverModule.createSessionToken({
    userId: bossId, username: 'Integration Boss', role: 'restaurant_admin', restaurantCode,
  });
  const superToken = serverModule.createSessionToken({
    userId: 'super_' + restaurantCode, username: 'Integration Super Admin', role: 'super_admin', restaurantCode: 'ALL',
  });
  const samePrincipalSuperToken = serverModule.createSessionToken({
    userId: bossId, username: 'Same Principal', role: 'super_admin', restaurantCode: 'ALL',
  });

  await pool!.query(
    'INSERT INTO restaurants (code,name,status,data) VALUES ($1,$2,$3,$4)',
    [restaurantCode, 'Approval Integration Test', 'active', JSON.stringify({ code: restaurantCode, name: 'Approval Integration Test', status: 'active' })]
  );
  serverModule.setServerDbState({
    restaurants: [{ code: restaurantCode, name: 'Approval Integration Test', status: 'active' }],
    scanPoints: [{ id: stationId, restaurantCode, status: 'active', isPaired: true, name: 'Integration Scanner' }],
    packages: [{ id: 'pkg_test_60', restaurantCode, name: '60 plates', platesCount: 60, priceRwf: 60000 }],
    customers: [], pendingApprovals: [], ledgerEntries: [], payments: [], auditLogs: [], stationUsers: [],
  });

  const httpServer = createServer(serverModule.app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = 'http://127.0.0.1:' + address.port;
  const post = async (path: string, token: string, body: unknown) => {
    const response = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as any };
  };
  const registration = (suffix: string, plates: number, phone: string) => ({
    name: 'Integration Customer ' + suffix, phone, idType: 'Student ID', idNumber: 'TEST-ID-' + suffix,
    isStudent: true, studentProfile: { registrationNumber: 'TEST-REG-' + suffix },
    platesRequested: plates, amountRwf: plates * 1000, paymentMethod: 'mtn_momo',
    paymentReference: 'TEST-REF-' + suffix, stationId,
  });

  try {
    await t.test('super-admin provisions tenant-specific administrator credentials', async () => {
      const password = 'Tenant-Admin-Strong-Password-2026';
      const created = await post('/api/admin/restaurant-admins', superToken, {
        restaurantCode,
        username: 'tenant.owner',
        displayName: 'Tenant Owner',
        password,
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.administrator.username, 'tenant.owner');
      const stored = await pool!.query(
        'SELECT password_hash,status FROM restaurant_admins WHERE id=$1',
        [created.body.administrator.id]
      );
      assert.equal(stored.rowCount, 1);
      assert.match(stored.rows[0].password_hash, /^scrypt\$/);
      assert.notEqual(stored.rows[0].password_hash, password);

      const login = await post('/api/auth/login', '', {
        role: 'restaurant_admin', restaurantCode, username: 'tenant.owner', password,
      });
      assert.equal(login.status, 200);
      assert.equal(login.body.user.username, 'tenant.owner');

      const invalidLogin = await post('/api/auth/login', '', {
        role: 'restaurant_admin', restaurantCode, username: 'tenant.owner', password: 'incorrect-password',
      });
      assert.equal(invalidLogin.status, 401);

      const blocked = await fetch(baseUrl + '/api/admin/restaurant-admins/' + created.body.administrator.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + superToken },
        body: JSON.stringify({ status: 'blocked' }),
      });
      assert.equal(blocked.status, 200);
      const sessionVersion = await pool!.query(
        'SELECT session_version FROM restaurant_admins WHERE id=$1',
        [created.body.administrator.id]
      );
      assert.equal(sessionVersion.rows[0].session_version, 2);
      const blockedLogin = await post('/api/auth/login', '', {
        role: 'restaurant_admin', restaurantCode, username: 'tenant.owner', password,
      });
      assert.equal(blockedLogin.status, 401);
    });

    await t.test('registration creates customer and approval atomically; grace usage reconciles once', async () => {
      const created = await post('/api/approvals/registration', bossToken, registration('A', 60, '+250780000001'));
      assert.equal(created.status, 201);
      assert.equal(created.body.success, true);
      const customerId = created.body.customer.id;
      const approvalId = created.body.approval.id;
      const persisted = await pool!.query(
        'SELECT c.id, a.id AS approval_id FROM customers c JOIN pending_approvals a ON a.customer_id=c.id WHERE c.id=$1 AND a.id=$2',
        [customerId, approvalId]
      );
      assert.equal(persisted.rowCount, 1);
      await pool!.query(
        "UPDATE pending_approvals SET data=jsonb_set(data,'{gracePlatesConsumed}','2'::jsonb) WHERE id=$1",
        [approvalId]
      );
      const attempts = await Promise.all([
        post('/api/approvals/' + approvalId + '/approve', bossToken, {}),
        post('/api/approvals/' + approvalId + '/approve', bossToken, {}),
      ]);
      assert.deepEqual(attempts.map((x) => x.status).sort(), [200, 409]);
      const approved = attempts.find((x) => x.status === 200)!;
      assert.equal(approved.body.success, true);
      assert.equal(approved.body.ledgerEntries.length, 2);
      assert.equal(approved.body.ledgerEntries[0].platesDelta, 60);
      assert.equal(approved.body.ledgerEntries[1].platesDelta, -2);
      const counts = await pool!.query(
        "SELECT (SELECT COUNT(*) FROM ledger_entries WHERE customer_id=$1) AS ledger_count, (SELECT COUNT(*) FROM payments WHERE customer_id=$1) AS payment_count",
        [customerId]
      );
      assert.equal(Number(counts.rows[0].ledger_count), 2);
      assert.equal(Number(counts.rows[0].payment_count), 1);
    });

    await t.test('high-value approval cannot credit before a different principal co-signs', async () => {
      const created = await post('/api/approvals/registration', bossToken, registration('B', 150, '+250780000002'));
      assert.equal(created.status, 201);
      const customerId = created.body.customer.id;
      const approvalId = created.body.approval.id;
      const staged = await post('/api/approvals/' + approvalId + '/approve', bossToken, {});
      assert.equal(staged.status, 200);
      assert.equal(staged.body.awaitingCoSign, true);
      const before = await pool!.query('SELECT COUNT(*)::int AS count FROM ledger_entries WHERE customer_id=$1', [customerId]);
      assert.equal(before.rows[0].count, 0);
      const samePrincipal = await post('/api/approvals/' + approvalId + '/cosign', samePrincipalSuperToken, {});
      assert.equal(samePrincipal.status, 403);
      const signed = await post('/api/approvals/' + approvalId + '/cosign', superToken, {});
      assert.equal(signed.status, 200);
      const after = await pool!.query('SELECT COUNT(*)::int AS count FROM ledger_entries WHERE customer_id=$1', [customerId]);
      assert.equal(after.rows[0].count, 1);
    });

    await t.test('provisional existing-customer top-up persists without changing paid balance', async () => {
      const created = await post('/api/approvals/registration', bossToken, registration('C', 20, '+250780000003'));
      assert.equal(created.status, 201);
      const approved = await post('/api/approvals/' + created.body.approval.id + '/approve', bossToken, {});
      assert.equal(approved.status, 200);
      const customerId = created.body.customer.id;
      await pool!.query(`UPDATE customers SET data=jsonb_set(jsonb_set(data,'{hasCustomPin}','true'::jsonb),'{activationStatus}',to_jsonb('active'::text)) WHERE id=$1`, [customerId]);
      const pending = await post('/api/approvals/topup', bossToken, {
        customerId, platesRequested: 25, amountRwf: 25000, paymentMethod: 'cash',
        paymentReference: 'TOPUP-REF-C', stationId,
      });
      assert.equal(pending.status, 201);
      assert.equal(pending.body.approval.type, 'balance_topup');
      const before = await pool!.query('SELECT COUNT(*)::int AS count FROM ledger_entries WHERE customer_id=$1', [customerId]);
      assert.equal(before.rows[0].count, 1);
      await pool!.query("UPDATE pending_approvals SET data=jsonb_set(data,'{gracePlatesConsumed}','1'::jsonb) WHERE id=$1", [pending.body.approval.id]);
      const committed = await post('/api/approvals/' + pending.body.approval.id + '/approve', bossToken, {});
      assert.equal(committed.status, 200);
      assert.equal(committed.body.ledgerEntries.length, 2);
      const after = await pool!.query('SELECT data FROM customers WHERE id=$1', [customerId]);
      assert.equal(after.rows[0].data.activationStatus, 'active');
    });

    await t.test('concurrent duplicate top-up references create one pending payment only', async () => {
      const created = await post('/api/approvals/registration', bossToken, registration('TOPUP-DUP', 10, '+250780000077'));
      assert.equal(created.status, 201);
      const approved = await post('/api/approvals/' + created.body.approval.id + '/approve', bossToken, {});
      assert.equal(approved.status, 200);
      const customerId = created.body.customer.id;
      await pool!.query(
        `UPDATE customers SET data=jsonb_set(jsonb_set(data,'{hasCustomPin}','true'::jsonb),'{activationStatus}',to_jsonb('active'::text)) WHERE id=$1`,
        [customerId]
      );
      const paymentReference = 'TOPUP-DUP-REF-' + restaurantCode;
      const request = {
        customerId, platesRequested: 15, amountRwf: 15000,
        paymentMethod: 'cash', paymentReference, stationId,
      };
      const [first, second] = await Promise.all([
        post('/api/approvals/topup', bossToken, request),
        post('/api/approvals/topup', bossToken, request),
      ]);
      assert.deepEqual([first.status, second.status].sort(), [201, 409]);
      const rows = await pool!.query(
        `SELECT COUNT(*)::int AS count FROM pending_approvals WHERE restaurant_code=$1 AND data->>'paymentReference'=$2`,
        [restaurantCode, paymentReference]
      );
      assert.equal(rows.rows[0].count, 1);
    });

    await t.test('concurrent duplicate identity registration is serialized', async () => {
      const payloadA = registration('D1', 10, '+250780000004');
      const payloadB = { ...registration('D2', 10, '+250780000004'), paymentReference: 'TEST-REF-D2', idNumber: payloadA.idNumber };
      const [a, b] = await Promise.all([
        post('/api/approvals/registration', bossToken, payloadA),
        post('/api/approvals/registration', bossToken, payloadB),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    });

    await t.test('browser sync cannot mint subscription entitlements or payment records', async () => {
      const sync = await post('/api/sync', bossToken, {
        fullState: {
          customerSubscriptions: [{
            id: 'forged-subscription-' + restaurantCode,
            customerId: 'forged-customer',
            restaurantCode,
            status: 'active',
            plan: 'monthly',
            expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          }],
          studentSubscriptionPayments: [{
            id: 'forged-payment-' + restaurantCode,
            customerId: 'forged-customer',
            restaurantCode,
            amountRwf: 500,
            status: 'successful',
          }],
        },
      });
      assert.equal(sync.status, 200);
      const state = serverModule.getServerDbState();
      assert.equal((state.customerSubscriptions || []).length, 0);
      assert.equal((state.studentSubscriptionPayments || []).length, 0);
    });

    await t.test('restaurant admins cannot alter license or tenant lifecycle fields through sync', async () => {
      const before = serverModule.getServerDbState();
      serverModule.setServerDbState({
        ...before,
        restaurants: (before.restaurants || []).map((restaurant: any) =>
          restaurant.code === restaurantCode
            ? { ...restaurant, status: 'active', currentLicenseId: 'trusted-license', planId: 'trusted-plan' }
            : restaurant
        ),
      });
      const sync = await post('/api/sync', bossToken, {
        fullState: {
          restaurants: [{
            code: restaurantCode,
            name: 'Updated Restaurant Display Name',
            status: 'inactive',
            currentLicenseId: 'attacker-selected-license',
            planId: 'unlicensed-plan',
          }],
        },
      });
      assert.equal(sync.status, 200);
      const updated = serverModule.getServerDbState().restaurants.find((item: any) => item.code === restaurantCode);
      assert.equal(updated.name, 'Updated Restaurant Display Name');
      assert.equal(updated.status, 'active');
      assert.equal(updated.currentLicenseId, 'trusted-license');
      assert.equal(updated.planId, 'trusted-plan');
    });

    await t.test('station accounts are hashed, persisted and bound to their assigned station', async () => {
      const staff = {
        id: 'staff_' + restaurantCode,
        restaurantCode,
        branchId: 'branch_' + restaurantCode,
        branchName: 'Integration Branch',
        stationId,
        stationName: 'Integration Scanner',
        name: 'Integration Staff',
        username: 'integration.cashier',
        phone: '+250780000099',
        role: 'stand_staff',
        status: 'active',
        passwordHash: 'A-unique-strong-staff-password-2026',
        pin: '83917462',
        createdAt: new Date().toISOString(),
      };
      const sync = await post('/api/sync', bossToken, { fullState: { stationUsers: [staff] } });
      assert.equal(sync.status, 200);
      const stored = await pool!.query('SELECT data FROM station_users WHERE id=$1', [staff.id]);
      assert.equal(stored.rowCount, 1);
      assert.match(stored.rows[0].data.passwordHash, /^scrypt\$/);
      assert.match(stored.rows[0].data.pin, /^scrypt\$/);
      assert.notEqual(stored.rows[0].data.passwordHash, staff.passwordHash);
      const login = await post('/api/auth/login', '', {
        role: 'stand_staff', username: staff.username, password: staff.passwordHash,
        restaurantCode, stationId,
      });
      assert.equal(login.status, 200);
      assert.equal(login.body.user.stationId, stationId);
      const wrongStation = await post('/api/auth/login', '', {
        role: 'stand_staff', username: staff.username, password: staff.passwordHash,
        restaurantCode, stationId: 'other_station',
      });
      assert.equal(wrongStation.status, 403);

      const blockedSync = await post('/api/sync', bossToken, {
        fullState: { stationUsers: [{ ...staff, status: 'blocked' }] },
      });
      assert.equal(blockedSync.status, 200);
      const staleSession = await fetch(baseUrl + '/api/auth/session', {
        headers: { Authorization: 'Bearer ' + login.body.token },
      });
      assert.equal(staleSession.status, 401);
      const reactivated = await post('/api/sync', bossToken, {
        fullState: { stationUsers: [{ ...staff, status: 'active' }] },
      });
      assert.equal(reactivated.status, 200);
      assert.equal(serverModule.getServerDbState().stationUsers.find((item: any) => item.id === staff.id).sessionVersion, 3);
    });

    await t.test('concurrent duplicate scanner requests commit one meal deduction', async () => {
      const staffLogin = await post('/api/auth/login', '', {
        role: 'stand_staff',
        username: 'integration.cashier',
        password: 'A-unique-strong-staff-password-2026',
        restaurantCode,
        stationId,
      });
      assert.equal(staffLogin.status, 200);
      const staffToken = staffLogin.body.token;
      const customerId = 'scan_customer_' + restaurantCode;
      // Keep the test member sequence above the registration workflow's 28490 baseline.
      const memberNo = '999999';
      const licenseId = 'license_' + restaurantCode;
      const planId = 'plan_' + restaurantCode;
      const currentState = serverModule.getServerDbState();
      serverModule.setServerDbState({
        ...currentState,
        restaurants: (currentState.restaurants || []).map((restaurant: any) =>
          restaurant.code === restaurantCode
            ? { ...restaurant, status: 'active', currentLicenseId: licenseId, planId }
            : restaurant
        ),
        licenses: [...(currentState.licenses || []), {
          id: licenseId, restaurantCode, status: 'active',
          validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        }],
        plans: [...(currentState.plans || []), {
          id: planId, terms: { servingWindowMinutes: 120, plateLimitPerWindow: 3 },
        }],
        customers: [...(currentState.customers || []), {
          id: customerId, restaurantCode, memberNo, name: 'Scanner Integration Customer',
          cardStatus: 'active', cardVersion: 1, keyVersion: 1,
          activationStatus: 'active', provisionalStatus: 'approved',
          gracePlatesConsumed: 0, photoUrl: '',
        }],
      });
      const customerData = {
        id: customerId, restaurantCode, memberNo, name: 'Scanner Integration Customer',
        cardStatus: 'active', cardVersion: 1, keyVersion: 1,
        activationStatus: 'active', provisionalStatus: 'approved',
        gracePlatesConsumed: 0, photoUrl: '',
      };
      await pool!.query(
        'INSERT INTO customers (id, restaurant_code, member_no, name, card_status, card_version, key_version, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [customerId, restaurantCode, memberNo, 'Scanner Integration Customer', 'active', 1, 1, JSON.stringify(customerData)]
      );
      await pool!.query(
        'INSERT INTO ledger_entries (id, restaurant_code, customer_id, type, plates_delta, idempotency_key, timestamp, data) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)',
        ['initial_' + customerId, restaurantCode, customerId, 'topup', 3, 'initial_' + customerId, JSON.stringify({ platesDelta: 3 })]
      );
      const card = await post('/api/qr/token/card', bossToken, { restaurantCode, memberNo, cardVersion: 1 });
      assert.equal(card.status, 200);
      const idempotencyKey = 'scan_' + restaurantCode + '_same_request';
      const body = { payload: card.body.token, stationId, idempotencyKey };
      const [first, retry] = await Promise.all([
        post('/api/scans/consume', staffToken, body),
        post('/api/scans/consume', staffToken, body),
      ]);
      assert.deepEqual([first.status, retry.status], [200, 200]);
      assert.deepEqual(first.body, retry.body);
      assert.equal(first.body.accepted, true);
      const counts = await pool!.query(
        'SELECT (SELECT COUNT(*)::int FROM scan_events WHERE customer_id=$1) AS scans, (SELECT COUNT(*)::int FROM ledger_entries WHERE customer_id=$1) AS ledger, (SELECT COUNT(*)::int FROM scan_requests WHERE customer_id=$1) AS requests',
        [customerId]
      );
      assert.equal(counts.rows[0].scans, 1);
      assert.equal(counts.rows[0].ledger, 2);
      assert.equal(counts.rows[0].requests, 1);
      const altered = await post('/api/scans/consume', staffToken, {
        ...body, payload: 'c1.' + restaurantCode + '.OTHER.1.invalid',
      });
      assert.equal(altered.status, 403);
    });


    await t.test('two-person financial exception workflows post compensating entries exactly once', async () => {
      const makeCustomer = async (id: string, memberNo: string) => {
        const data = { id, restaurantCode, memberNo, name: id, cardStatus: 'active', cardVersion: 1, keyVersion: 1 };
        await pool!.query(
          'INSERT INTO customers (id,restaurant_code,member_no,name,card_status,data) VALUES ($1,$2,$3,$4,$5,$6)',
          [id, restaurantCode, memberNo, id, 'active', JSON.stringify(data)]
        );
      };
      const requestException = (type: string, sourceId: string, idempotencyKey: string) =>
        post('/api/financial-exceptions', bossToken, {
          type, sourceId, reason: 'Integration test verified source transaction and supporting evidence.',
          idempotencyKey,
        });
      const approveException = (id: string, payoutReference?: string) =>
        post('/api/financial-exceptions/' + id + '/approve', superToken, {
          approvalReason: 'Independent supervisor reviewed the source and supporting evidence.',
          payoutReference,
        });

      const refundCustomer = 'refund_customer_' + restaurantCode;
      await makeCustomer(refundCustomer, 'RF' + restaurantCode);
      const paymentId = 'payment_refund_' + restaurantCode;
      const payment = { id: paymentId, customerId: refundCustomer, customerName: 'Refund Customer',
        memberNo: 'RF' + restaurantCode, platesAdded: 10, amountRwf: 10000, paymentMethod: 'cash',
        reference: 'CASH-REFUND-' + restaurantCode };
      await pool!.query('INSERT INTO payments (id,restaurant_code,customer_id,amount_rwf,data) VALUES ($1,$2,$3,$4,$5)',
        [paymentId, restaurantCode, refundCustomer, 10000, JSON.stringify(payment)]);
      const purchaseId = 'purchase_refund_' + restaurantCode;
      await pool!.query(
        "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,amount_rwf,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'purchase',10,10000,$4,NOW(),$5)",
        [purchaseId, restaurantCode, refundCustomer, 'purchase-refund-' + restaurantCode,
          JSON.stringify({ id: purchaseId, paymentId, timestamp: new Date().toISOString(), platesDelta: 10 })]
      );
      const refundRequest = await requestException('cash_refund', paymentId, 'refund-request-' + restaurantCode);
      assert.equal(refundRequest.status, 201, JSON.stringify(refundRequest.body));
      const refundApproval = await approveException(refundRequest.body.exception.id, 'CASH-PAYOUT-' + restaurantCode);
      assert.equal(refundApproval.status, 200);
      const refundLedger = await pool!.query(
        "SELECT plates_delta FROM ledger_entries WHERE customer_id=$1 AND type='reversal'",
        [refundCustomer]
      );
      assert.deepEqual(refundLedger.rows.map((x: any) => Number(x.plates_delta)), [-10]);
      const refundedPayment = await pool!.query('SELECT data FROM payments WHERE id=$1', [paymentId]);
      assert.equal(refundedPayment.rows[0].data.refundStatus, 'refunded');
      const duplicateRefund = await requestException('cash_refund', paymentId, 'refund-request-second-' + restaurantCode);
      assert.equal(duplicateRefund.status, 409);

      const scanCustomer = 'scan_reverse_customer_' + restaurantCode;
      await makeCustomer(scanCustomer, 'SR' + restaurantCode);
      const scanId = 'scan_reverse_' + restaurantCode;
      const scanTimestamp = new Date().toISOString();
      const scanData = { id: scanId, customerId: scanCustomer, scanPointId: stationId,
        timestamp: scanTimestamp, platesDeducted: 1, status: 'approved', isGracePlate: false };
      await pool!.query(
        "INSERT INTO scan_events (id,restaurant_code,customer_id,station_id,status,data) VALUES ($1,$2,$3,$4,'approved',$5)",
        [scanId, restaurantCode, scanCustomer, stationId, JSON.stringify(scanData)]
      );
      await pool!.query(
        "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'scan',-1,$4,$5,$6)",
        ['scan-ledger-' + restaurantCode, restaurantCode, scanCustomer, 'scan-ledger-' + restaurantCode,
          scanTimestamp, JSON.stringify({ timestamp: scanTimestamp, scanPointId: stationId })]
      );
      const scanRequest = await requestException('scan_reversal', scanId, 'scan-reversal-' + restaurantCode);
      assert.equal(scanRequest.status, 201);
      const samePrincipalAttempt = await post('/api/financial-exceptions/' + scanRequest.body.exception.id + '/approve', samePrincipalSuperToken, {
        approvalReason: 'A requester must never approve their own financial exception.',
      });
      assert.equal(samePrincipalAttempt.status, 403);
      const scanApproved = await approveException(scanRequest.body.exception.id);
      assert.equal(scanApproved.status, 200);
      const scanAfter = await pool!.query('SELECT status FROM scan_events WHERE id=$1', [scanId]);
      assert.equal(scanAfter.rows[0].status, 'undone');
      const scanReversal = await pool!.query(
        "SELECT plates_delta FROM ledger_entries WHERE customer_id=$1 AND type='reversal'",
        [scanCustomer]
      );
      assert.deepEqual(scanReversal.rows.map((x: any) => Number(x.plates_delta)), [1]);

      const sender = 'transfer_sender_' + restaurantCode;
      const recipient = 'transfer_recipient_' + restaurantCode;
      await makeCustomer(sender, 'TS' + restaurantCode);
      await makeCustomer(recipient, 'TR' + restaurantCode);
      const transferId = 'transfer_reverse_' + restaurantCode;
      const transfer = { id: transferId, senderCustomerId: sender, recipientCustomerId: recipient,
        plates: 5, status: 'completed' };
      await pool!.query('INSERT INTO transfers (id,restaurant_code,sender_customer_id,recipient_customer_id,plates,data) VALUES ($1,$2,$3,$4,5,$5)',
        [transferId, restaurantCode, sender, recipient, JSON.stringify(transfer)]);
      await pool!.query(
        "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'transfer_out',-5,$4,NOW(),$5),($6,$2,$7,'transfer_in',5,$8,NOW(),$9)",
        ['transfer-out-' + restaurantCode, restaurantCode, sender, 'transfer-out-' + restaurantCode,
          JSON.stringify({ platesDelta: -5 }), 'transfer-in-' + restaurantCode, recipient,
          'transfer-in-' + restaurantCode, JSON.stringify({ platesDelta: 5 })]
      );
      const transferRequest = await requestException('transfer_reversal', transferId, 'transfer-reversal-' + restaurantCode);
      assert.equal(transferRequest.status, 201);
      const transferApproved = await approveException(transferRequest.body.exception.id);
      assert.equal(transferApproved.status, 200);
      const transferAfter = await pool!.query('SELECT data FROM transfers WHERE id=$1', [transferId]);
      assert.equal(transferAfter.rows[0].data.status, 'reversed');
      const balances = await pool!.query(
        'SELECT customer_id,COALESCE(SUM(plates_delta),0)::int AS balance FROM ledger_entries WHERE customer_id IN ($1,$2) GROUP BY customer_id',
        [sender, recipient]
      );
      assert.deepEqual(balances.rows.map((x: any) => Number(x.balance)).sort(), [0, 0]);

    });

    await t.test('second-plate and photo-check actions are server-authoritative and idempotent', async () => {
      const staffToken = serverModule.createSessionToken({
        userId: 'staff_' + restaurantCode, username: 'Integration Scanner Operator',
        role: 'stand_staff', restaurantCode, stationId,
      });
      const secondCustomer = 'second_plate_customer_' + restaurantCode;
      const secondMember = 'SP' + restaurantCode;
      const secondData = { id: secondCustomer, restaurantCode, memberNo: secondMember, name: 'Second Plate Customer', cardStatus: 'active' };
      await pool!.query('INSERT INTO customers (id,restaurant_code,member_no,name,card_status,data) VALUES ($1,$2,$3,$4,$5,$6)',
        [secondCustomer, restaurantCode, secondMember, 'Second Plate Customer', 'active', JSON.stringify(secondData)]);
      await pool!.query(
        "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'purchase',10,$4,NOW(),$5),($6,$2,$3,'scan',-1,$7,NOW(),$8)",
        ['second-purchase-' + restaurantCode, restaurantCode, secondCustomer, 'second-purchase-' + restaurantCode,
          JSON.stringify({ platesDelta: 10 }), 'second-scan-' + restaurantCode,
          JSON.stringify({ timestamp: new Date().toISOString(), scanPointId: stationId })]
      );
      const secondScanId = 'scan_' + restaurantCode + '_second';
      const secondEvent = { id: secondScanId, restaurantCode, customerId: secondCustomer, memberNo: secondMember,
        scanPointId: stationId, timestamp: new Date().toISOString(), platesDeducted: 1,
        status: 'approved', photoCheckRequired: false, photoCheckResult: 'none', isGracePlate: false };
      await pool!.query(
        "INSERT INTO scan_events (id,restaurant_code,customer_id,station_id,status,data) VALUES ($1,$2,$3,$4,'approved',$5)",
        [secondScanId, restaurantCode, secondCustomer, stationId, JSON.stringify(secondEvent)]);
      const secondKey = 'second-plate-' + restaurantCode;
      const second = await post('/api/scans/' + secondScanId + '/second-plate', staffToken, { idempotencyKey: secondKey });
      assert.equal(second.status, 200, JSON.stringify(second.body));
      assert.equal(second.body.scanEvent.platesDeducted, 2);
      const duplicateSecond = await post('/api/scans/' + secondScanId + '/second-plate', staffToken, { idempotencyKey: secondKey });
      assert.equal(duplicateSecond.status, 200);
      assert.equal(duplicateSecond.body.idempotent, true);
      const secondLedger = await pool!.query("SELECT COUNT(*)::int AS count FROM ledger_entries WHERE customer_id=$1 AND type='extra'", [secondCustomer]);
      assert.equal(secondLedger.rows[0].count, 1);

      const photoCustomer = 'photo_customer_' + restaurantCode;
      const photoMember = 'PH' + restaurantCode;
      const photoData = { id: photoCustomer, restaurantCode, memberNo: photoMember, name: 'Photo Customer', cardStatus: 'active' };
      await pool!.query('INSERT INTO customers (id,restaurant_code,member_no,name,card_status,data) VALUES ($1,$2,$3,$4,$5,$6)',
        [photoCustomer, restaurantCode, photoMember, 'Photo Customer', 'active', JSON.stringify(photoData)]);
      const photoTimestamp = new Date().toISOString();
      await pool!.query(
        "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'purchase',10,$4,NOW(),$5),($6,$2,$3,'scan',-1,$7,$8,$9)",
        ['photo-purchase-' + restaurantCode, restaurantCode, photoCustomer, 'photo-purchase-' + restaurantCode,
          JSON.stringify({ platesDelta: 10 }), 'photo-scan-ledger-' + restaurantCode,
          photoTimestamp, JSON.stringify({ timestamp: photoTimestamp, scanPointId: stationId })]
      );
      const photoScanId = 'scan_' + restaurantCode + '_photo';
      const photoEvent = { id: photoScanId, restaurantCode, customerId: photoCustomer, memberNo: photoMember,
        scanPointId: stationId, timestamp: photoTimestamp, platesDeducted: 1,
        status: 'approved', photoCheckRequired: true, photoCheckReason: 'random_sample',
        photoCheckResult: 'none', isGracePlate: false };
      await pool!.query(
        "INSERT INTO scan_events (id,restaurant_code,customer_id,station_id,status,data) VALUES ($1,$2,$3,$4,'approved',$5)",
        [photoScanId, restaurantCode, photoCustomer, stationId, JSON.stringify(photoEvent)]);
      const photoMatch = await post('/api/scans/' + photoScanId + '/photo-check', staffToken, {
        result: 'matched', idempotencyKey: 'photo-match-' + restaurantCode,
      });
      assert.equal(photoMatch.status, 200, JSON.stringify(photoMatch.body));
      assert.equal(photoMatch.body.scanEvent.photoCheckResult, 'matched');
      const repeatedPhoto = await post('/api/scans/' + photoScanId + '/photo-check', staffToken, {
        result: 'rejected', idempotencyKey: 'photo-reject-again-' + restaurantCode,
      });
      assert.equal(repeatedPhoto.status, 409);
      const photoRejections = await pool!.query("SELECT COUNT(*)::int AS count FROM ledger_entries WHERE customer_id=$1 AND type='reversal'", [photoCustomer]);
      assert.equal(photoRejections.rows[0].count, 0);

      const rejectedCustomer = 'photo_rejected_customer_' + restaurantCode;
      const rejectedMember = 'PR' + restaurantCode;
      const rejectedData = { id: rejectedCustomer, restaurantCode, memberNo: rejectedMember, name: 'Rejected Photo Customer', cardStatus: 'active' };
      await pool!.query('INSERT INTO customers (id,restaurant_code,member_no,name,card_status,data) VALUES ($1,$2,$3,$4,$5,$6)',
        [rejectedCustomer, restaurantCode, rejectedMember, 'Rejected Photo Customer', 'active', JSON.stringify(rejectedData)]);
      const rejectedTimestamp = new Date().toISOString();
      const rejectedScanId = 'scan_' + restaurantCode + '_photo_rejected';
      const rejectedEvent = { id: rejectedScanId, restaurantCode, customerId: rejectedCustomer, memberNo: rejectedMember,
        scanPointId: stationId, timestamp: rejectedTimestamp, platesDeducted: 1,
        status: 'approved', photoCheckRequired: true, photoCheckReason: 'random_sample',
        photoCheckResult: 'none', isGracePlate: false };
      await pool!.query(
        "INSERT INTO ledger_entries (id,restaurant_code,customer_id,type,plates_delta,idempotency_key,timestamp,data) VALUES ($1,$2,$3,'scan',-1,$4,$5,$6)",
        ['rejected-photo-ledger-' + restaurantCode, restaurantCode, rejectedCustomer, 'rejected-photo-ledger-' + restaurantCode,
          rejectedTimestamp, JSON.stringify({ timestamp: rejectedTimestamp, scanPointId: stationId })]);
      await pool!.query(
        "INSERT INTO scan_events (id,restaurant_code,customer_id,station_id,status,data) VALUES ($1,$2,$3,$4,'approved',$5)",
        [rejectedScanId, restaurantCode, rejectedCustomer, stationId, JSON.stringify(rejectedEvent)]);
      const photoReject = await post('/api/scans/' + rejectedScanId + '/photo-check', staffToken, {
        result: 'rejected', reason: 'Photo did not match presenting patron.',
        idempotencyKey: 'photo-reject-' + restaurantCode,
      });
      assert.equal(photoReject.status, 200, JSON.stringify(photoReject.body));
      assert.equal(photoReject.body.reversed, true);
      assert.equal(photoReject.body.scanEvent.status, 'rejected_photo');
      const rejectedLedger = await pool!.query("SELECT plates_delta FROM ledger_entries WHERE customer_id=$1 AND type='reversal'", [rejectedCustomer]);
      assert.deepEqual(rejectedLedger.rows.map((row: any) => Number(row.plates_delta)), [1]);

      const crossStationToken = serverModule.createSessionToken({
        userId: 'other_staff_' + restaurantCode, username: 'Other Station Operator',
        role: 'stand_staff', restaurantCode, stationId: 'other_station',
      });
      const forbiddenSecond = await post('/api/scans/' + secondScanId + '/second-plate', crossStationToken, {
        idempotencyKey: 'cross-station-' + restaurantCode,
      });
      assert.equal(forbiddenSecond.status, 403);
    });

    await t.test('rejection atomically locks a provisional new customer', async () => {
      const created = await post('/api/approvals/registration', bossToken, registration('E', 15, '+250780000005'));
      assert.equal(created.status, 201);
      const rejected = await post('/api/approvals/' + created.body.approval.id + '/reject', bossToken, { reason: 'Provider statement does not show this deposit.' });
      assert.equal(rejected.status, 200);
      const persisted = await pool!.query('SELECT card_status,data FROM customers WHERE id=$1', [created.body.customer.id]);
      assert.equal(persisted.rows[0].card_status, 'locked');
      assert.equal(persisted.rows[0].data.provisionalStatus, 'rejected');
    });
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    await pool!.query('DELETE FROM financial_exception_requests WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM scan_requests WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM scan_events WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM used_tokens WHERE station_id=$1', [stationId]);
    await pool!.query('DELETE FROM balance_checkpoints WHERE customer_id IN (SELECT id FROM customers WHERE restaurant_code=$1)', [restaurantCode]);
    await pool!.query('DELETE FROM restaurant_admins WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM audit_logs WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM station_users WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM payments WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM ledger_entries WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM pending_approvals WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM customers WHERE restaurant_code=$1', [restaurantCode]);
    await pool!.query('DELETE FROM restaurants WHERE code=$1', [restaurantCode]);
    await adapter.closePostgres();
  }
});
