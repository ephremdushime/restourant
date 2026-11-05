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

test('disabled customer checkout advertises MTN MoMo only', () => {
  const server = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const checkoutRoute = server.slice(
    server.indexOf("app.post('/api/customer/subscription/checkout'"),
    server.indexOf("// POST /api/payments/mobile-money/callback")
  );
  assert.match(checkoutRoute, /PAYMENT_PROVIDER_NOT_CONFIGURED/);
  assert.match(checkoutRoute, /supportedProviders: \['mtn_momo'\]/);
  assert.doesNotMatch(checkoutRoute, /airtel_money|Airtel Money|Airtel/i);
});

test('production customer QR generation uses the authenticated server endpoint', () => {
  const store = fs.readFileSync(path.resolve(process.cwd(), 'src/store/restoStore.ts'), 'utf8');
  const customerView = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/customer/CustomerView.tsx'),
    'utf8'
  );
  assert.match(store, /getServerCustomerPhoneQr/);
  assert.match(store, /fetch\('\/api\/qr\/token\/phone'/);
  assert.match(customerView, /restoStore\.getServerCustomerPhoneQr\(customer\)/);
});

test('server-issued customer QR uses the stored customer key version', () => {
  const server = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const qrRoute = server.slice(
    server.indexOf("app.post('/api/qr/token/phone'"),
    server.indexOf("// POST /api/qr/token/card")
  );
  assert.match(qrRoute, /customerRecord\.keyVersion/);
  assert.doesNotMatch(qrRoute, /typeof keyVersion === 'number' \? keyVersion/);
  assert.match(qrRoute, /customerRecord\.id !== user\.userId/);
});
