import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const customerFiles = [
  'src/components/customer/CustomerView.tsx',
  'src/components/customer/StudentSelfRegistrationView.tsx',
];

test('customer-facing payment interfaces offer MTN MoMo only, not Airtel Money', () => {
  for (const relativePath of customerFiles) {
    const content = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
    assert.doesNotMatch(content, /airtel_money|Airtel Money|Airtel/i, relativePath);
  }
});

test('customer subscription checkout defaults to the MTN MoMo provider', () => {
  const customerView = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/customer/CustomerView.tsx'),
    'utf8'
  );
  assert.match(customerView, /const momoProvider = 'mtn_momo' as const/);
});
