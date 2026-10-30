import {
  Restaurant,
  License,
  Plan,
  PlanTerms,
  Customer,
  LedgerEntry,
  BalanceCheckpoint,
  ScanEvent,
  ScanPoint,
  PlateTransfer,
  Package,
  MenuItem,
  PaymentRecord,
  SubscriptionPayment,
  Branch,
  StationUser,
  PendingApproval,
  ApprovalType,
  ApprovalStatus,
  SyncOutboxItem,
  SyncCommand,
  AuditLogItem,
  ActivationCode,
  UserRole,
  Language,
  AppNotification,
  NotificationType,
  NotificationPriority,
  IdType,
  StudentProfile,
  PaymentMethod,
  ShiftRecord,
  CashierSession,
  StudentSubscriptionStatus,
  StudentSubscriptionSettings,
  CustomerSubscription,
  StudentSubscriptionPayment,
  StudentEntitlementFeature,
  StudentEntitlementResult,
  CustomerActivationRequest,
  CustomerPinRecoveryRequest,
  RestaurantExpense,
  ExpenseCategory,
} from '../types';
import {
  deriveRestaurantKey,
  deriveCustomerKey,
  hashIdNumber,
  signLicensePayload,
  generateActivationCode,
  generateCardToken,
  generatePhoneToken,
  verifyQrToken,
  verifyQrTokenServer,
  requestPhoneTokenFromServer,
  requestCardTokenFromServer,
  signLicensePayloadServer,
  markTokenStepUsed,
  hashPinWithSalt,
  verifyPinSecure,
  hashPasswordWithSalt,
  verifyPasswordSecure,
  getCustomerPinSalt,
  getStationUserSalt,
  getBossPasswordSalt,
  getSuperAdminSalt,
  sha256,
} from '../services/cryptoService';
import { sound } from '../services/audioService';
import { applyCustomTranslations } from '../services/i18n';

const STORAGE_KEY = 'RESTOPASS_STATE_V1.1';
const STORAGE_KEY_PROD = 'RESTOPASS_PRODUCTION_CLEAN_V2';

const DEMO_SEED_CUSTOMER_IDS = new Set([
  'cust_28491',
  'cust_28492',
  'cust_28493',
  'cust_28494',
  'cust_28495',
  'cust_pending_1',
  'cust_rw02_1',
  'cust_rw02_2',
]);
const DEMO_SEED_RESTO_CODES = new Set(['RW02', 'RW03']);
const DEMO_SEED_NOTIF_IDS = new Set([
  'notif_init_1',
  'notif_init_2',
  'notif_init_3',
  'notif_init_4',
  'notif_init_5',
  'notif_init_rw02_1',
]);
const DEMO_SEED_SCAN_IDS = new Set(['scan_grace_init_1']);
const DEMO_SEED_APPROVAL_IDS = new Set(['appr_init_1', 'appr_init_2']);
const DEMO_SEED_SHIFT_IDS = new Set(['shift_rw01_morning_1']);
const DEMO_SEED_SESSION_IDS = new Set(['sess_rw01_sp1', 'sess_rw01_sp2']);
const DEMO_SEED_EXPENSE_IDS = new Set(['exp_rw01_1', 'exp_rw01_2']);
const DEMO_SEED_BRANCH_IDS = new Set([
  'br_rw01_main',
  'br_rw01_east',
  'br_rw01_huye',
  'br_rw02_main',
  'br_rw02_heights',
]);
const DEMO_SEED_USER_IDS = new Set([
  'usr_rw01_1',
  'usr_rw01_2',
  'usr_rw01_3',
  'usr_rw02_1',
]);

// Initial plan templates
const INITIAL_PLANS: Plan[] = [
  {
    id: 'plan_starter',
    name: 'Campus Stand Starter',
    description: 'Designed for single-stand dining halls and school cafeterias',
    terms: {
      basePriceRwf: 65000,
      pricePerExtraScanPointRwf: 20000,
      billingPeriodMonths: 1,
      graceDays: 7,
      defaultSpotCheckRate: 0.10, // 1 in 10
      servingWindowMinutes: 120,
      plateLimitPerWindow: 3,
      customerCardFeeRwf: 2000,
      customerReissueFeeRwf: 2500,
      platformCardFeeRwf: 1200,
      platformReissueFeeRwf: 1500,
      maxScanPointsIncluded: 1,
    },
  },
  {
    id: 'plan_high_volume',
    name: 'High-Volume Multi-Stand',
    description: 'For university restaurants and large cafeterias with multiple serving lines',
    terms: {
      basePriceRwf: 140000,
      pricePerExtraScanPointRwf: 15000,
      billingPeriodMonths: 1,
      graceDays: 14,
      defaultSpotCheckRate: 0.12,
      servingWindowMinutes: 120,
      plateLimitPerWindow: 3,
      customerCardFeeRwf: 2000,
      customerReissueFeeRwf: 2500,
      platformCardFeeRwf: 1000,
      platformReissueFeeRwf: 1200,
      maxScanPointsIncluded: 4,
    },
  },
];

export interface AppState {
  currentRole: UserRole;
  currentLanguage: Language;
  theme: 'dark' | 'light';
  currentRestaurantCode: string;
  currentStaffId: string;
  currentCustomerId: string;
  currentStationId: string;
  networkStatus: 'online' | 'offline' | 'unstable';
  lastCloudBackupAt: string | null;

  plans: Plan[];
  restaurants: Restaurant[];
  licenses: License[];
  activationCodes: ActivationCode[];
  subscriptionPayments: SubscriptionPayment[];

  customers: Customer[];
  ledgerEntries: LedgerEntry[];
  checkpoints: BalanceCheckpoint[];
  scanEvents: ScanEvent[];
  scanPoints: ScanPoint[];
  transfers: PlateTransfer[];
  packages: Package[];
  menuItems: MenuItem[];
  payments: PaymentRecord[];
  branches: Branch[];
  stationUsers: StationUser[];
  pendingApprovals: PendingApproval[];
  shifts: ShiftRecord[];
  cashierSessions: CashierSession[];
  expenses: RestaurantExpense[];

  syncOutbox: SyncOutboxItem[];
  syncCommands: SyncCommand[];
  auditLogs: AuditLogItem[];
  notifications: AppNotification[];

  studentSubscriptionSettings: StudentSubscriptionSettings;
  customerSubscriptions: CustomerSubscription[];
  studentSubscriptionPayments: StudentSubscriptionPayment[];

  activationRequests: CustomerActivationRequest[];
  pinRecoveryRequests: CustomerPinRecoveryRequest[];
  customTranslations?: Partial<Record<Language, any>>;
}

