import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, PoolClient } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

async function expectUniqueViolation(
  client: PoolClient,
  constraint: string,
  insertSql: string,
  values: unknown[]
): Promise<void> {
  await client.query('SAVEPOINT before_identity_duplicate');
  await assert.rejects(
    client.query(insertSql, values),
    (error: any) => error?.code === '23505' && error?.constraint === constraint
  );
  await client.query('ROLLBACK TO SAVEPOINT before_identity_duplicate');
}

test('PostgreSQL enforces per-restaurant phone, identity-hash and student-number uniqueness', {
  skip: !databaseUrl ? 'TEST_DATABASE_URL is not configured' : false,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    const schema = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/db/schema.sql'),
      'utf8'
    );
    await client.query(schema);

    const restaurantA = `TST_ID_A_${process.pid}`;
    const restaurantB = `TST_ID_B_${process.pid}`;
    await client.query('BEGIN');

    await client.query(
      'INSERT INTO restaurants (code, name, status, data) VALUES ($1, $2, $3, $4), ($5, $6, $3, $7)',
      [
        restaurantA,
        'Identity Test A',
        'active',
        JSON.stringify({ code: restaurantA }),
        restaurantB,
        'Identity Test B',
        JSON.stringify({ code: restaurantB }),
      ]
    );

    const insertCustomer = `
      INSERT INTO customers
        (id, restaurant_code, member_no, name, phone, is_student, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await client.query(insertCustomer, [
      `cust_a_${process.pid}`,
      restaurantA,
      '10001',
      'Test Customer A',
      '+250 788 123 456',
      true,
      JSON.stringify({
        idHash: 'identity-hash-a',
        studentProfile: { registrationNumber: 'UR-2026-001' },
      }),
    ]);

    await expectUniqueViolation(
      client,
      'uq_customers_restaurant_phone_normalized',
      insertCustomer,
      [
        `cust_a_phone_duplicate_${process.pid}`,
        restaurantA,
        '10002',
        'Duplicate Phone',
        '0788-123-456',
        false,
        JSON.stringify({ idHash: 'different-id-hash' }),
      ]
    );

    await expectUniqueViolation(
      client,
      'uq_customers_restaurant_identity_hash',
      insertCustomer,
      [
        `cust_a_id_duplicate_${process.pid}`,
        restaurantA,
        '10003',
        'Duplicate ID',
        '+250 788 999 111',
        false,
        JSON.stringify({ idHash: 'identity-hash-a' }),
      ]
    );

    await expectUniqueViolation(
      client,
      'uq_customers_restaurant_student_number',
      insertCustomer,
      [
        `cust_a_student_duplicate_${process.pid}`,
        restaurantA,
        '10004',
        'Duplicate Student',
        '+250 788 999 222',
        true,
        JSON.stringify({
          idHash: 'identity-hash-student-duplicate',
          studentProfile: { registrationNumber: ' ur-2026-001 ' },
        }),
      ]
    );

    // Identity may be reused by the same person in a different restaurant.
    await client.query(insertCustomer, [
      `cust_b_${process.pid}`,
      restaurantB,
      '20001',
      'Same Person, Different Restaurant',
      '0788 123 456',
      true,
      JSON.stringify({
        idHash: 'identity-hash-a',
        studentProfile: { registrationNumber: 'UR-2026-001' },
      }),
    ]);

    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
});
