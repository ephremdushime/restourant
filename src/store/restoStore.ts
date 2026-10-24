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
  markTokenStepUsed,
  hashPinWithSalt,
  verifyPinSecure,
  hashPasswordWithSalt,
  verifyPasswordSecure,
  getCustomerPinSalt,
  getStationUserSalt,
  getBossPasswordSalt,
  getSuperAdminSalt,
} from '../services/cryptoService';
import { sound } from '../services/audioService';

const STORAGE_KEY = 'RESTOPASS_STATE_V1.1';

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
      plateLimitPerWindow: 2,
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
      plateLimitPerWindow: 2,
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

  syncOutbox: SyncOutboxItem[];
  syncCommands: SyncCommand[];
  auditLogs: AuditLogItem[];
  notifications: AppNotification[];
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
      pairingCode: 'PAIR-8841',
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
      deviceModel: 'Honeywell 2D BT Imager',
      pairingCode: 'PAIR-9932',
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
      pairingCode: 'PAIR-1102',
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

      syncOutbox: [],
      syncCommands: [],
      auditLogs,
      notifications: initialNotifications,
    };
  }

export class RestoStore {
  private state: AppState;
  private listeners: Set<() => void> = new Set();
  private isSyncingWithServer = false;

  constructor() {
    this.state = this.loadState();
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.pullStateFromServer();
      }, 100);
    }
  }

  public async pushStateToServer(): Promise<void> {
    if (typeof window === 'undefined' || !navigator.onLine || this.isSyncingWithServer) return;
    this.isSyncingWithServer = true;
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullState: this.state }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.serverState) {
          this.mergeServerState(data.serverState);
        }
      }
    } catch {
      // offline fallback - ignore network errors
    } finally {
      this.isSyncingWithServer = false;
    }
  }

  public async pullStateFromServer(): Promise<void> {
    if (typeof window === 'undefined' || !navigator.onLine || this.isSyncingWithServer) return;
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        if (data.hasServerState && data.state) {
          this.mergeServerState(data.state);
        } else if (!data.hasServerState) {
          // Push initial local state so server initializes
          this.pushStateToServer();
        }
      }
    } catch {
      // offline
    }
  }

  private mergeServerState(serverState: Partial<AppState>): void {
    let hasChanges = false;

    // 1. Merge customers by id
    if (serverState.customers && Array.isArray(serverState.customers)) {
      const currentCustMap = new Map(this.state.customers.map((c) => [c.id, c]));
      for (const serverCust of serverState.customers) {
        const existing = currentCustMap.get(serverCust.id);
        if (!existing) {
          this.state.customers.push(serverCust);
          currentCustMap.set(serverCust.id, serverCust);
          hasChanges = true;
        } else if (
          serverCust.cardVersion > existing.cardVersion ||
          serverCust.cardStatus !== existing.cardStatus ||
          serverCust.keyVersion > existing.keyVersion
        ) {
          Object.assign(existing, serverCust);
          hasChanges = true;
        }
      }
    }

    // 2. Merge ledger entries (append-only)
    if (serverState.ledgerEntries && Array.isArray(serverState.ledgerEntries)) {
      const currentLedgerIds = new Set(this.state.ledgerEntries.map((l) => l.id));
      for (const serverEntry of serverState.ledgerEntries) {
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
      const incomingNewScans = serverState.scanEvents.filter((s) => !currentScanIds.has(s.id));
      if (incomingNewScans.length > 0) {
        this.state.scanEvents = [...incomingNewScans, ...this.state.scanEvents];
        hasChanges = true;
      }
    }

    // 4. Merge restaurants
    if (serverState.restaurants && Array.isArray(serverState.restaurants)) {
      const currentRestoMap = new Map(this.state.restaurants.map((r) => [r.code, r]));
      for (const serverResto of serverState.restaurants) {
        const existing = currentRestoMap.get(serverResto.code);
        if (!existing) {
          this.state.restaurants.push(serverResto);
          currentRestoMap.set(serverResto.code, serverResto);
          hasChanges = true;
        } else if (serverResto.status !== existing.status) {
          Object.assign(existing, serverResto);
          hasChanges = true;
        }
      }
    }

    // 5. Merge notifications
    if (serverState.notifications && Array.isArray(serverState.notifications)) {
      if (!this.state.notifications) this.state.notifications = [];
      const currentNotifIds = new Set(this.state.notifications.map((n) => n.id));
      for (const serverNotif of serverState.notifications) {
        if (!currentNotifIds.has(serverNotif.id)) {
          this.state.notifications.unshift(serverNotif);
          currentNotifIds.add(serverNotif.id);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        } catch {}
      }
      this.listeners.forEach((cb) => cb());
    }
  }

  private loadState(): AppState {
    if (typeof window === 'undefined') return getInitialState();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with initial state to guarantee schema consistency
        const initial = getInitialState();
        let loadedPackages = initial.packages;
        if (Array.isArray(parsed.packages) && parsed.packages.length > 0) {
          loadedPackages = parsed.packages.map((pkg: any) => ({
            ...pkg,
            restaurantCode: pkg.restaurantCode || 'RW01',
          }));
        }

        let loadedMenuItems = initial.menuItems;
        if (Array.isArray(parsed.menuItems) && parsed.menuItems.length > 0) {
          loadedMenuItems = parsed.menuItems.map((item: any) => ({
            ...item,
            restaurantCode: item.restaurantCode || 'RW01',
          }));
        }

        let loadedBranches = initial.branches;
        if (Array.isArray(parsed.branches) && parsed.branches.length > 0) {
          loadedBranches = parsed.branches;
        }

        let loadedStationUsers = initial.stationUsers;
        if (Array.isArray(parsed.stationUsers) && parsed.stationUsers.length > 0) {
          loadedStationUsers = parsed.stationUsers;
        }

        let loadedPendingApprovals = initial.pendingApprovals;
        if (Array.isArray(parsed.pendingApprovals) && parsed.pendingApprovals.length > 0) {
          loadedPendingApprovals = parsed.pendingApprovals;
        }

        let loadedShifts = initial.shifts;
        if (Array.isArray(parsed.shifts) && parsed.shifts.length > 0) {
          loadedShifts = parsed.shifts;
        }

        // Ensure cust_pending_1 is present if not already in parsed customers
        let loadedCustomers = initial.customers;
        if (Array.isArray(parsed.customers) && parsed.customers.length > 0) {
          const custIds = new Set(parsed.customers.map((c: any) => c.id));
          const missingInitial = initial.customers.filter((c) => !custIds.has(c.id));
          loadedCustomers = [...parsed.customers, ...missingInitial];
        }

        return {
          ...initial,
          ...parsed,
          theme: parsed.theme || initial.theme,
          plans: initial.plans, // keep plan definitions fresh
          packages: loadedPackages,
          menuItems: loadedMenuItems,
          branches: loadedBranches,
          stationUsers: loadedStationUsers,
          pendingApprovals: loadedPendingApprovals,
          shifts: loadedShifts,
          customers: loadedCustomers,
          notifications: Array.isArray(parsed.notifications) && parsed.notifications.length > 0
            ? parsed.notifications
            : initial.notifications,
        };
      }
    } catch (e) {
      console.error('Failed to load RestoPass state', e);
    }
    return getInitialState();
  }

  private saveTimeout: any = null;

  private saveState(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
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
    // Set current customer to one belonging to this restaurant
    const cust = this.state.customers.find((c) => c.restaurantCode === code);
    if (cust) {
      this.state.currentCustomerId = cust.id;
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
    const cust = this.state.customers.find((c) => c.id === this.state.currentCustomerId);
    if (cust && cust.restaurantCode === this.state.currentRestaurantCode) {
      return cust;
    }
    return this.state.customers.find((c) => c.restaurantCode === this.state.currentRestaurantCode);
  }

  public getCurrentRestaurant(): Restaurant | undefined {
    return this.state.restaurants.find((r) => r.code === this.state.currentRestaurantCode);
  }

  public getRestaurantLicense(restaurantCode: string): License | undefined {
    const r = this.state.restaurants.find((res) => res.code === restaurantCode);
    if (!r?.currentLicenseId) return undefined;
    return this.state.licenses.find((l) => l.id === r.currentLicenseId);
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

  public processScan(payload: string): {
    scanEvent: ScanEvent;
    balanceAfter: number;
    error?: string;
    latencyMs: number;
  } {
    const startTime = performance.now();
    const restaurantCode = this.state.currentRestaurantCode;
    const station = this.state.scanPoints.find((sp) => sp.id === this.state.currentStationId) || this.state.scanPoints[0];
    const staffId = this.state.currentStaffId;
    const terms = this.getRestaurantTerms(restaurantCode);

    // 1. Offline License Enforcement
    const license = this.getRestaurantLicense(restaurantCode);
    const guardedNow = this.getGuardedTime(restaurantCode);

    if (!license) {
      sound.playDangerAlarm();
      const failEvent: ScanEvent = {
        id: `scan_${Date.now()}`,
        restaurantCode,
        customerId: '',
        customerName: 'Unknown',
        customerPhoto: '',
        memberNo: '',
        scanPointId: station.id,
        scanPointName: station.name,
        staffId,
        staffName: 'Stand Operator',
        timestamp: new Date(guardedNow).toISOString(),
        platesInWindow: 0,
        platesDeducted: 0,
        photoCheckRequired: false,
        photoCheckReason: 'none',
        photoCheckResult: 'none',
        status: 'blocked',
        blockedReason: 'License missing or not activated for this restaurant',
        tokenPayload: payload,
      };
      this.state.scanEvents.unshift(failEvent);
      this.notify();
      return {
        scanEvent: failEvent,
        balanceAfter: 0,
        error: failEvent.blockedReason,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    }

    const validUntilMs = new Date(license.validUntil).getTime();
    const graceUntilMs = validUntilMs + license.graceDays * 24 * 3600 * 1000;

    if (guardedNow > graceUntilMs) {
      sound.playDangerAlarm();
      const failEvent: ScanEvent = {
        id: `scan_${Date.now()}`,
        restaurantCode,
        customerId: '',
        customerName: 'Unknown',
        customerPhoto: '',
        memberNo: '',
        scanPointId: station.id,
        scanPointName: station.name,
        staffId,
        staffName: 'Stand Operator',
        timestamp: new Date(guardedNow).toISOString(),
        platesInWindow: 0,
        platesDeducted: 0,
        photoCheckRequired: false,
        photoCheckReason: 'none',
        photoCheckResult: 'none',
        status: 'blocked',
        blockedReason: 'Restaurant subscription expired (scanning disabled by authority)',
        tokenPayload: payload,
      };
      this.state.scanEvents.unshift(failEvent);
      this.notify();
      return {
        scanEvent: failEvent,
        balanceAfter: 0,
        error: failEvent.blockedReason,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    }

    // 2. Cryptographic QR Verification
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

    if (!verifyResult.valid) {
      sound.playDangerAlarm();
      const customer = this.state.customers.find(
        (c) => c.memberNo === verifyResult.memberNo && c.restaurantCode === restaurantCode
      );
      const failEvent: ScanEvent = {
        id: `scan_${Date.now()}`,
        restaurantCode,
        customerId: customer?.id || '',
        customerName: customer?.name || (verifyResult.memberNo ? `Customer #${verifyResult.memberNo}` : 'Unknown'),
        customerPhoto: customer?.photoUrl || '',
        memberNo: verifyResult.memberNo || 'Unknown',
        scanPointId: station.id,
        scanPointName: station.name,
        staffId,
        staffName: 'Stand Operator',
        timestamp: new Date(guardedNow).toISOString(),
        platesInWindow: 0,
        platesDeducted: 0,
        photoCheckRequired: false,
        photoCheckReason: 'none',
        photoCheckResult: 'none',
        status: 'blocked',
        blockedReason: verifyResult.error || 'Token verification failed',
        tokenPayload: payload,
      };
      this.state.scanEvents.unshift(failEvent);
      this.notify();
      return {
        scanEvent: failEvent,
        balanceAfter: 0,
        error: failEvent.blockedReason,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    }

    const customer = this.state.customers.find(
      (c) => c.memberNo === verifyResult.memberNo && c.restaurantCode === restaurantCode
    );

    if (!customer) {
      sound.playDangerAlarm();
      const failEvent: ScanEvent = {
        id: `scan_${Date.now()}`,
        restaurantCode,
        customerId: '',
        customerName: 'Unknown',
        customerPhoto: '',
        memberNo: verifyResult.memberNo,
        scanPointId: station.id,
        scanPointName: station.name,
        staffId,
        staffName: 'Stand Operator',
        timestamp: new Date(guardedNow).toISOString(),
        platesInWindow: 0,
        platesDeducted: 0,
        photoCheckRequired: false,
        photoCheckReason: 'none',
        photoCheckResult: 'none',
        status: 'blocked',
        blockedReason: 'Customer record not found on local authority',
        tokenPayload: payload,
      };
      this.state.scanEvents.unshift(failEvent);
      this.notify();
      return {
        scanEvent: failEvent,
        balanceAfter: 0,
        error: failEvent.blockedReason,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    }

    // Check customer card status
    if (customer.cardStatus === 'locked') {
      sound.playDangerAlarm();
      const failEvent: ScanEvent = {
        id: `scan_${Date.now()}`,
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
        platesInWindow: 0,
        platesDeducted: 0,
        photoCheckRequired: true,
        photoCheckReason: 'physical_card',
        photoCheckResult: 'none',
        status: 'blocked',
        blockedReason: 'Card is locked by customer or manager',
        tokenPayload: payload,
      };
      this.state.scanEvents.unshift(failEvent);
      this.notify();
      return {
        scanEvent: failEvent,
        balanceAfter: this.getCustomerBalance(customer.id),
        error: failEvent.blockedReason,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    }

    // 3. Balance & Provisional Grace Allowance Check
    const currentBalance = this.getCustomerBalance(customer.id);
    const isProvisional = customer.provisionalStatus === 'pending_approval';
    const graceConsumed = customer.gracePlatesConsumed || 0;

    if (currentBalance < 1 && (!isProvisional || graceConsumed >= 3)) {
      sound.playDangerAlarm();
      const blockedMsg = isProvisional && graceConsumed >= 3
        ? 'Provisional grace limit reached (3/3 meals consumed). Awaiting restaurant boss Mobile Money payment approval before further servings.'
        : 'Insufficient plate balance (0 plates remaining). Cashier top-up required.';

      const failEvent: ScanEvent = {
        id: `scan_${Date.now()}`,
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
        platesInWindow: 0,
        platesDeducted: 0,
        photoCheckRequired: false,
        photoCheckReason: 'none',
        photoCheckResult: 'none',
        status: 'blocked',
        blockedReason: blockedMsg,
        tokenPayload: payload,
      };
      this.state.scanEvents.unshift(failEvent);
      this.notify();
      return {
        scanEvent: failEvent,
        balanceAfter: 0,
        error: failEvent.blockedReason,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    }

    // 4. Anti-Double-Tap / Pass-Between Guard
    // Between first scan and second scan, at least one other different card must pass through the station
    const lastSuccessfulStationScan = this.state.scanEvents.find(
      (ev) =>
        ev.restaurantCode === restaurantCode &&
        ev.scanPointId === station.id &&
        (ev.status === 'approved' || ev.status === 'warning_confirmed')
    );

    if (lastSuccessfulStationScan && lastSuccessfulStationScan.customerId === customer.id) {
      sound.playDangerAlarm();
      const failEvent: ScanEvent = {
        id: `scan_${Date.now()}`,
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
        platesInWindow: this.getPlatesInWindow(customer.id, restaurantCode).count,
        platesDeducted: 0,
        photoCheckRequired: true,
        photoCheckReason: 'repeat_scan_in_window',
        photoCheckResult: 'none',
        status: 'blocked',
        blockedReason: 'Consecutive tap blocked: Another customer card must be scanned before this card can tap again (anti-passback rule; max 3 scans per 2hr window).',
        tokenPayload: payload,
      };
      this.state.scanEvents.unshift(failEvent);
      this.notify();
      return {
        scanEvent: failEvent,
        balanceAfter: currentBalance,
        error: failEvent.blockedReason,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    }

    // 5. 2-Hour Usage Window Check (Strict limit of 3 plates in 2 hours for lunch/dinner)
    const windowInfo = this.getPlatesInWindow(customer.id, restaurantCode);
    const platesInWindow = windowInfo.count;
    const windowLimit = Math.max(3, terms.plateLimitPerWindow || 3);

    // Hard block if plate limit reached in 2-hour window
    if (platesInWindow >= windowLimit) {
      sound.playDangerAlarm();
      const failEvent: ScanEvent = {
        id: `scan_${Date.now()}`,
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
        platesInWindow,
        platesDeducted: 0,
        photoCheckRequired: true,
        photoCheckReason: 'repeat_scan_in_window',
        photoCheckResult: 'none',
        status: 'blocked',
        blockedReason: `Plate limit reached: Already consumed ${platesInWindow} plates in the 2-hour window (max ${windowLimit}). Blocked until manager overrides.`,
        tokenPayload: payload,
      };
      this.state.scanEvents.unshift(failEvent);
      this.notify();
      return {
        scanEvent: failEvent,
        balanceAfter: currentBalance,
        error: failEvent.blockedReason,
        latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
      };
    }

    // 5. Photo Spot-Check Triggers
    let photoCheckRequired = false;
    let photoCheckReason: ScanEvent['photoCheckReason'] = 'none';

    if (verifyResult.isCard) {
      // Physical cards always require photo check
      photoCheckRequired = true;
      photoCheckReason = 'physical_card';
    } else {
      // Phone QR spot checks: random sample (configurable rate e.g. 1 in 10) + risk triggers
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

    // 6. Deduct 1 Plate via Ledger
    const ledgerId = `led_scan_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
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
    };
    this.state.ledgerEntries.push(newLedgerEntry);

    // Update active shift stats
    const activeShift = this.getActiveShift(station.id);
    if (activeShift) {
      activeShift.platesServedCount += 1;
    }

    // Mark step as used if phone token
    if (!verifyResult.isCard && verifyResult.step !== undefined) {
      const restKey = deriveRestaurantKey(restaurantCode);
      const custKey = deriveCustomerKey(restKey, customer.memberNo, customer.keyVersion);
      markTokenStepUsed(custKey, verifyResult.step);
    }

    // Track provisional grace plate consumption
    let overrideReason: string | undefined = undefined;
    if (isProvisional) {
      customer.gracePlatesConsumed = graceConsumed + 1;
      const pending = this.state.pendingApprovals.find(
        (p) => p.customerId === customer.id && p.status === 'pending'
      );
      if (pending) {
        pending.gracePlatesConsumed = customer.gracePlatesConsumed;
      }
      overrideReason = `Provisional grace plate (#${customer.gracePlatesConsumed}/3 served). Boss Mobile Money approval pending.`;
    }

    // Check repeat warning (platesInWindow === 1) or provisional grace plate
    const isRepeatWarning = platesInWindow === 1 || isProvisional;
    const scanStatus: ScanEvent['status'] = isRepeatWarning ? 'warning_confirmed' : 'approved';

    const scanEvent: ScanEvent = {
      id: `scan_${Date.now()}`,
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
      platesInWindow,
      platesDeducted: 1,
      photoCheckRequired,
      photoCheckReason,
      photoCheckResult: 'none',
      status: scanStatus,
      isGracePlate: isProvisional,
      overrideReason,
      tokenPayload: payload,
    };

    this.state.scanEvents.unshift(scanEvent);

    // Outbox item for sync
    this.queueOutboxItem('ledger_entry', newLedgerEntry.id, newLedgerEntry);

    // Audio feedback
    if (isRepeatWarning) {
      sound.playWarningAlarm();
    } else {
      sound.playSuccessBeep();
    }

    const newBalance = this.getCustomerBalance(customer.id);

    // Autogenerate meal served notification
    this.sendNotification({
      restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'system',
      senderName: station.name,
      type: 'meal_served',
      title: 'Meal Plate Served',
      message: `Redeemed 1 buffet meal at ${station.name}. Remaining balance: ${newBalance} plate(s).`,
      priority: 'normal',
      actionTab: 'history',
    });

    // Check low-balance auto-alert trigger (< 5 plates)
    if (newBalance < 5) {
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

    return {
      scanEvent,
      balanceAfter: newBalance,
      latencyMs: Math.round((performance.now() - startTime) * 10) / 10,
    };
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
    scanEvent.status = 'undone';
    scanEvent.platesDeducted = 0;

    this.queueOutboxItem('ledger_entry', undoEntry.id, undoEntry);
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
      id: `led_topup_${Date.now()}`,
      customerId: customer.id,
      restaurantCode: data.restaurantCode,
      type: 'purchase',
      platesDelta: data.plates,
      timestamp: now,
      staffId: data.adminStaffId,
      reason: `Top-up: +${data.plates} plates (${data.paymentMethod.toUpperCase()})`,
      reference: data.reference,
    };

    this.state.ledgerEntries.push(ledgerEntry);

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
   */
  public setCustomerCardStatus(customerId: string, status: 'active' | 'locked', actorName: string) {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return;

    customer.cardStatus = status;
    if (status === 'locked') {
      customer.cardVersion += 1; // raising version invalidates old QR
    }

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
   * Set or update customer's personal 4-digit security PIN
   */
  public setCustomerPin(customerId: string, newPin: string): boolean {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return false;
    if (!/^\d{4}$/.test(newPin)) return false;

    customer.pinHash = newPin;
    customer.hasCustomPin = true;
    customer.pinSetAt = new Date().toISOString();

    this.queueOutboxItem('customer', customer.id, customer);
    this.logAudit({
      restaurantCode: customer.restaurantCode,
      actorRole: 'customer',
      actorName: customer.name,
      action: 'CUSTOMER_PIN_UPDATED',
      details: `Customer #${customer.memberNo} set personal 4-digit dashboard security PIN`,
    });

    this.sendNotification({
      restaurantCode: customer.restaurantCode,
      target: customer.id,
      targetName: `${customer.name} (#${customer.memberNo})`,
      senderRole: 'system',
      senderName: 'Security Guard',
      type: 'card_security',
      title: 'Security PIN Activated',
      message: 'Your 4-digit security PIN is active. The dashboard will lock automatically whenever your screen goes off.',
      priority: 'normal',
      actionTab: 'my_card',
    });

    this.notify();
    return true;
  }

  /**
   * Verify customer's 4-digit PIN for dashboard unlock or sensitive actions
   */
  public verifyCustomerPin(customerId: string, pin: string): boolean {
    const customer = this.state.customers.find((c) => c.id === customerId);
    if (!customer) return false;
    return customer.pinHash === pin;
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
  }): { success: boolean; error?: string } {
    const sender = this.state.customers.find((c) => c.id === data.senderCustomerId);
    if (!sender) return { success: false, error: 'Sender account not found' };

    if (data.pin !== sender.pinHash) {
      return { success: false, error: 'Incorrect 4-digit PIN. Please re-enter.' };
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
  }): Restaurant {
    const code = data.code.toUpperCase().trim();
    const now = new Date().toISOString();

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
      termsOverride: data.termsOverride,
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

    this.logAudit({
      actorRole: 'super_admin',
      actorName: 'Ephrem (Founder)',
      action: 'RESTAURANT_ONBOARDED',
      details: `Created restaurant ${code} - ${restaurant.name}. Generated activation code ${codeStr}`,
    });

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

    const customerId = `cust_prov_${Date.now()}`;
    const approvalId = `appr_${Date.now()}`;

    const newCustomer: Customer = {
      id: customerId,
      memberNo,
      restaurantCode,
      branchId: data.branchId || 'br_rw01_main',
      branchName: data.branchName || 'Main Campus Dining Hall',
      name: data.name.trim(),
      phone: data.phone.trim(),
      photoUrl: data.photoUrl || '/src/assets/images/avatar_student_male_1790979380050.jpg',
      idType: data.idType,
      idHash: hashIdNumber(data.idType, data.idNumber),
      idNumberMasked: data.idNumber.length > 5 ? `${data.idNumber.slice(0, 5)}****` : '****',
      isStudent: data.isStudent,
      studentProfile: data.studentProfile,
      cardVersion: 1,
      keyVersion: 1,
      cardStatus: 'active', // Allowed for provisional grace taps
      pinHash: '1234',
      provisionalStatus: 'pending_approval',
      gracePlatesConsumed: 0,
      gracePlatesRemaining: 3,
      pendingApprovalId: approvalId,
      createdAt: now,
      onboardingToken: `OB-${memberNo}-PROV`,
      consentSigned: true,
    };

    const pkg = data.packageId ? this.state.packages.find((p) => p.id === data.packageId) : null;

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
      details: `Provisionally registered #${memberNo} (${newCustomer.name}). MoMo/Payment Ref: "${data.paymentReference}" (${data.amountRwf.toLocaleString()} RWF for ${data.platesRequested} plates). Awaiting boss Mobile Money confirmation. Grace plates allowed: 3.`,
    });

    // Notify Restaurant Boss
    this.sendNotification({
      restaurantCode,
      target: 'all',
      senderRole: 'system',
      senderName: `${staffName} (${data.stationName})`,
      type: 'system_broadcast',
      title: `Pending Approval: New Customer #${memberNo}`,
      message: `${newCustomer.name} provisionally registered with ${data.paymentMethod.toUpperCase()} ref ${data.paymentReference} (${data.amountRwf.toLocaleString()} RWF). Please verify payment on Mobile Money.`,
      priority: 'important',
      actionTab: 'approvals',
    });

    this.scheduleSaveState();
    this.notify();
    return { customer: newCustomer, approval };
  }

  /**
   * Scanner station user / reception records a provisional recharge when boss is away
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

    const approvalId = `appr_topup_${Date.now()}`;
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
    };

    customer.provisionalStatus = 'pending_approval';
    customer.gracePlatesConsumed = 0;
    customer.gracePlatesRemaining = 3;
    customer.pendingApprovalId = approvalId;

    if (!this.state.pendingApprovals) this.state.pendingApprovals = [];
    this.state.pendingApprovals.unshift(approval);

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

    this.scheduleSaveState();
    this.notify();
    return approval;
  }

  /**
   * Restaurant Boss confirms pending registration or recharge after checking Mobile Money SMS / statement.
   * If customer consumed 1, 2, or 3 grace plates while waiting, the system accounts for them so the final
   * credited balance is exact and transparent!
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
    const graceConsumed = approval.gracePlatesConsumed || customer.gracePlatesConsumed || 0;

    // 1. Record confirmed purchase payment on ledger
    const ledgerEntry: LedgerEntry = {
      id: `led_appr_${Date.now()}`,
      customerId: customer.id,
      restaurantCode: approval.restaurantCode,
      type: 'purchase',
      platesDelta: approval.platesRequested,
      timestamp: now,
      staffId: bossName,
      reason: `Boss Verified & Approved: +${approval.platesRequested} plates (${approval.paymentMethod.toUpperCase()} Ref: ${approval.paymentReference})${graceConsumed > 0 ? ` [${graceConsumed} grace plates consumed while waiting]` : ''}`,
      reference: approval.paymentReference,
    };
    this.state.ledgerEntries.push(ledgerEntry);

    // 2. Add confirmed payment record
    const payment: PaymentRecord = {
      id: `pay_appr_${Date.now()}`,
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

    // 3. Update customer and approval status
    customer.provisionalStatus = 'approved';
    customer.cardStatus = 'active';
    customer.pendingApprovalId = undefined;

    approval.status = 'approved';
    approval.reviewedAt = now;
    approval.reviewedByAdminName = bossName;

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
      title: 'Payment Confirmed & Account Activated!',
      message: `Your payment was verified by cafeteria management. Credited ${approval.platesRequested} plates. Current balance: ${finalBalance} plates. Your card and digital pass are fully active.`,
      priority: 'important',
      actionTab: 'history',
    });

    this.scheduleSaveState();
    this.notify();
    return { success: true, customer };
  }

  /**
   * Restaurant Boss rejects an approval request (e.g. fraudulent MoMo SMS, payment not received)
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
      customer.provisionalStatus = 'rejected';
      customer.cardStatus = 'locked'; // Lock card access
      customer.pendingApprovalId = undefined;
    }

    this.logAudit({
      restaurantCode: approval.restaurantCode,
      branchId: approval.branchId,
      branchName: approval.branchName,
      actorRole: 'restaurant_admin',
      actorName: bossName,
      action: 'APPROVAL_REJECTED',
      details: `Boss rejected approval for #${approval.memberNo} (${approval.customerName}). Reason: "${approval.rejectionReason}". Card access locked.`,
    });

    if (customer) {
      this.sendNotification({
        restaurantCode: approval.restaurantCode,
        target: customer.id,
        targetName: `${customer.name} (#${customer.memberNo})`,
        senderRole: 'restaurant_admin',
        senderName: bossName,
        type: 'card_security',
        title: 'Payment Verification Failed - Card Locked',
        message: `Your pending payment could not be confirmed: "${approval.rejectionReason}". Please visit the administration desk with your transaction receipt.`,
        priority: 'urgent',
        actionTab: 'history',
      });
    }

    this.scheduleSaveState();
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
    this.notify();
    return resto;
  }
}

export const restoStore = new RestoStore();