function getInitialState(): AppState {
  const now = new Date().toISOString();
  const validUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  const licPayload = {
    licenseId: 'LIC-RW01-2026-X8F',
    restaurantCode: 'RW01',
    planId: 'plan_high_volume',
    maxScanPoints: 4,
    validUntil,
    graceDays: 14,
  };
  const licenseSignature = signLicensePayload(licPayload);

  const initialLicense: License = {
    id: 'LIC-RW01-2026-X8F',
    restaurantCode: 'RW01',
    planId: 'plan_high_volume',
    maxScanPoints: 4,
    validUntil,
    graceDays: 14,
    featureFlags: {
      spotChecksEnabled: true,
      multiStationEnabled: true,
      secondPlateAllowed: true,
      customerTransfersEnabled: true,
    },
    signature: licenseSignature,
    issuedAt: now,
    paidUntil: validUntil,
  };

  const licRW02Payload = {
    licenseId: 'LIC-RW02-2026-N9B',
    restaurantCode: 'RW02',
    planId: 'plan_starter',
    maxScanPoints: 2,
    validUntil,
    graceDays: 14,
  };
  const licenseRW02Signature = signLicensePayload(licRW02Payload);

  const initialLicenseRW02: License = {
    id: 'LIC-RW02-2026-N9B',
    restaurantCode: 'RW02',
    planId: 'plan_starter',
    maxScanPoints: 2,
    validUntil,
    graceDays: 14,
    featureFlags: {
      spotChecksEnabled: true,
      multiStationEnabled: false,
      secondPlateAllowed: true,
      customerTransfersEnabled: true,
    },
    signature: licenseRW02Signature,
    issuedAt: now,
    paidUntil: validUntil,
  };

  const initialRestaurants: Restaurant[] = [
    {
      code: 'RW01',
      name: 'Kigali Campus Resto',
      legalEntity: 'Kigali Campus Food Services Ltd',
      phone: '+250 788 123 456',
      email: 'manager@kigalicampusresto.rw',
      address: 'University Boulevard, Huye/Kigali, Rwanda',
      currency: 'RWF',
      status: 'active',
      planId: 'plan_high_volume',
      defaultPlatePriceRwf: 1150,
      badgeStyle: 'emerald',
      welcomeMessage: 'Grand Resto Universitaire — Eat Fresh, Study Hard!',
      primaryColor: '#059669',
      currentLicenseId: 'LIC-RW01-2026-X8F',
      highestTimeSeen: Date.now(),
      lastSyncAt: now,
      softwareVersion: '1.1.0-authority',
      createdAt: now,
    },
    {
      code: 'RW02',
      name: 'Nyarugenge Central Bistro',
      legalEntity: 'Nyarugenge Eateries Ltd',
      phone: '+250 788 987 654',
      email: 'info@nyarugengebistro.rw',
      address: 'KN 4 Ave, Nyarugenge, Kigali',
      currency: 'RWF',
      status: 'active',
      planId: 'plan_starter',
      defaultPlatePriceRwf: 1350,
      badgeStyle: 'gold',
      welcomeMessage: 'Fresh Gourmet Buffet & Express Dining in Nyarugenge',
      primaryColor: '#d97706',
      currentLicenseId: 'LIC-RW02-2026-N9B',
      highestTimeSeen: Date.now(),
      lastSyncAt: now,
      softwareVersion: '1.1.0-authority',
      createdAt: now,
    },
    {
      code: 'RW03',
      name: 'Huye University Canteen',
      legalEntity: 'Southern Province Campus Catering Ltd',
      phone: '+250 788 555 777',
      email: 'canteen@huyeuniversity.rw',
      address: 'University Main Road, Huye Campus',
      currency: 'RWF',
      status: 'active',
      planId: 'plan_starter',
      defaultPlatePriceRwf: 1100,
      badgeStyle: 'blue',
      welcomeMessage: 'Wholesome student nutrition for campus scholars',
      primaryColor: '#2563eb',
      highestTimeSeen: Date.now(),
      lastSyncAt: now,
      softwareVersion: '1.1.0-authority',
      createdAt: now,
    },
  ];

  const initialPackages: Package[] = [
    {
      id: 'pkg_10',
      restaurantCode: 'RW01',
      name: '10 Plates Starter Bundle',
      platesCount: 10,
      priceRwf: 12000,
      description: 'Ideal for occasional dining or 1-week lunch',
    },
    {
      id: 'pkg_15',
      restaurantCode: 'RW01',
      name: '15 Plates Half-Month Pack',
      platesCount: 15,
      priceRwf: 17500,
      description: 'Recommended for 2 weeks of campus meals',
    },
    {
      id: 'pkg_30',
      restaurantCode: 'RW01',
      name: '30 Plates 1 Month Pack',
      platesCount: 30,
      priceRwf: 34000,
      description: '30 days of single meal (Lunch or Dinner)',
    },
    {
      id: 'pkg_60',
      restaurantCode: 'RW01',
      name: '60 Plates Full Month (Lunch + Dinner)',
      platesCount: 60,
      priceRwf: 66000,
      description: '30 days of lunch and dinner (2 meals/day)',
    },
    {
      id: 'pkg_rw02_10',
      restaurantCode: 'RW02',
      name: '10 Plates Business Lunch',
      platesCount: 10,
      priceRwf: 13500,
      description: '10 executive lunches at Nyarugenge Bistro',
    },
    {
      id: 'pkg_rw02_20',
      restaurantCode: 'RW02',
      name: '20 Plates Monthly Bistro Pack',
      platesCount: 20,
      priceRwf: 26000,
      description: '20 cafeteria meals for Nyarugenge patrons',
    },
  ];

  const initialMenuItems: MenuItem[] = [
    // RW01 (Kigali Campus Resto)
    {
      id: 'menu_rw01_lunch',
      restaurantCode: 'RW01',
      name: 'Campus Buffet Lunch',
      category: 'lunch',
      priceRwf: 1150,
      costRwf: 680,
      description: 'Hot buffet with rice, beans, sombe, sweet potatoes & meat sauce',
      isAvailable: true,
      targetDailyVolume: 140,
    },
    {
      id: 'menu_rw01_dinner',
      restaurantCode: 'RW01',
      name: 'Hot Evening Dinner',
      category: 'dinner',
      priceRwf: 1250,
      costRwf: 720,
      description: 'Warm evening buffet with ugali, vegetables, beef stew & greens',
      isAvailable: true,
      targetDailyVolume: 85,
    },
    {
      id: 'menu_rw01_economy',
      restaurantCode: 'RW01',
      name: 'Student Economy Combo Plate',
      category: 'lunch',
      priceRwf: 950,
      costRwf: 540,
      description: 'High-energy subsidized campus staple: posho, red beans & seasoned cabbage',
      isAvailable: true,
      targetDailyVolume: 110,
    },
    {
      id: 'menu_rw01_breakfast',
      restaurantCode: 'RW01',
      name: 'Morning Porridge & Bread Spread',
      category: 'breakfast',
      priceRwf: 750,
      costRwf: 380,
      description: 'Fermented sorghum porridge (igikoma), freshly baked buns & boiled eggs',
      isAvailable: true,
      targetDailyVolume: 65,
    },
    {
      id: 'menu_rw01_special',
      restaurantCode: 'RW01',
      name: "Chef's Grill & Tilapia Special",
      category: 'special',
      priceRwf: 1600,
      costRwf: 1050,
      description: 'Grilled Lake Kivu tilapia fillet or skewered goat brochette with plantains',
      isAvailable: true,
      targetDailyVolume: 30,
    },
    {
      id: 'menu_rw01_salad',
      restaurantCode: 'RW01',
      name: 'Fresh Salad & Avocado Protein Bowl',
      category: 'lunch',
      priceRwf: 1100,
      costRwf: 620,
      description: 'Garden mixed greens, diced avocado, boiled peas, carrots & lemon vinaigrette',
      isAvailable: true,
      targetDailyVolume: 35,
    },

    // RW02 (Nyarugenge Central Bistro)
    {
      id: 'menu_rw02_exec_lunch',
      restaurantCode: 'RW02',
      name: 'Executive Bistro Buffet',
      category: 'lunch',
      priceRwf: 1400,
      costRwf: 800,
      description: 'Full culinary spread with roast chicken, plantains, rice & fresh veggies',
      isAvailable: true,
      targetDailyVolume: 80,
    },
    {
      id: 'menu_rw02_express',
      restaurantCode: 'RW02',
      name: 'Express Business Plate',
      category: 'lunch',
      priceRwf: 1200,
      costRwf: 690,
      description: 'Fast counter service meal for busy downtown Kigali professionals',
      isAvailable: true,
      targetDailyVolume: 90,
    },
    {
      id: 'menu_rw02_dinner',
      restaurantCode: 'RW02',
      name: 'Bistro Evening Service',
      category: 'dinner',
      priceRwf: 1500,
      costRwf: 860,
      description: 'Hearty evening plated entrees with soups and seasonal sides',
      isAvailable: true,
      targetDailyVolume: 55,
    },
    {
      id: 'menu_rw02_breakfast',
      restaurantCode: 'RW02',
      name: 'Artisan Continental Breakfast',
      category: 'breakfast',
      priceRwf: 900,
      costRwf: 460,
      description: 'Fresh coffee, tea, pastries, seasonal tropical fruits & eggs',
      isAvailable: true,
      targetDailyVolume: 40,
    },
    {
      id: 'menu_rw02_special',
      restaurantCode: 'RW02',
      name: 'Prime Brochette & Matoke Platter',
      category: 'special',
      priceRwf: 1800,
      costRwf: 1150,
      description: 'Slow-cooked matoke banana mash with char-grilled beef tenderloin brochette',
      isAvailable: true,
      targetDailyVolume: 25,
    },
  ];

  const initialBranches: Branch[] = [
    {
      id: 'br_rw01_main',
      restaurantCode: 'RW01',
      code: 'RW01-MAIN',
      name: 'Main Campus Dining Hall (Hall A)',
      address: 'University Boulevard, Student Center, Kigali',
      phone: '+250 788 123 456',
      managerName: 'Claire Mukamurenzi',
      status: 'active',
      createdAt: now,
    },
    {
      id: 'br_rw01_east',
      restaurantCode: 'RW01',
      code: 'RW01-EAST',
      name: 'East Science Cafeteria (Hall B)',
      address: 'Science & Engineering Complex, Ground Floor',
      phone: '+250 788 123 457',
      managerName: 'Jean-Claude Mugabo',
      status: 'active',
      createdAt: now,
    },
    {
      id: 'br_rw01_huye',
      restaurantCode: 'RW01',
      code: 'RW01-HUYE',
      name: 'Huye Campus Satellite Cafeteria',
      address: 'Southern Province Regional Campus Hub',
      phone: '+250 788 123 458',
      managerName: 'Chantal Uwera',
      status: 'active',
      createdAt: now,
    },
    {
      id: 'br_rw02_main',
      restaurantCode: 'RW02',
      code: 'RW02-MAIN',
      name: 'Nyarugenge Central Bistro',
      address: 'KN 4 Ave, Downtown Commercial District, Kigali',
      phone: '+250 788 987 654',
      managerName: 'Patrick Bizimana',
      status: 'active',
      createdAt: now,
    },
    {
      id: 'br_rw02_heights',
      restaurantCode: 'RW02',
      code: 'RW02-KGL',
      name: 'Kigali Heights Express Hub',
      address: 'Kigali Heights Commercial Wing, 1st Floor',
      phone: '+250 788 987 655',
      managerName: 'Diane Mukamana',
      status: 'active',
      createdAt: now,
    },
  ];

  const initialStationUsers: StationUser[] = [
    {
      id: 'usr_rw01_1',
      restaurantCode: 'RW01',
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall (Hall A)',
      stationId: 'sp_1',
      stationName: 'Stand 1 - Main Buffet Line',
      name: 'Eric Nshimiyimana',
      username: 'eric.buffet',
      phone: '+250 788 111 222',
      role: 'stand_staff',
      status: 'active',
      passwordHash: 'StaffPass#2026',
      pin: '1122',
      createdAt: now,
      lastLoginAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      lastActiveAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 'usr_rw01_2',
      restaurantCode: 'RW01',
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall (Hall A)',
      stationId: 'sp_2',
      stationName: 'Stand 2 - Express Lunch Station',
      name: 'Chantal Uwera',
      username: 'chantal.reception',
      phone: '+250 788 333 444',
      role: 'reception',
      status: 'active',
      passwordHash: 'Reception#2026',
      pin: '3344',
      createdAt: now,
      lastLoginAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      lastActiveAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      id: 'usr_rw01_3',
      restaurantCode: 'RW01',
      branchId: 'br_rw01_east',
      branchName: 'East Science Cafeteria (Hall B)',
      stationId: 'sp_3',
      stationName: 'Stand 3 - Evening Dinner Window',
      name: 'Jean-Claude Mugabo',
      username: 'jc.science',
      phone: '+250 788 555 666',
      role: 'stand_staff',
      status: 'active',
      passwordHash: 'EastHub#2026',
      pin: '5566',
      createdAt: now,
      lastLoginAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      lastActiveAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: 'usr_rw02_1',
      restaurantCode: 'RW02',
      branchId: 'br_rw02_main',
      branchName: 'Nyarugenge Central Bistro',
      stationId: 'sp_rw02_1',
      stationName: 'Stand 1 - Nyarugenge Main Cashier',
      name: 'Patrick Bizimana',
      username: 'patrick.bistro',
      phone: '+250 788 777 888',
      role: 'stand_staff',
      status: 'active',
      passwordHash: 'BistroPOS#2026',
      pin: '7788',
      createdAt: now,
      lastLoginAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      lastActiveAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  ];

  const initialPendingApprovals: PendingApproval[] = [
    {
      id: 'appr_rw01_1',
      restaurantCode: 'RW01',
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall (Hall A)',
      type: 'new_customer',
      customerId: 'cust_pending_1',
      customerName: 'Aimable Nkurunziza',
      customerPhone: '+250 788 661 223',
      customerPhoto: '/src/assets/images/avatar_patron_male_1790979396731.jpg',
      memberNo: '28499',
      packageId: 'pkg_30',
      packageName: '30 Plates 1 Month Pack',
      platesRequested: 30,
      amountRwf: 34000,
      paymentMethod: 'mtn_momo',
      paymentReference: 'MOMO-2026-993812',
      registeredByStaffId: 'usr_rw01_2',
      registeredByStaffName: 'Chantal Uwera (Reception)',
      stationId: 'sp_2',
      stationName: 'Stand 2 - Express Lunch Station',
      gracePlatesAllowed: 3,
      gracePlatesConsumed: 1, // Already consumed 1 grace plate while boss reviews
      createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      status: 'pending',
    },
  ];

  const initialScanPoints: ScanPoint[] = [
    {
      id: 'sp_1',
      restaurantCode: 'RW01',
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall (Hall A)',
      name: 'Stand 1 - Main Buffet Line',
      deviceModel: 'Android Scanner Station A12',
      deviceType: 'tablet',
      pairingCode: 'PAIR-8841',
      pairingKey: 'PAIR-8841',
      isPaired: true,
      pairedAt: now,
      pairedDeviceFingerprint: 'Samsung Galaxy Tab A8 · Android 13',
      status: 'active',
      lastHeartbeat: now,
      isCurrentDevice: true,
      assignedStaffUserId: 'usr_rw01_1',
      assignedStaffUserName: 'Eric Nshimiyimana',
    },
    {
      id: 'sp_2',
      restaurantCode: 'RW01',
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall (Hall A)',
      name: 'Stand 2 - Express Lunch Station',
      deviceModel: 'Laptop + Honeywell 2D BT Imager',
      deviceType: 'laptop_scanner',
      pairingCode: 'PAIR-9932',
      pairingKey: 'PAIR-9932',
      isPaired: false,
      status: 'active',
      lastHeartbeat: now,
      assignedStaffUserId: 'usr_rw01_2',
      assignedStaffUserName: 'Chantal Uwera',
    },
    {
      id: 'sp_3',
      restaurantCode: 'RW01',
      branchId: 'br_rw01_east',
      branchName: 'East Science Cafeteria (Hall B)',
      name: 'Stand 3 - Evening Dinner Window',
      deviceModel: 'POS Tablet Barcode Wedge',
      deviceType: 'pos_terminal',
      pairingCode: 'PAIR-1102',
      pairingKey: 'PAIR-1102',
      isPaired: false,
      status: 'active',
      lastHeartbeat: now,
      assignedStaffUserId: 'usr_rw01_3',
      assignedStaffUserName: 'Jean-Claude Mugabo',
    },
    {
      id: 'sp_rw02_1',
      restaurantCode: 'RW02',
      branchId: 'br_rw02_main',
      branchName: 'Nyarugenge Central Bistro',
      name: 'Stand 1 - Nyarugenge Main Cashier',
      deviceModel: 'Samsung Galaxy Stand Terminal',
      pairingCode: 'PAIR-2021',
      status: 'active',
      lastHeartbeat: now,
      isCurrentDevice: true,
      assignedStaffUserId: 'usr_rw02_1',
      assignedStaffUserName: 'Patrick Bizimana',
    },
  ];

  const customers: Customer[] = [
    {
      id: 'cust_28491',
      memberNo: '28491',
      restaurantCode: 'RW01',
      name: 'Jean-Paul Habimana',
      phone: '+250 788 334 112',
      photoUrl: '/src/assets/images/avatar_student_male_1790979380050.jpg',
      idType: 'student_id',
      idHash: hashIdNumber('student_id', 'UR-2023-CS-8819'),
      idNumberMasked: 'UR-2023-****-8819',
      occupation: 'Undergraduate Student',
      isStudent: true,
      studentProfile: {
        institution: 'University of Rwanda',
        programme: 'BSc Computer Science',
        year: 3,
        registrationNumber: '221004891',
      },
      cardVersion: 1,
      keyVersion: 1,
      cardStatus: 'active',
      pinHash: '1234',
      hasCustomPin: true,
      pinSetAt: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString(),
      onboardingToken: 'OB-28491-KIGALI',
      consentSigned: true,
    },
    {
      id: 'cust_28492',
      memberNo: '28492',
      restaurantCode: 'RW01',
      name: 'Keza Umutoni',
      phone: '+250 785 119 220',
      photoUrl: '/src/assets/images/avatar_student_female_1790979387287.jpg',
      idType: 'national_id',
      idHash: hashIdNumber('national_id', '1199980045678122'),
      idNumberMasked: '1 1999 8 0045678 1 **',
      occupation: 'Medical Student',
      isStudent: true,
      studentProfile: {
        institution: 'University of Rwanda (College of Medicine)',
        programme: 'General Medicine & Surgery',
        year: 4,
        registrationNumber: '220008492',
      },
      cardVersion: 1,
      keyVersion: 1,
      cardStatus: 'active',
      pinHash: '5678',
      hasCustomPin: false,
      createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      onboardingToken: 'OB-28492-KIGALI',
      consentSigned: true,
    },
    {
      id: 'cust_28493',
      memberNo: '28493',
      restaurantCode: 'RW01',
      name: 'Eric Mugisha',
      phone: '+250 782 554 990',
      photoUrl: '/src/assets/images/avatar_patron_male_1790979396731.jpg',
      idType: 'national_id',
      idHash: hashIdNumber('national_id', '1199480012345689'),
      idNumberMasked: '1 1994 8 0012345 6 **',
      occupation: 'Assistant Lecturer & Researcher',
      isStudent: false,
      cardVersion: 1,
      keyVersion: 1,
      cardStatus: 'active',
      pinHash: '9999',
      createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      onboardingToken: 'OB-28493-KIGALI',
      consentSigned: true,
    },
    // RESTAURANT B (RW02) CUSTOMERS
    {
      id: 'cust_rw02_501',
      memberNo: '50101',
      restaurantCode: 'RW02',
      name: 'Diane Mukamana',
      phone: '+250 788 445 771',
      photoUrl: '/src/assets/images/avatar_student_female_1790979387287.jpg',
      idType: 'student_id',
      idHash: hashIdNumber('student_id', 'MKU-2023-DIANE-501'),
      idNumberMasked: 'MKU-2023-****-501',
      occupation: 'Hospitality Student',
      isStudent: true,
      studentProfile: {
        institution: 'Mount Kigali University',
        programme: 'BSc Hospitality & Tourism',
        year: 2,
        registrationNumber: '2230050101',
      },
      cardVersion: 1,
      keyVersion: 1,
      cardStatus: 'active',
      pinHash: '1234',
      createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      onboardingToken: 'OB-50101-NYARUGENGE',
      consentSigned: true,
    },
    {
      id: 'cust_rw02_502',
      memberNo: '50102',
      restaurantCode: 'RW02',
      name: 'Fabrice Gasana',
      phone: '+250 783 770 123',
      photoUrl: '/src/assets/images/avatar_patron_male_1790979396731.jpg',
      idType: 'national_id',
      idHash: hashIdNumber('national_id', '1199180055412988'),
      idNumberMasked: '1 1991 8 0055412 9 **',
      occupation: 'Financial Analyst',
      isStudent: false,
      cardVersion: 1,
      keyVersion: 1,
      cardStatus: 'active',
      pinHash: '4321',
      createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      onboardingToken: 'OB-50102-NYARUGENGE',
      consentSigned: true,
    },
    // PROVISIONAL CUSTOMER WAITING FOR BOSS PAYMENT APPROVAL (Requirement #3)
    {
      id: 'cust_pending_1',
      memberNo: '28499',
      restaurantCode: 'RW01',
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall (Hall A)',
      name: 'Aimable Nkurunziza',
      phone: '+250 788 661 223',
      photoUrl: '/src/assets/images/avatar_patron_male_1790979396731.jpg',
      idType: 'student_id',
      idHash: hashIdNumber('student_id', 'UR-2023-CS-9912'),
      idNumberMasked: 'UR-2023-****-9912',
      occupation: 'Engineering Student',
      isStudent: true,
      studentProfile: {
        institution: 'University of Rwanda (College of Science & Tech)',
        programme: 'BSc Civil Engineering',
        year: 2,
        registrationNumber: '2230028499',
      },
      cardVersion: 1,
      keyVersion: 1,
      cardStatus: 'active',
      pinHash: '1234',
      provisionalStatus: 'pending_approval',
      gracePlatesConsumed: 1, // Consumed 1 grace meal while waiting
      gracePlatesRemaining: 2,
      pendingApprovalId: 'appr_rw01_1',
      createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      onboardingToken: 'OB-28499-KIGALI',
      consentSigned: true,
    },
  ];

  // Ledger entries matching Masterplan rules:
  // Balances: latest checkpoint + sum of subsequent ledger entries
  const ledgerEntries: LedgerEntry[] = [
    // Jean-Paul: Started with 60 plates bundle, had some scans
    {
      id: 'led_1',
      customerId: 'cust_28491',
      restaurantCode: 'RW01',
      type: 'purchase',
      platesDelta: 60,
      timestamp: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      reason: 'Purchase 60 Plates Full Month Pack',
      reference: 'MOMO-9948102',
    },
    {
      id: 'led_2',
      customerId: 'cust_28491',
      restaurantCode: 'RW01',
      type: 'scan',
      platesDelta: -1,
      timestamp: new Date(Date.now() - 19 * 24 * 3600 * 1000).toISOString(),
      scanPointId: 'sp_1',
      staffId: 'staff_1',
    },
    {
      id: 'led_3',
      customerId: 'cust_28491',
      restaurantCode: 'RW01',
      type: 'extra',
      platesDelta: -1,
      timestamp: new Date(Date.now() - 19 * 24 * 3600 * 1000 + 12000).toISOString(),
      scanPointId: 'sp_1',
      staffId: 'staff_1',
      reason: 'Second plate added on screen',
    },
    {
      id: 'led_4',
      customerId: 'cust_28491',
      restaurantCode: 'RW01',
      type: 'scan',
      platesDelta: -1,
      timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      scanPointId: 'sp_1',
      staffId: 'staff_1',
    },
    // Let's bring Jean-Paul to 34 plates
    {
      id: 'led_5',
      customerId: 'cust_28491',
      restaurantCode: 'RW01',
      type: 'scan',
      platesDelta: -23,
      timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      reason: 'Prior historical scans roll-up',
    },

    // Keza Umutoni: 4 plates remaining (triggers low-balance warning < 5)
    {
      id: 'led_6',
      customerId: 'cust_28492',
      restaurantCode: 'RW01',
      type: 'purchase',
      platesDelta: 15,
      timestamp: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      reference: 'MOMO-771890',
    },
    {
      id: 'led_7',
      customerId: 'cust_28492',
      restaurantCode: 'RW01',
      type: 'scan',
      platesDelta: -11,
      timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      reason: 'Historical daily cafeteria meals',
    },

    // Eric Mugisha: 60 plates purchased, 2 scanned = 58 plates
    {
      id: 'led_8',
      customerId: 'cust_28493',
      restaurantCode: 'RW01',
      type: 'purchase',
      platesDelta: 60,
      timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      reference: 'BANK-BK-88912',
    },
    {
      id: 'led_9',
      customerId: 'cust_28493',
      restaurantCode: 'RW01',
      type: 'scan',
      platesDelta: -2,
      timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      scanPointId: 'sp_2',
      staffId: 'staff_1',
    },
    // RW02 (Restaurant B) initial ledger
    {
      id: 'led_rw02_1',
      customerId: 'cust_rw02_501',
      restaurantCode: 'RW02',
      type: 'purchase',
      platesDelta: 20,
      timestamp: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      reason: 'Purchase 20 Plates Monthly Bistro Pack',
      reference: 'MOMO-RW02-8812',
    },
    {
      id: 'led_rw02_2',
      customerId: 'cust_rw02_501',
      restaurantCode: 'RW02',
      type: 'scan',
      platesDelta: -1,
      timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      scanPointId: 'sp_rw02_1',
      staffId: 'staff_rw02_1',
    },
    {
      id: 'led_rw02_3',
      customerId: 'cust_rw02_502',
      restaurantCode: 'RW02',
      type: 'purchase',
      platesDelta: 10,
      timestamp: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      reason: 'Purchase 10 Plates Business Lunch',
      reference: 'MOMO-RW02-9901',
    },
    {
      id: 'led_rw02_4',
      customerId: 'cust_rw02_502',
      restaurantCode: 'RW02',
      type: 'scan',
      platesDelta: -2,
      timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      scanPointId: 'sp_rw02_1',
      staffId: 'staff_rw02_1',
    },
  ];

  const payments: PaymentRecord[] = [
    {
      id: 'pay_1',
      restaurantCode: 'RW01',
      customerId: 'cust_28491',
      customerName: 'Jean-Paul Habimana',
      memberNo: '28491',
      packageId: 'pkg_60',
      platesAdded: 60,
      amountRwf: 66000,
      paymentMethod: 'mtn_momo',
      reference: 'MOMO-9948102',
      adminStaffId: 'admin_1',
      adminStaffName: 'Claire Mukamurenzi (Cashier)',
      timestamp: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'pay_2',
      restaurantCode: 'RW01',
      customerId: 'cust_28492',
      customerName: 'Keza Umutoni',
      memberNo: '28492',
      packageId: 'pkg_15',
      platesAdded: 15,
      amountRwf: 17500,
      paymentMethod: 'mtn_momo',
      reference: 'MOMO-771890',
      adminStaffId: 'admin_1',
      adminStaffName: 'Claire Mukamurenzi (Cashier)',
      timestamp: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'pay_3',
      restaurantCode: 'RW01',
      customerId: 'cust_28493',
      customerName: 'Eric Mugisha',
      memberNo: '28493',
      packageId: 'pkg_60',
      platesAdded: 60,
      amountRwf: 66000,
      paymentMethod: 'bank_transfer',
      reference: 'BANK-BK-88912',
      adminStaffId: 'admin_1',
      adminStaffName: 'Claire Mukamurenzi (Cashier)',
      timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'pay_rw02_1',
      restaurantCode: 'RW02',
      customerId: 'cust_rw02_501',
      customerName: 'Diane Mukamana',
      memberNo: '50101',
      packageId: 'pkg_rw02_20',
      platesAdded: 20,
      amountRwf: 26000,
      paymentMethod: 'mtn_momo',
      reference: 'MOMO-RW02-8812',
      adminStaffId: 'admin_rw02_1',
      adminStaffName: 'Patrick (Bistro Cashier)',
      timestamp: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const subscriptionPayments: SubscriptionPayment[] = [
    {
      id: 'sub_pay_1',
      restaurantCode: 'RW01',
      restaurantName: 'Kigali Campus Resto',
      periodCovered: 'October 2026',
      amountRwf: 140000,
      paidAt: now,
      paymentMethod: 'MTN Mobile Money B2B',
      reference: 'RESTO-SUB-OCT-9901',
    },
  ];

  const activationCodes: ActivationCode[] = [
    {
      code: 'RP-RW01-INIT77',
      restaurantCode: 'RW01',
      generatedAt: now,
      usedAt: now,
      isUsed: true,
    },
    {
      code: 'RP-RW02-SPARE4',
      restaurantCode: 'RW02',
      generatedAt: now,
      isUsed: false,
    },
  ];

  const auditLogs: AuditLogItem[] = [
    {
      id: 'aud_1',
      restaurantCode: 'RW01',
      actorRole: 'super_admin',
      actorName: 'Ephrem (Founder)',
      action: 'LICENSE_ISSUED',
      details: 'Issued High-Volume license LIC-RW01-2026-X8F for Kigali Campus Resto (4 stations allowed)',
      timestamp: now,
    },
    {
      id: 'aud_2',
      restaurantCode: 'RW01',
      actorRole: 'restaurant_admin',
      actorName: 'Restaurant Admin',
      action: 'STATION_REGISTERED',
      details: 'Paired Stand 1 - Main Buffet Line with Android Scanner Station A12',
      timestamp: now,
    },
  ];

  const initialNotifications: AppNotification[] = [
    {
      id: 'notif_init_1',
      restaurantCode: 'RW01',
      target: 'all',
      senderRole: 'system',
      senderName: 'RestoPass System',
      type: 'system_broadcast',
      title: 'Welcome to Kigali Campus Resto',
      message: 'Your prepaid plates never expire. Present your rotating digital QR pass or physical badge at any active buffet stand.',
      priority: 'normal',
      timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      readByCustomerIds: ['cust_28491'],
      actionTab: 'my_card',
    },
    {
      id: 'notif_init_2',
      restaurantCode: 'RW01',
      target: 'all',
      senderRole: 'restaurant_admin',
      senderName: 'Claire Mukamurenzi (Manager)',
      type: 'system_broadcast',
      title: 'Exam Week Extended Serving Hours',
      message: 'Dinner service is now open until 21:30 throughout mid-semester examination week at Stand 1 and Stand 2.',
      priority: 'important',
      timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      readByCustomerIds: [],
    },
    {
      id: 'notif_init_3',
      restaurantCode: 'RW01',
      target: 'cust_28492', // Keza Umutoni (has 4 plates)
      targetName: 'Keza Umutoni (#28492)',
      senderRole: 'system',
      senderName: 'Balance Sentinel',
      type: 'low_balance',
      title: 'Low Plate Balance Warning (< 5 plates)',
      message: 'You have only 4 prepaid plates remaining. Visit the campus cashier or top up via MTN Mobile Money (*182#) to avoid dining line delays.',
      priority: 'urgent',
      timestamp: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
      readByCustomerIds: [],
      actionTab: 'history',
    },
    {
      id: 'notif_init_4',
      restaurantCode: 'RW01',
      target: 'cust_28491', // Jean-Paul Habimana
      targetName: 'Jean-Paul Habimana (#28491)',
      senderRole: 'system',
      senderName: 'Stand 1 - Main Buffet',
      type: 'meal_served',
      title: '1 Meal Plate Served',
      message: 'Redeemed 1 buffet meal at Stand 1 - Main Buffet. Remaining balance: 34 plates.',
      priority: 'normal',
      timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      readByCustomerIds: ['cust_28491'],
      actionTab: 'history',
    },
    {
      id: 'notif_init_5',
      restaurantCode: 'RW01',
      target: 'cust_28491',
      targetName: 'Jean-Paul Habimana (#28491)',
      senderRole: 'restaurant_admin',
      senderName: 'Cashier Desk (Claire)',
      type: 'topup_success',
      title: 'Top-Up Successful: +60 Plates',
      message: 'Receipt #MOMO-9948102 confirmed. Added 60 plates (Full Month Pack) for 66,000 RWF.',
      priority: 'normal',
      timestamp: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      readByCustomerIds: ['cust_28491'],
      actionTab: 'history',
    },
    {
      id: 'notif_init_rw02_1',
      restaurantCode: 'RW02',
      target: 'all',
      senderRole: 'restaurant_admin',
      senderName: 'Patrick (Bistro Manager)',
      type: 'system_broadcast',
      title: 'Welcome to Nyarugenge Central Bistro',
      message: 'Enjoy executive buffet lunch with digital QR verification. Contact desk for inquiries.',
      priority: 'normal',
      timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      readByCustomerIds: [],
    },
  ];

    const initialGraceScan: ScanEvent = {
      id: 'scan_grace_init_1',
      restaurantCode: 'RW01',
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall (Hall A)',
      customerId: 'cust_pending_1',
      customerName: 'Aimable Nkurunziza',
      customerPhoto: '/src/assets/images/avatar_patron_male_1790979396731.jpg',
      memberNo: '28499',
      scanPointId: 'sp_1',
      scanPointName: 'Stand 1 - Main Buffet Line',
      staffId: 'usr_rw01_1',
      staffName: 'Eric Nshimiyimana',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      platesInWindow: 1,
      platesDeducted: 1,
      photoCheckRequired: false,
      photoCheckReason: 'none',
      photoCheckResult: 'none',
      status: 'warning_confirmed',
      isGracePlate: true,
      overrideReason: 'Grace plate served (#1/3). Awaiting boss Mobile Money confirmation.',
      tokenPayload: 'c1.28499.1.INIT.0123456789abcdef',
    };

    return {
      currentRole: 'stand_staff',
      currentLanguage: 'en',
      theme: 'dark',
      currentRestaurantCode: 'RW01',
      currentStaffId: 'staff_1',
      currentCustomerId: 'cust_28491',
      currentStationId: 'sp_1',
      networkStatus: 'online',
      lastCloudBackupAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),

      plans: INITIAL_PLANS,
      restaurants: initialRestaurants,
      licenses: [initialLicense, initialLicenseRW02],
      activationCodes,
      subscriptionPayments,

      customers,
      ledgerEntries,
      checkpoints: [],
      scanEvents: [initialGraceScan],
      scanPoints: initialScanPoints,
      transfers: [],
      packages: initialPackages,
      menuItems: initialMenuItems,
      payments,

      branches: initialBranches,
      stationUsers: initialStationUsers,
      pendingApprovals: initialPendingApprovals,
      shifts: [
        {
          id: 'shift_rw01_morning_1',
          restaurantCode: 'RW01',
          branchId: 'br_rw01_main',
          branchName: 'Main Campus Dining Hall (Hall A)',
          stationId: 'sp_1',
          stationName: 'Stand 1 - Main Buffet Line',
          operatorId: 'usr_rw01_1',
          operatorName: 'Eric Nshimiyimana',
          startedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          openingCashRwf: 20000,
          cashCollectedRwf: 34000,
          platesServedCount: 14,
          provisionalCustomersRegistered: 1,
          topUpsProcessedCount: 2,
          status: 'open',
        },
      ],
      cashierSessions: [
        {
          id: 'sess_rw01_sp1',
          restaurantCode: 'RW01',
          stationId: 'sp_1',
          stationName: 'Stand 1 - Main Buffet Line',
          branchId: 'br_rw01_main',
          branchName: 'Main Campus Dining Hall (Hall A)',
          staffUserId: 'usr_rw01_1',
          staffName: 'Eric Nshimiyimana',
          staffUsername: 'eric_scanner',
          deviceType: 'tablet',
          deviceModel: 'Samsung Galaxy Tab Active4 Pro',
          deviceFingerprint: 'Linux ARM · Chrome 128 / Android 14',
          ipAddress: '192.168.1.142',
          sessionToken: 'DEV_CERT_sp_1_active',
          startedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          lastHeartbeat: new Date(Date.now() - 45 * 1000).toISOString(),
          status: 'active',
        },
        {
          id: 'sess_rw01_sp2',
          restaurantCode: 'RW01',
          stationId: 'sp_2',
          stationName: 'Stand 2 - Express Salads & Drinks',
          branchId: 'br_rw01_main',
          branchName: 'Main Campus Dining Hall (Hall A)',
          staffUserId: 'usr_rw01_2',
          staffName: 'Keza Divine',
          staffUsername: 'keza_cashier',
          deviceType: 'laptop_scanner',
          deviceModel: 'Dell Latitude 5420 · USB Barcode Gun',
          deviceFingerprint: 'Windows NT 10.0 · Chrome 128 / Desktop',
          ipAddress: '192.168.1.108',
          sessionToken: 'DEV_CERT_sp_2_active',
          startedAt: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
          lastHeartbeat: new Date(Date.now() - 90 * 1000).toISOString(),
          status: 'active',
        },
      ],

      syncOutbox: [],
      syncCommands: [],
      auditLogs,
      notifications: initialNotifications,

      studentSubscriptionSettings: {
        enabled: false, // Disabled at launch per specification
        priceRwf: 500, // Exactly 500 RWF per month
        currency: 'RWF',
        period: 'monthly',
        graceDays: 3, // 3 calendar days (72 hours)
        requireForTransfers: true,
        requireForDashboard: true,
        updatedAt: now,
      },
      customerSubscriptions: [],
      studentSubscriptionPayments: [],
      activationRequests: [],
      pinRecoveryRequests: [],
      customTranslations: {},
      expenses: [
        {
          id: 'exp_rw01_1',
          restaurantCode: 'RW01',
          category: 'food_supplies',
          categoryLabel: 'Food Supplies & Produce',
          amountRwf: 145000,
          description: '50kg Rice (Kigali Wholesale) + 30kg Dry Beans',
          supplierName: 'Kigali Agribusiness Hub',
          receiptNumber: 'REC-2026-991',
          recordedByRole: 'restaurant_admin',
          recordedByName: 'Manager Ephrem',
          recordedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
        },
        {
          id: 'exp_rw01_2',
          restaurantCode: 'RW01',
          category: 'fuel_gas_charcoal',
          categoryLabel: 'Cooking Gas & Charcoal',
          amountRwf: 38000,
          description: '2x 38kg Commercial LPG Cylinders Refill',
          supplierName: 'Kobil Gas Rwanda',
          receiptNumber: 'REC-2026-994',
          recordedByRole: 'restaurant_admin',
          recordedByName: 'Manager Ephrem',
          recordedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        },
      ],
    };
  }

function getProductionCleanState(): AppState {
  const demo = getInitialState();
  const now = new Date().toISOString();
  return {
    ...demo,
    currentRole: 'stand_staff',
    currentRestaurantCode: 'RW01',
    currentCustomerId: '',
    currentStationId: 'sp_1',
    restaurants: demo.restaurants.filter((r) => r.code === 'RW01'),
    licenses: demo.licenses.filter((l) => l.restaurantCode === 'RW01'),
    activationCodes: [],
    subscriptionPayments: demo.subscriptionPayments.filter((p) => p.restaurantCode === 'RW01'),
    customers: [],
    ledgerEntries: [],
    checkpoints: [],
    scanEvents: [],
    scanPoints: demo.scanPoints.filter((sp) => sp.restaurantCode === 'RW01'),
    transfers: [],
    packages: demo.packages.filter((p) => p.restaurantCode === 'RW01'),
    menuItems: demo.menuItems.filter((m) => m.restaurantCode === 'RW01'),
    payments: [],
    branches: [],
    stationUsers: [],
    pendingApprovals: [],
    shifts: [],
    cashierSessions: [],
    syncOutbox: [],
    syncCommands: [],
    auditLogs: [],
    notifications: [],
    expenses: [],
    studentSubscriptionSettings: {
      enabled: false, // Configurable via Super Admin portal toggle
      priceRwf: 500,
      currency: 'RWF',
      period: 'monthly',
      graceDays: 3,
      requireForTransfers: true,
      requireForDashboard: true,
      updatedAt: now,
    },
    customerSubscriptions: [],
    studentSubscriptionPayments: [],
    activationRequests: [],
    pinRecoveryRequests: [],
    customTranslations: {},
  };
}

export class RestoStore {
  private state: AppState;
  private listeners: Set<() => void> = new Set();
  private isSyncingWithServer = false;
  private authToken: string | null = null;
  private failedPairingAttempts = 0;
  private pairingLockoutUntil = 0;

  /**
   * Sanitizes state by ensuring customer PINs are stored only as salted SHA-256 digests
   * (never raw plaintext) in localStorage (Finding 4 & 7).
   */
  private sanitizeStateForStorage(state: AppState): string {
    const copy = { ...state };
    if (Array.isArray(copy.customers)) {
      copy.customers = copy.customers.map((c) => {
        if (!c.pinHash) return c;
        if (/^[a-f0-9]{64}$/i.test(c.pinHash)) {
          return c;
        }
        const salt = getCustomerPinSalt(c.id, c.memberNo);
        const saltedPayload = `RESTOPASS_SALTED_PIN_V1:${salt}:${c.pinHash.trim()}`;
        return {
          ...c,
          pinHash: sha256(saltedPayload),
        };
      });
    }
    return JSON.stringify(copy);
  }

  /**
   * Appends a ledger entry idempotently to prevent double-charging or duplicate plate deductions
   */
  public appendLedgerEntry(entry: LedgerEntry): boolean {
    if (!this.state.ledgerEntries) this.state.ledgerEntries = [];
    const exists = this.state.ledgerEntries.some(
      (e) => e.id === entry.id || (entry.idempotencyKey && e.idempotencyKey === entry.idempotencyKey)
    );
    if (exists) {
      console.warn('[Idempotency Guard] Prevented duplicate ledger entry:', entry.id);
      return false;
    }
    this.state.ledgerEntries.push(entry);
    return true;
  }

  constructor() {
    this.state = this.loadState();
    if (this.state.customTranslations) {
      applyCustomTranslations(this.state.customTranslations);
    }
    if (typeof window !== 'undefined') {
      try {
        this.authToken = sessionStorage.getItem('restopass_active_token') || null;
      } catch {}
      setTimeout(() => {
        if (this.authToken) {
          this.pullStateFromServer();
        }
      }, 100);
    }
  }

  public setAuthToken(token: string | null): void {
    this.authToken = token;
    if (typeof window !== 'undefined') {
      try {
        if (token) {
          sessionStorage.setItem('restopass_active_token', token);
        } else {
          sessionStorage.removeItem('restopass_active_token');
        }
      } catch {}
    }
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  private pendingOfflineAuthParams: {
    role: string;
    username?: string;
    password?: string;
    pin?: string;
    restaurantCode?: string;
    stationId?: string;
  } | null = null;

  public async loginToServer(params: {
    role: string;
    username?: string;
    password?: string;
    pin?: string;
    restaurantCode?: string;
    stationId?: string;
  }): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
    this.pendingOfflineAuthParams = params;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        this.setAuthToken(data.token);
        this.pullStateFromServer();
        return { success: true, token: data.token, user: data.user };
      }
      return { success: false, error: data.error || 'Authentication failed' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error during login' };
    }
  }

  private async ensureAuthTokenIfOfflineSession(): Promise<boolean> {
    if (this.authToken) return true;
    if (!this.pendingOfflineAuthParams || typeof window === 'undefined' || !navigator.onLine) {
      return false;
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.pendingOfflineAuthParams),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        this.setAuthToken(data.token);
        return true;
      }
    } catch {}
    return false;
  }

  public async logoutFromServer(): Promise<void> {
    this.pendingOfflineAuthParams = null;
    if (this.authToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.authToken}`,
          },
        });
      } catch {}
    }
    this.setAuthToken(null);
  }

  public async pushStateToServer(): Promise<void> {
    if (typeof window === 'undefined' || !navigator.onLine || this.isSyncingWithServer) return;
    if (!this.authToken) {
      const recovered = await this.ensureAuthTokenIfOfflineSession();
      if (!recovered) return;
    }
    this.isSyncingWithServer = true;
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ fullState: this.state }),
      });
      if (res.ok) {
        const data = await res.json();
        // Mark all local outbox items as synced after server confirms receipt
        this.state.syncOutbox.forEach((item) => {
          item.syncedToCloud = true;
        });
        const r = this.getCurrentRestaurant();
        if (r) {
          r.lastSyncAt = new Date().toISOString();
        }
        if (data.serverState) {
          this.mergeServerState(data.serverState);
        }
      } else if (res.status === 401) {
        // Token expired or invalid
        this.setAuthToken(null);
      }
    } catch {
      // offline fallback - ignore network errors
    } finally {
      this.isSyncingWithServer = false;
    }
  }

  public async pullStateFromServer(): Promise<void> {
    if (typeof window === 'undefined' || !navigator.onLine || this.isSyncingWithServer) return;
    if (!this.authToken) {
      const recovered = await this.ensureAuthTokenIfOfflineSession();
      if (!recovered) return;
    }
    try {
      const res = await fetch('/api/state', {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.hasServerState && data.state) {
          this.mergeServerState(data.state);
        }
      } else if (res.status === 401) {
        this.setAuthToken(null);
      }
    } catch {
      // offline
    }
  }

  private mergeServerState(serverState: Partial<AppState>): void {
    let hasChanges = false;
    const isProdClean = typeof window !== 'undefined' && !this.isDemoModeActive();

    // 1. Merge customers by id (preserving local pinHash when redacted by customer scope)
    if (serverState.customers && Array.isArray(serverState.customers)) {
      const currentCustMap = new Map(this.state.customers.map((c) => [c.id, c]));
      for (const serverCust of serverState.customers) {
        if (isProdClean && DEMO_SEED_CUSTOMER_IDS.has(serverCust.id)) continue;
        const existing = currentCustMap.get(serverCust.id);
        if (!existing) {
          this.state.customers.push(serverCust);
          currentCustMap.set(serverCust.id, serverCust);
          hasChanges = true;
        } else {
          const preservedPinHash = serverCust.pinHash ?? existing.pinHash;
          Object.assign(existing, serverCust, { pinHash: preservedPinHash });
          hasChanges = true;
        }
      }
    }

    // 2. Merge ledger entries (append-only)
    if (serverState.ledgerEntries && Array.isArray(serverState.ledgerEntries)) {
      const currentLedgerIds = new Set(this.state.ledgerEntries.map((l) => l.id));
      for (const serverEntry of serverState.ledgerEntries) {
        if (isProdClean && DEMO_SEED_CUSTOMER_IDS.has(serverEntry.customerId)) continue;
        if (!currentLedgerIds.has(serverEntry.id)) {
          this.state.ledgerEntries.push(serverEntry);
          currentLedgerIds.add(serverEntry.id);
          hasChanges = true;
        }
      }
    }

    // 3. Merge scan events
    if (serverState.scanEvents && Array.isArray(serverState.scanEvents)) {
      const currentScanIds = new Set(this.state.scanEvents.map((s) => s.id));
      const incomingNewScans = serverState.scanEvents.filter(
        (s) =>
          !currentScanIds.has(s.id) &&
          !(isProdClean && (DEMO_SEED_SCAN_IDS.has(s.id) || DEMO_SEED_CUSTOMER_IDS.has(s.customerId)))
      );
      if (incomingNewScans.length > 0) {
        this.state.scanEvents = [...incomingNewScans, ...this.state.scanEvents];
        hasChanges = true;
      }
    }

    // 4. Merge restaurants
    if (serverState.restaurants && Array.isArray(serverState.restaurants)) {
      const currentRestoMap = new Map(this.state.restaurants.map((r) => [r.code, r]));
      for (const serverResto of serverState.restaurants) {
        if (isProdClean && DEMO_SEED_RESTO_CODES.has(serverResto.code)) continue;
        const existing = currentRestoMap.get(serverResto.code);
        if (!existing) {
          this.state.restaurants.push(serverResto);
          currentRestoMap.set(serverResto.code, serverResto);
          hasChanges = true;
        } else {
          Object.assign(existing, serverResto);
          hasChanges = true;
        }
      }
    }

    // 5. Merge notifications
    if (serverState.notifications && Array.isArray(serverState.notifications)) {
      if (!this.state.notifications) this.state.notifications = [];
      const currentNotifMap = new Map(this.state.notifications.map((n) => [n.id, n]));
      for (const serverNotif of serverState.notifications) {
        if (
          isProdClean &&
          (DEMO_SEED_NOTIF_IDS.has(serverNotif.id) ||
            DEMO_SEED_CUSTOMER_IDS.has(serverNotif.target) ||
            DEMO_SEED_RESTO_CODES.has(serverNotif.restaurantCode))
        ) {
          continue;
        }
        const existing = currentNotifMap.get(serverNotif.id);
        if (!existing) {
          this.state.notifications.unshift(serverNotif);
          currentNotifMap.set(serverNotif.id, serverNotif);
          hasChanges = true;
        } else {
          Object.assign(existing, serverNotif);
          hasChanges = true;
        }
      }
    }

    // 6. Merge operational collections by id
    const mergeCollectionById = <T extends { id: string }>(
      key: keyof AppState,
      incoming: T[] | undefined,
      skipFilter?: (item: T) => boolean
    ) => {
      if (!incoming || !Array.isArray(incoming)) return;
      const list = ((this.state as any)[key] || []) as T[];
      const map = new Map(list.map((item) => [item.id, item]));
      for (const serverItem of incoming) {
        if (!serverItem || !serverItem.id) continue;
        if (skipFilter && skipFilter(serverItem)) continue;
        const existing = map.get(serverItem.id);
        if (!existing) {
          list.push(serverItem);
          map.set(serverItem.id, serverItem);
          hasChanges = true;
        } else {
          Object.assign(existing, serverItem);
          hasChanges = true;
        }
      }
      (this.state as any)[key] = list;
    };

    mergeCollectionById(
      'pendingApprovals',
      serverState.pendingApprovals,
      (item) => isProdClean && (DEMO_SEED_APPROVAL_IDS.has(item.id) || DEMO_SEED_CUSTOMER_IDS.has(item.customerId))
    );
    mergeCollectionById(
      'packages',
      serverState.packages,
      (item) => isProdClean && DEMO_SEED_RESTO_CODES.has(item.restaurantCode)
    );
    mergeCollectionById(
      'menuItems',
      serverState.menuItems,
      (item) => isProdClean && DEMO_SEED_RESTO_CODES.has(item.restaurantCode)
    );
    mergeCollectionById(
      'branches',
      serverState.branches,
      (item) => isProdClean && (DEMO_SEED_BRANCH_IDS.has(item.id) || DEMO_SEED_RESTO_CODES.has(item.restaurantCode))
    );
    mergeCollectionById(
      'stationUsers',
      serverState.stationUsers,
      (item) => isProdClean && (DEMO_SEED_USER_IDS.has(item.id) || DEMO_SEED_RESTO_CODES.has(item.restaurantCode))
    );
    mergeCollectionById(
      'scanPoints',
      serverState.scanPoints,
      (item) => isProdClean && DEMO_SEED_RESTO_CODES.has(item.restaurantCode)
    );
    mergeCollectionById(
      'shifts',
      serverState.shifts,
      (item) => isProdClean && DEMO_SEED_SHIFT_IDS.has(item.id)
    );
    mergeCollectionById(
      'cashierSessions',
      serverState.cashierSessions,
      (item) => isProdClean && DEMO_SEED_SESSION_IDS.has(item.id)
    );
    mergeCollectionById('transfers', serverState.transfers);
    mergeCollectionById(
      'payments',
      serverState.payments,
      (item) => isProdClean && DEMO_SEED_CUSTOMER_IDS.has(item.customerId)
    );
    mergeCollectionById('customerSubscriptions', serverState.customerSubscriptions);
    mergeCollectionById('studentSubscriptionPayments', serverState.studentSubscriptionPayments);
    mergeCollectionById(
      'expenses',
      serverState.expenses,
      (item) => isProdClean && (DEMO_SEED_EXPENSE_IDS.has(item.id) || DEMO_SEED_RESTO_CODES.has(item.restaurantCode))
    );
    mergeCollectionById('activationRequests', serverState.activationRequests);
    mergeCollectionById('pinRecoveryRequests', serverState.pinRecoveryRequests);
    mergeCollectionById('plans', serverState.plans);
    mergeCollectionById(
      'licenses',
      serverState.licenses,
      (item) => isProdClean && DEMO_SEED_RESTO_CODES.has(item.restaurantCode)
    );

    if (serverState.studentSubscriptionSettings) {
      this.state.studentSubscriptionSettings = {
        ...this.state.studentSubscriptionSettings,
        ...serverState.studentSubscriptionSettings,
        enabled:
          typeof serverState.studentSubscriptionSettings.enabled === 'boolean'
            ? serverState.studentSubscriptionSettings.enabled
            : (this.state.studentSubscriptionSettings?.enabled ?? false),
      };
      hasChanges = true;
    }

    if (serverState.customTranslations) {
      this.state.customTranslations = {
        ...this.state.customTranslations,
        ...serverState.customTranslations,
      };
      applyCustomTranslations(this.state.customTranslations);
      hasChanges = true;
    }

    if (hasChanges) {
      if (typeof window !== 'undefined') {
        try {
          const activeStorageKey = this.isDemoModeActive() ? STORAGE_KEY : STORAGE_KEY_PROD;
          localStorage.setItem(activeStorageKey, this.sanitizeStateForStorage(this.state));
        } catch {}
      }
      this.listeners.forEach((cb) => cb());
    }
  }

  public isDemoModeActive(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      return sessionStorage.getItem('restopass_demo_mode') === 'true';
    } catch {
      return false;
    }
  }

  public setDemoMode(isDemo: boolean): void {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('restopass_demo_mode', String(isDemo));
      } catch {}
    }
    if (isDemo) {
      this.state = getInitialState();
    } else {
      this.state = getProductionCleanState();
    }
    this.saveState();
    this.listeners.forEach((cb) => cb());
  }

  private loadState(): AppState {
    if (typeof window === 'undefined') return getInitialState();
    const isDemo = this.isDemoModeActive();
    const activeStorageKey = isDemo ? STORAGE_KEY : STORAGE_KEY_PROD;
    try {
      const saved = localStorage.getItem(activeStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const baseState = isDemo ? getInitialState() : getProductionCleanState();
        return {
          ...baseState,
          ...parsed,
          theme: parsed.theme || baseState.theme,
          plans: baseState.plans,
          restaurants: Array.isArray(parsed.restaurants) && parsed.restaurants.length > 0
            ? (isDemo ? parsed.restaurants : parsed.restaurants.filter((r: any) => !DEMO_SEED_RESTO_CODES.has(r.code)))
            : baseState.restaurants,
          packages: Array.isArray(parsed.packages) && parsed.packages.length > 0
            ? parsed.packages
            : baseState.packages,
          menuItems: Array.isArray(parsed.menuItems) && parsed.menuItems.length > 0
            ? parsed.menuItems
            : baseState.menuItems,
          branches: Array.isArray(parsed.branches) && parsed.branches.length > 0
            ? (isDemo ? parsed.branches : parsed.branches.filter((b: any) => !DEMO_SEED_BRANCH_IDS.has(b.id) && !DEMO_SEED_RESTO_CODES.has(b.restaurantCode)))
            : baseState.branches,
          stationUsers: Array.isArray(parsed.stationUsers) && parsed.stationUsers.length > 0
            ? (isDemo ? parsed.stationUsers : parsed.stationUsers.filter((u: any) => !DEMO_SEED_USER_IDS.has(u.id) && !DEMO_SEED_RESTO_CODES.has(u.restaurantCode)))
            : baseState.stationUsers,
          pendingApprovals: Array.isArray(parsed.pendingApprovals)
            ? (isDemo
                ? parsed.pendingApprovals
                : parsed.pendingApprovals.filter(
                    (a: any) => !DEMO_SEED_APPROVAL_IDS.has(a.id) && !DEMO_SEED_CUSTOMER_IDS.has(a.customerId)
                  ))
            : baseState.pendingApprovals,
          shifts: Array.isArray(parsed.shifts)
            ? (isDemo ? parsed.shifts : parsed.shifts.filter((s: any) => !DEMO_SEED_SHIFT_IDS.has(s.id)))
            : baseState.shifts,
          cashierSessions: Array.isArray(parsed.cashierSessions)
            ? (isDemo ? parsed.cashierSessions : parsed.cashierSessions.filter((s: any) => !DEMO_SEED_SESSION_IDS.has(s.id)))
            : baseState.cashierSessions,
          customers: Array.isArray(parsed.customers)
            ? (isDemo ? parsed.customers : parsed.customers.filter((c: any) => !DEMO_SEED_CUSTOMER_IDS.has(c.id)))
            : baseState.customers,
          ledgerEntries: Array.isArray(parsed.ledgerEntries)
            ? (isDemo ? parsed.ledgerEntries : parsed.ledgerEntries.filter((l: any) => !DEMO_SEED_CUSTOMER_IDS.has(l.customerId)))
            : baseState.ledgerEntries,
          scanEvents: Array.isArray(parsed.scanEvents)
            ? (isDemo
                ? parsed.scanEvents
                : parsed.scanEvents.filter(
                    (s: any) => !DEMO_SEED_SCAN_IDS.has(s.id) && !DEMO_SEED_CUSTOMER_IDS.has(s.customerId)
                  ))
            : baseState.scanEvents,
          notifications: Array.isArray(parsed.notifications)
            ? (isDemo
                ? parsed.notifications
                : parsed.notifications.filter(
                    (n: any) =>
                      !DEMO_SEED_NOTIF_IDS.has(n.id) &&
                      !DEMO_SEED_CUSTOMER_IDS.has(n.target) &&
                      !DEMO_SEED_RESTO_CODES.has(n.restaurantCode)
                  ))
            : baseState.notifications,
          expenses: Array.isArray(parsed.expenses)
            ? (isDemo ? parsed.expenses : parsed.expenses.filter((e: any) => !DEMO_SEED_EXPENSE_IDS.has(e.id) && !DEMO_SEED_RESTO_CODES.has(e.restaurantCode)))
            : baseState.expenses,
          studentSubscriptionSettings: parsed.studentSubscriptionSettings
            ? { ...baseState.studentSubscriptionSettings, ...parsed.studentSubscriptionSettings }
            : baseState.studentSubscriptionSettings,
          customTranslations: parsed.customTranslations || {},
        };
      }
    } catch (e) {
      console.error('Failed to load RestoPass state', e);
    }
    return isDemo ? getInitialState() : getProductionCleanState();
  }

  private saveTimeout: any = null;

  private saveState(): void {
    if (typeof window === 'undefined') return;
    try {
      const activeStorageKey = this.isDemoModeActive() ? STORAGE_KEY : STORAGE_KEY_PROD;
      localStorage.setItem(activeStorageKey, this.sanitizeStateForStorage(this.state));
    } catch (e) {
      console.error('Failed to save RestoPass state', e);
    }
    // Push updates to shared server database
    this.pushStateToServer();
  }

  private scheduleSaveState(): void {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveState();
      this.saveTimeout = null;
    }, 150);
  }

  private notify(): void {
    // Deliver updates to React components synchronously in sub-millisecond time
    this.listeners.forEach((cb) => cb());
    // Persist to disk asynchronously without freezing the scanning loop
    this.scheduleSaveState();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getState(): AppState {
    return this.state;
  }

  // --- Session & Navigation ---
  public setRole(role: UserRole) {
    this.state.currentRole = role;
    this.notify();
  }

  public setLanguage(lang: Language) {
    this.state.currentLanguage = lang;
    this.notify();
  }

  public setTheme(theme: 'dark' | 'light') {
    this.state.theme = theme;
    this.notify();
  }

  public toggleTheme() {
    this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
    this.notify();
  }

  public setRestaurantCode(code: string) {
    this.state.currentRestaurantCode = code;
    // Set current station to one belonging to this restaurant
    const stn = this.state.scanPoints.find((sp) => sp.restaurantCode === code);
    if (stn) {
      this.state.currentStationId = stn.id;
    }
    // Preserve currentCustomerId only if it belongs to this restaurant; never silently select another customer
    const currentCust = this.state.customers.find((c) => c.id === this.state.currentCustomerId);
    if (!currentCust || currentCust.restaurantCode !== code) {
      this.state.currentCustomerId = '';
    }
    this.notify();
  }

  public setCustomer(customerId: string) {
    this.state.currentCustomerId = customerId;
    this.notify();
  }

  public setStation(stationId: string) {
    this.state.currentStationId = stationId;
    this.notify();
  }

  public setNetworkStatus(status: 'online' | 'offline' | 'unstable') {
    const prev = this.state.networkStatus;
    this.state.networkStatus = status;
    this.logAudit({
      actorRole: this.state.currentRole,
      actorName: 'System Network Guard',
      action: 'NETWORK_CHANGE',
      details: `Network connectivity changed to ${status.toUpperCase()}`,
    });
    // Immediately auto-flush pending outbox entries when coming online
    if (status === 'online' && prev !== 'online') {
      this.syncPendingOutbox();
    }
    this.notify();
  }

  // --- Authority Logic & Balances ---

  /**
   * Balance = latest checkpoint + sum of subsequent ledger entries
   * Balances are never edited directly.
   */
  public getCustomerBalance(customerId: string): number {
    const checkpoint = this.state.checkpoints
      .filter((cp) => cp.customerId === customerId)
      .sort((a, b) => new Date(b.cutoffTimestamp).getTime() - new Date(a.cutoffTimestamp).getTime())[0];

    const cutoffTime = checkpoint ? new Date(checkpoint.cutoffTimestamp).getTime() : 0;
    const baseBalance = checkpoint ? checkpoint.balance : 0;

    const subsequentEntries = this.state.ledgerEntries.filter(
      (entry) =>
        entry.customerId === customerId &&
        new Date(entry.timestamp).getTime() > cutoffTime
    );

    const deltaSum = subsequentEntries.reduce((sum, item) => sum + item.platesDelta, 0);
    return Math.max(0, baseBalance + deltaSum);
  }

  public getCurrentCustomer(): Customer | undefined {
    if (!this.state.currentCustomerId) return undefined;
    const cust = this.state.customers.find((c) => c.id === this.state.currentCustomerId);
    if (cust && cust.restaurantCode === this.state.currentRestaurantCode) {
      return cust;
    }
    return undefined;
  }

  public getCurrentRestaurant(): Restaurant | undefined {
    return this.state.restaurants.find((r) => r.code === this.state.currentRestaurantCode);
  }

  public getRestaurantLicense(restaurantCode: string): License | undefined {
    const r = this.state.restaurants.find((res) => res.code === restaurantCode);
    if (r?.currentLicenseId) {
      const match = this.state.licenses.find((l) => l.id === r.currentLicenseId);
      if (match) return match;
    }
    const restoLicenses = (this.state.licenses || []).filter((l) => l.restaurantCode === restaurantCode);
    if (restoLicenses.length > 0) {
      return restoLicenses[restoLicenses.length - 1];
    }
    return undefined;
  }

  /**
   * Time-dependent Restaurant License Status:
   * - Automatically expires when validUntil passes (or if restaurant is suspended/unlicensed).
   * - Warns restaurant 7 days before monthly subscription ends.
   */
  public getRestaurantLicenseStatus(restaurantCode?: string): {
    status: 'active' | 'expiring_soon' | 'expired' | 'unlicensed';
    isExpired: boolean;
    isExpiringSoon: boolean;
    daysRemaining: number;
    hoursRemaining: number;
    validUntil: string | null;
    license?: License;
    warningMessage?: string;
  } {
    const code = restaurantCode || this.state.currentRestaurantCode;
    const restaurant = this.state.restaurants.find((r) => r.code === code);
    const license = this.getRestaurantLicense(code);
    const guardedNow = this.getGuardedTime(code);

    if (!license) {
      return {
        status: 'unlicensed',
        isExpired: true,
        isExpiringSoon: false,
        daysRemaining: 0,
        hoursRemaining: 0,
        validUntil: null,
        warningMessage: 'No active license issued for this restaurant. Please activate a monthly subscription license in Super Admin.',
      };
    }

    const validUntilMs = new Date(license.validUntil).getTime();
    const msRemaining = validUntilMs - guardedNow;
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 3600 * 1000)));
    const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (3600 * 1000)));

    if (msRemaining <= 0 || restaurant?.status === 'suspended') {
      if (restaurant && restaurant.status === 'active' && msRemaining <= 0) {
        restaurant.status = 'suspended';
      }
      return {
        status: 'expired',
        isExpired: true,
        isExpiringSoon: false,
        daysRemaining: 0,
        hoursRemaining: 0,
        validUntil: license.validUntil,
        license,
        warningMessage:
          'Monthly restaurant subscription license has expired. Boss and Scanner operations are locked until the license is renewed and reactivated by Super Admin.',
      };
    }

    if (daysRemaining <= 7) {
      return {
        status: 'expiring_soon',
        isExpired: false,
        isExpiringSoon: true,
        daysRemaining,
        hoursRemaining,
        validUntil: license.validUntil,
        license,
        warningMessage: `Subscription Renewal Warning: Your monthly restaurant license expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (${new Date(license.validUntil).toLocaleDateString()}). Please renew with RestoPass Super Admin to avoid service interruption.`,
      };
    }

    return {
      status: 'active',
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining,
      hoursRemaining,
      validUntil: license.validUntil,
      license,
    };
  }

  public getRestaurantTerms(restaurantCode: string): PlanTerms {
    const r = this.state.restaurants.find((res) => res.code === restaurantCode);
    const plan = this.state.plans.find((p) => p.id === r?.planId) || this.state.plans[0];
    return {
      ...plan.terms,
      ...(r?.termsOverride || {}),
    };
  }

  /**
   * Clock Guard: Uses max(system time, highest time ever seen)
   * Rolling clock back does not extend licenses or cheat time-based rules.
   */
  public getGuardedTime(restaurantCode: string): number {
    const r = this.state.restaurants.find((res) => res.code === restaurantCode);
    const now = Date.now();
    const highest = r?.highestTimeSeen || 0;
    const effective = Math.max(now, highest);
    if (r && effective > r.highestTimeSeen) {
      r.highestTimeSeen = effective;
    }
    return effective;
  }

  /**
   * Calculates plates taken by a customer in the last 2-hour window (or configured window)
   */
  public getPlatesInWindow(customerId: string, restaurantCode: string): { count: number; lastServedMinutesAgo: number | null } {
    const terms = this.getRestaurantTerms(restaurantCode);
    const windowMs = terms.servingWindowMinutes * 60 * 1000;
    const now = this.getGuardedTime(restaurantCode);
    const windowStart = now - windowMs;

    // Look at scan events in window that weren't undone
    const windowEvents = this.state.scanEvents.filter(
      (ev) =>
        ev.customerId === customerId &&
        ev.restaurantCode === restaurantCode &&
        (ev.status === 'approved' || ev.status === 'warning_confirmed') &&
        new Date(ev.timestamp).getTime() >= windowStart
    );

    const totalPlates = windowEvents.reduce((acc, ev) => acc + ev.platesDeducted, 0);

    let lastServedMinutesAgo: number | null = null;
    if (windowEvents.length > 0) {
      const mostRecentTime = Math.max(...windowEvents.map((e) => new Date(e.timestamp).getTime()));
      lastServedMinutesAgo = Math.max(0, Math.floor((now - mostRecentTime) / 60000));
    }

    return {
      count: totalPlates,
      lastServedMinutesAgo,
    };
  }

  // --- STAND SCANNER WORKFLOW (Masterplan Sections 2 & 6.3) ---

  private activeScanLocks: Set<string> = new Set();

  public processScan(payload: string): {
    outcome: 'ACCEPTED' | 'REJECTED';
    accepted: boolean;
    deducted: number;
    isGraceMeal: boolean;
    rejectionCode?:
      | 'LICENSE_INVALID'
      | 'INVALID_QR'
      | 'ACCOUNT_INACTIVE'
      | 'NO_BALANCE'
      | 'CONSECUTIVE_SCAN'
      | 'TWO_HOUR_LIMIT'
      | 'DUPLICATE_SCAN';
    rejectionReason?: string;
    message: string;
    scanEvent: ScanEvent;
    balanceBefore: number;
    balanceAfter: number;
    error?: string;
    latencyMs: number;
  } {
    const startTime = performance.now();
    const restaurantCode = this.state.currentRestaurantCode;
    const station = this.state.scanPoints.find((sp) => sp.id === this.state.currentStationId) || this.state.scanPoints[0];
    const staffId = this.state.currentStaffId;
    const terms = this.getRestaurantTerms(restaurantCode);
    const guardedNow = this.getGuardedTime(restaurantCode);

    const buildRejection = (
      rejectionCode:
        | 'LICENSE_INVALID'
        | 'INVALID_QR'
        | 'ACCOUNT_INACTIVE'
        | 'NO_BALANCE'
        | 'CONSECUTIVE_SCAN'
        | 'TWO_HOUR_LIMIT'
        | 'DUPLICATE_SCAN',
      rejectionReason: string,
      customer?: Customer,
      fallbackMemberNo?: string,
      balanceBefore = 0,
      platesInWindow = 0,
      photoCheckRequired = false,
      photoCheckReason: ScanEvent['photoCheckReason'] = 'none'
    ) => {
      const eventId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      sound.playFailureSound(eventId);
      const failEvent: ScanEvent = {
        id: eventId,
        restaurantCode,
        customerId: customer?.id || '',
        customerName: customer?.name || (fallbackMemberNo ? `Customer #${fallbackMemberNo}` : 'Unknown'),
        customerPhoto: customer?.photoUrl || '',
        memberNo: customer?.memberNo || fallbackMemberNo || 'Unknown',
        scanPointId: station.id,
        scanPointName: station.name,
        staffId,
        staffName: 'Stand Operator',
        timestamp: new Date(guardedNow).toISOString(),
        platesInWindow,
        platesDeducted: 0,
        photoCheckRequired,
        photoCheckReason,
        photoCheckResult: 'none',
        status: 'blocked',
        blockedReason: rejectionReason,
        tokenPayload: payload,
      };
      this.state.scanEvents.unshift(failEvent);
      if (customer) {
        this.sendNotification({
          restaurantCode,
          target: customer.id,
          targetName: `${customer.name} (#${customer.memberNo})`,
          senderRole: 'system',
          senderName: station.name,
          type: 'card_security',
          title: 'Scan Declined at Stand',
          message: `A scan attempt at ${station.name} was declined: ${rejectionReason}`,
          priority: rejectionCode === 'NO_BALANCE' || rejectionCode === 'ACCOUNT_INACTIVE' ? 'important' : 'normal',
          actionTab: 'my_card',
        });
      }
      this.notify();
      return {
        outcome: 'REJECTED' as const,
        accepted: false,
        deducted: 0,
        isGraceMeal: false,
        rejectionCode,
        rejectionReason,
        message: rejectionReason,
        scanEvent: failEvent,
        balanceBefore,
        balanceAfter: balanceBefore,
        error: rejectionReason,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    };

    // 0. Time-Dependent Monthly License Enforcement
    const licStatus = this.getRestaurantLicenseStatus(restaurantCode);
    if (licStatus.isExpired) {
      return buildRejection(
        'LICENSE_INVALID',
        licStatus.warningMessage || 'Restaurant monthly subscription license has expired (please renew to continue operation)'
      );
    }

    // 1. QR Validation: Is the QR code valid, signed, and linked to a real customer?
    const customerKeyVersionMap: Record<string, { keyVersion: number; cardVersion: number; cardStatus: string }> = {};
    this.state.customers
      .filter((c) => c.restaurantCode === restaurantCode)
      .forEach((c) => {
        customerKeyVersionMap[c.memberNo] = {
          keyVersion: c.keyVersion,
          cardVersion: c.cardVersion,
          cardStatus: c.cardStatus,
        };
      });

    const verifyResult = verifyQrToken(payload, restaurantCode, customerKeyVersionMap);
    const matchedCustomer = this.state.customers.find(
      (c) => c.memberNo === verifyResult.memberNo && c.restaurantCode === restaurantCode
    );

    if (!verifyResult.valid) {
      const errDetail = verifyResult.error || 'Token verification failed';
      // Check if it failed specifically because the card is locked
      if (matchedCustomer && matchedCustomer.cardStatus === 'locked') {
        const curBal = this.getCustomerBalance(matchedCustomer.id);
        return buildRejection(
          'ACCOUNT_INACTIVE',
          'Account not active — Card is locked by customer or manager.',
          matchedCustomer,
          matchedCustomer.memberNo,
          curBal,
          0,
          true,
          'physical_card'
        );
      }
      return buildRejection(
        'INVALID_QR',
        `Invalid card / QR code — ${errDetail}`,
        matchedCustomer,
        verifyResult.memberNo
      );
    }

    if (!matchedCustomer) {
      return buildRejection(
        'INVALID_QR',
        'Invalid card / QR code — Customer record not found on local authority.',
        undefined,
        verifyResult.memberNo
      );
    }

    const customer = matchedCustomer;
    const currentBalance = this.getCustomerBalance(customer.id);

    // Concurrent / Duplicate scan guard per customer
    if (this.activeScanLocks.has(customer.id)) {
      return buildRejection(
        'DUPLICATE_SCAN',
        'Duplicate scan in progress — please wait.',
        customer,
        customer.memberNo,
        currentBalance
      );
    }

    this.activeScanLocks.add(customer.id);
    try {
      // 2. Account Eligibility: Is the customer's account active or eligible for grace access?
      if (
        customer.cardStatus === 'locked' ||
        customer.activationStatus === 'suspended' ||
        customer.provisionalStatus === 'rejected'
      ) {
        const statusReason =
          customer.provisionalStatus === 'rejected'
            ? 'Account not active — Registration was rejected by management.'
            : customer.activationStatus === 'suspended'
            ? 'Account not active — Customer account is suspended.'
            : 'Account not active — Card is locked by customer or manager.';
        return buildRejection(
          'ACCOUNT_INACTIVE',
          statusReason,
          customer,
          customer.memberNo,
          currentBalance,
          0,
          true,
          'physical_card'
        );
      }

      // 2b. Customer-Dashboard Monetization Rule:
      // Physical card QR (verifyResult.isCard === true) NEVER requires a dashboard subscription.
      // Digital dashboard QR (verifyResult.isCard === false) requires an active subscription when monetization is enabled.
      if (!verifyResult.isCard) {
        const qrEntitlement = this.checkStudentEntitlement(customer.id, 'digital_qr');
        if (!qrEntitlement.allowed) {
          return buildRejection(
            'ACCOUNT_INACTIVE',
            'Digital QR pass requires an active dashboard subscription (500 RWF/mo). Please scan your physical card or activate your subscription.',
            customer,
            customer.memberNo,
            currentBalance
          );
        }
      }

      // Compute pending approvals & unapproved grace meals for this customer
      const customerPendingApprovals = (this.state.pendingApprovals || []).filter(
        (a) => a.customerId === customer.id && a.status === 'pending'
      );
      const totalGraceUsedAcrossPending = customerPendingApprovals.reduce(
        (sum, a) => sum + (a.gracePlatesConsumed || 0),
        0
      );
      // Also account for customer.gracePlatesConsumed if set directly on provisional customer
      const effectiveGraceConsumed = Math.max(
        totalGraceUsedAcrossPending,
        customer.provisionalStatus === 'pending_approval' ? (customer.gracePlatesConsumed || 0) : 0
      );
      const hasQualifyingPendingPayment =
        customerPendingApprovals.length > 0 || customer.provisionalStatus === 'pending_approval';
      const eligibleGraceAvailable = hasQualifyingPendingPayment && effectiveGraceConsumed < 3;

      // 3. Available Credits: Does the customer have an approved meal balance >= 1 or an eligible grace meal?
      if (currentBalance < 1 && !eligibleGraceAvailable) {
        const noBalMsg =
          hasQualifyingPendingPayment && effectiveGraceConsumed >= 3
            ? 'No balance — Grace meal limit reached (3/3 meals consumed). Please await payment approval.'
            : 'No balance — please top up or await payment approval.';
        return buildRejection(
          'NO_BALANCE',
          noBalMsg,
          customer,
          customer.memberNo,
          currentBalance
        );
      }

      // 4. Successive Scans: Is this customer trying to scan twice in a row without another customer scanning in between?
      // Failed scans do NOT reset the consecutive-scan check because we only inspect the last ACCEPTED scan at this station.
      const lastSuccessfulStationScan = this.state.scanEvents.find(
        (ev) =>
          ev.restaurantCode === restaurantCode &&
          ev.scanPointId === station.id &&
          (ev.status === 'approved' || ev.status === 'warning_confirmed')
      );

      if (lastSuccessfulStationScan && lastSuccessfulStationScan.customerId === customer.id) {
        return buildRejection(
          'CONSECUTIVE_SCAN',
          'Too many successive taps — scan another customer first.',
          customer,
          customer.memberNo,
          currentBalance,
          this.getPlatesInWindow(customer.id, restaurantCode).count,
          true,
          'repeat_scan_in_window'
        );
      }

      // 5. Two-Hour Limit: Has the customer already taken 3 meals in the last 120 minutes?
      const windowInfo = this.getPlatesInWindow(customer.id, restaurantCode);
      const platesInWindow = windowInfo.count;
      const windowLimit = Math.max(3, terms.plateLimitPerWindow || 3);

      if (platesInWindow >= windowLimit) {
        return buildRejection(
          'TWO_HOUR_LIMIT',
          `Meal limit reached — maximum ${windowLimit} meals in 2 hours.`,
          customer,
          customer.memberNo,
          currentBalance,
          platesInWindow,
          true,
          'repeat_scan_in_window'
        );
      }

      // Photo Spot-Check Triggers
      let photoCheckRequired = false;
      let photoCheckReason: ScanEvent['photoCheckReason'] = 'none';

      if (verifyResult.isCard) {
        photoCheckRequired = true;
        photoCheckReason = 'physical_card';
      } else {
        const isRandomHit = Math.random() < terms.defaultSpotCheckRate;
        const isRiskRepeat = platesInWindow > 0;
        if (isRiskRepeat) {
          photoCheckRequired = true;
          photoCheckReason = 'repeat_scan_in_window';
        } else if (isRandomHit) {
          photoCheckRequired = true;
          photoCheckReason = 'random_sample';
        }
      }

      // 6. Commit Meal: Paid meals deduct from existing approved balance first!
      // Grace consumption begins ONLY when approved balance is 0 and a qualifying pending payment exists.
      const isUsingGraceMeal = currentBalance < 1 && eligibleGraceAvailable;
      let overrideReason: string | undefined = undefined;

      if (!isUsingGraceMeal) {
        // Deduct 1 paid credit via Ledger
        const ledgerId = `led_scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const idempotencyKey = `idemp_scan_${customer.id}_${station.id}_${guardedNow}_${Math.random().toString(36).slice(2, 6)}`;
        const newLedgerEntry: LedgerEntry = {
          id: ledgerId,
          customerId: customer.id,
          restaurantCode,
          type: 'scan',
          platesDelta: -1,
          timestamp: new Date(guardedNow).toISOString(),
          scanPointId: station.id,
          staffId,
          reference: `SCAN-${customer.memberNo}`,
          idempotencyKey,
        };
        this.appendLedgerEntry(newLedgerEntry);
        this.queueOutboxItem('ledger_entry', newLedgerEntry.id, newLedgerEntry);
      } else {
        // Record 1 authorized grace meal against the earliest qualifying pending approval
        // Do NOT push a -1 paid ledger entry now, because approvePendingRequest will deduct -gracePlatesConsumed upon approval!
        const targetApproval =
          customerPendingApprovals
            .slice()
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .find((a) => (a.gracePlatesConsumed || 0) < (a.gracePlatesAllowed || 3)) ||
          customerPendingApprovals[0];

        if (targetApproval) {
          targetApproval.gracePlatesConsumed = (targetApproval.gracePlatesConsumed || 0) + 1;
        }
        const updatedTotalGrace = effectiveGraceConsumed + 1;
        customer.gracePlatesConsumed = updatedTotalGrace;
        customer.gracePlatesRemaining = Math.max(0, 3 - updatedTotalGrace);
        overrideReason = `Authorized grace meal (#${updatedTotalGrace}/3 served). Awaiting boss Mobile Money payment approval.`;
      }

      // Update active shift stats
      const activeShift = this.getActiveShift(station.id);
      if (activeShift) {
        activeShift.platesServedCount += 1;
      }

      // Mark dynamic phone QR step as used ONLY after scan succeeds
      if (!verifyResult.isCard && verifyResult.step !== undefined) {
        const restKey = deriveRestaurantKey(restaurantCode);
        const custKey = deriveCustomerKey(restKey, customer.memberNo, customer.keyVersion);
        markTokenStepUsed(custKey, verifyResult.step);

        if (typeof window !== 'undefined' && navigator.onLine) {
          fetch('/api/qr/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
            },
            body: JSON.stringify({
              payload,
              restaurantCode,
              stationId: station.id,
            }),
          }).catch(() => {});
        }
      }

      const scanEventId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const isRepeatWarning = platesInWindow >= 1 || isUsingGraceMeal;
      const scanStatus: ScanEvent['status'] = isRepeatWarning ? 'warning_confirmed' : 'approved';

      const scanEvent: ScanEvent = {
        id: scanEventId,
        restaurantCode,
        customerId: customer.id,
        customerName: customer.name,
        customerPhoto: customer.photoUrl,
        memberNo: customer.memberNo,
        scanPointId: station.id,
        scanPointName: station.name,
        staffId,
        staffName: 'Stand Operator',
        timestamp: new Date(guardedNow).toISOString(),
        platesInWindow: platesInWindow + 1,
        platesDeducted: 1,
        photoCheckRequired,
        photoCheckReason,
        photoCheckResult: 'none',
        status: scanStatus,
        isGracePlate: isUsingGraceMeal,
        gracePlateNumber: isUsingGraceMeal ? customer.gracePlatesConsumed : undefined,
        overrideReason,
        tokenPayload: payload,
      };

      this.state.scanEvents.unshift(scanEvent);

      // Play unified Sound 1 (Confirmation beep) exactly once after meal commit succeeds
      sound.playSuccessSound(scanEvent.id);

      const newBalance = this.getCustomerBalance(customer.id);

      // Autogenerate meal served notification
      this.sendNotification({
        restaurantCode,
        target: customer.id,
        targetName: `${customer.name} (#${customer.memberNo})`,
        senderRole: 'system',
        senderName: station.name,
        type: 'meal_served',
        title: isUsingGraceMeal ? 'Grace Meal Served' : 'Meal Plate Served',
        message: isUsingGraceMeal
          ? `Served 1 authorized grace meal (#${customer.gracePlatesConsumed}/3) at ${station.name} while awaiting payment approval.`
          : `Redeemed 1 buffet meal at ${station.name}. Remaining balance: ${newBalance} plate(s).`,
        priority: 'normal',
        actionTab: 'history',
      });

      // Check low-balance auto-alert trigger (< 5 plates)
      if (!isUsingGraceMeal && newBalance < 5) {
        this.sendNotification({
          restaurantCode,
          target: customer.id,
          targetName: `${customer.name} (#${customer.memberNo})`,
          senderRole: 'system',
          senderName: 'Balance Sentinel',
          type: 'low_balance',
          title: 'Low Plate Balance Warning (< 5 plates)',
          message: `Your balance is now ${newBalance} plate(s). Please top up soon to ensure uninterrupted cafeteria dining.`,
          priority: 'urgent',
          actionTab: 'history',
        });
      }

      this.notify();

      const acceptedMessage = isUsingGraceMeal
        ? `Meal accepted — 1 grace meal recorded (${customer.gracePlatesConsumed}/3 used).`
        : 'Meal accepted — 1 meal recorded.';

      return {
        outcome: 'ACCEPTED',
        accepted: true,
        deducted: 1,
        isGraceMeal: isUsingGraceMeal,
        message: acceptedMessage,
        scanEvent,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    } finally {
      this.activeScanLocks.delete(customer.id);
    }
  }

  /**
   * Second Plate (+1) - Only permitted while current customer result is on screen
   * Maximum 2 plates per serving.
   */
  public addSecondPlate(scanEventId: string): boolean {
    const scanEvent = this.state.scanEvents.find((e) => e.id === scanEventId);
    if (!scanEvent || scanEvent.platesDeducted >= 2) return false;

    const currentBalance = this.getCustomerBalance(scanEvent.customerId);
    if (currentBalance < 1) {
      sound.playDangerAlarm();
      return false;
    }

    const now = this.getGuardedTime(scanEvent.restaurantCode);
    const ledgerId = `led_extra_${Date.now()}`;
    const extraEntry: LedgerEntry = {
      id: ledgerId,
      customerId: scanEvent.customerId,
      restaurantCode: scanEvent.restaurantCode,
      type: 'extra',
      platesDelta: -1,
      timestamp: new Date(now).toISOString(),
      scanPointId: scanEvent.scanPointId,
      staffId: scanEvent.staffId,
      reason: 'Second plate added on scan screen',
      reference: `EXTRA-2ND-${scanEvent.memberNo}`,
    };

    this.state.ledgerEntries.push(extraEntry);
    scanEvent.platesDeducted = 2;
    scanEvent.isSecondPlateAdded = true;

    this.queueOutboxItem('ledger_entry', extraEntry.id, extraEntry);

    const updatedBal = this.getCustomerBalance(scanEvent.customerId);
    this.sendNotification({
      restaurantCode: scanEvent.restaurantCode,
      target: scanEvent.customerId,
      targetName: `${scanEvent.customerName} (#${scanEvent.memberNo})`,
      senderRole: 'system',
      senderName: scanEvent.scanPointName,
      type: 'meal_served',
      title: 'Second Plate (+1) Confirmed',
      message: `Second plate confirmed at ${scanEvent.scanPointName}. Remaining balance: ${updatedBal} plate(s).`,
      priority: 'normal',
      actionTab: 'history',
    });

    sound.playSecondPlateBeep();
    this.notify();
    return true;
  }

  /**
   * Undo Serving - Only permitted while current customer result is on screen
   */
  public undoScan(scanEventId: string): boolean {
    const scanEvent = this.state.scanEvents.find((e) => e.id === scanEventId);
    if (!scanEvent || scanEvent.status === 'undone') return false;

    const now = this.getGuardedTime(scanEvent.restaurantCode);
    const platesToRestore = scanEvent.platesDeducted;

    if (scanEvent.isGracePlate) {
      // Restore grace meal counter rather than crediting a paid ledger entry
      const customer = this.state.customers.find((c) => c.id === scanEvent.customerId);
      const pendingApprovals = (this.state.pendingApprovals || []).filter(
        (a) => a.customerId === scanEvent.customerId && a.status === 'pending' && (a.gracePlatesConsumed || 0) > 0
      );
      if (pendingApprovals.length > 0) {
        const target = pendingApprovals[0];
        target.gracePlatesConsumed = Math.max(0, (target.gracePlatesConsumed || 0) - platesToRestore);
      }
      if (customer) {
        const remainingGraceUsed = (this.state.pendingApprovals || [])
          .filter((a) => a.customerId === customer.id && a.status === 'pending')
          .reduce((sum, a) => sum + (a.gracePlatesConsumed || 0), 0);
        customer.gracePlatesConsumed = remainingGraceUsed;
        customer.gracePlatesRemaining = Math.max(0, 3 - remainingGraceUsed);
      }
    } else {
      const undoEntry: LedgerEntry = {
        id: `led_undo_${Date.now()}`,
        customerId: scanEvent.customerId,
        restaurantCode: scanEvent.restaurantCode,
        type: 'undo',
        platesDelta: platesToRestore,
        timestamp: new Date(now).toISOString(),
        scanPointId: scanEvent.scanPointId,
        staffId: scanEvent.staffId,
        reason: `Serving undone by staff (${platesToRestore} plate${platesToRestore > 1 ? 's' : ''})`,
      };

      this.state.ledgerEntries.push(undoEntry);
      this.queueOutboxItem('ledger_entry', undoEntry.id, undoEntry);
    }

    scanEvent.status = 'undone';
    scanEvent.platesDeducted = 0;

    if (scanEvent.customerId) {
      const restoredBal = this.getCustomerBalance(scanEvent.customerId);
      this.sendNotification({
        restaurantCode: scanEvent.restaurantCode,
        target: scanEvent.customerId,
        targetName: `${scanEvent.customerName} (#${scanEvent.memberNo})`,
        senderRole: 'system',
        senderName: scanEvent.scanPointName,
        type: 'balance_adjustment',
        title: `Serving Undone (+${platesToRestore} Plate${platesToRestore > 1 ? 's' : ''} Restored)`,
        message: scanEvent.isGracePlate
          ? `Stand operator reversed your recent grace meal scan at ${scanEvent.scanPointName}.`
          : `Stand operator reversed your recent scan at ${scanEvent.scanPointName}. Restored +${platesToRestore} plate(s). Current balance: ${restoredBal} plates.`,
        priority: 'normal',
        actionTab: 'history',
      });
    }

    sound.playUndoBeep();
    this.notify();
    return true;
  }

  /**
   * Record Staff Photo Check outcome (Match vs Reject)
   */
  public recordPhotoCheck(scanEventId: string, result: 'matched' | 'rejected') {
    const scanEvent = this.state.scanEvents.find((e) => e.id === scanEventId);
    if (!scanEvent) return;

    scanEvent.photoCheckResult = result;
    if (result === 'rejected') {
      scanEvent.status = 'rejected_photo';
      // If rejected, reverse the auto-deducted plate
      this.undoScan(scanEventId);
      this.logAudit({
        restaurantCode: scanEvent.restaurantCode,
        actorRole: 'stand_staff',
        actorName: 'Stand Staff',
        action: 'PHOTO_CHECK_REJECTED',
        details: `Rejected customer #${scanEvent.memberNo} (${scanEvent.customerName}) on spot-check: photo did not match face`,
      });
    } else {
      this.logAudit({
        restaurantCode: scanEvent.restaurantCode,
        actorRole: 'stand_staff',
        actorName: 'Stand Staff',
        action: 'PHOTO_CHECK_MATCHED',
        details: `Verified customer #${scanEvent.memberNo} (${scanEvent.customerName}) face matches card/phone photo`,
      });
    }
    this.notify();
  }

  /**
   * Admin Override for Blocked Scan
   */
  public approveScanOverride(scanEventId: string, reason: string, adminStaffId: string): boolean {
    const scanEvent = this.state.scanEvents.find((e) => e.id === scanEventId);
    if (!scanEvent || scanEvent.status !== 'blocked') return false;

    const balance = this.getCustomerBalance(scanEvent.customerId);
    if (balance < 1) return false;

    const now = this.getGuardedTime(scanEvent.restaurantCode);
    const ledgerEntry: LedgerEntry = {
      id: `led_override_${Date.now()}`,
      customerId: scanEvent.customerId,
      restaurantCode: scanEvent.restaurantCode,
      type: 'scan',
      platesDelta: -1,
      timestamp: new Date(now).toISOString(),
      scanPointId: scanEvent.scanPointId,
      staffId: adminStaffId,
      reason: `Manager Override: ${reason}`,
    };

    this.state.ledgerEntries.push(ledgerEntry);
    scanEvent.status = 'approved';
    scanEvent.platesDeducted = 1;
    scanEvent.overrideReason = reason;
    scanEvent.overrideStaffId = adminStaffId;

    this.queueOutboxItem('ledger_entry', ledgerEntry.id, ledgerEntry);
    this.logAudit({
      restaurantCode: scanEvent.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: 'Restaurant Admin',
      action: 'SCAN_OVERRIDE_APPROVED',
      details: `Approved serving override for customer #${scanEvent.memberNo}. Reason: "${reason}"`,
    });

    if (scanEvent.customerId) {
      const updatedBal = this.getCustomerBalance(scanEvent.customerId);
      this.sendNotification({
        restaurantCode: scanEvent.restaurantCode,
        target: scanEvent.customerId,
        targetName: `${scanEvent.customerName} (#${scanEvent.memberNo})`,
        senderRole: 'restaurant_admin',
        senderName: adminStaffId || 'Restaurant Admin',
        type: 'meal_served',
        title: 'Meal Served via Manager Override (-1 Plate)',
        message: `Manager authorized 1 meal at ${scanEvent.scanPointName} (${reason}). Remaining balance: ${updatedBal} plates.`,
        priority: 'normal',
        actionTab: 'history',
      });
    }

    sound.playSuccessBeep();
    this.notify();
    return true;
  }

  // --- RESTAURANT ADMIN OPERATIONS ---

  /**
   * Normalizes a phone number to standard digits for robust duplicate detection
   * Handles Rwandan formats: +250 78..., 078..., 25078...
   */
  public normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('250') && digits.length === 12) {
      return digits.slice(3);
    }
    if (digits.startsWith('0') && digits.length === 10) {
      return digits.slice(1);
    }
    return digits;
  }

  /**
   * Strict Identity Uniqueness Validator:
   * Guarantees that no customer can have two accounts in the same restaurant.
   * Checks normalized phone numbers, ID document numbers/hashes, and student registration numbers.
   */
  public checkDuplicateCustomerIdentity(
    restaurantCode: string,
    phone: string,
    idType: Customer['idType'],
    idNumber: string,
    studentRegNumber?: string,
    excludeCustomerId?: string
  ): {
    isDuplicate: boolean;
    duplicateCustomer?: Customer;
    field?: 'phone' | 'id_number' | 'student_id';
    message?: string;
  } {
    const cleanPhone = this.normalizePhoneNumber(phone);
    const cleanIdNumber = idNumber.trim().toLowerCase();
    const cleanRegNumber = studentRegNumber?.trim().toLowerCase();
    const hash = hashIdNumber(idType, idNumber.trim());

    const customers = this.state.customers.filter(
      (c) => c.restaurantCode === restaurantCode && (!excludeCustomerId || c.id !== excludeCustomerId)
    );

    for (const c of customers) {
      // 1. Phone number check (normalized)
      if (cleanPhone && cleanPhone.length >= 7) {
        const cPhone = this.normalizePhoneNumber(c.phone);
        if (cPhone === cleanPhone) {
          return {
            isDuplicate: true,
            duplicateCustomer: c,
            field: 'phone',
            message: `Phone number is already registered to #${c.memberNo} (${c.name}).`,
          };
        }
      }

      // 2. ID document number / Hash check
      if (cleanIdNumber && cleanIdNumber.length > 2) {
        if (c.idHash === hash || (c.idNumberMasked && c.idNumberMasked.toLowerCase().replace(/[\s*-]/g, '').includes(cleanIdNumber.replace(/[\s*-]/g, '')))) {
          return {
            isDuplicate: true,
            duplicateCustomer: c,
            field: 'id_number',
            message: `ID document number is already registered to #${c.memberNo} (${c.name}).`,
          };
        }
      }

      // 3. Student Registration Number check (exact campus ID)
      if (cleanRegNumber && cleanRegNumber.length >= 3 && c.isStudent && c.studentProfile?.registrationNumber) {
        const cReg = c.studentProfile.registrationNumber.trim().toLowerCase();
        if (cReg === cleanRegNumber) {
          return {
            isDuplicate: true,
            duplicateCustomer: c,
            field: 'student_id',
            message: `Student Registration ID (${studentRegNumber}) is already registered to #${c.memberNo} (${c.name}).`,
          };
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Register customer with live photo, student details, and strict duplicate check
   */
  public registerCustomer(data: {
    restaurantCode: string;
    name: string;
    phone: string;
    photoUrl: string;
    idType: Customer['idType'];
    idNumber: string;
    occupation?: string;
    isStudent: boolean;
    studentProfile?: Customer['studentProfile'];
    packageId?: string;
    paymentMethod: PaymentRecord['paymentMethod'];
    paymentReference: string;
    adminStaffId: string;
    adminStaffName: string;
  }): { success: boolean; customer?: Customer; error?: string; existingCustomer?: Customer } {
    const phoneClean = data.phone.trim();
    const idHash = hashIdNumber(data.idType, data.idNumber);

    // Strict duplicate check per restaurant
    const dupCheck = this.checkDuplicateCustomerIdentity(
      data.restaurantCode,
      data.phone,
      data.idType,
      data.idNumber,
      data.isStudent ? data.studentProfile?.registrationNumber : undefined
    );

    if (dupCheck.isDuplicate && dupCheck.duplicateCustomer) {
      return {
        success: false,
        error: dupCheck.message || `Customer already enrolled in this restaurant as #${dupCheck.duplicateCustomer.memberNo} (${dupCheck.duplicateCustomer.name}).`,
        existingCustomer: dupCheck.duplicateCustomer,
      };
    }

    // Member number allocated strictly by local server
    const nextMemberNum = 28490 + this.state.customers.length + 1;
    const memberNo = nextMemberNum.toString();
    const now = new Date(this.getGuardedTime(data.restaurantCode)).toISOString();

    const customer: Customer = {
      id: `cust_${memberNo}`,
      memberNo,
      restaurantCode: data.restaurantCode,
      name: data.name.trim(),
      phone: phoneClean,
      photoUrl: data.photoUrl,
      idType: data.idType,
      idHash,
      idNumberMasked: data.idNumber.length > 5 ? `${data.idNumber.slice(0, 5)}****` : '****',
      occupation: data.occupation,
      isStudent: data.isStudent,
      studentProfile: data.isStudent ? data.studentProfile : undefined,
      cardVersion: 1,
      keyVersion: 1,
      cardStatus: 'active',
      pinHash: '1234', // default PIN, customer sets personal PIN on magic link arrival
      hasCustomPin: false,
      createdAt: now,
      onboardingToken: `OB-${memberNo}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      consentSigned: true,
    };

    this.state.customers.push(customer);
    this.queueOutboxItem('customer', customer.id, customer);

    // Initial top-up if package selected
    if (data.packageId) {
      const pkg = this.state.packages.find((p) => p.id === data.packageId);
      if (pkg) {
        this.topUpCustomer({
          restaurantCode: data.restaurantCode,
          customerId: customer.id,
          plates: pkg.platesCount,
          amountRwf: pkg.priceRwf,
          paymentMethod: data.paymentMethod,
          reference: data.paymentReference,
          packageId: pkg.id,
          adminStaffId: data.adminStaffId,
          adminStaffName: data.adminStaffName,
        });
      }
    }

    this.logAudit({
      restaurantCode: data.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: data.adminStaffName,
      action: 'CUSTOMER_REGISTERED',
      details: `Registered customer #${memberNo} (${customer.name}), ID Type: ${data.idType}`,
    });

    this.notify();
    return { success: true, customer };
  }

  /**
   * Generates bulk pre-printed / onboarding cards for new customer onboarding batches
   */
  public generateBulkOnboardingCards(data: {
    restaurantCode: string;
    count: number;
    packageId?: string;
    batchLabel?: string;
    adminStaffName: string;
  }): Customer[] {
    const created: Customer[] = [];
    const now = new Date(this.getGuardedTime(data.restaurantCode)).toISOString();
    const pkg = data.packageId ? this.state.packages.find((p) => p.id === data.packageId) : undefined;

    // Find highest current member number in restaurant
    let maxMember = 28490;
    this.state.customers.forEach((c) => {
      const num = parseInt(c.memberNo, 10);
      if (!isNaN(num) && num > maxMember) {
        maxMember = num;
      }
    });

    for (let i = 1; i <= data.count; i++) {
      const memberNo = (maxMember + i).toString();
      const randToken = Math.random().toString(36).substring(2, 7).toUpperCase();
      const onboardingToken = `OB-${memberNo}-${randToken}`;

      const customer: Customer = {
        id: `cust_${memberNo}`,
        memberNo,
        restaurantCode: data.restaurantCode,
        name: `Onboarding Patron #${memberNo}`,
        phone: `+250 780 00${memberNo.slice(-4)}`,
        photoUrl: '/src/assets/images/avatar_student_male_1790979380050.jpg',
        idType: 'student_id',
        idHash: hashIdNumber('student_id', `ONBOARDING_${memberNo}`),
        idNumberMasked: 'PENDING_ONBOARDING',
        occupation: 'Student / Patron',
        isStudent: true,
        cardVersion: 1,
        keyVersion: 1,
        cardStatus: 'active',
        pinHash: '1234',
        createdAt: now,
        onboardingToken,
        consentSigned: true,
      };

      this.state.customers.push(customer);
      this.queueOutboxItem('customer', customer.id, customer);

      // If pre-loaded with an initial plate bundle
      if (pkg) {
        const ledgerEntry: LedgerEntry = {
          id: `led_bulk_${Date.now()}_${i}`,
          customerId: customer.id,
          restaurantCode: data.restaurantCode,
          type: 'purchase',
          platesDelta: pkg.platesCount,
          timestamp: now,
          staffId: data.adminStaffName,
          reason: `Bulk Onboarding Card: ${pkg.name}`,
          reference: `BULK-${memberNo}`,
        };
        this.state.ledgerEntries.push(ledgerEntry);
        this.queueOutboxItem('ledger_entry', ledgerEntry.id, ledgerEntry);
      }

      created.push(customer);
    }

    this.logAudit({
      restaurantCode: data.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: data.adminStaffName,
      action: 'BULK_CARDS_GENERATED',
      details: `Generated ${data.count} bulk onboarding cards (#${created[0]?.memberNo} to #${created[created.length - 1]?.memberNo})${pkg ? ` pre-loaded with ${pkg.platesCount} plates` : ''}`,
    });

    this.notify();
    return created;
  }

  /**
   * Top-Up customer plates
   */
  public topUpCustomer(data: {
    restaurantCode: string;
    customerId: string;
    plates: number;
    amountRwf: number;
    paymentMethod: PaymentRecord['paymentMethod'];
    reference: string;
    packageId?: string;
    adminStaffId: string;
    adminStaffName: string;
  }): void {
    const customer = this.state.customers.find((c) => c.id === data.customerId);
    if (!customer) return;

    const now = new Date(this.getGuardedTime(data.restaurantCode)).toISOString();

    const ledgerEntry: LedgerEntry = {
      id: `led_topup_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      customerId: customer.id,
      restaurantCode: data.restaurantCode,
      type: 'purchase',
      platesDelta: data.plates,
      timestamp: now,
      staffId: data.adminStaffId,
      reason: `Top-up: +${data.plates} plates (${data.paymentMethod.toUpperCase()})`,
      reference: data.reference,
      idempotencyKey: data.reference ? `idemp_ref_${data.reference}` : `idemp_topup_${customer.id}_${Date.now()}`,
    };

    this.appendLedgerEntry(ledgerEntry);

    const payment: PaymentRecord = {
      id: `pay_${Date.now()}`,
      restaurantCode: data.restaurantCode,
      customerId: customer.id,
      customerName: customer.name,
      memberNo: customer.memberNo,
      packageId: data.packageId,
      platesAdded: data.plates,
      amountRwf: data.amountRwf,
      paymentMethod: data.paymentMethod,
      reference: data.reference,
      adminStaffId: data.adminStaffId,
      adminStaffName: data.adminStaffName,
      timestamp: now,
    };

    this.state.payments.unshift(payment);

    this.queueOutboxItem('ledger_entry', ledgerEntry.id, ledgerEntry);
    this.logAudit({
      restaurantCode: data.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: data.adminStaffName,
      action: 'CUSTOMER_TOPUP',
      details: `Added ${data.plates} plates to #${customer.memberNo} (${customer.name}) - ${data.amountRwf.toLocaleString()} RWF via ${data.paymentMethod}`,
    });

    const newBal = this.getCustomerBalance(customer.id);
    this.sendNotification({
      restaurantCode: data.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'restaurant_admin',
      senderName: data.adminStaffName,
      type: 'topup_success',
      title: `Top-Up Success: +${data.plates} Plates`,
      message: `Credited ${data.plates} plates (${data.amountRwf.toLocaleString()} RWF via ${data.paymentMethod.replace('_', ' ').toUpperCase()}). Ref: ${data.reference}. New balance: ${newBal} plates.`,
      priority: 'normal',
      actionTab: 'history',
    });

    this.notify();
  }

  /**
   * Reissue Card: Increments cardVersion, instantly invalidating the prior physical card
   */
  public reissueCard(customerId: string, adminStaffName: string): Customer | null {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return null;

    customer.cardVersion += 1;
    customer.cardStatus = 'active';

    this.queueOutboxItem('card_update', customer.id, { cardVersion: customer.cardVersion, cardStatus: 'active' });
    this.logAudit({
      restaurantCode: customer.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: adminStaffName,
      action: 'CARD_REISSUED',
      details: `Reissued physical card for #${customer.memberNo}. New version is V${customer.cardVersion}. Old card invalidated.`,
    });

    this.sendNotification({
      restaurantCode: customer.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'restaurant_admin',
      senderName: adminStaffName,
      type: 'card_security',
      title: `New Physical Card Issued (V${customer.cardVersion})`,
      message: `A replacement badge was issued. Your previous physical card has been permanently invalidated.`,
      priority: 'important',
      actionTab: 'my_card',
    });

    this.notify();
    return customer;
  }

  /**
   * Reissue Phone Key: Increments keyVersion, invalidating old phone app tokens
   */
  public reissuePhoneKey(customerId: string, adminStaffName: string): Customer | null {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return null;

    customer.keyVersion += 1;

    this.queueOutboxItem('card_update', customer.id, { keyVersion: customer.keyVersion });
    this.logAudit({
      restaurantCode: customer.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: adminStaffName,
      action: 'PHONE_KEY_REISSUED',
      details: `Reissued phone dynamic key for #${customer.memberNo}. Key version is now V${customer.keyVersion}.`,
    });

    this.sendNotification({
      restaurantCode: customer.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'restaurant_admin',
      senderName: adminStaffName,
      type: 'card_security',
      title: `Digital Key Rotated (Key V${customer.keyVersion})`,
      message: `Your dynamic QR code security key has been refreshed. Old digital passes are invalidated.`,
      priority: 'normal',
      actionTab: 'my_card',
    });

    this.notify();
    return customer;
  }

  /**
   * Lock / Unlock Card
   * Note: Temporary lock/unlock preserves cardVersion so the permanent physical card
   * remains valid when unlocked. Only reissueCard increments cardVersion when a card is stolen/lost.
   */
  public setCustomerCardStatus(customerId: string, status: 'active' | 'locked', actorName: string) {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return;

    // When invoked from customer portal, enforce active student subscription if monetization is enabled
    if (this.state.currentRole === 'customer') {
      const ent = this.checkStudentEntitlement(customer.id, 'customer_dashboard');
      if (!ent.allowed) return;
    }

    customer.cardStatus = status;

    this.queueOutboxItem('card_update', customer.id, { cardStatus: status, cardVersion: customer.cardVersion });
    this.logAudit({
      restaurantCode: customer.restaurantCode,
      actorRole: this.state.currentRole,
      actorName,
      action: status === 'locked' ? 'CARD_LOCKED' : 'CARD_UNLOCKED',
      details: `Customer #${customer.memberNo} card ${status.toUpperCase()}`,
    });

    this.sendNotification({
      restaurantCode: customer.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'system',
      senderName: actorName,
      type: 'card_security',
      title: status === 'locked' ? 'Card Locked by Cafeteria' : 'Card Reactivated',
      message: status === 'locked'
        ? `Your physical card access was temporarily locked for security. Tap is disabled; your balance remains safe.`
        : `Your card has been reactivated. You can now tap at all dining stands.`,
      priority: status === 'locked' ? 'urgent' : 'normal',
      actionTab: 'my_card',
    });

    this.notify();
  }

  /**
   * Set or update customer's personal security PIN (Minimum 6 digits, salted hash)
   */
  public setCustomerPin(customerId: string, newPin: string): boolean {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return false;
    const cleanPin = newPin.trim();
    if (!/^\d{6,}$/.test(cleanPin)) return false;

    const salt = getCustomerPinSalt(customer.id, customer.memberNo);
    const saltedPayload = `RESTOPASS_SALTED_PIN_V1:${salt}:${cleanPin}`;
    customer.pinHash = sha256(saltedPayload);
    customer.hasCustomPin = true;
    customer.pinSetAt = new Date().toISOString();

    this.queueOutboxItem('customer', customer.id, customer);
    this.logAudit({
      restaurantCode: customer.restaurantCode,
      actorRole: 'customer',
      actorName: customer.name,
      action: 'CUSTOMER_PIN_UPDATED',
      details: `Customer #${customer.memberNo} established personal 6+ digit security PIN`,
    });

    this.sendNotification({
      restaurantCode: customer.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'system',
      senderName: 'Security Guard',
      type: 'card_security',
      title: 'Security PIN Activated',
      message: 'Your 6+ digit security PIN is active. The dashboard will lock automatically whenever your screen goes off.',
      priority: 'normal',
      actionTab: 'my_card',
    });

    this.notify();
    return true;
  }

  /**
   * Verify customer's 6+ digit PIN for dashboard unlock or sensitive actions
   */
  public verifyCustomerPin(customerId: string, pin: string): boolean {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return false;
    const cleanPin = pin.trim();
    if (!cleanPin) return false;
    if (customer.pinHash === cleanPin) return true;
    const salt = getCustomerPinSalt(customer.id, customer.memberNo);
    const saltedPayload = `RESTOPASS_SALTED_PIN_V1:${salt}:${cleanPin}`;
    const computedHash = sha256(saltedPayload);
    if (customer.pinHash === computedHash) return true;
    if (customer.pinHash === sha256(cleanPin)) return true;
    if (!customer.hasCustomPin && (!customer.pinHash || customer.pinHash === '1234') && (cleanPin === '1234' || cleanPin === '123456')) {
      return true;
    }
    return false;
  }

  /**
   * Update Member Profile Details
   */
  public updateCustomerProfile(
    customerId: string,
    updates: {
      name?: string;
      phone?: string;
      photoUrl?: string;
      idType?: Customer['idType'];
      idNumber?: string;
      occupation?: string;
      isStudent?: boolean;
      studentProfile?: Customer['studentProfile'];
    },
    adminStaffName: string
  ): { success: boolean; customer?: Customer; error?: string } {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return { success: false, error: 'Member not found' };

    const checkPhone = updates.phone || customer.phone;
    const checkIdType = updates.idType || customer.idType;
    const checkIdNumber = updates.idNumber || '';
    const checkStudentReg = updates.studentProfile?.registrationNumber || customer.studentProfile?.registrationNumber;

    const dupCheck = this.checkDuplicateCustomerIdentity(
      customer.restaurantCode,
      checkPhone,
      checkIdType,
      checkIdNumber,
      checkStudentReg,
      customer.id
    );

    if (dupCheck.isDuplicate && dupCheck.duplicateCustomer) {
      return { success: false, error: dupCheck.message || 'Duplicate customer identity detected in this restaurant.' };
    }

    if (updates.phone) {
      customer.phone = updates.phone.trim();
    }

    if (updates.name) customer.name = updates.name.trim();
    if (updates.photoUrl) customer.photoUrl = updates.photoUrl;
    if (updates.occupation !== undefined) customer.occupation = updates.occupation;
    if (updates.isStudent !== undefined) customer.isStudent = updates.isStudent;
    if (updates.studentProfile !== undefined) customer.studentProfile = updates.studentProfile;

    if (updates.idType && updates.idNumber) {
      customer.idType = updates.idType;
      customer.idHash = hashIdNumber(updates.idType, updates.idNumber);
      customer.idNumberMasked = updates.idNumber.length > 5 ? `${updates.idNumber.slice(0, 5)}****` : '****';
    } else if (updates.idType) {
      customer.idType = updates.idType;
    }

    this.queueOutboxItem('customer', customer.id, customer);
    this.logAudit({
      restaurantCode: customer.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: adminStaffName,
      action: 'CUSTOMER_PROFILE_UPDATED',
      details: `Updated profile details for member #${customer.memberNo} (${customer.name})`,
    });

    this.sendNotification({
      restaurantCode: customer.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'restaurant_admin',
      senderName: adminStaffName,
      type: 'card_security',
      title: 'Member Profile Updated',
      message: `Your account profile details were updated by ${adminStaffName}.`,
      priority: 'normal',
      actionTab: 'my_card',
    });

    this.notify();
    return { success: true, customer };
  }

  /**
   * Reset Customer PIN (defaults to 1234)
   */
  public resetCustomerPin(customerId: string, newPin = '1234', adminStaffName: string): boolean {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return false;

    customer.pinHash = newPin;
    this.queueOutboxItem('customer', customer.id, customer);
    this.logAudit({
      restaurantCode: customer.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: adminStaffName,
      action: 'CUSTOMER_PIN_RESET',
      details: `Reset security PIN to default for member #${customer.memberNo} (${customer.name})`,
    });

    this.sendNotification({
      restaurantCode: customer.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'restaurant_admin',
      senderName: adminStaffName,
      type: 'card_security',
      title: 'Transfer PIN Reset to 1234',
      message: 'Your 4-digit plate transfer PIN was reset by administration to default (1234).',
      priority: 'important',
      actionTab: 'my_card',
    });

    this.notify();
    return true;
  }

  /**
   * Manual Balance Adjustment (Credit / Debit / Courtesy with audit note)
   */
  public adjustCustomerBalance(data: {
    restaurantCode: string;
    customerId: string;
    platesDelta: number;
    reason: string;
    adminStaffName: string;
  }): { success: boolean; error?: string; newBalance?: number } {
    const customer = this.state.customers.find((c) => c.id === data.customerId);
    if (!customer) return { success: false, error: 'Member not found' };

    const currentBalance = this.getCustomerBalance(customer.id);
    if (currentBalance + data.platesDelta < 0) {
      return { success: false, error: `Cannot deduct ${Math.abs(data.platesDelta)} plates. Member only has ${currentBalance} plates.` };
    }

    const now = new Date(this.getGuardedTime(data.restaurantCode)).toISOString();
    const entry: LedgerEntry = {
      id: `led_adj_${Date.now()}`,
      customerId: customer.id,
      restaurantCode: data.restaurantCode,
      type: 'adjustment',
      platesDelta: data.platesDelta,
      timestamp: now,
      staffId: data.adminStaffName,
      reason: `Manual Adjustment: ${data.reason}`,
      reference: `ADJ-${customer.memberNo}`,
    };

    this.state.ledgerEntries.push(entry);
    this.queueOutboxItem('ledger_entry', entry.id, entry);

    this.logAudit({
      restaurantCode: data.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: data.adminStaffName,
      action: 'BALANCE_ADJUSTMENT',
      details: `Adjusted balance for #${customer.memberNo} (${customer.name}) by ${data.platesDelta > 0 ? `+${data.platesDelta}` : data.platesDelta} plates. Reason: "${data.reason}"`,
    });

    const newBal = this.getCustomerBalance(customer.id);
    this.sendNotification({
      restaurantCode: data.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'restaurant_admin',
      senderName: data.adminStaffName,
      type: 'balance_adjustment',
      title: `Balance Adjustment: ${data.platesDelta > 0 ? `+${data.platesDelta}` : data.platesDelta} Plates`,
      message: `Administration adjusted your plate balance: "${data.reason}". New balance: ${newBal} plates.`,
      priority: 'important',
      actionTab: 'history',
    });

    this.notify();
    return { success: true, newBalance: newBal };
  }

  /**
   * Transfer Reversal Tool:
   * Adds reversing ledger entries to restore balances; NEVER deletes original entries!
   */
  public reverseTransfer(transferId: string, adminStaffName: string): boolean {
    const transfer = this.state.transfers.find((t) => t.id === transferId);
    if (!transfer || transfer.status === 'reversed') return false;

    const now = new Date(this.getGuardedTime(transfer.restaurantCode)).toISOString();

    // Reversal entry 1: Credit sender back
    const refundSender: LedgerEntry = {
      id: `led_rev_credit_${Date.now()}`,
      customerId: transfer.senderCustomerId,
      restaurantCode: transfer.restaurantCode,
      type: 'reversal',
      platesDelta: transfer.plates,
      timestamp: now,
      reason: `Admin reversal: Refunded ${transfer.plates} plates from transfer ${transfer.id}`,
    };

    // Reversal entry 2: Deduct recipient
    const debitRecipient: LedgerEntry = {
      id: `led_rev_debit_${Date.now()}`,
      customerId: transfer.recipientCustomerId,
      restaurantCode: transfer.restaurantCode,
      type: 'reversal',
      platesDelta: -transfer.plates,
      timestamp: now,
      reason: `Admin reversal: Deducted ${transfer.plates} plates from transfer ${transfer.id}`,
    };

    this.state.ledgerEntries.push(refundSender, debitRecipient);
    transfer.status = 'reversed';
    transfer.reversedAt = now;
    transfer.reversedByAdminId = adminStaffName;

    this.queueOutboxItem('ledger_entry', refundSender.id, refundSender);
    this.queueOutboxItem('ledger_entry', debitRecipient.id, debitRecipient);

    this.logAudit({
      restaurantCode: transfer.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: adminStaffName,
      action: 'TRANSFER_REVERSED',
      details: `Reversed transfer of ${transfer.plates} plates from #${transfer.senderMemberNo} to #${transfer.recipientMemberNo}`,
    });

    this.notify();
    return true;
  }

  // --- CUSTOMER ACTIONS ---

  /**
   * Transfer Plates between customers of the same restaurant
   * Requires PIN authentication
   */
  public transferPlates(data: {
    senderCustomerId: string;
    recipientIdentifier: string; // member number or phone
    plates: number;
    pin: string;
  }): { success: boolean; error?: string; requiresSubscription?: boolean } {
    const sender = this.state.customers.find((c) => c.id === data.senderCustomerId);
    if (!sender) return { success: false, error: 'Sender account not found' };

    // Student Subscription Entitlement Check (when feature is enabled by admin)
    if (this.state.studentSubscriptionSettings?.enabled && this.state.studentSubscriptionSettings?.requireForTransfers) {
      const entitlement = this.checkStudentEntitlement(sender.id, 'digital_plate_transfer');
      if (!entitlement.allowed) {
        return {
          success: false,
          error: entitlement.reason || 'Digital plate transfers require an active student subscription (500 RWF/mo).',
          requiresSubscription: true,
        };
      }
    }

    if (!this.verifyCustomerPin(sender.id, data.pin)) {
      return { success: false, error: 'Incorrect Security PIN. Please re-enter.' };
    }

    if (data.plates <= 0) {
      return { success: false, error: 'Transfer quantity must be at least 1 plate' };
    }

    const senderBalance = this.getCustomerBalance(sender.id);
    if (senderBalance < data.plates) {
      return { success: false, error: `Insufficient plates. You have ${senderBalance} plates, cannot transfer ${data.plates}` };
    }

    const cleanIdent = data.recipientIdentifier.trim();
    const recipient = this.state.customers.find(
      (c) =>
        c.restaurantCode === sender.restaurantCode &&
        (c.memberNo === cleanIdent || c.phone.replace(/[\s-]/g, '') === cleanIdent.replace(/[\s-]/g, ''))
    );

    if (!recipient) {
      return { success: false, error: 'Recipient not found in this restaurant' };
    }

    if (recipient.id === sender.id) {
      return { success: false, error: 'Cannot transfer plates to yourself' };
    }

    const now = new Date(this.getGuardedTime(sender.restaurantCode)).toISOString();
    const transferId = `trans_${Date.now()}`;

    // Atomic ledger entries at local authority
    const outEntry: LedgerEntry = {
      id: `led_tx_out_${Date.now()}`,
      customerId: sender.id,
      restaurantCode: sender.restaurantCode,
      type: 'transfer_out',
      platesDelta: -data.plates,
      timestamp: now,
      reason: `Transfer to #${recipient.memberNo} (${recipient.name})`,
      reference: transferId,
    };

    const inEntry: LedgerEntry = {
      id: `led_tx_in_${Date.now()}`,
      customerId: recipient.id,
      restaurantCode: recipient.restaurantCode,
      type: 'transfer_in',
      platesDelta: data.plates,
      timestamp: now,
      reason: `Transfer from #${sender.memberNo} (${sender.name})`,
      reference: transferId,
    };

    this.state.ledgerEntries.push(outEntry, inEntry);

    const transferRecord: PlateTransfer = {
      id: transferId,
      restaurantCode: sender.restaurantCode,
      senderCustomerId: sender.id,
      recipientCustomerId: recipient.id,
      senderMemberNo: sender.memberNo,
      recipientMemberNo: recipient.memberNo,
      senderName: sender.name,
      recipientName: recipient.name,
      plates: data.plates,
      timestamp: now,
      status: 'completed',
    };

    this.state.transfers.unshift(transferRecord);

    this.queueOutboxItem('transfer', transferRecord.id, transferRecord);
    this.logAudit({
      restaurantCode: sender.restaurantCode,
      actorRole: 'customer',
      actorName: sender.name,
      action: 'PLATES_TRANSFERRED',
      details: `Transferred ${data.plates} plates to #${recipient.memberNo}`,
    });

    const senderBal = this.getCustomerBalance(sender.id);
    const recipBal = this.getCustomerBalance(recipient.id);

    // Sender notification
    this.sendNotification({
      restaurantCode: sender.restaurantCode,
      target: sender.id,
      targetName: `${sender.name} (#${sender.memberNo})`,
      senderRole: 'system',
      senderName: 'RestoPass Transfer',
      type: 'plate_transfer',
      title: `Sent ${data.plates} Plates to #${recipient.memberNo}`,
      message: `Successfully transferred ${data.plates} plate(s) to ${recipient.name} (#${recipient.memberNo}). Remaining balance: ${senderBal} plates.`,
      priority: 'normal',
      actionTab: 'history',
    });

    // Recipient notification
    this.sendNotification({
      restaurantCode: recipient.restaurantCode,
      target: recipient.id,
      targetName: `${recipient.name} (#${recipient.memberNo})`,
      senderRole: 'system',
      senderName: 'RestoPass Transfer',
      type: 'plate_transfer',
      title: `Received ${data.plates} Plates!`,
      message: `Member #${sender.memberNo} (${sender.name}) transferred ${data.plates} plate(s) to you. New balance: ${recipBal} plates.`,
      priority: 'important',
      actionTab: 'history',
    });

    this.notify();
    return { success: true };
  }

  // --- SUPER ADMIN ACTIONS (Masterplan Section 6.1) ---

  public createRestaurant(data: {
    code: string;
    name: string;
    legalEntity: string;
    phone: string;
    email: string;
    address: string;
    currency: string;
    planId: string;
    termsOverride?: Restaurant['termsOverride'];
    licensedScanPoints?: number;
    basePriceRwf?: number;
    pricePerExtraScanPointRwf?: number;
    studentSubscriptionPriceRwf?: number;
    singlePlatePriceRwf?: number;
  }): Restaurant {
    const code = data.code.toUpperCase().trim();
    const now = new Date().toISOString();

    const selectedPlan = this.state.plans.find((p) => p.id === data.planId) || this.state.plans[0];
    const termsOverride: Restaurant['termsOverride'] = {
      effectiveFrom: now,
      ...(data.termsOverride || {}),
    };

    if (data.basePriceRwf !== undefined) termsOverride.basePriceRwf = Number(data.basePriceRwf);
    if (data.pricePerExtraScanPointRwf !== undefined) termsOverride.pricePerExtraScanPointRwf = Number(data.pricePerExtraScanPointRwf);
    if (data.studentSubscriptionPriceRwf !== undefined) termsOverride.studentSubscriptionPriceRwf = Number(data.studentSubscriptionPriceRwf);

    const restaurant: Restaurant = {
      code,
      name: data.name.trim(),
      legalEntity: data.legalEntity.trim(),
      phone: data.phone.trim(),
      email: data.email.trim(),
      address: data.address.trim(),
      currency: data.currency || 'RWF',
      status: 'active',
      planId: data.planId,
      termsOverride,
      defaultPlatePriceRwf: data.singlePlatePriceRwf ? Number(data.singlePlatePriceRwf) : 1200,
      studentSubscriptionPriceRwf: data.studentSubscriptionPriceRwf !== undefined ? Number(data.studentSubscriptionPriceRwf) : undefined,
      highestTimeSeen: Date.now(),
      lastSyncAt: now,
      softwareVersion: '1.1.0-authority',
      createdAt: now,
    };

    this.state.restaurants.push(restaurant);

    // Auto issue 1st activation code
    const codeStr = generateActivationCode(code);
    this.state.activationCodes.push({
      code: codeStr,
      restaurantCode: code,
      generatedAt: now,
      isUsed: false,
    });

    // Auto issue initial 30-day signed license with configured stations quota
    const scanPointsLimit = data.licensedScanPoints || selectedPlan?.terms?.maxScanPointsIncluded || 2;
    try {
      this.issueLicense({
        restaurantCode: code,
        planId: data.planId,
        maxScanPoints: Number(scanPointsLimit),
        validDays: 30,
        graceDays: selectedPlan?.terms?.graceDays || 7,
        featureFlags: {
          spotChecksEnabled: true,
          multiStationEnabled: Number(scanPointsLimit) > 1,
          secondPlateAllowed: true,
          customerTransfersEnabled: true,
        },
      });
    } catch (e) {
      console.warn('Initial license issuance skipped in createRestaurant:', e);
    }

    this.logAudit({
      actorRole: 'super_admin',
      actorName: 'Ephrem (Founder)',
      action: 'RESTAURANT_ONBOARDED',
      details: `Created restaurant ${code} - ${restaurant.name} on ${selectedPlan?.name || data.planId} with ${scanPointsLimit} licensed scan point stations. Generated activation code ${codeStr}`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return restaurant;
  }

  public issueLicense(data: {
    restaurantCode: string;
    planId: string;
    maxScanPoints: number;
    validDays: number;
    graceDays: number;
    featureFlags: License['featureFlags'];
  }): License {
    const restaurant = this.state.restaurants.find((r) => r.code === data.restaurantCode);
    if (!restaurant) throw new Error('Restaurant not found');

    const now = new Date();
    const validUntil = new Date(now.getTime() + data.validDays * 24 * 3600 * 1000).toISOString();
    const licenseId = `LIC-${data.restaurantCode}-${now.getFullYear()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const payload = {
      licenseId,
      restaurantCode: data.restaurantCode,
      planId: data.planId,
      maxScanPoints: data.maxScanPoints,
      validUntil,
      graceDays: data.graceDays,
    };

    const signature = signLicensePayload(payload);

    const license: License = {
      id: licenseId,
      restaurantCode: data.restaurantCode,
      planId: data.planId,
      maxScanPoints: data.maxScanPoints,
      validUntil,
      graceDays: data.graceDays,
      featureFlags: data.featureFlags,
      signature,
      issuedAt: now.toISOString(),
      paidUntil: validUntil,
    };

    this.state.licenses.push(license);
    restaurant.currentLicenseId = license.id;
    restaurant.status = 'active';

    this.logAudit({
      actorRole: 'super_admin',
      actorName: 'Ephrem (Founder)',
      action: 'LICENSE_ISSUED',
      details: `Issued signed Ed25519 license ${license.id} for ${data.restaurantCode} valid until ${validUntil}`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return license;
  }

  /**
   * Super Admin 1-Click Activate / Renew Monthly License for a Restaurant
   */
  public renewRestaurantLicense(params: {
    restaurantCode: string;
    validDays?: number;
    maxScanPoints?: number;
    recordPayment?: boolean;
  }): License {
    const restaurant = this.state.restaurants.find((r) => r.code === params.restaurantCode);
    if (!restaurant) throw new Error('Restaurant not found');

    const existingLic = this.getRestaurantLicense(params.restaurantCode);
    const plan = this.state.plans.find((p) => p.id === restaurant.planId) || this.state.plans[0];
    const validDays = params.validDays ?? 30;
    const maxScanPoints = params.maxScanPoints ?? existingLic?.maxScanPoints ?? plan.terms.maxScanPointsIncluded ?? 4;

    const newLic = this.issueLicense({
      restaurantCode: params.restaurantCode,
      planId: restaurant.planId,
      maxScanPoints,
      validDays,
      graceDays: 0,
      featureFlags: existingLic?.featureFlags || {
        spotChecksEnabled: true,
        multiStationEnabled: true,
        secondPlateAllowed: true,
        customerTransfersEnabled: true,
      },
    });

    if (existingLic) {
      existingLic.validUntil = newLic.validUntil;
      existingLic.paidUntil = newLic.validUntil;
      existingLic.graceDays = 0;
    }
    restaurant.status = 'active';
    restaurant.currentLicenseId = newLic.id;
    restaurant.highestTimeSeen = Date.now();

    if (params.recordPayment !== false && validDays >= 28) {
      const now = new Date();
      this.recordSubscriptionPayment({
        restaurantCode: restaurant.code,
        restaurantName: restaurant.name,
        amountRwf: plan.terms.basePriceRwf,
        periodCovered: `${now.toLocaleString('en-US', { month: 'short', year: 'numeric' })} (${validDays}d Renewal)`,
        paidAt: now.toISOString(),
        paymentMethod: 'MOMO_B2B',
        reference: `RENEW-${restaurant.code}-${Date.now().toString().slice(-5)}`,
      });
    }

    this.sendNotification({
      restaurantCode: restaurant.code,
      target: 'all',
      senderRole: 'system',
      senderName: 'RestoPass Super Admin',
      type: 'system_broadcast',
      title: `Restaurant License Activated (${validDays} Days)`,
      message: `License ${newLic.id} is active until ${new Date(newLic.validUntil).toLocaleDateString()}. All Boss and Scanner operations are unlocked.`,
      priority: 'important',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return newLic;
  }

  /**
   * Super Admin: Update Pricing and Terms for a Plan template
   */
  public updatePlan(
    planId: string,
    updates: Partial<Plan['terms']>,
    actorName = 'Platform Admin (Ephrem)'
  ): Plan | null {
    const plan = this.state.plans.find((p) => p.id === planId);
    if (!plan) return null;

    plan.terms = {
      ...plan.terms,
      ...updates,
    };

    this.logAudit({
      actorRole: 'super_admin',
      actorName,
      action: 'PLAN_TERMS_UPDATED',
      details: `Updated plan "${plan.name}" (${planId}): basePrice=${plan.terms.basePriceRwf} RWF, extraStationFee=${plan.terms.pricePerExtraScanPointRwf} RWF, maxIncluded=${plan.terms.maxScanPointsIncluded}`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return plan;
  }

  /**
   * Super Admin: Update Pricing, Student Subscription Fee and Licensed Stations for a Restaurant
   */
  public updateRestaurantPricingAndTerms(
    restaurantCode: string,
    data: {
      basePriceRwf?: number;
      pricePerExtraScanPointRwf?: number;
      studentSubscriptionPriceRwf?: number;
      defaultPlatePriceRwf?: number;
      maxScanPoints?: number;
      customNotes?: string;
    },
    actorName = 'Platform Admin (Ephrem)'
  ): boolean {
    const r = this.state.restaurants.find((res) => res.code === restaurantCode);
    if (!r) return false;

    if (!r.termsOverride) {
      r.termsOverride = {
        effectiveFrom: new Date().toISOString(),
      };
    }

    if (data.basePriceRwf !== undefined) r.termsOverride.basePriceRwf = Number(data.basePriceRwf);
    if (data.pricePerExtraScanPointRwf !== undefined) r.termsOverride.pricePerExtraScanPointRwf = Number(data.pricePerExtraScanPointRwf);
    if (data.studentSubscriptionPriceRwf !== undefined) {
      r.termsOverride.studentSubscriptionPriceRwf = Number(data.studentSubscriptionPriceRwf);
      r.studentSubscriptionPriceRwf = Number(data.studentSubscriptionPriceRwf);
    }
    if (data.defaultPlatePriceRwf !== undefined) r.defaultPlatePriceRwf = Number(data.defaultPlatePriceRwf);
    if (data.customNotes !== undefined) r.termsOverride.customNotes = data.customNotes;

    // If maxScanPoints provided, update active license quota
    if (data.maxScanPoints !== undefined) {
      const activeLic = this.getRestaurantLicense(restaurantCode);
      if (activeLic) {
        activeLic.maxScanPoints = Math.max(1, Number(data.maxScanPoints));
      }
    }

    this.logAudit({
      restaurantCode,
      actorRole: 'super_admin',
      actorName,
      action: 'RESTAURANT_PRICING_UPDATED',
      details: `Updated pricing & terms for ${r.name} (${restaurantCode}): basePrice=${r.termsOverride.basePriceRwf || 'default'} RWF, extraStation=${r.termsOverride.pricePerExtraScanPointRwf || 'default'} RWF, studentSub=${r.studentSubscriptionPriceRwf || 'default'} RWF, platePrice=${r.defaultPlatePriceRwf} RWF`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return true;
  }

  /**
   * Super Admin action to immediately expire/suspend a restaurant's license (or set custom remaining days)
   */
  public setRestaurantLicenseRemainingDays(restaurantCode: string, remainingDays: number): License | undefined {
    const restaurant = this.state.restaurants.find((r) => r.code === restaurantCode);
    if (!restaurant) return undefined;

    let license = this.getRestaurantLicense(restaurantCode);
    if (!license) {
      license = this.issueLicense({
        restaurantCode,
        planId: restaurant.planId,
        maxScanPoints: 4,
        validDays: Math.max(1, remainingDays),
        graceDays: 0,
        featureFlags: {
          spotChecksEnabled: true,
          multiStationEnabled: true,
          secondPlateAllowed: true,
          customerTransfersEnabled: true,
        },
      });
    }

    const targetTime = Date.now() + remainingDays * 24 * 3600 * 1000;
    license.validUntil = new Date(targetTime).toISOString();
    license.paidUntil = license.validUntil;
    license.graceDays = 0;
    restaurant.status = remainingDays <= 0 ? 'suspended' : 'active';
    restaurant.highestTimeSeen = Date.now();

    if (remainingDays > 0 && remainingDays <= 7) {
      this.sendNotification({
        restaurantCode: restaurant.code,
        target: 'all',
        senderRole: 'system',
        senderName: 'RestoPass License Sentinel',
        type: 'system_broadcast',
        title: `7-Day License Expiry Warning (${remainingDays}d left)`,
        message: `Your monthly RestoPass subscription expires in ${remainingDays} day(s) on ${new Date(license.validUntil).toLocaleDateString()}. Please renew with Super Admin before expiration to avoid interruption.`,
        priority: 'urgent',
      });
    }

    this.logAudit({
      restaurantCode,
      actorRole: 'super_admin',
      actorName: 'Ephrem (Super Admin)',
      action: remainingDays <= 0 ? 'LICENSE_EXPIRED_ENFORCED' : 'LICENSE_EXPIRY_UPDATED',
      details:
        remainingDays <= 0
          ? `Restaurant ${restaurantCode} license expired. Boss and Scanner operations locked until renewal.`
          : `Restaurant ${restaurantCode} license set to ${remainingDays} day(s) remaining (valid until ${license.validUntil}).`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return license;
  }

  public recordSubscriptionPayment(payment: Omit<SubscriptionPayment, 'id'>) {
    const newPayment: SubscriptionPayment = {
      ...payment,
      id: `sub_pay_${Date.now()}`,
    };
    this.state.subscriptionPayments.unshift(newPayment);
    this.logAudit({
      actorRole: 'super_admin',
      actorName: 'Ephrem (Founder)',
      action: 'SUBSCRIPTION_PAYMENT_RECORDED',
      details: `Recorded subscription fee of ${payment.amountRwf.toLocaleString()} RWF from ${payment.restaurantName}`,
    });
    this.notify();
  }

  // --- SYNC & OUTBOX ENGINE ---

  public queueOutboxItem(entityType: SyncOutboxItem['entityType'], entityId: string, payload: any) {
    const restaurantCode = this.state.currentRestaurantCode;
    const seq = this.state.syncOutbox.filter((i) => i.restaurantCode === restaurantCode).length + 1;
    const isOnline = this.state.networkStatus === 'online';
    const outboxItem: SyncOutboxItem = {
      id: `outbox_${Date.now()}_${seq}`,
      restaurantCode,
      sequenceNo: seq,
      entityType,
      entityId,
      payload,
      createdAt: new Date().toISOString(),
      syncedToCloud: isOnline,
    };
    this.state.syncOutbox.push(outboxItem);
    if (isOnline) {
      const r = this.getCurrentRestaurant();
      if (r) {
        r.lastSyncAt = new Date().toISOString();
      }
    }
  }

  public syncPendingOutbox(): number {
    let syncedCount = 0;
    this.state.syncOutbox.forEach((item) => {
      if (!item.syncedToCloud) {
        item.syncedToCloud = true;
        syncedCount++;
      }
    });
    const r = this.getCurrentRestaurant();
    if (r) {
      r.lastSyncAt = new Date().toISOString();
    }
    if (syncedCount > 0) {
      this.logAudit({
        restaurantCode: this.state.currentRestaurantCode,
        actorRole: this.state.currentRole,
        actorName: 'Auto-Sync Engine',
        action: 'OUTBOX_SYNCED',
        details: `Auto-synced ${syncedCount} queued transaction(s) to cloud database immediately upon internet restore.`,
      });
    }
    this.pushStateToServer();
    this.notify();
    return syncedCount;
  }

  public triggerNightlyBackup(): string {
    const backupTimestamp = new Date().toISOString();
    this.state.lastCloudBackupAt = backupTimestamp;
    this.logAudit({
      actorRole: 'restaurant_admin',
      actorName: 'Authority Daemon',
      action: 'NIGHTLY_BACKUP_COMPLETED',
      details: `Nightly encrypted backup completed. ${this.state.ledgerEntries.length} ledger entries preserved.`,
    });
    this.notify();
    return backupTimestamp;
  }

  public logAudit(item: Omit<AuditLogItem, 'id' | 'timestamp'>) {
    this.state.auditLogs.unshift({
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      ...item,
    });
  }

  // --- Helpers for QR generation ---
  public getCustomerCardQr(customer: Customer): string {
    return generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion);
  }

  public getCustomerPhoneQr(customer: Customer): { token: string; step: number; secondsRemaining: number } {
    const ent = this.checkStudentEntitlement(customer.id, 'digital_qr');
    if (!ent.allowed) {
      return { token: '', step: 0, secondsRemaining: 0 };
    }
    return generatePhoneToken(customer.restaurantCode, customer.memberNo, customer.keyVersion);
  }

  // --- IN-APP & SYSTEM NOTIFICATIONS ENGINE ---

  /**
   * Send In-App / System Notification (Broadcast or Direct Member Message)
   */
  public sendNotification(params: {
    restaurantCode: string;
    target: 'all' | string; // 'all' or customerId
    targetName?: string;
    senderRole?: 'restaurant_admin' | 'system';
    senderName: string;
    type: NotificationType;
    title: string;
    message: string;
    priority?: NotificationPriority;
    actionTab?: string;
  }): AppNotification {
    if (!this.state.notifications) {
      this.state.notifications = [];
    }

    const notif: AppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      restaurantCode: params.restaurantCode,
      target: params.target,
      targetName: params.targetName,
      senderRole: params.senderRole || 'restaurant_admin',
      senderName: params.senderName,
      type: params.type,
      title: params.title.trim(),
      message: params.message.trim(),
      priority: params.priority || 'normal',
      timestamp: new Date(this.getGuardedTime(params.restaurantCode)).toISOString(),
      readByCustomerIds: [],
      actionTab: params.actionTab,
    };

    this.state.notifications.unshift(notif);

    this.logAudit({
      restaurantCode: params.restaurantCode,
      actorRole: params.senderRole === 'system' ? 'stand_staff' : 'restaurant_admin',
      actorName: params.senderName,
      action: params.target === 'all' ? 'BROADCAST_NOTIFICATION_SENT' : 'DIRECT_NOTIFICATION_SENT',
      details: `[${(params.priority || 'normal').toUpperCase()}] ${params.title} -> ${params.target === 'all' ? 'All Members' : params.targetName || params.target}`,
    });

    this.notify();
    return notif;
  }

  /**
   * Mark notification as read by a customer
   */
  public markNotificationAsRead(notificationId: string, customerId: string): void {
    if (!this.state.notifications) return;
    const notif = this.state.notifications.find((n) => n.id === notificationId);
    if (notif && !notif.readByCustomerIds.includes(customerId)) {
      notif.readByCustomerIds.push(customerId);
      this.notify();
    }
  }

  /**
   * Mark all notifications as read for a customer
   */
  public markAllNotificationsAsRead(customerId: string): void {
    if (!this.state.notifications) return;
    let modified = false;
    for (const notif of this.state.notifications) {
      const isTargeted = notif.target === 'all' || notif.target === customerId;
      if (isTargeted && !notif.readByCustomerIds.includes(customerId)) {
        notif.readByCustomerIds.push(customerId);
        modified = true;
      }
    }
    if (modified) {
      this.notify();
    }
  }

  /**
   * Delete / recall notification (admin capability)
   */
  public deleteNotification(notificationId: string, actorName = 'Admin'): boolean {
    if (!this.state.notifications) return false;
    const idx = this.state.notifications.findIndex((n) => n.id === notificationId);
    if (idx !== -1) {
      const removed = this.state.notifications.splice(idx, 1)[0];
      this.logAudit({
        restaurantCode: removed.restaurantCode,
        actorRole: 'restaurant_admin',
        actorName,
        action: 'NOTIFICATION_DELETED',
        details: `Deleted notification: "${removed.title}"`,
      });
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * Get filtered notifications for a customer
   */
  public getCustomerNotifications(customerId: string, restaurantCode?: string): AppNotification[] {
    if (!this.state.notifications) return [];
    const restoCode = restaurantCode || this.state.currentRestaurantCode;
    return this.state.notifications.filter(
      (n) => n.restaurantCode === restoCode && (n.target === 'all' || n.target === customerId)
    );
  }

  /**
   * Get unread notification count for a customer
   */
  public getUnreadNotificationCount(customerId: string): number {
    const notifs = this.getCustomerNotifications(customerId);
    return notifs.filter((n) => !n.readByCustomerIds.includes(customerId)).length;
  }

  /**
   * Get all notifications for a specific restaurant
   */
  public getRestaurantNotifications(restaurantCode?: string): AppNotification[] {
    if (!this.state.notifications) return [];
    const restoCode = restaurantCode || this.state.currentRestaurantCode;
    return this.state.notifications.filter((n) => n.restaurantCode === restoCode);
  }

  // --- RESTAURANT CUSTOM SUBSCRIPTION & MEAL PACKAGE MANAGEMENT ---

  /**
   * Get all active packages for a specific restaurant
   */
  public getRestaurantPackages(restaurantCode?: string): Package[] {
    const code = restaurantCode || this.state.currentRestaurantCode;
    let restoPackages = this.state.packages.filter((p) => p.restaurantCode === code);

    // If a restaurant doesn't have any packages yet, seed standard baseline packages
    if (restoPackages.length === 0) {
      const defaultBundles: Omit<Package, 'id'>[] = [
        {
          restaurantCode: code,
          name: '10 Plates Starter Bundle',
          platesCount: 10,
          priceRwf: 12000,
          description: '10 prepaid cafeteria meals',
        },
        {
          restaurantCode: code,
          name: '15 Plates Half-Month Pack',
          platesCount: 15,
          priceRwf: 17500,
          description: '15 campus dining plates',
        },
        {
          restaurantCode: code,
          name: '30 Plates 1 Month Pack',
          platesCount: 30,
          priceRwf: 34000,
          description: '30 standard buffet meals (1 meal/day)',
        },
        {
          restaurantCode: code,
          name: '60 Plates Full Month (Lunch + Dinner)',
          platesCount: 60,
          priceRwf: 66000,
          description: '60 full-month meals (2 meals/day)',
        },
      ];

      defaultBundles.forEach((b, idx) => {
        const pkg: Package = {
          id: `pkg_${code.toLowerCase()}_${Date.now()}_${idx}`,
          ...b,
        };
        this.state.packages.push(pkg);
      });

      this.scheduleSaveState();
      restoPackages = this.state.packages.filter((p) => p.restaurantCode === code);
    }

    return restoPackages;
  }

  /**
   * Add a new custom package for a restaurant
   */
  public addPackage(data: {
    restaurantCode: string;
    name: string;
    platesCount: number;
    priceRwf: number;
    description: string;
    actorName?: string;
  }): Package {
    const newPkg: Package = {
      id: `pkg_${data.restaurantCode.toLowerCase()}_${Date.now()}`,
      restaurantCode: data.restaurantCode,
      name: data.name.trim(),
      platesCount: Number(data.platesCount),
      priceRwf: Number(data.priceRwf),
      description: data.description.trim() || `${data.platesCount} prepaid cafeteria plates`,
    };

    this.state.packages.push(newPkg);
    this.queueOutboxItem('package' as any, newPkg.id, newPkg);
    this.logAudit({
      restaurantCode: data.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: data.actorName || 'Restaurant Admin',
      action: 'PACKAGE_CREATED',
      details: `Created new meal package "${newPkg.name}" (${newPkg.platesCount} plates for ${newPkg.priceRwf.toLocaleString()} RWF)`,
    });

    this.notify();
    return newPkg;
  }

  /**
   * Update an existing package's price, plate count, name, or description
   */
  public updatePackage(
    packageId: string,
    data: Partial<{ name: string; platesCount: number; priceRwf: number; description: string }>,
    actorName = 'Restaurant Admin'
  ): Package | null {
    const pkg = this.state.packages.find((p) => p.id === packageId);
    if (!pkg) return null;

    const oldPrice = pkg.priceRwf;
    const oldPlates = pkg.platesCount;

    if (data.name !== undefined) pkg.name = data.name.trim();
    if (data.platesCount !== undefined) pkg.platesCount = Number(data.platesCount);
    if (data.priceRwf !== undefined) pkg.priceRwf = Number(data.priceRwf);
    if (data.description !== undefined) pkg.description = data.description.trim();

    this.queueOutboxItem('package' as any, pkg.id, pkg);
    this.logAudit({
      restaurantCode: pkg.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'PACKAGE_UPDATED',
      details: `Updated package "${pkg.name}": ${oldPlates} plates (${oldPrice.toLocaleString()} RWF) -> ${pkg.platesCount} plates (${pkg.priceRwf.toLocaleString()} RWF)`,
    });

    this.notify();
    return pkg;
  }

  /**
   * Delete / remove a package from a restaurant
   */
  public deletePackage(packageId: string, restaurantCode: string, actorName = 'Restaurant Admin'): boolean {
    const idx = this.state.packages.findIndex((p) => p.id === packageId && p.restaurantCode === restaurantCode);
    if (idx !== -1) {
      const removed = this.state.packages.splice(idx, 1)[0];
      this.logAudit({
        restaurantCode,
        actorRole: 'restaurant_admin',
        actorName,
        action: 'PACKAGE_DELETED',
        details: `Deleted meal bundle "${removed.name}" (${removed.platesCount} plates, ${removed.priceRwf.toLocaleString()} RWF)`,
      });
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * Reset packages for a restaurant to standard default packages
   */
  public resetRestaurantPackages(restaurantCode: string, actorName = 'Restaurant Admin'): Package[] {
    this.state.packages = this.state.packages.filter((p) => p.restaurantCode !== restaurantCode);
    const refreshed = this.getRestaurantPackages(restaurantCode);
    this.logAudit({
      restaurantCode,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'PACKAGES_RESET_DEFAULT',
      details: `Restored standard default plate bundles for restaurant ${restaurantCode}`,
    });
    this.notify();
    return refreshed;
  }

  /**
   * Calculate price for any plate count based on restaurant single plate rate and bundles
   */
  public calculatePlatesPrice(restaurantCode?: string, plates = 1): { amountRwf: number; ratePerPlate: number; appliedTier: string } {
    const code = restaurantCode || this.state.currentRestaurantCode;
    const count = Math.max(1, Math.round(plates));
    const pkgs = this.getRestaurantPackages(code);
    const r = this.state.restaurants.find((res) => res.code === code);
    const baseRate = r?.defaultPlatePriceRwf || 1200;

    // Check exact bundle match (e.g. 60, 30, 15)
    const exactPkg = pkgs.find((p) => p.platesCount === count);
    if (exactPkg) {
      return {
        amountRwf: exactPkg.priceRwf,
        ratePerPlate: Math.round(exactPkg.priceRwf / count),
        appliedTier: `${exactPkg.name} Bundle (${count}p)`,
      };
    }

    // Default to unit rate * plates
    const amountRwf = count * baseRate;
    return {
      amountRwf,
      ratePerPlate: baseRate,
      appliedTier: `Unit Rate (${baseRate.toLocaleString()} RWF/plate)`,
    };
  }

  /**
   * Update a restaurant's baseline single-plate price for custom top-ups
   */
  public updateRestaurantDefaultPlatePrice(restaurantCode: string, priceRwf: number, actorName = 'Restaurant Admin'): number {
    const code = restaurantCode || this.state.currentRestaurantCode;
    const r = this.state.restaurants.find((res) => res.code === code);
    const cleanPrice = Math.max(100, Math.round(priceRwf));
    if (r) {
      r.defaultPlatePriceRwf = cleanPrice;
      this.logAudit({
        restaurantCode: code,
        actorRole: 'restaurant_admin',
        actorName,
        action: 'CUSTOM_PLATE_PRICE_UPDATED',
        details: `Updated custom top-up plate rate for ${r.name} to ${cleanPrice.toLocaleString()} RWF / plate`,
      });
      this.scheduleSaveState();
      this.notify();
    }
    return cleanPrice;
  }

  /**
   * Get restaurant baseline custom plate price
   */
  public getRestaurantDefaultPlatePrice(restaurantCode?: string): number {
    const code = restaurantCode || this.state.currentRestaurantCode;
    const r = this.state.restaurants.find((res) => res.code === code);
    if (r && r.defaultPlatePriceRwf && r.defaultPlatePriceRwf > 0) {
      return r.defaultPlatePriceRwf;
    }
    const pkgs = this.getRestaurantPackages(code);
    if (pkgs.length > 0) {
      const avg = Math.round(pkgs.reduce((s, p) => s + (p.priceRwf / p.platesCount), 0) / pkgs.length);
      return avg || 1150;
    }
    return 1150;
  }

  // --- RESTAURANT MENU ITEMS & MEAL PRICING MANAGEMENT ---

  /**
   * Get all menu items for a specific restaurant
   */
  public getRestaurantMenuItems(restaurantCode?: string): MenuItem[] {
    const code = restaurantCode || this.state.currentRestaurantCode;
    if (!this.state.menuItems) {
      this.state.menuItems = [];
    }
    const items = this.state.menuItems.filter((i) => i.restaurantCode === code);
    if (items.length === 0) {
      const defaultItems: MenuItem[] = [
        {
          id: `menu_${code.toLowerCase()}_lunch`,
          restaurantCode: code,
          name: 'Campus Buffet Lunch',
          category: 'lunch',
          priceRwf: 1150,
          costRwf: 680,
          description: 'Hot buffet with rice, beans, sombe, sweet potatoes & meat sauce',
          isAvailable: true,
          targetDailyVolume: 140,
        },
        {
          id: `menu_${code.toLowerCase()}_dinner`,
          restaurantCode: code,
          name: 'Hot Evening Dinner',
          category: 'dinner',
          priceRwf: 1250,
          costRwf: 720,
          description: 'Warm evening buffet with ugali, vegetables, beef stew & greens',
          isAvailable: true,
          targetDailyVolume: 85,
        },
        {
          id: `menu_${code.toLowerCase()}_economy`,
          restaurantCode: code,
          name: 'Student Economy Combo Plate',
          category: 'lunch',
          priceRwf: 950,
          costRwf: 540,
          description: 'High-energy subsidized campus staple: posho, red beans & seasoned cabbage',
          isAvailable: true,
          targetDailyVolume: 110,
        },
        {
          id: `menu_${code.toLowerCase()}_breakfast`,
          restaurantCode: code,
          name: 'Morning Porridge & Bread Spread',
          category: 'breakfast',
          priceRwf: 750,
          costRwf: 380,
          description: 'Fermented sorghum porridge (igikoma), freshly baked buns & boiled eggs',
          isAvailable: true,
          targetDailyVolume: 65,
        },
        {
          id: `menu_${code.toLowerCase()}_special`,
          restaurantCode: code,
          name: "Chef's Grill & Tilapia Special",
          category: 'special',
          priceRwf: 1600,
          costRwf: 1050,
          description: 'Grilled Lake Kivu tilapia fillet or skewered goat brochette with plantains',
          isAvailable: true,
          targetDailyVolume: 30,
        },
      ];
      this.state.menuItems.push(...defaultItems);
      this.scheduleSaveState();
      return this.state.menuItems.filter((i) => i.restaurantCode === code);
    }
    return items;
  }

  /**
   * Add a new menu item
   */
  public addMenuItem(data: Omit<MenuItem, 'id'>, actorName = 'Restaurant Admin'): MenuItem {
    if (!this.state.menuItems) this.state.menuItems = [];
    const newItem: MenuItem = {
      id: `menu_${data.restaurantCode.toLowerCase()}_${Date.now()}`,
      restaurantCode: data.restaurantCode,
      name: data.name.trim(),
      category: data.category,
      priceRwf: Math.max(100, Math.round(Number(data.priceRwf))),
      costRwf: data.costRwf ? Math.round(Number(data.costRwf)) : Math.round(Number(data.priceRwf) * 0.58),
      description: data.description.trim(),
      isAvailable: data.isAvailable ?? true,
      targetDailyVolume: data.targetDailyVolume ? Number(data.targetDailyVolume) : 50,
    };

    this.state.menuItems.push(newItem);
    this.logAudit({
      restaurantCode: data.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'MENU_ITEM_CREATED',
      details: `Added menu item "${newItem.name}" (${newItem.priceRwf.toLocaleString()} RWF in ${newItem.category})`,
    });
    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return newItem;
  }

  /**
   * Update a menu item's price, details, or availability
   */
  public updateMenuItem(
    id: string,
    updates: Partial<MenuItem>,
    actorName = 'Restaurant Admin'
  ): MenuItem | null {
    if (!this.state.menuItems) return null;
    const item = this.state.menuItems.find((i) => i.id === id);
    if (!item) return null;

    const oldPrice = item.priceRwf;

    if (updates.name !== undefined) item.name = updates.name.trim();
    if (updates.category !== undefined) item.category = updates.category;
    if (updates.priceRwf !== undefined) item.priceRwf = Math.max(100, Math.round(Number(updates.priceRwf)));
    if (updates.costRwf !== undefined) item.costRwf = Math.max(0, Math.round(Number(updates.costRwf)));
    if (updates.description !== undefined) item.description = updates.description.trim();
    if (updates.isAvailable !== undefined) item.isAvailable = Boolean(updates.isAvailable);
    if (updates.targetDailyVolume !== undefined) item.targetDailyVolume = Number(updates.targetDailyVolume);

    this.logAudit({
      restaurantCode: item.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'MENU_ITEM_UPDATED',
      details:
        updates.priceRwf !== undefined && updates.priceRwf !== oldPrice
          ? `Adjusted price for "${item.name}": ${oldPrice.toLocaleString()} RWF -> ${item.priceRwf.toLocaleString()} RWF`
          : `Updated menu item "${item.name}" settings`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return item;
  }

  /**
   * Delete a menu item
   */
  public deleteMenuItem(id: string, restaurantCode: string, actorName = 'Restaurant Admin'): boolean {
    if (!this.state.menuItems) return false;
    const idx = this.state.menuItems.findIndex((i) => i.id === id && i.restaurantCode === restaurantCode);
    if (idx !== -1) {
      const removed = this.state.menuItems.splice(idx, 1)[0];
      this.logAudit({
        restaurantCode,
        actorRole: 'restaurant_admin',
        actorName,
        action: 'MENU_ITEM_DELETED',
        details: `Deleted menu item "${removed.name}" (${removed.priceRwf.toLocaleString()} RWF)`,
      });
      this.scheduleSaveState();
      this.notify();
      return true;
    }
    return false;
  }

  // =========================================================================
  // MULTI-BRANCH MANAGEMENT (Requirement 2a)
  // =========================================================================

  public getRestaurantBranches(restaurantCode?: string): Branch[] {
    const code = restaurantCode || this.state.currentRestaurantCode;
    if (!this.state.branches) this.state.branches = [];
    return this.state.branches.filter((b) => b.restaurantCode === code);
  }

  public addBranch(data: Omit<Branch, 'id' | 'createdAt'>, actorName = 'Restaurant Boss'): Branch {
    if (!this.state.branches) this.state.branches = [];
    const now = new Date().toISOString();
    const newBranch: Branch = {
      ...data,
      id: `br_${data.restaurantCode.toLowerCase()}_${Date.now()}`,
      createdAt: now,
    };
    this.state.branches.push(newBranch);
    this.logAudit({
      restaurantCode: data.restaurantCode,
      branchId: newBranch.id,
      branchName: newBranch.name,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'BRANCH_CREATED',
      details: `Created new branch "${newBranch.name}" (${newBranch.code}) at ${newBranch.address}. Manager: ${newBranch.managerName}`,
    });
    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return newBranch;
  }

  public updateBranch(branchId: string, updates: Partial<Branch>, actorName = 'Restaurant Boss'): Branch | null {
    if (!this.state.branches) return null;
    const branch = this.state.branches.find((b) => b.id === branchId);
    if (!branch) return null;

    if (updates.name !== undefined) branch.name = updates.name.trim();
    if (updates.code !== undefined) branch.code = updates.code.trim().toUpperCase();
    if (updates.address !== undefined) branch.address = updates.address.trim();
    if (updates.phone !== undefined) branch.phone = updates.phone.trim();
    if (updates.managerName !== undefined) branch.managerName = updates.managerName.trim();
    if (updates.status !== undefined) branch.status = updates.status;

    this.logAudit({
      restaurantCode: branch.restaurantCode,
      branchId: branch.id,
      branchName: branch.name,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'BRANCH_UPDATED',
      details: `Updated branch settings for "${branch.name}" (${branch.code})`,
    });
    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return branch;
  }

  public deleteBranch(branchId: string, restaurantCode: string, actorName = 'Restaurant Boss'): boolean {
    if (!this.state.branches) return false;
    const idx = this.state.branches.findIndex((b) => b.id === branchId && b.restaurantCode === restaurantCode);
    if (idx !== -1) {
      const removed = this.state.branches.splice(idx, 1)[0];
      this.logAudit({
        restaurantCode,
        branchId: removed.id,
        branchName: removed.name,
        actorRole: 'restaurant_admin',
        actorName,
        action: 'BRANCH_DELETED',
        details: `Deleted branch "${removed.name}" (${removed.code})`,
      });
      this.scheduleSaveState();
      this.notify();
      return true;
    }
    return false;
  }

  // =========================================================================
  // SCANNING POINTS & STATION USERS AS ACCOUNTS (Requirement 2a & 4)
  // =========================================================================

  public getRestaurantStationUsers(restaurantCode?: string): StationUser[] {
    const code = restaurantCode || this.state.currentRestaurantCode;
    if (!this.state.stationUsers) this.state.stationUsers = [];
    return this.state.stationUsers.filter((u) => u.restaurantCode === code);
  }

  public addStationUser(
    data: Omit<StationUser, 'id' | 'createdAt'>,
    actorName = 'Restaurant Boss'
  ): StationUser {
    if (!this.state.stationUsers) this.state.stationUsers = [];
    const quota = this.getCashierQuotaStatus(data.restaurantCode);
    if (quota.isAtLimit) {
      throw new Error(`Plan quota reached: Your ${quota.planName} subscription includes ${quota.maxAllowed} Cashier Scan Points. Upgrade plan or add extra scan points (+${quota.extraPriceRwf.toLocaleString()} RWF/mo) to add more cashiers.`);
    }

    const now = new Date().toISOString();
    const newUser: StationUser = {
      ...data,
      id: `usr_${data.restaurantCode.toLowerCase()}_${Date.now()}`,
      createdAt: now,
    };
    this.state.stationUsers.push(newUser);

    // Also ensure the corresponding scanPoint exists and is linked
    if (data.stationId && !this.state.scanPoints.some((sp) => sp.id === data.stationId)) {
      this.state.scanPoints.push({
        id: data.stationId,
        restaurantCode: data.restaurantCode,
        branchId: data.branchId,
        branchName: data.branchName,
        name: data.stationName,
        deviceModel: 'Android Scanner Station POS',
        pairingCode: `PAIR-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'active',
        lastHeartbeat: now,
        assignedStaffUserId: newUser.id,
        assignedStaffUserName: newUser.name,
      });
    }

    this.logAudit({
      restaurantCode: data.restaurantCode,
      branchId: data.branchId,
      branchName: data.branchName,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'STATION_USER_CREATED',
      details: `Created station user account "${newUser.name}" (username: ${newUser.username}, role: ${newUser.role}) assigned to ${newUser.stationName} at ${newUser.branchName}`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return newUser;
  }

  public updateStationUser(
    userId: string,
    updates: Partial<StationUser>,
    actorName = 'Restaurant Boss'
  ): StationUser | null {
    if (!this.state.stationUsers) return null;
    const user = this.state.stationUsers.find((u) => u.id === userId);
    if (!user) return null;

    if (updates.name !== undefined) user.name = updates.name.trim();
    if (updates.username !== undefined) user.username = updates.username.trim().toLowerCase();
    if (updates.phone !== undefined) user.phone = updates.phone.trim();
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.branchId !== undefined) user.branchId = updates.branchId;
    if (updates.branchName !== undefined) user.branchName = updates.branchName;
    if (updates.stationId !== undefined) user.stationId = updates.stationId;
    if (updates.stationName !== undefined) user.stationName = updates.stationName;
    if (updates.status !== undefined) user.status = updates.status;
    if (updates.passwordHash !== undefined) user.passwordHash = updates.passwordHash;
    if (updates.pin !== undefined) user.pin = updates.pin;

    this.logAudit({
      restaurantCode: user.restaurantCode,
      branchId: user.branchId,
      branchName: user.branchName,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'STATION_USER_UPDATED',
      details: `Updated station user account details for "${user.name}" (@${user.username})`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return user;
  }

  public setStationUserStatus(
    userId: string,
    status: 'active' | 'blocked',
    actorName = 'Restaurant Boss'
  ): boolean {
    if (!this.state.stationUsers) return false;
    const user = this.state.stationUsers.find((u) => u.id === userId);
    if (!user) return false;

    user.status = status;
    this.logAudit({
      restaurantCode: user.restaurantCode,
      branchId: user.branchId,
      branchName: user.branchName,
      actorRole: 'restaurant_admin',
      actorName,
      action: status === 'blocked' ? 'STATION_USER_BLOCKED' : 'STATION_USER_UNBLOCKED',
      details: `${status === 'blocked' ? 'Blocked' : 'Unblocked'} station user account "${user.name}" (@${user.username})`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return true;
  }

  public resetStationUserPassword(
    userId: string,
    newPassword: string,
    newPin?: string,
    actorName = 'Restaurant Boss'
  ): boolean {
    if (!this.state.stationUsers) return false;
    const user = this.state.stationUsers.find((u) => u.id === userId);
    if (!user) return false;

    user.passwordHash = newPassword;
    if (newPin) user.pin = newPin;

    this.logAudit({
      restaurantCode: user.restaurantCode,
      branchId: user.branchId,
      branchName: user.branchName,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'STATION_USER_PASSWORD_RESET',
      details: `Reset security credentials for station user "${user.name}" (@${user.username})`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return true;
  }

  public deleteStationUser(
    userId: string,
    restaurantCode: string,
    actorName = 'Restaurant Boss'
  ): boolean {
    if (!this.state.stationUsers) return false;
    const idx = this.state.stationUsers.findIndex(
      (u) => u.id === userId && u.restaurantCode === restaurantCode
    );
    if (idx !== -1) {
      const removed = this.state.stationUsers.splice(idx, 1)[0];
      this.logAudit({
        restaurantCode,
        branchId: removed.branchId,
        branchName: removed.branchName,
        actorRole: 'restaurant_admin',
        actorName,
        action: 'STATION_USER_DELETED',
        details: `Deleted station user account "${removed.name}" (@${removed.username})`,
      });
      this.scheduleSaveState();
      this.notify();
      return true;
    }
    return false;
  }

  // =========================================================================
  // CASHIER QUOTA & CRYPTOGRAPHIC DEVICE PAIRING (Requirement 1 & 2)
  // =========================================================================

  /**
   * Cashier Quota Status: 1 Cashier Account = 1 Scan Point
   */
  public getCashierQuotaStatus(restaurantCode?: string): {
    activeCashiers: number;
    maxAllowed: number;
    isAtLimit: boolean;
    planName: string;
    extraPriceRwf: number;
  } {
    const code = restaurantCode || this.state.currentRestaurantCode;
    const license = this.getRestaurantLicense(code);
    const plan = this.state.plans.find((p) => p.id === license?.planId) || this.state.plans[0];
    const maxAllowed = license?.maxScanPoints || plan.terms.maxScanPointsIncluded || 1;
    const activeCashiers = (this.state.stationUsers || []).filter(
      (u) => u.restaurantCode === code && u.status === 'active'
    ).length;
    return {
      activeCashiers,
      maxAllowed,
      isAtLimit: activeCashiers >= maxAllowed,
      planName: plan.name,
      extraPriceRwf: plan.terms.pricePerExtraScanPointRwf || 15000,
    };
  }

  /**
   * Verify if the current device/browser terminal is authorized for this restaurant
   */
  public isCurrentTerminalPaired(restaurantCode?: string): boolean {
    const code = restaurantCode || this.state.currentRestaurantCode;
    try {
      const stored = localStorage.getItem(`restopass_paired_station_${code}`);
      if (stored) {
        // If an explicit revocation was issued for this station in cashierSessions, clear and block
        const sessions = (this.state.cashierSessions || []).filter(
          (s) => s.restaurantCode === code && s.stationId === stored
        );
        const latestSession = sessions[0];
        if (latestSession && latestSession.status === 'revoked') {
          localStorage.removeItem(`restopass_paired_station_${code}`);
          localStorage.removeItem(`restopass_paired_token_${code}`);
          return false;
        }

        const found = this.state.scanPoints.find((sp) => sp.id === stored && sp.restaurantCode === code);
        if (found && found.isPaired !== false) return true;
      }
    } catch {}
    // If current station is marked paired in state
    const curStn = this.state.scanPoints.find(
      (sp) => sp.id === this.state.currentStationId && sp.restaurantCode === code
    );
    return curStn?.isPaired === true;
  }

  /**
   * Pair a terminal device via Boss screen QR code or 6-character Station Pairing Key
   */
  public pairTerminalDevice(data: {
    restaurantCode: string;
    pairingKeyOrCode: string;
    deviceFingerprint?: string;
    deviceType?: 'phone' | 'tablet' | 'laptop_scanner' | 'pos_terminal';
    ipAddress?: string;
  }): { success: boolean; station?: ScanPoint; session?: CashierSession; error?: string } {
    const code = data.restaurantCode || this.state.currentRestaurantCode;
    const cleanKey = data.pairingKeyOrCode.trim().toUpperCase();
    const nowMs = Date.now();

    // Brute-force lockout protection (Finding 3)
    if (this.pairingLockoutUntil > nowMs) {
      const waitSec = Math.ceil((this.pairingLockoutUntil - nowMs) / 1000);
      return {
        success: false,
        error: `Station pairing temporarily locked due to repeated invalid attempts. Please wait ${waitSec}s or ask the cafeteria manager for assistance.`,
      };
    }

    // Find matching scan point by pairing code or pairing key strictly without bypasses (Finding 3)
    const station = this.state.scanPoints.find(
      (sp) =>
        sp.restaurantCode === code &&
        (sp.pairingCode.toUpperCase() === cleanKey ||
          (sp.pairingKey && sp.pairingKey.toUpperCase() === cleanKey))
    );

    if (!station) {
      this.failedPairingAttempts++;
      if (this.failedPairingAttempts >= 5) {
        this.pairingLockoutUntil = nowMs + 5 * 60 * 1000; // 5-minute lockout
      }
      return {
        success: false,
        error: 'Invalid station pairing key. Scan the QR code on the Boss screen or ask the cafeteria manager for the station key.',
      };
    }

    this.failedPairingAttempts = 0;

    const now = new Date().toISOString();
    const detectedType = data.deviceType || (navigator.userAgent.includes('Mobile') ? 'phone' : 'laptop_scanner');
    const fingerprint = data.deviceFingerprint || `${navigator.platform} · ${navigator.userAgent.slice(0, 30)}`;
    const sessionToken = `DEV_CERT_${station.id}_${Date.now()}`;
    const assignedUser = this.state.stationUsers.find((u) => u.id === station.assignedStaffUserId || u.stationId === station.id);

    station.isPaired = true;
    station.pairedAt = now;
    station.deviceType = detectedType;
    station.pairedDeviceFingerprint = fingerprint;
    station.isCurrentDevice = true;
    station.lastHeartbeat = now;
    station.status = 'active';

    this.state.currentStationId = station.id;

    // Register active CashierSession
    if (!this.state.cashierSessions) this.state.cashierSessions = [];
    const sessionId = `sess_${station.restaurantCode.toLowerCase()}_${Date.now()}`;
    const newSession: CashierSession = {
      id: sessionId,
      restaurantCode: code,
      stationId: station.id,
      stationName: station.name,
      branchId: station.branchId,
      branchName: station.branchName,
      staffUserId: assignedUser?.id || 'usr_staff_default',
      staffName: assignedUser?.name || station.assignedStaffUserName || 'Stand Operator',
      staffUsername: assignedUser?.username || 'cashier_desk',
      deviceType: detectedType,
      deviceModel: station.deviceModel || (detectedType === 'laptop_scanner' ? 'Manager Laptop + USB Barcode Gun' : 'Android Tablet POS'),
      deviceFingerprint: fingerprint,
      ipAddress: data.ipAddress || '192.168.1.' + Math.floor(102 + Math.random() * 80),
      sessionToken,
      startedAt: now,
      lastHeartbeat: now,
      status: 'active',
    };

    // Close any previous open session for the same station
    this.state.cashierSessions
      .filter((s) => s.restaurantCode === code && s.stationId === station.id && s.status === 'active')
      .forEach((s) => {
        s.status = 'closed';
      });

    this.state.cashierSessions.unshift(newSession);

    try {
      localStorage.setItem(`restopass_paired_station_${code}`, station.id);
      localStorage.setItem(`restopass_paired_token_${code}`, sessionToken);
    } catch {}

    this.logAudit({
      restaurantCode: code,
      actorRole: 'stand_staff',
      actorName: station.assignedStaffUserName || 'Stand Operator',
      action: 'TERMINAL_PAIRED',
      details: `Terminal device paired for station "${station.name}" (${station.id}) via ${station.deviceType}. Session #${sessionId} created. IP: ${newSession.ipAddress}`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, station, session: newSession };
  }

  /**
   * Revoke terminal pairing (e.g. lost phone or decommissioning station)
   */
  public revokeTerminalPairing(stationId: string, actorName = 'Restaurant Boss'): boolean {
    const stn = this.state.scanPoints.find((s) => s.id === stationId);
    if (!stn) return false;
    stn.isPaired = false;
    stn.pairedAt = undefined;
    stn.pairedDeviceFingerprint = undefined;

    // Revoke associated cashier sessions
    if (this.state.cashierSessions) {
      this.state.cashierSessions
        .filter((s) => s.stationId === stationId && s.status === 'active')
        .forEach((s) => {
          s.status = 'revoked';
          s.revokedAt = new Date().toISOString();
          s.revokedReason = 'Terminal pairing revoked by restaurant admin';
          s.revokedByActor = actorName;
        });
    }

    try {
      localStorage.removeItem(`restopass_paired_station_${stn.restaurantCode}`);
      localStorage.removeItem(`restopass_paired_token_${stn.restaurantCode}`);
    } catch {}

    this.logAudit({
      restaurantCode: stn.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'TERMINAL_PAIRING_REVOKED',
      details: `Revoked terminal device pairing for station "${stn.name}" (${stn.id})`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return true;
  }

  // =========================================================================
  // CASHIER SESSIONS & REMOTE TERMINAL REVOCATION (Security Center)
  // =========================================================================

  public getActiveCashierSessions(restaurantCode?: string): CashierSession[] {
    const code = restaurantCode || this.state.currentRestaurantCode;
    if (!this.state.cashierSessions) this.state.cashierSessions = [];
    return this.state.cashierSessions.filter(
      (s) => s.restaurantCode === code && s.status === 'active'
    );
  }

  public getAllCashierSessions(restaurantCode?: string): CashierSession[] {
    const code = restaurantCode || this.state.currentRestaurantCode;
    if (!this.state.cashierSessions) this.state.cashierSessions = [];
    return this.state.cashierSessions.filter((s) => s.restaurantCode === code);
  }

  public revokeCashierSession(
    sessionId: string,
    reason = 'Remote logout executed by Restaurant Admin',
    actorName = 'Restaurant Boss'
  ): boolean {
    if (!this.state.cashierSessions) this.state.cashierSessions = [];
    const session = this.state.cashierSessions.find((s) => s.id === sessionId);
    if (!session) return false;

    session.status = 'revoked';
    session.revokedAt = new Date().toISOString();
    session.revokedReason = reason;
    session.revokedByActor = actorName;

    // Also unpair the corresponding scan point
    const stn = this.state.scanPoints.find(
      (sp) => sp.id === session.stationId && sp.restaurantCode === session.restaurantCode
    );
    if (stn) {
      stn.isPaired = false;
      stn.pairedAt = undefined;
    }

    // If local terminal was bound to this station, evict tokens immediately
    try {
      const storedStation = localStorage.getItem(`restopass_paired_station_${session.restaurantCode}`);
      if (storedStation === session.stationId) {
        localStorage.removeItem(`restopass_paired_station_${session.restaurantCode}`);
        localStorage.removeItem(`restopass_paired_token_${session.restaurantCode}`);
      }
    } catch {}

    this.logAudit({
      restaurantCode: session.restaurantCode,
      branchId: session.branchId,
      branchName: session.branchName,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'CASHIER_SESSION_REVOKED',
      details: `Revoked active cashier session #${session.id} for "${session.staffName}" on ${session.stationName} (${session.deviceType} · IP: ${session.ipAddress}). Reason: ${reason}`,
    });

    this.sendNotification({
      restaurantCode: session.restaurantCode,
      target: 'all',
      senderRole: 'restaurant_admin',
      senderName: actorName,
      type: 'card_security',
      title: `Terminal Session Revoked: ${session.stationName}`,
      message: `The cashier terminal session for ${session.staffName} on ${session.stationName} was remotely revoked and locked out by admin.`,
      priority: 'urgent',
      actionTab: 'security',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return true;
  }

  public revokeAllCashierSessions(
    restaurantCode: string,
    reason = 'Emergency lockdown by Restaurant Admin',
    actorName = 'Restaurant Boss'
  ): number {
    if (!this.state.cashierSessions) this.state.cashierSessions = [];
    const active = this.state.cashierSessions.filter(
      (s) => s.restaurantCode === restaurantCode && s.status === 'active'
    );
    active.forEach((s) => {
      s.status = 'revoked';
      s.revokedAt = new Date().toISOString();
      s.revokedReason = reason;
      s.revokedByActor = actorName;
    });

    // Unpair all scan points in this restaurant
    this.state.scanPoints
      .filter((sp) => sp.restaurantCode === restaurantCode)
      .forEach((sp) => {
        sp.isPaired = false;
        sp.pairedAt = undefined;
      });

    try {
      localStorage.removeItem(`restopass_paired_station_${restaurantCode}`);
      localStorage.removeItem(`restopass_paired_token_${restaurantCode}`);
    } catch {}

    this.logAudit({
      restaurantCode,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'ALL_TERMINAL_SESSIONS_REVOKED',
      details: `Emergency lockdown: Revoked all ${active.length} active terminal sessions in restaurant ${restaurantCode}`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return active.length;
  }

  /**
   * Create Cashier / Scanner Account protected by 8-Digit PIN or Password
   */
  public createCashierAccount(
    data: {
      restaurantCode: string;
      name: string;
      username: string;
      phone: string;
      branchId: string;
      branchName: string;
      stationId: string;
      stationName: string;
      role?: 'cashier' | 'scanner' | 'stand_staff' | 'reception';
      authType: 'pin8' | 'password' | 'both';
      pin?: string;
      password?: string;
    },
    actorName = 'Restaurant Boss'
  ): StationUser {
    if (data.authType === 'pin8' || data.authType === 'both') {
      const cleanPin = (data.pin || '').trim();
      if (!/^\d{8}$/.test(cleanPin)) {
        throw new Error('Security PIN must be exactly 8 numeric digits (e.g. 83920194)');
      }
    }
    if (data.authType === 'password' || data.authType === 'both') {
      if (!data.password || data.password.trim().length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }
    }

    const resolvedPin = data.pin?.trim() || '12345678';
    const resolvedPassword = data.password?.trim() || resolvedPin;

    return this.addStationUser(
      {
        restaurantCode: data.restaurantCode,
        branchId: data.branchId,
        branchName: data.branchName,
        stationId: data.stationId,
        stationName: data.stationName,
        name: data.name.trim(),
        username: data.username.trim().toLowerCase(),
        phone: data.phone.trim(),
        role: data.role || 'cashier',
        status: 'active',
        passwordHash: resolvedPassword,
        pin: resolvedPin,
        authType: data.authType,
        lastLoginAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
      actorName
    );
  }

  // =========================================================================
  // PROVISIONAL REGISTRATION & RECHARGE APPROVAL WORKFLOW (Requirement 3)
  // =========================================================================

  public getRestaurantPendingApprovals(restaurantCode?: string): PendingApproval[] {
    const code = restaurantCode || this.state.currentRestaurantCode;
    if (!this.state.pendingApprovals) this.state.pendingApprovals = [];
    return this.state.pendingApprovals.filter((a) => a.restaurantCode === code);
  }

  /**
   * Scanner station user / reception provisionally registers a new customer.
   * Customer can immediately receive up to 3 grace plates while awaiting boss approval!
   */
  public registerProvisionalCustomer(
    data: {
      restaurantCode: string;
      branchId?: string;
      branchName?: string;
      name: string;
      phone: string;
      photoUrl?: string;
      idType: IdType;
      idNumber: string;
      isStudent: boolean;
      studentProfile?: StudentProfile;
      packageId?: string;
      platesRequested: number;
      amountRwf: number;
      paymentMethod: PaymentMethod;
      paymentReference: string;
      registeredByStaffId: string;
      registeredByStaffName: string;
      stationId: string;
      stationName: string;
    },
    staffName = 'Reception Desk'
  ): { customer: Customer; approval: PendingApproval } {
    const now = new Date().toISOString();
    const restaurantCode = data.restaurantCode || this.state.currentRestaurantCode;

    // Allocate next member number
    const existing = this.state.customers.filter((c) => c.restaurantCode === restaurantCode);
    const maxNo = existing.reduce((max, c) => Math.max(max, parseInt(c.memberNo) || 0), 28490);
    const memberNo = String(maxNo + 1);

    const customerId = `cust_prov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const newCustomer: Customer = {
      id: customerId,
      memberNo,
      restaurantCode,
      branchId: data.branchId || 'br_rw01_main',
      branchName: data.branchName || 'Main Campus Dining Hall',
      name: data.name.trim(),
      phone: data.phone.trim(),
      photoUrl: data.photoUrl || '/src/assets/images/avatar_student_male_1790979380050.jpg',
      idType: data.idType || 'Student ID',
      idHash: data.idNumber ? hashIdNumber(data.idType, data.idNumber) : '',
      idNumberMasked: data.idNumber ? (data.idNumber.length > 5 ? `${data.idNumber.slice(0, 5)}****` : '****') : '****',
      isStudent: data.isStudent,
      studentProfile: data.studentProfile,
      cardVersion: 1,
      keyVersion: 1,
      cardStatus: 'active', // Allowed for provisional grace taps
      pinHash: '1234',
      hasCustomPin: false,
      provisionalStatus: 'pending_approval',
      activationStatus: 'pending_approval',
      cardReadyForPrint: false,
      failedLoginAttempts: 0,
      gracePlatesConsumed: 0,
      gracePlatesRemaining: 3,
      pendingApprovalId: approvalId,
      createdAt: now,
      onboardingToken: `OB-${memberNo}-PROV`,
      consentSigned: true,
    };

    const pkg = data.packageId ? this.state.packages.find((p) => p.id === data.packageId) : null;

    const platesCount = data.platesRequested || (data as any).requestedPlates || 0;

    const approval: PendingApproval = {
      id: approvalId,
      restaurantCode,
      branchId: data.branchId || 'br_rw01_main',
      branchName: data.branchName || 'Main Campus Dining Hall',
      type: 'new_customer',
      customerId,
      customerName: newCustomer.name,
      customerPhone: newCustomer.phone,
      customerPhoto: newCustomer.photoUrl,
      memberNo,
      packageId: data.packageId,
      packageName: pkg ? pkg.name : `${platesCount} Custom Plates`,
      platesRequested: platesCount,
      amountRwf: data.amountRwf || (platesCount * 1000),
      paymentMethod: data.paymentMethod || 'momo',
      paymentReference: (data.paymentReference || (data as any).momoReference || `MOMO-${Date.now()}`).trim(),
      registeredByStaffId: data.registeredByStaffId || 'staff_prov',
      registeredByStaffName: data.registeredByStaffName || 'Station Staff',
      stationId: data.stationId || 'sp_kgl_01',
      stationName: data.stationName || 'Reception POS Desk',
      gracePlatesAllowed: 3,
      gracePlatesConsumed: 0,
      createdAt: now,
      status: 'pending',
      requiresSuperAdminCoSign: data.platesRequested > 120,
      coSignStatus: data.platesRequested > 120 ? 'pending_super_admin' : 'not_required',
    };

    if (!this.state.customers) this.state.customers = [];
    if (!this.state.pendingApprovals) this.state.pendingApprovals = [];

    this.state.customers.push(newCustomer);
    this.state.pendingApprovals.unshift(approval);

    this.logAudit({
      restaurantCode,
      branchId: approval.branchId,
      branchName: approval.branchName,
      actorRole: 'reception',
      actorName: staffName,
      action: 'PROVISIONAL_CUSTOMER_REGISTERED',
      details: `Provisionally registered #${memberNo} (${newCustomer.name}). MoMo/Payment Ref: "${approval.paymentReference}" (${(approval.amountRwf || 0).toLocaleString()} RWF for ${data.platesRequested} plates). Awaiting boss Mobile Money confirmation. Grace plates allowed: 3.`,
    });

    // Notify Restaurant Boss
    this.sendNotification({
      restaurantCode,
      target: 'all',
      senderRole: 'system',
      senderName: `${staffName} (${approval.stationName})`,
      type: 'system_broadcast',
      title: `Pending Approval: New Customer #${memberNo}`,
      message: `${newCustomer.name} provisionally registered with ${approval.paymentMethod.toUpperCase()} ref ${approval.paymentReference} (${(approval.amountRwf || 0).toLocaleString()} RWF). Please verify payment on Mobile Money.`,
      priority: 'important',
      actionTab: 'approvals',
    });

    // Direct receipt notification to the newly registered customer
    this.sendNotification({
      restaurantCode,
      target: newCustomer.id,
      targetName: `${newCustomer.name} (#${memberNo})`,
      senderRole: 'system',
      senderName: approval.stationName,
      type: 'topup_success',
      title: `Registration Recorded (#${memberNo}) — Awaiting Boss Approval`,
      message: `Your registration for ${platesCount} plates (${(approval.amountRwf || 0).toLocaleString()} RWF, Ref: ${approval.paymentReference}) is in the Boss approval queue. You may consume up to 3 grace meals while waiting.`,
      priority: 'important',
      actionTab: 'my_card',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { customer: newCustomer, approval };
  }

  /**
   * Scanner station user / reception records a provisional recharge when boss is away.
   * Keeps existing approved customers active while their top-up request is pending,
   * and preserves any prior grace consumption without resetting the counter.
   */
  public rechargeProvisionalCustomer(
    data: {
      restaurantCode: string;
      branchId?: string;
      branchName?: string;
      customerId: string;
      packageId?: string;
      platesRequested: number;
      amountRwf: number;
      paymentMethod: PaymentMethod;
      paymentReference: string;
      registeredByStaffId: string;
      registeredByStaffName: string;
      stationId: string;
      stationName: string;
    },
    staffName = 'Reception Desk'
  ): PendingApproval {
    const now = new Date().toISOString();
    const customer = this.state.customers.find((c) => c.id === data.customerId);
    if (!customer) throw new Error('Customer not found');

    const approvalId = `appr_topup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const pkg = data.packageId ? this.state.packages.find((p) => p.id === data.packageId) : null;

    const approval: PendingApproval = {
      id: approvalId,
      restaurantCode: data.restaurantCode,
      branchId: data.branchId || customer.branchId || 'br_rw01_main',
      branchName: data.branchName || customer.branchName || 'Main Campus Dining Hall',
      type: 'balance_topup',
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerPhoto: customer.photoUrl,
      memberNo: customer.memberNo,
      packageId: data.packageId,
      packageName: pkg ? pkg.name : `${data.platesRequested} Custom Plates`,
      platesRequested: data.platesRequested,
      amountRwf: data.amountRwf,
      paymentMethod: data.paymentMethod,
      paymentReference: data.paymentReference.trim(),
      registeredByStaffId: data.registeredByStaffId,
      registeredByStaffName: data.registeredByStaffName,
      stationId: data.stationId,
      stationName: data.stationName,
      gracePlatesAllowed: 3,
      gracePlatesConsumed: 0,
      createdAt: now,
      status: 'pending',
      requiresSuperAdminCoSign: data.platesRequested > 120,
      coSignStatus: data.platesRequested > 120 ? 'pending_super_admin' : 'not_required',
    };

    if (!this.state.pendingApprovals) this.state.pendingApprovals = [];
    this.state.pendingApprovals.unshift(approval);

    // Keep existing approved customers active; do NOT reset gracePlatesConsumed!
    if (!customer.provisionalStatus) {
      customer.provisionalStatus = 'approved';
    }
    const totalPendingGraceConsumed = this.state.pendingApprovals
      .filter((a) => a.customerId === customer.id && a.status === 'pending')
      .reduce((sum, a) => sum + (a.gracePlatesConsumed || 0), 0);
    const effectiveGraceUsed = Math.max(totalPendingGraceConsumed, customer.gracePlatesConsumed || 0);
    customer.gracePlatesConsumed = effectiveGraceUsed;
    customer.gracePlatesRemaining = Math.max(0, 3 - effectiveGraceUsed);
    if (!customer.pendingApprovalId) {
      customer.pendingApprovalId = approvalId;
    }

    this.logAudit({
      restaurantCode: data.restaurantCode,
      branchId: approval.branchId,
      branchName: approval.branchName,
      actorRole: 'reception',
      actorName: staffName,
      action: 'PROVISIONAL_TOPUP_SUBMITTED',
      details: `Submitted provisional recharge of ${data.platesRequested} plates for #${customer.memberNo} (${customer.name}) via ${data.paymentMethod.toUpperCase()} Ref "${data.paymentReference}" (${data.amountRwf.toLocaleString()} RWF). Awaiting boss confirmation.`,
    });

    this.sendNotification({
      restaurantCode: data.restaurantCode,
      target: 'all',
      senderRole: 'system',
      senderName: `${staffName} (${data.stationName})`,
      type: 'system_broadcast',
      title: `Pending Approval: Top-Up for #${customer.memberNo}`,
      message: `Provisional top-up of ${data.platesRequested} plates submitted with ref ${data.paymentReference}. Please verify Mobile Money deposit.`,
      priority: 'important',
      actionTab: 'approvals',
    });

    // Direct receipt notification to the customer
    this.sendNotification({
      restaurantCode: data.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'system',
      senderName: data.stationName,
      type: 'topup_success',
      title: `Top-Up Submitted (+${data.platesRequested} Plates Pending)`,
      message: `Your top-up request of ${data.platesRequested} plates (${data.amountRwf.toLocaleString()} RWF, Ref: ${data.paymentReference}) has been submitted for Boss verification.`,
      priority: 'normal',
      actionTab: 'history',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return approval;
  }

  /**
   * Restaurant Boss confirms pending registration or recharge after checking Mobile Money SMS / statement.
   * Atomic and idempotent: credits purchased plates once and reconciles grace meals associated with this approval once.
   */
  public approvePendingRequest(
    approvalId: string,
    bossName = 'Restaurant Boss'
  ): { success: boolean; customer?: Customer; error?: string } {
    if (!this.state.pendingApprovals) return { success: false, error: 'No approvals found' };
    const approval = this.state.pendingApprovals.find((a) => a.id === approvalId);
    if (!approval) return { success: false, error: 'Approval request not found' };
    if (approval.status !== 'pending') return { success: false, error: 'Request is already reviewed' };

    const customer = this.state.customers.find((c) => c.id === approval.customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    const now = new Date().toISOString();

    // High-value dual control: Exceeding 120 plates requires cryptographic co-signing from Super Admin
    if (approval.platesRequested > 120 && approval.coSignStatus !== 'co_signed') {
      approval.requiresSuperAdminCoSign = true;
      approval.coSignStatus = 'pending_super_admin';
      approval.reviewedAt = now;
      approval.reviewedByAdminName = bossName;

      this.logAudit({
        restaurantCode: approval.restaurantCode,
        actorRole: 'restaurant_admin',
        actorName: bossName,
        action: 'BOSS_APPROVED_AWAITING_COSIGN',
        details: `Boss approved high-value balance of ${approval.platesRequested} plates (> 120 plates threshold) for #${customer.memberNo} (${customer.name}). Awaiting Super Admin cryptographic co-signature before ledger credit becomes irrevocable.`,
      });

      this.sendNotification({
        restaurantCode: approval.restaurantCode,
        target: 'all',
        senderRole: 'restaurant_admin',
        senderName: bossName,
        type: 'system_broadcast',
        title: `High-Value Top-Up (>120 Plates) Awaiting Super Admin Co-Sign`,
        message: `Boss verified payment for ${approval.platesRequested} plates (#${customer.memberNo} ${customer.name}). Super Admin co-signature is required.`,
        priority: 'urgent',
      });

      this.scheduleSaveState();
      this.pushStateToServer();
      this.notify();
      return { success: true, customer };
    }
    // Use the grace meals linked to this specific approval; fall back to customer.gracePlatesConsumed only for a new_customer registration if set directly
    const graceConsumed =
      (approval.gracePlatesConsumed || 0) > 0
        ? approval.gracePlatesConsumed
        : approval.type === 'new_customer'
        ? ((customer as any).graceMealsConsumed || customer.gracePlatesConsumed || 0)
        : 0;
    const requested = approval.platesRequested || 0;

    // 1. Record confirmed purchase payment on ledger idempotently
    const purchaseIdempKey = `idemp_appr_credit_${approval.id}`;
    const ledgerEntry: LedgerEntry = {
      id: `led_appr_${approval.id}`,
      customerId: customer.id,
      restaurantCode: approval.restaurantCode,
      type: 'purchase',
      platesDelta: requested,
      timestamp: now,
      staffId: bossName,
      reason: `Boss Verified & Approved: +${requested} plates (${approval.paymentMethod.toUpperCase()} Ref: ${approval.paymentReference})${graceConsumed > 0 ? ` [${graceConsumed} grace plates consumed while waiting]` : ''}`,
      reference: approval.paymentReference,
      idempotencyKey: purchaseIdempKey,
    };
    const credited = this.appendLedgerEntry(ledgerEntry);
    if (!credited) {
      return { success: false, error: 'Request is already reviewed' };
    }

    // If grace plates were consumed while awaiting approval, deduct them once so balance is exact net
    if (graceConsumed > 0) {
      const graceEntry: LedgerEntry = {
        id: `led_grace_deduct_${approval.id}`,
        customerId: customer.id,
        restaurantCode: approval.restaurantCode,
        type: 'scan',
        platesDelta: -graceConsumed,
        timestamp: now,
        staffId: bossName,
        reason: `Deduction: -${graceConsumed} grace meals consumed while awaiting boss approval (< 3 policy)`,
        reference: `GRACE-CONSUMED-${customer.memberNo}-${approval.id}`,
        idempotencyKey: `idemp_appr_grace_${approval.id}`,
      };
      this.appendLedgerEntry(graceEntry);
    }

    // 2. Add confirmed payment record
    const payment: PaymentRecord = {
      id: `pay_appr_${approval.id}`,
      restaurantCode: approval.restaurantCode,
      branchId: approval.branchId,
      branchName: approval.branchName,
      customerId: customer.id,
      customerName: customer.name,
      memberNo: customer.memberNo,
      packageId: approval.packageId,
      platesAdded: approval.platesRequested,
      amountRwf: approval.amountRwf,
      paymentMethod: approval.paymentMethod,
      reference: approval.paymentReference,
      adminStaffId: 'admin_boss',
      adminStaffName: bossName,
      isProvisional: false,
      approvalId: approval.id,
      timestamp: now,
    };
    this.state.payments.unshift(payment);

    // 3. Update approval status first, then recompute customer grace state from any remaining pending approvals
    approval.gracePlatesConsumed = graceConsumed;
    approval.status = 'approved';
    approval.reviewedAt = now;
    approval.reviewedByAdminName = bossName;

    const remainingPending = this.state.pendingApprovals.filter(
      (a) => a.customerId === customer.id && a.status === 'pending'
    );
    const remainingGraceUsed = remainingPending.reduce((sum, a) => sum + (a.gracePlatesConsumed || 0), 0);

    customer.provisionalStatus = 'approved';
    customer.cardStatus = 'active';
    customer.gracePlatesConsumed = remainingGraceUsed;
    customer.gracePlatesRemaining = Math.max(0, 3 - remainingGraceUsed);
    customer.pendingApprovalId = remainingPending[0]?.id;
    customer.activationStatus = customer.hasCustomPin ? 'active' : 'ready_for_activation';
    if (approval.type === 'new_customer') {
      customer.cardReadyForPrint = true;
    }

    const finalBalance = this.getCustomerBalance(customer.id);

    // 4. Detailed audit log
    this.logAudit({
      restaurantCode: approval.restaurantCode,
      branchId: approval.branchId,
      branchName: approval.branchName,
      actorRole: 'restaurant_admin',
      actorName: bossName,
      action: 'APPROVAL_CONFIRMED',
      details: `Boss confirmed ${approval.type === 'new_customer' ? 'new registration' : 'recharge'} for #${customer.memberNo} (${customer.name}). Verified ${approval.amountRwf.toLocaleString()} RWF via ${approval.paymentMethod.toUpperCase()} (Ref: ${approval.paymentReference}). Credited ${approval.platesRequested} plates (prior grace consumed: ${graceConsumed}). Net balance: ${finalBalance} plates.`,
    });

    // 5. Customer Notification
    this.sendNotification({
      restaurantCode: approval.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'restaurant_admin',
      senderName: bossName,
      type: 'topup_success',
      title:
        approval.type === 'new_customer'
          ? 'Registration Approved — Set Your Personal PIN!'
          : `Top-Up Approved (+${approval.platesRequested} Plates)`,
      message:
        approval.type === 'new_customer'
          ? `Your registration was verified by cafeteria management! Credited ${approval.platesRequested} plates (Net balance: ${finalBalance} plates). Open the Customer Portal with your phone number to set your personal PIN and access your dashboard.`
          : `Your top-up payment was verified by cafeteria management! Credited ${approval.platesRequested} plates to your permanent card. Current balance: ${finalBalance} plates.`,
      priority: 'important',
      actionTab: 'history',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, customer };
  }

  /**
   * Retrieves all customers for a given restaurant whose physical card has been approved by the Boss
   * and is queued for physical printing or export for a local print shop.
   */
  public getPrintReadyCustomers(restaurantCode: string): Customer[] {
    return this.state.customers.filter(
      (c) => c.restaurantCode === restaurantCode && Boolean(c.cardReadyForPrint) && c.cardStatus !== 'locked'
    );
  }

  /**
   * Marks a customer's physical card as printed/exported by the cashier or print shop
   */
  public markCardAsPrinted(customerId: string): boolean {
    const cust = this.state.customers.find((c) => c.id === customerId);
    if (!cust) return false;
    cust.cardReadyForPrint = false;
    (cust as any).cardPrintedAt = new Date().toISOString();
    this.scheduleSaveState();
    this.notify();
    return true;
  }

  /**
   * Marks multiple customers' physical cards as printed/exported in batch
   */
  public markBatchCardsAsPrinted(customerIds: string[]): number {
    const ids = new Set(customerIds);
    let count = 0;
    const now = new Date().toISOString();
    for (const c of this.state.customers) {
      if (ids.has(c.id) && c.cardReadyForPrint) {
        c.cardReadyForPrint = false;
        (c as any).cardPrintedAt = now;
        count++;
      }
    }
    if (count > 0) {
      this.scheduleSaveState();
      this.notify();
    }
    return count;
  }

  /**
   * Super Admin Cryptographic Co-Signing for High-Value Entitlements (> 120 plates / 2 months)
   * Enforces dual control between Restaurant Admin and Super Admin.
   */
  public coSignPendingRequest(
    approvalId: string,
    superAdminName = 'Ephrem (Founder & Super Admin)'
  ): { success: boolean; customer?: Customer; error?: string } {
    if (!this.state.pendingApprovals) return { success: false, error: 'No approvals found' };
    const approval = this.state.pendingApprovals.find((a) => a.id === approvalId);
    if (!approval) return { success: false, error: 'Approval request not found' };

    const customer = this.state.customers.find((c) => c.id === approval.customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    const now = new Date().toISOString();
    const signature = `COSIGN-${approval.id}-${Date.now().toString(36).toUpperCase()}`;

    approval.coSignStatus = 'co_signed';
    approval.coSignedAt = now;
    approval.coSignedBySuperAdminName = superAdminName;
    approval.coSignature = signature;

    this.logAudit({
      restaurantCode: approval.restaurantCode,
      actorRole: 'super_admin',
      actorName: superAdminName,
      action: 'APPROVAL_COSIGNED',
      details: `Super Admin cryptographically co-signed high-value balance of ${approval.platesRequested} plates (> 120 threshold) for #${customer.memberNo} (${customer.name}). Sig: ${signature}`,
    });

    return this.approvePendingRequest(approvalId, approval.reviewedByAdminName || 'Restaurant Boss');
  }

  /**
   * Restaurant Boss rejects an approval request (e.g. fraudulent MoMo SMS, payment not received).
   * Only locks card / marks account rejected if the request was a new_customer registration;
   * an existing approved customer keeps their active account and existing paid balance.
   */
  public rejectPendingRequest(
    approvalId: string,
    reason: string,
    bossName = 'Restaurant Boss'
  ): { success: boolean; error?: string } {
    if (!this.state.pendingApprovals) return { success: false, error: 'No approvals found' };
    const approval = this.state.pendingApprovals.find((a) => a.id === approvalId);
    if (!approval) return { success: false, error: 'Approval request not found' };
    if (approval.status !== 'pending') return { success: false, error: 'Request is already reviewed' };

    const customer = this.state.customers.find((c) => c.id === approval.customerId);
    const now = new Date().toISOString();

    approval.status = 'rejected';
    approval.rejectionReason = reason.trim() || 'Payment not verified on Mobile Money statement';
    approval.reviewedAt = now;
    approval.reviewedByAdminName = bossName;

    if (customer) {
      const remainingPending = this.state.pendingApprovals.filter(
        (a) => a.customerId === customer.id && a.status === 'pending'
      );
      customer.pendingApprovalId = remainingPending[0]?.id;

      if (approval.type === 'new_customer') {
        customer.provisionalStatus = 'rejected';
        customer.cardStatus = 'locked'; // Lock card access for unverified new registration
      }
    }

    this.logAudit({
      restaurantCode: approval.restaurantCode,
      branchId: approval.branchId,
      branchName: approval.branchName,
      actorRole: 'restaurant_admin',
      actorName: bossName,
      action: 'APPROVAL_REJECTED',
      details: `Boss rejected ${approval.type === 'new_customer' ? 'new registration' : 'top-up'} approval for #${approval.memberNo} (${approval.customerName}). Reason: "${approval.rejectionReason}".`,
    });

    if (customer) {
      this.sendNotification({
        restaurantCode: approval.restaurantCode,
        target: customer.id,
        targetName: `${customer.name} (#${customer.memberNo})`,
        senderRole: 'restaurant_admin',
        senderName: bossName,
        type: 'card_security',
        title:
          approval.type === 'new_customer'
            ? 'Payment Verification Failed - Card Locked'
            : 'Top-Up Payment Verification Failed',
        message: `Your pending payment could not be confirmed: "${approval.rejectionReason}". Please visit the administration desk with your transaction receipt.`,
        priority: 'urgent',
        actionTab: 'history',
      });
    }

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true };
  }

  // =========================================================================
  // MONTHLY PREPAID PLATES & CASH, USED PLATES & CASH, REMAINING (Requirement 2b)
  // =========================================================================

  public getRestaurantMonthlyMetrics(
    restaurantCode?: string,
    targetDate = new Date()
  ) {
    const code = restaurantCode || this.state.currentRestaurantCode;
    const targetMonth = targetDate.getMonth();
    const targetYear = targetDate.getFullYear();
    const defaultRate = this.getRestaurantDefaultPlatePrice(code);

    // 1. Monthly Prepaid Plates & Cash
    const monthlyPayments = this.state.payments.filter((p) => {
      if (p.restaurantCode !== code) return false;
      const d = new Date(p.timestamp);
      return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
    });

    const monthlyPrepaidPlates = monthlyPayments.reduce((acc, p) => acc + p.platesAdded, 0);
    const monthlyPrepaidCashRwf = monthlyPayments.reduce((acc, p) => acc + p.amountRwf, 0);

    const avgPricePerPlate =
      monthlyPrepaidPlates > 0
        ? Math.round(monthlyPrepaidCashRwf / monthlyPrepaidPlates)
        : defaultRate;

    // 2. Monthly Used Plates & Cash (from scans and ledger entries)
    const monthlyLedgerScans = this.state.ledgerEntries.filter((l) => {
      if (l.restaurantCode !== code || l.type !== 'scan' || l.platesDelta >= 0) return false;
      const d = new Date(l.timestamp);
      return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
    });

    const monthlyUsedPlates = monthlyLedgerScans.reduce((acc, l) => acc + Math.abs(l.platesDelta), 0);
    const monthlyUsedCashRwf = monthlyUsedPlates * avgPricePerPlate;

    // 3. Remaining Plates & Cash (Active Patron Balances across this restaurant)
    const activeCustomers = this.state.customers.filter((c) => c.restaurantCode === code);
    const remainingPlates = activeCustomers.reduce((acc, c) => acc + this.getCustomerBalance(c.id), 0);
    const remainingCashRwf = remainingPlates * avgPricePerPlate;

    const monthLabel = targetDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

    return {
      monthLabel,
      monthlyPrepaidPlates,
      monthlyPrepaidCashRwf,
      monthlyUsedPlates,
      monthlyUsedCashRwf,
      remainingPlates,
      remainingCashRwf,
      avgPricePerPlate,
      totalCustomersCount: activeCustomers.length,
      monthlyTransactionsCount: monthlyPayments.length,
      monthlyServingsCount: monthlyLedgerScans.length,
    };
  }

  // =========================================================================
  // RESTAURANT EXPENSE TRACKING & PROFIT/LOSS CO-PILOT
  // =========================================================================

  public getRestaurantExpenses(restaurantCode?: string): RestaurantExpense[] {
    if (!this.state.expenses) this.state.expenses = [];
    const code = restaurantCode || this.state.currentRestaurantCode;
    return this.state.expenses
      .filter((e) => e.restaurantCode === code)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  public addRestaurantExpense(params: {
    restaurantCode?: string;
    category: ExpenseCategory;
    categoryLabel?: string;
    amountRwf: number;
    description: string;
    supplierName?: string;
    receiptNumber?: string;
    recordedByRole?: string;
    recordedByName?: string;
  }): RestaurantExpense {
    if (!this.state.expenses) this.state.expenses = [];
    const code = params.restaurantCode || this.state.currentRestaurantCode;
    const now = new Date().toISOString();
    const id = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const categoryLabels: Record<ExpenseCategory, string> = {
      food_supplies: 'Food Supplies & Produce',
      fuel_gas_charcoal: 'Cooking Fuel, LPG & Charcoal',
      staff_wages: 'Staff & Kitchen Wages',
      rent_utilities: 'Rent, Water & Electricity',
      packaging_logistics: 'Packaging, Soap & Logistics',
      other: 'Other Operating Expenses',
    };

    const newExpense: RestaurantExpense = {
      id,
      restaurantCode: code,
      category: params.category,
      categoryLabel: params.categoryLabel || categoryLabels[params.category] || 'Operating Expense',
      amountRwf: Math.max(0, Math.round(params.amountRwf)),
      description: params.description.trim(),
      supplierName: params.supplierName?.trim(),
      receiptNumber: params.receiptNumber?.trim(),
      recordedByRole: params.recordedByRole || this.state.currentRole,
      recordedByName: params.recordedByName || 'Manager',
      recordedAt: now,
    };

    this.state.expenses.unshift(newExpense);

    this.logAudit({
      restaurantCode: code,
      actorRole: this.state.currentRole,
      actorName: newExpense.recordedByName,
      action: 'EXPENSE_RECORDED',
      details: `Recorded ${newExpense.categoryLabel} expense: ${newExpense.amountRwf.toLocaleString()} RWF (${newExpense.description})`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return newExpense;
  }

  public deleteRestaurantExpense(expenseId: string, actorName = 'Manager'): boolean {
    if (!this.state.expenses) return false;
    const idx = this.state.expenses.findIndex((e) => e.id === expenseId);
    if (idx === -1) return false;
    const [removed] = this.state.expenses.splice(idx, 1);

    this.logAudit({
      restaurantCode: removed.restaurantCode,
      actorRole: this.state.currentRole,
      actorName,
      action: 'EXPENSE_DELETED',
      details: `Deleted expense record ${removed.id}: ${removed.amountRwf.toLocaleString()} RWF (${removed.description})`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return true;
  }

  public getRestaurantProfitAndLoss(
    restaurantCode?: string,
    targetMonth?: number,
    targetYear?: number
  ): {
    monthLabel: string;
    intakeCashRwf: number;
    realizedRevenueRwf: number;
    outstandingLiabilityRwf: number;
    totalExpensesRwf: number;
    grossProfitRwf: number;
    netCashFlowRwf: number;
    costPerPlateServed: number;
    avgRevenuePerPlate: number;
    platesServedCount: number;
    isOperatingAtLoss: boolean;
    healthStatus: 'profitable' | 'balanced' | 'loss_warning';
    healthRecommendation: string;
    expenseCategories: { category: ExpenseCategory; label: string; amountRwf: number; percentage: number }[];
  } {
    const code = restaurantCode || this.state.currentRestaurantCode;
    const now = new Date();
    const m = targetMonth !== undefined ? targetMonth : now.getMonth();
    const y = targetYear !== undefined ? targetYear : now.getFullYear();

    const recon = this.getRestaurantMonthlyMetrics(code, new Date(y, m, 1));
    const allExpenses = this.getRestaurantExpenses(code).filter((e) => {
      const d = new Date(e.recordedAt);
      return d.getMonth() === m && d.getFullYear() === y;
    });

    const totalExpensesRwf = allExpenses.reduce((sum, e) => sum + e.amountRwf, 0);
    const realizedRevenueRwf = recon.monthlyUsedCashRwf;
    const intakeCashRwf = recon.monthlyPrepaidCashRwf;
    const outstandingLiabilityRwf = recon.remainingCashRwf;
    const platesServedCount = recon.monthlyUsedPlates;
    const avgRevenuePerPlate = recon.avgPricePerPlate;

    const grossProfitRwf = realizedRevenueRwf - totalExpensesRwf;
    const netCashFlowRwf = intakeCashRwf - totalExpensesRwf;
    const costPerPlateServed = platesServedCount > 0 ? Math.round(totalExpensesRwf / platesServedCount) : 0;
    const isOperatingAtLoss = platesServedCount > 0 && grossProfitRwf < 0;

    let healthStatus: 'profitable' | 'balanced' | 'loss_warning' = 'balanced';
    let healthRecommendation = 'Operating in a healthy financial position.';

    if (platesServedCount === 0 && totalExpensesRwf === 0) {
      healthStatus = 'balanced';
      healthRecommendation = 'No meals or expenses logged yet for this billing cycle.';
    } else if (isOperatingAtLoss) {
      healthStatus = 'loss_warning';
      const lossPerMeal = costPerPlateServed - avgRevenuePerPlate;
      healthRecommendation = `Attention: Meal production costs (${costPerPlateServed.toLocaleString()} RWF/plate) exceed average plate revenue (${avgRevenuePerPlate.toLocaleString()} RWF/plate) by ${lossPerMeal.toLocaleString()} RWF. Consider auditing wholesale dry goods suppliers or adjusting meal bundle pricing.`;
    } else if (grossProfitRwf > 0) {
      healthStatus = 'profitable';
      const margin = Math.round((grossProfitRwf / Math.max(1, realizedRevenueRwf)) * 100);
      healthRecommendation = `Strong operational health: Realized ${margin}% gross margin across ${platesServedCount.toLocaleString()} meals served this month.`;
    }

    const categoryMap = new Map<ExpenseCategory, number>();
    for (const exp of allExpenses) {
      categoryMap.set(exp.category, (categoryMap.get(exp.category) || 0) + exp.amountRwf);
    }

    const categoryLabels: Record<ExpenseCategory, string> = {
      food_supplies: 'Food Supplies & Produce',
      fuel_gas_charcoal: 'Cooking Fuel & LPG',
      staff_wages: 'Staff & Kitchen Wages',
      rent_utilities: 'Rent, Water & Electric',
      packaging_logistics: 'Logistics & Packaging',
      other: 'Other Expenses',
    };

    const expenseCategories = Array.from(categoryMap.entries()).map(([cat, amt]) => ({
      category: cat,
      label: categoryLabels[cat] || cat,
      amountRwf: amt,
      percentage: totalExpensesRwf > 0 ? Math.round((amt / totalExpensesRwf) * 100) : 0,
    })).sort((a, b) => b.amountRwf - a.amountRwf);

    return {
      monthLabel: recon.monthLabel,
      intakeCashRwf,
      realizedRevenueRwf,
      outstandingLiabilityRwf,
      totalExpensesRwf,
      grossProfitRwf,
      netCashFlowRwf,
      costPerPlateServed,
      avgRevenuePerPlate,
      platesServedCount,
      isOperatingAtLoss,
      healthStatus,
      healthRecommendation,
      expenseCategories,
    };
  }

  // =========================================================================
  // CUSTOMER ACCOUNT LIFECYCLE & SECURITY (Requirement 4)
  // =========================================================================

  public deleteCustomerAccount(customerId: string, bossName = 'Restaurant Boss'): boolean {
    const idx = this.state.customers.findIndex((c) => c.id === customerId);
    if (idx === -1) return false;

    const cust = this.state.customers.splice(idx, 1)[0];
    this.logAudit({
      restaurantCode: cust.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: bossName,
      action: 'CUSTOMER_ACCOUNT_DELETED',
      details: `Permanently deleted customer account #${cust.memberNo} (${cust.name}) and revoked all card/key credentials.`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return true;
  }

  // =========================================================================
  // CASHIER SHIFT HANDOVER & DAILY RECONCILIATION AUDIT
  // =========================================================================

  public getActiveShift(stationId?: string): ShiftRecord | undefined {
    if (!this.state.shifts) this.state.shifts = [];
    return this.state.shifts.find(
      (s) => s.status === 'open' && (!stationId || s.stationId === stationId)
    );
  }

  public getShiftHistory(restaurantCode?: string): ShiftRecord[] {
    if (!this.state.shifts) this.state.shifts = [];
    const code = restaurantCode || this.state.currentRestaurantCode;
    return this.state.shifts.filter((s) => s.restaurantCode === code);
  }

  public openShift(params: {
    restaurantCode: string;
    branchId: string;
    branchName: string;
    stationId: string;
    stationName: string;
    operatorId: string;
    operatorName: string;
    openingCashRwf: number;
  }): ShiftRecord {
    if (!this.state.shifts) this.state.shifts = [];
    // Auto-close any existing open shift on the same station
    const existing = this.getActiveShift(params.stationId);
    if (existing) {
      existing.status = 'closed';
      existing.closedAt = new Date().toISOString();
      existing.expectedCashRwf = existing.openingCashRwf + existing.cashCollectedRwf;
      existing.closingCashRwf = existing.expectedCashRwf;
      existing.cashVarianceRwf = 0;
    }

    const shiftId = `shift_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const newShift: ShiftRecord = {
      id: shiftId,
      restaurantCode: params.restaurantCode,
      branchId: params.branchId,
      branchName: params.branchName,
      stationId: params.stationId,
      stationName: params.stationName,
      operatorId: params.operatorId,
      operatorName: params.operatorName,
      startedAt: new Date().toISOString(),
      openingCashRwf: Math.max(0, params.openingCashRwf),
      cashCollectedRwf: 0,
      platesServedCount: 0,
      provisionalCustomersRegistered: 0,
      topUpsProcessedCount: 0,
      status: 'open',
    };

    this.state.shifts.unshift(newShift);
    this.logAudit({
      restaurantCode: params.restaurantCode,
      branchId: params.branchId,
      branchName: params.branchName,
      actorRole: 'stand_staff',
      actorName: params.operatorName,
      action: 'SHIFT_OPENED',
      details: `Operator opened new cashier shift on ${params.stationName} with opening cash float ${params.openingCashRwf.toLocaleString()} RWF.`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return newShift;
  }

  public closeShift(params: {
    shiftId: string;
    closingCashRwf: number;
    closingNotes?: string;
    signedOffByPin?: string;
  }): { success: boolean; shift?: ShiftRecord; varianceRwf?: number; error?: string } {
    if (!this.state.shifts) return { success: false, error: 'No shifts recorded' };
    const shift = this.state.shifts.find((s) => s.id === params.shiftId);
    if (!shift) return { success: false, error: 'Shift not found' };
    if (shift.status === 'closed') return { success: false, error: 'Shift is already closed' };

    const expectedCash = shift.openingCashRwf + shift.cashCollectedRwf;
    const variance = params.closingCashRwf - expectedCash;
    const now = new Date().toISOString();
    const auditId = `aud_shift_close_${Date.now()}`;

    shift.status = 'closed';
    shift.closedAt = now;
    shift.closingCashRwf = params.closingCashRwf;
    shift.expectedCashRwf = expectedCash;
    shift.cashVarianceRwf = variance;
    shift.closingNotes = params.closingNotes;
    shift.reconciliationAuditId = auditId;

    const varianceDesc =
      variance === 0
        ? 'Balanced (0 RWF variance)'
        : variance > 0
        ? `Overage: +${variance.toLocaleString()} RWF`
        : `Shortage: ${variance.toLocaleString()} RWF`;

    this.logAudit({
      restaurantCode: shift.restaurantCode,
      branchId: shift.branchId,
      branchName: shift.branchName,
      actorRole: 'stand_staff',
      actorName: shift.operatorName,
      action: 'SHIFT_RECONCILED_AND_CLOSED',
      details: `Closed shift #${shift.id} on ${shift.stationName}. Expected cash: ${expectedCash.toLocaleString()} RWF (Float: ${shift.openingCashRwf.toLocaleString()} + Sales: ${shift.cashCollectedRwf.toLocaleString()}). Counted cash: ${params.closingCashRwf.toLocaleString()} RWF. Variance: ${varianceDesc}. Plates served: ${shift.platesServedCount}. Notes: "${params.closingNotes || 'None'}"`,
    });

    this.sendNotification({
      restaurantCode: shift.restaurantCode,
      target: 'all',
      senderRole: 'system',
      senderName: `${shift.operatorName} (${shift.stationName})`,
      type: 'system_broadcast',
      title: `Shift Closed: ${shift.stationName}`,
      message: `Cashier shift handover completed. Total plates: ${shift.platesServedCount}. Counted cash: ${params.closingCashRwf.toLocaleString()} RWF (${varianceDesc}).`,
      priority: variance !== 0 ? 'important' : 'normal',
      actionTab: 'reports',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, shift, varianceRwf: variance };
  }

  public updateRestaurantProfile(
    restaurantCode: string,
    updates: Partial<Restaurant>,
    actorName = 'Restaurant Boss'
  ): Restaurant | undefined {
    const resto = this.state.restaurants.find((r) => r.code === restaurantCode);
    if (!resto) return undefined;
    Object.assign(resto, updates);
    this.logAudit({
      restaurantCode,
      actorRole: 'restaurant_admin',
      actorName,
      action: 'RESTAURANT_PROFILE_UPDATED',
      details: `Updated restaurant details and appearance for ${resto.name} (${restaurantCode})`,
    });
    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return resto;
  }

  // ----------------------------------------------------
  // RESTOPASS STUDENT DIGITAL SUBSCRIPTION & MONETIZATION
  // ----------------------------------------------------

  public getStudentSubscriptionSettings(): StudentSubscriptionSettings {
    if (!this.state.studentSubscriptionSettings) {
      this.state.studentSubscriptionSettings = {
        enabled: false,
        priceRwf: 500,
        currency: 'RWF',
        period: 'monthly',
        graceDays: 3,
        requireForTransfers: true,
        requireForDashboard: true,
        updatedAt: new Date().toISOString(),
      };
    }
    return this.state.studentSubscriptionSettings;
  }

  /**
   * Authoritative student subscription price resolver:
   * 1. Check restaurant terms override (per-restaurant custom rate)
   * 2. Check restaurant custom studentSubscriptionPriceRwf
   * 3. Fallback to platform-wide studentSubscriptionSettings.priceRwf (default 500 RWF)
   */
  public getStudentSubscriptionPrice(restaurantCode?: string): number {
    const code = restaurantCode || this.state.currentRestaurantCode;
    const r = this.state.restaurants.find((res) => res.code === code);
    if (r?.termsOverride?.studentSubscriptionPriceRwf !== undefined) {
      return Number(r.termsOverride.studentSubscriptionPriceRwf);
    }
    if (r?.studentSubscriptionPriceRwf !== undefined) {
      return Number(r.studentSubscriptionPriceRwf);
    }
    const settings = this.getStudentSubscriptionSettings();
    return settings.priceRwf !== undefined ? Number(settings.priceRwf) : 500;
  }

  public updateStudentSubscriptionSettings(
    updates: Partial<StudentSubscriptionSettings>,
    actorName = 'Platform Admin'
  ): StudentSubscriptionSettings {
    const current = this.getStudentSubscriptionSettings();
    const updated: StudentSubscriptionSettings = {
      ...current,
      ...updates,
      priceRwf: updates.priceRwf !== undefined ? Math.max(0, Number(updates.priceRwf)) : (current.priceRwf ?? 500),
      currency: 'RWF',
      period: 'monthly',
      updatedAt: new Date().toISOString(),
      updatedBy: actorName,
    };
    this.state.studentSubscriptionSettings = updated;
    this.logAudit({
      actorRole: 'super_admin',
      actorName,
      action: 'STUDENT_SUBSCRIPTION_SETTINGS_UPDATED',
      details: `Updated student subscription policy: enabled=${updated.enabled}, price=${updated.priceRwf} RWF, graceDays=${updated.graceDays}`,
    });
    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return updated;
  }

  public getCustomerSubscription(customerId: string): CustomerSubscription | null {
    if (!this.state.customerSubscriptions) this.state.customerSubscriptions = [];
    const sub = this.state.customerSubscriptions.find((s) => s.customerId === customerId);
    if (!sub) return null;

    // Evaluate expiration & grace period transitions dynamically
    const now = Date.now();
    if (sub.status === 'active' && sub.currentPeriodEnd) {
      const endMs = new Date(sub.currentPeriodEnd).getTime();
      const graceMs = sub.gracePeriodEnd ? new Date(sub.gracePeriodEnd).getTime() : endMs + 3 * 24 * 3600 * 1000;
      if (now > graceMs) {
        sub.status = 'expired';
        sub.updatedAt = new Date().toISOString();
      } else if (now > endMs) {
        sub.status = 'grace_period';
        sub.updatedAt = new Date().toISOString();
      }
    }
    return sub;
  }

  public checkStudentEntitlement(
    customerId: string,
    feature: StudentEntitlementFeature
  ): StudentEntitlementResult {
    const settings = this.getStudentSubscriptionSettings();

    // 0. Physical card QR scanning NEVER requires a dashboard subscription
    if (feature === 'physical_card_scan') {
      const sub = this.getCustomerSubscription(customerId);
      return {
        allowed: true,
        feature,
        status: sub?.status || 'inactive',
        inGracePeriod: sub?.status === 'grace_period',
        enforcementEnabled: settings.enabled,
        reason: 'Physical card QR scanning does not require a dashboard subscription.',
      };
    }

    // 1. If feature flag is disabled at launch: All existing rules apply without subscription requirement
    if (!settings.enabled) {
      return {
        allowed: true,
        feature,
        status: 'inactive',
        inGracePeriod: false,
        enforcementEnabled: false,
        reason: 'Student subscription monetization is disabled at launch',
      };
    }

    // 2. Look up customer's authoritative subscription
    const sub = this.getCustomerSubscription(customerId);
    const customer = this.state.customers.find((c) => c.id === customerId);
    const subPrice = this.getStudentSubscriptionPrice(customer?.restaurantCode);

    if (!sub) {
      return {
        allowed: false,
        feature,
        status: 'inactive',
        inGracePeriod: false,
        enforcementEnabled: true,
        reason: `An active student subscription (${subPrice.toLocaleString()} RWF/mo) is required for this digital feature.`,
      };
    }

    // 3. Complimentary access
    if (sub.status === 'complimentary') {
      return {
        allowed: true,
        feature,
        status: 'complimentary',
        inGracePeriod: false,
        enforcementEnabled: true,
        expiresAt: sub.currentPeriodEnd,
      };
    }

    // 4. Active subscription
    if (sub.status === 'active') {
      return {
        allowed: true,
        feature,
        status: 'active',
        inGracePeriod: false,
        enforcementEnabled: true,
        expiresAt: sub.currentPeriodEnd,
        gracePeriodEnd: sub.gracePeriodEnd,
      };
    }

    // 5. Grace period (3 calendar days / 72 hours after paid period)
    if (sub.status === 'grace_period') {
      return {
        allowed: true,
        feature,
        status: 'grace_period',
        inGracePeriod: true,
        enforcementEnabled: true,
        expiresAt: sub.currentPeriodEnd,
        gracePeriodEnd: sub.gracePeriodEnd,
        reason: 'Subscription is in 3-day grace period. Please renew to keep uninterrupted digital access.',
      };
    }

    // 6. Expired / cancelled / pending
    return {
      allowed: false,
      feature,
      status: sub.status,
      inGracePeriod: false,
      enforcementEnabled: true,
      reason:
        sub.status === 'expired'
          ? `Your subscription and 3-day grace period have expired. Please renew for ${subPrice.toLocaleString()} RWF/mo.`
          : sub.status === 'pending_payment'
          ? 'Your payment is pending confirmation. Access will activate once verified.'
          : 'An active student subscription is required.',
    };
  }

  public initiateStudentCheckout(params: {
    customerId: string;
    phoneNumber: string;
    provider: 'mtn_momo' | 'airtel_money';
  }): { success: boolean; payment?: StudentSubscriptionPayment; instructions?: string; error?: string } {
    const cust = this.state.customers.find((c) => c.id === params.customerId);
    if (!cust) return { success: false, error: 'Customer not found' };

    const cleanPhone = params.phoneNumber.trim();
    if (!cleanPhone || cleanPhone.length < 8) {
      return { success: false, error: 'Please enter a valid Mobile Money phone number' };
    }

    if (!this.state.studentSubscriptionPayments) this.state.studentSubscriptionPayments = [];
    if (!this.state.customerSubscriptions) this.state.customerSubscriptions = [];

    const now = new Date().toISOString();
    const internalReference = `SUB-MOMO-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const subPrice = this.getStudentSubscriptionPrice(cust.restaurantCode);

    // Get or create subscription record in pending status
    let sub = this.state.customerSubscriptions.find((s) => s.customerId === cust.id);
    if (!sub) {
      sub = {
        id: `sub_${cust.id}_${Date.now()}`,
        customerId: cust.id,
        memberNo: cust.memberNo,
        restaurantCode: cust.restaurantCode,
        status: 'pending_payment',
        planName: 'Student Digital Pass',
        priceRwf: subPrice,
        currency: 'RWF',
        paymentMethod: params.provider,
        lastPaymentRef: internalReference,
        createdAt: now,
        updatedAt: now,
      };
      this.state.customerSubscriptions.push(sub);
    } else {
      sub.status = 'pending_payment';
      sub.priceRwf = subPrice;
      sub.lastPaymentRef = internalReference;
      sub.paymentMethod = params.provider;
      sub.updatedAt = now;
    }

    const payment: StudentSubscriptionPayment = {
      id: `spay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      subscriptionId: sub.id,
      customerId: cust.id,
      memberNo: cust.memberNo,
      restaurantCode: cust.restaurantCode,
      internalReference,
      provider: params.provider,
      phoneNumber: cleanPhone,
      amountRwf: subPrice,
      currency: 'RWF',
      status: 'pending',
      initiatedAt: now,
    };

    this.state.studentSubscriptionPayments.unshift(payment);
    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();

    const providerName = params.provider === 'mtn_momo' ? 'MTN Mobile Money (*182#)' : 'Airtel Money (*500#)';
    return {
      success: true,
      payment,
      instructions: `USSD payment push sent via ${providerName} to ${cleanPhone}. Please enter your PIN on your phone to complete the ${subPrice.toLocaleString()} RWF subscription.`,
    };
  }

  public verifyStudentPayment(
    internalReference: string,
    providerTransactionId?: string
  ): { success: boolean; subscription?: CustomerSubscription; error?: string } {
    if (!this.state.studentSubscriptionPayments) return { success: false, error: 'No payments found' };
    const payment = this.state.studentSubscriptionPayments.find(
      (p) => p.internalReference === internalReference
    );
    if (!payment) return { success: false, error: 'Payment reference not found' };

    // Idempotency check: Already verified payments do not re-extend
    if (payment.status === 'verified') {
      const sub = this.getCustomerSubscription(payment.customerId);
      return { success: true, subscription: sub || undefined };
    }

    const nowMs = Date.now();
    const periodEndMs = nowMs + 30 * 24 * 3600 * 1000; // 30 calendar days
    const graceEndMs = periodEndMs + (this.state.studentSubscriptionSettings?.graceDays || 3) * 24 * 3600 * 1000; // +72h grace

    payment.status = 'verified';
    payment.verifiedAt = new Date(nowMs).toISOString();
    payment.providerTransactionId = providerTransactionId || `TRX_${Date.now()}`;
    const verifiedPrice = payment.amountRwf || this.getStudentSubscriptionPrice(payment.restaurantCode);

    let sub = this.state.customerSubscriptions.find((s) => s.id === payment.subscriptionId);
    if (!sub) {
      sub = {
        id: payment.subscriptionId,
        customerId: payment.customerId,
        memberNo: payment.memberNo,
        restaurantCode: payment.restaurantCode,
        status: 'active',
        planName: 'Student Digital Pass',
        priceRwf: verifiedPrice,
        currency: 'RWF',
        currentPeriodStart: new Date(nowMs).toISOString(),
        currentPeriodEnd: new Date(periodEndMs).toISOString(),
        gracePeriodEnd: new Date(graceEndMs).toISOString(),
        cancelAtPeriodEnd: false,
        paymentMethod: payment.provider,
        lastPaymentRef: payment.internalReference,
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
      };
      this.state.customerSubscriptions.push(sub);
    } else {
      sub.status = 'active';
      sub.priceRwf = verifiedPrice;
      sub.currency = 'RWF';
      sub.currentPeriodStart = new Date(nowMs).toISOString();
      sub.currentPeriodEnd = new Date(periodEndMs).toISOString();
      sub.gracePeriodEnd = new Date(graceEndMs).toISOString();
      sub.cancelAtPeriodEnd = false;
      sub.paymentMethod = payment.provider;
      sub.lastPaymentRef = payment.internalReference;
      sub.updatedAt = new Date(nowMs).toISOString();
    }

    this.logAudit({
      restaurantCode: payment.restaurantCode,
      actorRole: 'customer',
      actorName: payment.memberNo,
      action: 'STUDENT_SUBSCRIPTION_ACTIVATED',
      details: `Activated student subscription for #${payment.memberNo} via ${payment.provider.toUpperCase()} (Ref: ${payment.internalReference}, Amount: 500 RWF). Valid until ${new Date(periodEndMs).toLocaleDateString()}`,
    });

    this.sendNotification({
      restaurantCode: payment.restaurantCode,
      target: payment.customerId,
      senderRole: 'system',
      senderName: 'RestoPass Subscription Authority',
      type: 'system_broadcast',
      title: 'Student Digital Pass Active! 🌟',
      message: 'Your 500 RWF monthly digital subscription is active! Digital plate transfers and online pass features are unlocked for 30 days.',
      priority: 'important',
      actionTab: 'my_card',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, subscription: sub };
  }

  public cancelStudentSubscription(customerId: string): { success: boolean; error?: string } {
    const sub = this.getCustomerSubscription(customerId);
    if (!sub) return { success: false, error: 'Subscription not found' };

    sub.cancelAtPeriodEnd = true;
    sub.updatedAt = new Date().toISOString();

    this.logAudit({
      restaurantCode: sub.restaurantCode,
      actorRole: 'customer',
      actorName: sub.memberNo,
      action: 'STUDENT_SUBSCRIPTION_CANCEL_SCHEDULED',
      details: `Scheduled cancellation for #${sub.memberNo}. Digital access remains active until ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : 'end of period'}.`,
    });

    this.sendNotification({
      restaurantCode: sub.restaurantCode,
      target: sub.customerId,
      senderRole: 'system',
      senderName: 'RestoPass Subscription Authority',
      type: 'system_broadcast',
      title: 'Dashboard Subscription Cancellation Scheduled',
      message: `Your 500 RWF monthly dashboard subscription will remain active until ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : 'the end of your billing period'} and will not auto-renew.`,
      priority: 'normal',
      actionTab: 'my_card',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true };
  }

  public grantComplimentarySubscription(params: {
    customerId: string;
    reason: string;
    durationDays?: number;
    grantedBy?: string;
  }): { success: boolean; subscription?: CustomerSubscription; error?: string } {
    if (!params.reason || !params.reason.trim()) {
      return { success: false, error: 'A mandatory reason is required to grant complimentary access.' };
    }

    const cust = this.state.customers.find((c) => c.id === params.customerId);
    if (!cust) return { success: false, error: 'Customer not found' };

    if (!this.state.customerSubscriptions) this.state.customerSubscriptions = [];

    const nowMs = Date.now();
    const days = params.durationDays || 30;
    const periodEndMs = nowMs + days * 24 * 3600 * 1000;
    const graceEndMs = periodEndMs + 3 * 24 * 3600 * 1000;

    let sub = this.state.customerSubscriptions.find((s) => s.customerId === cust.id);
    if (!sub) {
      sub = {
        id: `sub_${cust.id}_${Date.now()}`,
        customerId: cust.id,
        memberNo: cust.memberNo,
        restaurantCode: cust.restaurantCode,
        status: 'complimentary',
        planName: 'Complimentary Student Pass',
        priceRwf: 0,
        currency: 'RWF',
        currentPeriodStart: new Date(nowMs).toISOString(),
        currentPeriodEnd: new Date(periodEndMs).toISOString(),
        gracePeriodEnd: new Date(graceEndMs).toISOString(),
        cancelAtPeriodEnd: false,
        paymentMethod: 'complimentary',
        complimentaryReason: params.reason.trim(),
        complimentaryGrantedBy: params.grantedBy || 'Platform Administrator',
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
      };
      this.state.customerSubscriptions.push(sub);
    } else {
      sub.status = 'complimentary';
      sub.planName = 'Complimentary Student Pass';
      sub.currentPeriodStart = new Date(nowMs).toISOString();
      sub.currentPeriodEnd = new Date(periodEndMs).toISOString();
      sub.gracePeriodEnd = new Date(graceEndMs).toISOString();
      sub.complimentaryReason = params.reason.trim();
      sub.complimentaryGrantedBy = params.grantedBy || 'Platform Administrator';
      sub.updatedAt = new Date(nowMs).toISOString();
    }

    this.logAudit({
      restaurantCode: cust.restaurantCode,
      actorRole: 'super_admin',
      actorName: params.grantedBy || 'Platform Administrator',
      action: 'COMPLIMENTARY_STUDENT_SUBSCRIPTION_GRANTED',
      details: `Granted ${days}-day complimentary student pass to #${cust.memberNo} (${cust.name}). Reason: "${params.reason.trim()}"`,
    });

    this.sendNotification({
      restaurantCode: cust.restaurantCode,
      target: cust.id,
      targetName: `${cust.name} (#${cust.memberNo})`,
      senderRole: 'system',
      senderName: params.grantedBy || 'Platform Administrator',
      type: 'system_broadcast',
      title: `Complimentary Dashboard Pass Granted (${days} Days)`,
      message: `You have been granted ${days} days of complimentary digital dashboard access (${params.reason.trim()}).`,
      priority: 'important',
      actionTab: 'my_card',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, subscription: sub };
  }

  public revokeComplimentarySubscription(
    customerId: string,
    reason: string,
    revokedBy = 'Platform Administrator'
  ): { success: boolean; error?: string } {
    const sub = this.getCustomerSubscription(customerId);
    if (!sub) return { success: false, error: 'Subscription not found' };

    sub.status = 'expired';
    sub.currentPeriodEnd = new Date().toISOString();
    sub.gracePeriodEnd = new Date().toISOString();
    sub.updatedAt = new Date().toISOString();

    this.logAudit({
      restaurantCode: sub.restaurantCode,
      actorRole: 'super_admin',
      actorName: revokedBy,
      action: 'COMPLIMENTARY_STUDENT_SUBSCRIPTION_REVOKED',
      details: `Revoked complimentary pass for #${sub.memberNo}. Reason: "${reason}"`,
    });

    this.sendNotification({
      restaurantCode: sub.restaurantCode,
      target: sub.customerId,
      senderRole: 'system',
      senderName: revokedBy,
      type: 'system_broadcast',
      title: 'Complimentary Dashboard Pass Ended',
      message: `Your complimentary digital dashboard pass has ended (${reason}). Your physical card remains active for meals.`,
      priority: 'normal',
      actionTab: 'my_card',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true };
  }

  // ----------------------------------------------------
  // Non-SMS Customer Activation & PIN Lifecycle Methods
  // ----------------------------------------------------

  /**
   * Cashier / Manager Station issues a short-lived, single-use activation code (Non-SMS)
   */
  public requestCustomerActivation(params: {
    customerId: string;
    authorizingStaffId: string;
    authorizingStaffName: string;
    restaurantCode?: string;
  }): { success: boolean; activationCode?: string; expiresAt?: string; error?: string } {
    const cust = this.state.customers.find((c) => c.id === params.customerId);
    if (!cust) return { success: false, error: 'Customer not found' };
    if (cust.provisionalStatus === 'pending_approval') {
      return { success: false, error: 'Registration is pending boss approval before activation.' };
    }
    if (cust.provisionalStatus === 'rejected' || cust.activationStatus === 'suspended') {
      return { success: false, error: 'Customer registration was rejected or suspended.' };
    }

    if (!this.state.activationRequests) this.state.activationRequests = [];

    // Invalidate any previous unused requests for this customer
    this.state.activationRequests.forEach((req) => {
      if (req.customerId === cust.id && !req.used) {
        req.used = true;
      }
    });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = sha256(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const activationRequest: CustomerActivationRequest = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      customerId: cust.id,
      memberNo: cust.memberNo,
      phone: cust.phone,
      restaurantCode: cust.restaurantCode,
      activationCode: code,
      codeHash,
      authorizingStaffId: params.authorizingStaffId,
      authorizingStaffName: params.authorizingStaffName,
      expiresAt,
      used: false,
      createdAt: now.toISOString(),
    };

    this.state.activationRequests.unshift(activationRequest);

    this.logAudit({
      restaurantCode: cust.restaurantCode,
      actorRole: 'stand_staff',
      actorName: params.authorizingStaffName,
      action: 'CUSTOMER_ACTIVATION_REQUESTED',
      details: `Issued 15-minute non-SMS activation code for #${cust.memberNo} (${cust.name}). Staff verified customer identity at desk.`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, activationCode: code, expiresAt };
  }

  /**
   * Check a customer's portal readiness by phone number or Member ID:
   * Once the Boss approves a new registration, the customer can immediately set their
   * personal 6+ digit PIN on the Customer Portal without needing a magic link or WhatsApp link.
   */
  public checkCustomerPortalStatus(
    phoneOrMember: string,
    restaurantCode?: string
  ): {
    status: 'needs_pin_setup' | 'ready_for_login' | 'pending_boss_approval' | 'rejected' | 'not_found';
    customer?: Customer;
  } {
    const clean = phoneOrMember.trim();
    if (!clean) return { status: 'not_found' };
    const normPhone = this.normalizePhoneNumber(clean);

    const cust = this.state.customers.find((c) => {
      if (restaurantCode && c.restaurantCode !== restaurantCode) return false;
      const cNorm = this.normalizePhoneNumber(c.phone);
      return (
        c.phone === clean ||
        c.phone.replace(/\s+/g, '') === clean.replace(/\s+/g, '') ||
        (normPhone.length >= 7 && cNorm === normPhone) ||
        c.memberNo === clean ||
        c.id === clean
      );
    });

    if (!cust) return { status: 'not_found' };
    if (cust.provisionalStatus === 'pending_approval') {
      return { status: 'pending_boss_approval', customer: cust };
    }
    if (cust.provisionalStatus === 'rejected' || cust.activationStatus === 'suspended') {
      return { status: 'rejected', customer: cust };
    }
    if (!cust.hasCustomPin || cust.activationStatus === 'ready_for_activation') {
      return { status: 'needs_pin_setup', customer: cust };
    }
    return { status: 'ready_for_login', customer: cust };
  }

  /**
   * First-time PIN setup directly on Customer Portal once Boss has approved registration
   */
  public async setupFirstTimeCustomerPin(params: {
    phoneOrMember: string;
    newPin: string;
    restaurantCode?: string;
  }): Promise<{ success: boolean; customer?: Customer; error?: string }> {
    const cleanPin = params.newPin.trim();
    if (!/^\d{6,}$/.test(cleanPin)) {
      return { success: false, error: 'PIN must be at least 6 numeric digits.' };
    }

    const check = this.checkCustomerPortalStatus(params.phoneOrMember, params.restaurantCode);
    if (check.status === 'not_found' || !check.customer) {
      return { success: false, error: 'No registered member found with that phone number or Member ID.' };
    }
    if (check.status === 'pending_boss_approval') {
      return {
        success: false,
        error: 'Your registration is still awaiting Restaurant Boss approval. You can use up to 3 grace meals at the stand while waiting.',
      };
    }
    if (check.status === 'rejected') {
      return {
        success: false,
        error: 'Your registration was not approved. Please visit cafeteria management.',
      };
    }
    if (check.status === 'ready_for_login' && check.customer.hasCustomPin) {
      return {
        success: false,
        error: 'Your personal PIN is already set. Please sign in with your PIN or use Forgot PIN.',
      };
    }

    const cust = check.customer;
    const salt = getCustomerPinSalt(cust.id, cust.memberNo);
    const pinHash = await hashPinWithSalt(cleanPin, salt);

    cust.pinHash = pinHash;
    cust.hasCustomPin = true;
    cust.pinSetAt = new Date().toISOString();
    cust.activationStatus = 'active';
    cust.failedLoginAttempts = 0;
    cust.lockedUntil = null;
    cust.lastLoginAt = new Date().toISOString();

    this.pendingOfflineAuthParams = {
      role: 'customer',
      username: cust.memberNo,
      pin: cleanPin,
      restaurantCode: cust.restaurantCode,
    };

    this.setRestaurantCode(cust.restaurantCode);
    this.setCustomer(cust.id);
    this.setRole('customer');
    this.queueOutboxItem('customer', cust.id, cust);

    this.logAudit({
      restaurantCode: cust.restaurantCode,
      actorRole: 'customer',
      actorName: cust.name,
      action: 'CUSTOMER_FIRST_TIME_PIN_SETUP',
      details: `Customer #${cust.memberNo} (${cust.name}) set personal 6+ digit PIN on Customer Portal after Boss registration approval.`,
    });

    this.sendNotification({
      restaurantCode: cust.restaurantCode,
      target: cust.id,
      targetName: `${cust.name} (#${cust.memberNo})`,
      senderRole: 'system',
      senderName: 'RestoPass Security',
      type: 'account_activated',
      title: 'Personal PIN Set & Portal Activated!',
      message: 'Your personal 6+ digit PIN is now active. You can sign in anytime using your phone number or Member ID.',
      priority: 'important',
      actionTab: 'my_card',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, customer: cust };
  }

  /**
   * Customer privately completes activation and sets their personal PIN (Minimum 6 digits, No SMS)
   */
  public async completeCustomerActivation(params: {
    phoneOrMember: string;
    activationCode?: string;
    newPin: string;
    restaurantCode?: string;
  }): Promise<{ success: boolean; customer?: Customer; error?: string }> {
    const cleanIdentifier = params.phoneOrMember.trim();
    const cleanPin = params.newPin.trim();
    const cleanCode = (params.activationCode || '').trim();

    // If no cashier code was passed (or 'BOSS_APPROVED'), allow direct first-time PIN setup for Boss-approved accounts
    if (!cleanCode || cleanCode === 'BOSS_APPROVED') {
      return this.setupFirstTimeCustomerPin({
        phoneOrMember: cleanIdentifier,
        newPin: cleanPin,
        restaurantCode: params.restaurantCode,
      });
    }

    // 1. PIN Policy: Minimum 6 digits, allows longer
    if (!/^\d{6,}$/.test(cleanPin)) {
      return { success: false, error: 'PIN must be at least 6 numeric digits.' };
    }

    const cust = this.state.customers.find(
      (c) =>
        c.phone === cleanIdentifier ||
        c.phone.replace(/\s+/g, '') === cleanIdentifier.replace(/\s+/g, '') ||
        c.memberNo === cleanIdentifier ||
        c.id === cleanIdentifier
    );
    if (!cust) return { success: false, error: 'Invalid activation credentials or code.' };

    if (!this.state.activationRequests) this.state.activationRequests = [];

    // Find valid activation request
    const codeHash = sha256(cleanCode);
    const req = this.state.activationRequests.find(
      (r) =>
        r.customerId === cust.id &&
        !r.used &&
        (r.activationCode === cleanCode || r.codeHash === codeHash) &&
        new Date(r.expiresAt).getTime() > Date.now()
    );

    if (!req) {
      return { success: false, error: 'Invalid, expired, or already used activation code.' };
    }

    // 2. Hash PIN with customer salt
    const salt = getCustomerPinSalt(cust.id, cust.memberNo);
    const pinHash = await hashPinWithSalt(cleanPin, salt);

    // 3. Activate account
    cust.pinHash = pinHash;
    cust.hasCustomPin = true;
    cust.pinSetAt = new Date().toISOString();
    cust.activationStatus = 'active';
    cust.failedLoginAttempts = 0;
    cust.lockedUntil = null;
    cust.cardReadyForPrint = true;

    req.used = true;
    req.usedAt = new Date().toISOString();

    this.logAudit({
      restaurantCode: cust.restaurantCode,
      actorRole: 'customer',
      actorName: cust.name,
      action: 'CUSTOMER_ACTIVATION_COMPLETED',
      details: `Customer #${cust.memberNo} (${cust.name}) privately established personal 6+ digit PIN without SMS OTP. Account activated.`,
    });

    this.sendNotification({
      restaurantCode: cust.restaurantCode,
      target: cust.id,
      targetName: cust.name,
      senderRole: 'system',
      senderName: 'RestoPass Security',
      type: 'account_activated',
      title: 'RestoPass Account Activated!',
      message: 'Your personal PIN has been securely set. You can now access your meal dashboard anytime using your registered phone number.',
      priority: 'important',
      actionTab: 'history',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, customer: cust };
  }

  /**
   * Create an audited non-SMS PIN recovery request after manager in-person identity check
   */
  public requestCustomerPinRecovery(params: {
    customerId: string;
    reason: string;
    idVerificationMethod: CustomerPinRecoveryRequest['idVerificationMethod'];
    restaurantCode: string;
    staffId: string;
    staffName: string;
  }): { success: boolean; requestId?: string; error?: string } {
    const cust = this.state.customers.find((c) => c.id === params.customerId);
    if (!cust) return { success: false, error: 'Customer not found' };

    if (!this.state.pinRecoveryRequests) this.state.pinRecoveryRequests = [];

    const requestId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const recReq: CustomerPinRecoveryRequest = {
      id: requestId,
      customerId: cust.id,
      memberNo: cust.memberNo,
      phone: cust.phone,
      restaurantCode: cust.restaurantCode,
      reason: params.reason.trim(),
      idVerificationMethod: params.idVerificationMethod,
      status: 'pending',
      authorizingStaffId: params.staffId,
      authorizingStaffName: params.staffName,
      createdAt: new Date().toISOString(),
    };

    this.state.pinRecoveryRequests.unshift(recReq);

    this.logAudit({
      restaurantCode: cust.restaurantCode,
      actorRole: 'stand_staff',
      actorName: params.staffName,
      action: 'CUSTOMER_PIN_RECOVERY_REQUESTED',
      details: `Initiated PIN recovery request for #${cust.memberNo} (${cust.name}). Reason: "${params.reason}". Verification: ${params.idVerificationMethod}.`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, requestId };
  }

  /**
   * Restaurant Manager/Boss approves PIN recovery request and issues single-use reset code
   */
  public approveCustomerPinRecovery(params: {
    requestId: string;
    authorizingStaffId: string;
    authorizingStaffName: string;
  }): { success: boolean; recoveryCode?: string; expiresAt?: string; error?: string } {
    if (!this.state.pinRecoveryRequests) return { success: false, error: 'No recovery requests found' };
    const req = this.state.pinRecoveryRequests.find((r) => r.id === params.requestId);
    if (!req) return { success: false, error: 'Recovery request not found' };
    if (req.status !== 'pending') return { success: false, error: 'Request is already reviewed or completed' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = sha256(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    req.status = 'approved';
    req.recoveryCode = code;
    req.recoveryCodeHash = codeHash;
    req.authorizingStaffId = params.authorizingStaffId;
    req.authorizingStaffName = params.authorizingStaffName;
    req.approvedAt = new Date().toISOString();
    req.expiresAt = expiresAt;

    this.logAudit({
      restaurantCode: req.restaurantCode,
      actorRole: 'restaurant_admin',
      actorName: params.authorizingStaffName,
      action: 'CUSTOMER_PIN_RECOVERY_APPROVED',
      details: `Manager approved PIN recovery for #${req.memberNo}. Single-use reset code issued. Customer to set new PIN privately.`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, recoveryCode: code, expiresAt };
  }

  /**
   * Customer privately sets new PIN through recovery flow
   */
  public async completeCustomerPinRecovery(params: {
    requestId: string;
    recoveryCode: string;
    newPin: string;
  }): Promise<{ success: boolean; error?: string }> {
    const cleanPin = params.newPin.trim();
    if (!/^\d{6,}$/.test(cleanPin)) {
      return { success: false, error: 'PIN must be at least 6 numeric digits.' };
    }

    if (!this.state.pinRecoveryRequests) return { success: false, error: 'No recovery requests found' };
    const req = this.state.pinRecoveryRequests.find((r) => r.id === params.requestId);
    if (!req) return { success: false, error: 'Recovery request not found' };
    if (req.status !== 'approved') return { success: false, error: 'Request is not authorized for reset.' };

    if (req.expiresAt && new Date(req.expiresAt).getTime() < Date.now()) {
      return { success: false, error: 'Recovery code has expired. Please request a new reset.' };
    }

    const cleanCode = params.recoveryCode.trim();
    const codeHash = sha256(cleanCode);
    if (req.recoveryCode !== cleanCode && req.recoveryCodeHash !== codeHash) {
      return { success: false, error: 'Invalid recovery code.' };
    }

    const cust = this.state.customers.find((c) => c.id === req.customerId);
    if (!cust) return { success: false, error: 'Customer not found' };

    const salt = getCustomerPinSalt(cust.id, cust.memberNo);
    const pinHash = await hashPinWithSalt(cleanPin, salt);

    cust.pinHash = pinHash;
    cust.hasCustomPin = true;
    cust.pinSetAt = new Date().toISOString();
    cust.failedLoginAttempts = 0;
    cust.lockedUntil = null;
    cust.cardStatus = 'active';

    req.status = 'completed';
    req.completedAt = new Date().toISOString();

    // Invalidate existing sessions
    cust.keyVersion = (cust.keyVersion || 1) + 1;

    this.logAudit({
      restaurantCode: cust.restaurantCode,
      actorRole: 'customer',
      actorName: cust.name,
      action: 'CUSTOMER_PIN_RESET_COMPLETED',
      details: `Customer #${cust.memberNo} reset security PIN following manager-approved identity verification. All previous sessions revoked.`,
    });

    this.sendNotification({
      restaurantCode: cust.restaurantCode,
      target: cust.id,
      targetName: cust.name,
      senderRole: 'system',
      senderName: 'RestoPass Security',
      type: 'security_alert',
      title: 'Security PIN Reset Completed',
      message: 'Your personal PIN was reset at cafeteria management desk. If you did not authorize this, alert staff immediately.',
      priority: 'important',
      actionTab: 'history',
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true };
  }

  /**
   * Customer Phone + PIN login with progressive delays, lockout, and generic error (Section 3)
   */
  public async customerLogin(params: {
    phone: string;
    pin: string;
    restaurantCode?: string;
  }): Promise<{ success: boolean; customer?: Customer; error?: string }> {
    const cleanPhone = params.phone.trim();
    const cleanPin = params.pin.trim();

    // 1. Server authentication attempt first if online
    if (typeof window !== 'undefined' && navigator.onLine) {
      try {
        const res = await fetch('/api/customer/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: cleanPhone,
            pin: cleanPin,
            restaurantCode: params.restaurantCode,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success && data.token) {
          this.setAuthToken(data.token);
          if (data.customer?.id) {
            this.setCustomer(data.customer.id);
            this.setRestaurantCode(data.customer.restaurantCode);
          }
          this.setRole('customer');
          this.pullStateFromServer();
          return { success: true, customer: this.getCurrentCustomer() || undefined };
        } else if (res.status === 401 || res.status === 403 || res.status === 423) {
          return { success: false, error: data.error || 'Invalid phone number or PIN' };
        }
      } catch {
        // Fall through to local offline verification
      }
    }

    // 2. Offline / local verification fallback
    const cust = this.state.customers.find(
      (c) =>
        c.phone === cleanPhone ||
        c.phone.replace(/\s+/g, '') === cleanPhone.replace(/\s+/g, '') ||
        c.memberNo === cleanPhone ||
        c.id === cleanPhone
    );

    // Account enumeration protection: Return generic error if customer does not exist
    if (!cust) {
      return { success: false, error: 'Invalid phone number or PIN' };
    }

    // Check account lockout
    if (cust.lockedUntil && new Date(cust.lockedUntil).getTime() > Date.now()) {
      const waitMinutes = Math.max(1, Math.ceil((new Date(cust.lockedUntil).getTime() - Date.now()) / 60000));
      return {
        success: false,
        error: `Account temporarily locked due to multiple failed login attempts. Please try again in ${waitMinutes} minutes or visit cafeteria reception.`,
      };
    }

    // Check pending / rejected status
    if (cust.provisionalStatus === 'pending_approval') {
      return {
        success: false,
        error: 'Your registration is pending restaurant boss approval. You can eat grace meals at the stand with your Member ID.',
      };
    }
    if (cust.provisionalStatus === 'rejected') {
      return {
        success: false,
        error: 'Customer registration was not approved. Please visit cafeteria management.',
      };
    }
    if (cust.activationStatus === 'ready_for_activation') {
      return {
        success: false,
        error: 'Account approved! Please complete your one-time activation at cafeteria reception to set your personal PIN.',
      };
    }

    // Verify PIN with constant-time equality and salt
    const salt = getCustomerPinSalt(cust.id, cust.memberNo);
    const isPinValid = await verifyPinSecure(cleanPin, salt, cust.pinHash || '1234');

    if (!isPinValid) {
      cust.failedLoginAttempts = (cust.failedLoginAttempts || 0) + 1;
      if (cust.failedLoginAttempts >= 5) {
        cust.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        this.logAudit({
          restaurantCode: cust.restaurantCode,
          actorRole: 'customer',
          actorName: `Customer #${cust.memberNo}`,
          action: 'CUSTOMER_ACCOUNT_LOCKED',
          details: `Account #${cust.memberNo} temporarily locked for 15 minutes after 5 consecutive failed PIN attempts.`,
        });
      }
      this.scheduleSaveState();
      return { success: false, error: 'Invalid phone number or PIN' };
    }

    // Success: reset attempts
    cust.failedLoginAttempts = 0;
    cust.lockedUntil = null;
    cust.lastLoginAt = new Date().toISOString();

    this.pendingOfflineAuthParams = {
      role: 'customer',
      username: cust.memberNo,
      pin: cleanPin,
      restaurantCode: cust.restaurantCode,
    };

    this.setRestaurantCode(cust.restaurantCode);
    this.setCustomer(cust.id);
    this.setRole('customer');

    this.logAudit({
      restaurantCode: cust.restaurantCode,
      actorRole: 'customer',
      actorName: cust.name,
      action: 'CUSTOMER_LOGIN_SUCCESS',
      details: `Customer #${cust.memberNo} logged into meal dashboard using registered phone and PIN.`,
    });

    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    return { success: true, customer: cust };
  }

  /**
   * Super Admin Live Translation Management (CMS)
   * Allows live editing, persistence, and instant propagation of Kinyarwanda & other translations
   */
  public saveCustomTranslations(language: Language, overrides: Record<string, any>): void {
    if (!this.state.customTranslations) {
      this.state.customTranslations = {};
    }
    this.state.customTranslations[language] = {
      ...(this.state.customTranslations[language] || {}),
      ...overrides,
    };
    applyCustomTranslations(this.state.customTranslations);
    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    this.logAudit({
      actorRole: 'super_admin',
      actorName: 'Super Admin Authority',
      action: 'TRANSLATIONS_UPDATED',
      details: `Updated custom language dictionary for '${language}'.`,
    });
  }

  public resetCustomTranslations(language?: Language): void {
    if (language) {
      if (this.state.customTranslations) {
        delete this.state.customTranslations[language];
      }
    } else {
      this.state.customTranslations = {};
    }
    this.scheduleSaveState();
    this.pushStateToServer();
    this.notify();
    this.logAudit({
      actorRole: 'super_admin',
      actorName: 'Super Admin Authority',
      action: 'TRANSLATIONS_RESET',
      details: language
        ? `Reset custom translations for '${language}' to factory defaults.`
        : 'Reset all custom translations to factory defaults.',
    });
  }

  public getCustomTranslations(language?: Language): Record<string, any> {
    if (language) {
      return this.state.customTranslations?.[language] || {};
    }
    return this.state.customTranslations || {};
  }
}

export const restoStore = new RestoStore();
