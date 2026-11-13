import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function computeCustomerPinHash(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin.trim(), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${derived}`;
}

function hashStaffSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

const dataDir = path.resolve(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'db.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let existingDb: any = {};
if (fs.existsSync(dbFile)) {
  try {
    existingDb = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch {
    existingDb = {};
  }
}

// 1. Restaurant
const restaurants = [
  {
    code: 'RW01',
    name: 'Kigali Central Campus Diner',
    address: 'KN 7 Ave, Kigali',
    city: 'Kigali',
    country: 'Rwanda',
    phone: '+250788100100',
    email: 'admin@rw01.rw',
    status: 'active',
    currency: 'RWF',
    ratePerPlate: 1500,
    dailyGraceMealsLimit: 3,
    currentLicenseId: 'lic_rw01_annual',
    activeBranchesCount: 1,
    activeStationsCount: 1,
  },
];

// 2. SaaS License
const licenses = [
  {
    id: 'lic_rw01_annual',
    restaurantCode: 'RW01',
    type: 'annual',
    status: 'active',
    maxActiveCustomers: 5000,
    maxStations: 10,
    issuedAt: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-12-31T23:59:59.000Z',
  },
];

// 3. Restaurant Subscription
const restaurantSubscriptions = [
  {
    id: 'sub_rw01',
    restaurantCode: 'RW01',
    status: 'active',
    currentPeriodEnd: '2027-12-31T23:59:59.000Z',
    renewalGraceDays: 7,
  },
];

// 4. Branch
const branches = [
  {
    id: 'branch_rw01_kigali',
    restaurantCode: 'RW01',
    name: 'Main Campus Dining Hall',
    code: 'KGL-MAIN',
    address: 'KN 7 Ave Campus Central',
    city: 'Kigali',
    status: 'active',
    isMainBranch: true,
  },
];

// 5. Scan Point (POS Scanner)
const scanPoints = [
  {
    id: 'sp_1',
    restaurantCode: 'RW01',
    branchId: 'branch_rw01_kigali',
    branchName: 'Main Campus Dining Hall',
    name: 'Stand 1 - Main Buffet Line',
    deviceModel: 'RestoPass Terminal Pro (Browser POS)',
    deviceType: 'laptop_scanner',
    pairingCode: 'PAIR-RW01-01',
    pairingKey: 'PAIR-8841',
    isPaired: true,
    status: 'active',
    lastHeartbeat: new Date().toISOString(),
  },
  {
    id: 'station_rw01',
    restaurantCode: 'RW01',
    branchId: 'branch_rw01_kigali',
    branchName: 'Main Campus Dining Hall',
    name: 'Station 1 - Main Buffet Scanner',
    deviceModel: 'RestoPass Terminal Pro (Browser POS)',
    deviceType: 'laptop_scanner',
    pairingCode: 'PAIR-RW01-02',
    pairingKey: 'PAIR01',
    isPaired: true,
    status: 'active',
    lastHeartbeat: new Date().toISOString(),
  },
];

// 6. Station Users (Scanner Operators)
const stationUsers = [
  {
    id: 'staff_rw01_scanner1',
    restaurantCode: 'RW01',
    branchId: 'branch_rw01_kigali',
    branchName: 'Main Campus Dining Hall',
    stationId: 'sp_1',
    stationName: 'Stand 1 - Main Buffet Line',
    name: 'Jean Bosco (Scanner)',
    username: 'station1',
    phone: '+250788222333',
    role: 'stand_staff',
    status: 'active',
    authType: 'both',
    pinHash: hashStaffSecret('123456'),
    passwordHash: hashStaffSecret('StaffPass2026KGL!'),
    sessionVersion: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'staff_rw01_eric',
    restaurantCode: 'RW01',
    branchId: 'branch_rw01_kigali',
    branchName: 'Main Campus Dining Hall',
    stationId: 'sp_1',
    stationName: 'Stand 1 - Main Buffet Line',
    name: 'Eric Nshimiyimana',
    username: 'eric.buffet',
    phone: '+250788111222',
    role: 'stand_staff',
    status: 'active',
    authType: 'both',
    pinHash: hashStaffSecret('123456'),
    passwordHash: hashStaffSecret('StaffPass2026KGL!'),
    sessionVersion: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'staff_rw01_station_rw01',
    restaurantCode: 'RW01',
    branchId: 'branch_rw01_kigali',
    branchName: 'Main Campus Dining Hall',
    stationId: 'station_rw01',
    stationName: 'Station 1 - Main Buffet Scanner',
    name: 'Operator 1',
    username: 'operator1',
    phone: '+250788444555',
    role: 'stand_staff',
    status: 'active',
    authType: 'both',
    pinHash: hashStaffSecret('123456'),
    passwordHash: hashStaffSecret('StaffPass2026KGL!'),
    sessionVersion: 1,
    createdAt: new Date().toISOString(),
  },
];

// 7. Customers
const customer1PinHash = computeCustomerPinHash('123456');
const customer2PinHash = computeCustomerPinHash('123456');

const customers = [
  {
    id: 'cust_rw01_10001',
    memberNo: '10001',
    restaurantCode: 'RW01',
    branchId: 'branch_rw01_kigali',
    branchName: 'Main Campus Dining Hall',
    name: 'Jean Claude Nshimiyimana',
    phone: '+250788111222',
    photoUrl: '/src/assets/images/avatar_student_male_1790979380050.jpg',
    idType: 'national_id',
    idHash: 'hash_jean_10001',
    idNumberMasked: '1 1999 8 0045678 1 23',
    occupation: 'Computer Science Student',
    isStudent: true,
    cardVersion: 1,
    cardStatus: 'active',
    activationStatus: 'activated',
    provisionalStatus: 'approved',
    registrationStatus: 'approved',
    receptionPaymentStatus: 'confirmed',
    hasCustomPin: true,
    pinHash: customer1PinHash,
    failedLoginAttempts: 0,
    keyVersion: 1,
    gracePlatesConsumed: 0,
    gracePlatesRemaining: 0,
    lastLoginAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'cust_rw01_10002',
    memberNo: '10002',
    restaurantCode: 'RW01',
    branchId: 'branch_rw01_kigali',
    branchName: 'Main Campus Dining Hall',
    name: 'Aline Mukamana',
    phone: '+250788333444',
    photoUrl: '/src/assets/images/avatar_student_male_1790979380050.jpg',
    idType: 'student_id',
    idHash: 'hash_aline_10002',
    idNumberMasked: 'STU-2024-8841',
    occupation: 'Business Administration Student',
    isStudent: true,
    cardVersion: 1,
    cardStatus: 'active',
    activationStatus: 'activated',
    provisionalStatus: 'approved',
    registrationStatus: 'approved',
    receptionPaymentStatus: 'confirmed',
    hasCustomPin: true,
    pinHash: customer2PinHash,
    failedLoginAttempts: 0,
    keyVersion: 1,
    gracePlatesConsumed: 0,
    gracePlatesRemaining: 0,
    lastLoginAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
];

// 8. Prepaid Ledger Entries (Meal Plates)
const ledgerEntries = [
  {
    id: 'ledg_rw01_10001_init',
    customerId: 'cust_rw01_10001',
    restaurantCode: 'RW01',
    type: 'purchase',
    platesDelta: 25,
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    staffId: 'admin_RW01',
    reason: 'Prepaid Monthly Semester Pass (25 plates)',
    reference: 'PAY-SEMESTER-10001',
  },
  {
    id: 'ledg_rw01_10002_init',
    customerId: 'cust_rw01_10002',
    restaurantCode: 'RW01',
    type: 'purchase',
    platesDelta: 10,
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    staffId: 'admin_RW01',
    reason: 'Prepaid 10 Meal Package',
    reference: 'PAY-PKG10-10002',
  },
];

// 9. Customer Subscriptions (Platform Access)
const customerSubscriptions = [
  {
    id: 'csub_rw01_10001',
    customerId: 'cust_rw01_10001',
    memberNo: '10001',
    restaurantCode: 'RW01',
    status: 'active',
    planName: 'Standard Student Pass',
    priceRwf: 500,
    currency: 'RWF',
    currentPeriodStart: new Date(Date.now() - 86400000).toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
  },
  {
    id: 'csub_rw01_10002',
    customerId: 'cust_rw01_10002',
    memberNo: '10002',
    restaurantCode: 'RW01',
    status: 'active',
    planName: 'Standard Student Pass',
    priceRwf: 500,
    currency: 'RWF',
    currentPeriodStart: new Date(Date.now() - 86400000).toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
  },
];

// Assemble updated state
const updatedDb = {
  ...existingDb,
  restaurants,
  licenses,
  restaurantSubscriptions,
  branches,
  scanPoints,
  stationUsers,
  customers,
  ledgerEntries,
  customerSubscriptions,
  studentSubscriptionSettings: {
    enabled: false,
    priceRwf: 500,
    currency: 'RWF',
    promoAccessEnabled: false,
    promoMessage: 'Welcome to RestoPass Kigali Central',
    period: 'monthly',
    graceDays: 3,
    requireForTransfers: false,
    requireForDashboard: false,
    updatedAt: new Date().toISOString(),
  },
};

fs.writeFileSync(dbFile, JSON.stringify(updatedDb, null, 2), 'utf8');
console.log('Successfully seeded browser test accounts into data/db.json!');
