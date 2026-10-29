export type UserRole = 'super_admin' | 'restaurant_admin' | 'stand_staff' | 'customer';

export type Language = 'en' | 'rw' | 'fr';

export type Theme = 'dark' | 'light';

export type RestaurantStatus = 'active' | 'expiring' | 'grace' | 'expired' | 'suspended';

export interface PlanTerms {
  basePriceRwf: number;
  pricePerExtraScanPointRwf: number;
  billingPeriodMonths: number;
  graceDays: number;
  defaultSpotCheckRate: number; // e.g. 0.10 (1 in 10)
  servingWindowMinutes: number; // e.g. 120 (2 hours)
  plateLimitPerWindow: number; // e.g. 2 plates
  customerCardFeeRwf: number;
  customerReissueFeeRwf: number;
  platformCardFeeRwf: number;
  platformReissueFeeRwf: number;
  maxScanPointsIncluded: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  terms: PlanTerms;
}

export interface RestaurantTermsOverride extends Partial<PlanTerms> {
  customNotes?: string;
  effectiveFrom: string;
}

export interface PlateBundlePricing {
  singlePlatePriceRwf: number; // e.g. 1,200 RWF (default standard single plate)
  bundle15PlatesPriceRwf?: number; // e.g. 17,500 RWF (~1,166 RWF/plate)
  bundle30PlatesPriceRwf?: number; // e.g. 33,000 RWF (1,100 RWF/plate)
  bundle60PlatesPriceRwf?: number; // e.g. 60,000 RWF (1,000 RWF/plate - monthly standard)
}

export interface Restaurant {
  code: string; // e.g. RW01
  name: string;
  legalEntity: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
  logoUrl?: string;
  primaryColor?: string;
  status: RestaurantStatus;
  planId: string;
  defaultPlatePriceRwf?: number;
  bundlePricing?: PlateBundlePricing;
  welcomeMessage?: string;
  badgeStyle?: 'gold' | 'emerald' | 'blue' | 'dark';
  termsOverride?: RestaurantTermsOverride;
  currentLicenseId?: string;
  highestTimeSeen: number; // clock guard against rollbacks
  lastSyncAt: string;
  softwareVersion: string;
  createdAt: string;
}

export interface License {
  id: string; // e.g. LIC-RW01-2026-X8F
  restaurantCode: string;
  planId: string;
  maxScanPoints: number;
  validUntil: string; // ISO date
  graceDays: number;
  featureFlags: {
    spotChecksEnabled: boolean;
    multiStationEnabled: boolean;
    secondPlateAllowed: boolean;
    customerTransfersEnabled: boolean;
  };
  signature: string; // Ed25519 hex representation
  issuedAt: string;
  paidUntil: string;
}

export interface ActivationCode {
  code: string;
  restaurantCode: string;
  generatedAt: string;
  usedAt?: string;
  isUsed: boolean;
}

export type IdType = 'national_id' | 'passport' | 'driver_license' | 'student_id';

export interface StudentProfile {
  institution: string;
  programme: string;
  year: number;
  registrationNumber: string;
}

export interface Customer {
  id: string; // UUID
  memberNo: string; // e.g. "28491"
  restaurantCode: string; // e.g. "RW01"
  branchId?: string;
  branchName?: string;
  name: string;
  phone: string;
  photoUrl: string;
  idType: IdType;
  idHash: string; // encrypted/hashed for duplicate checking
  idNumberMasked: string; // e.g. "1 1999 8 0045678 1 **"
  occupation?: string;
  isStudent: boolean;
  studentProfile?: StudentProfile;
  cardVersion: number; // raised when reissued or locked
  keyVersion: number; // raised when phone key reissued
  cardStatus: 'active' | 'locked' | 'reissued';
  pinHash: string; // 6+ digit PIN hash
  hasCustomPin?: boolean; // false until customer sets PIN
  pinSetAt?: string;
  provisionalStatus?: 'pending_approval' | 'approved' | 'rejected';
  activationStatus?: 'pending_approval' | 'ready_for_activation' | 'active' | 'suspended';
  cardReadyForPrint?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
  lastLoginAt?: string;
  gracePlatesConsumed?: number; // max 3 consumed while awaiting boss approval
  gracePlatesRemaining?: number;
  pendingApprovalId?: string;
  createdAt: string;
  onboardingToken: string;
  consentSigned: boolean;
}

export type LedgerEntryType = 
  | 'purchase' 
  | 'scan' 
  | 'extra' 
  | 'undo' 
  | 'transfer_out' 
  | 'transfer_in' 
  | 'adjustment' 
  | 'reversal';

export interface LedgerEntry {
  id: string; // UUID
  customerId: string;
  restaurantCode: string;
  type: LedgerEntryType;
  platesDelta: number; // positive or negative
  timestamp: string;
  scanPointId?: string;
  staffId?: string;
  reason?: string;
  reference?: string;
  reversalOfId?: string;
  idempotencyKey?: string;
}

export interface BalanceCheckpoint {
  id: string;
  customerId: string;
  balance: number;
  cutoffTimestamp: string;
}

export type PhotoCheckReason = 
  | 'none'
  | 'random_sample' 
  | 'repeat_scan_in_window' 
  | 'new_device_key' 
  | 'rapid_stand_switch' 
  | 'physical_card';

export type PhotoCheckResult = 'matched' | 'rejected' | 'none';

export type ScanStatus = 
  | 'approved' 
  | 'warning_confirmed' 
  | 'blocked' 
  | 'undone' 
  | 'rejected_photo';

export interface ScanEvent {
  id: string; // UUID
  restaurantCode: string;
  customerId: string;
  customerName: string;
  customerPhoto: string;
  memberNo: string;
  scanPointId: string;
  scanPointName: string;
  staffId: string;
  staffName: string;
  timestamp: string;
  platesInWindow: number;
  platesDeducted: number; // 1 or 2
  photoCheckRequired: boolean;
  photoCheckReason: PhotoCheckReason;
  photoCheckResult: PhotoCheckResult;
  status: ScanStatus;
  blockedReason?: string;
  overrideReason?: string;
  overrideStaffId?: string;
  tokenPayload: string;
  isSecondPlateAdded?: boolean;
  menuItemId?: string;
  menuItemName?: string;
  priceRwf?: number;
  branchId?: string;
  branchName?: string;
  isGracePlate?: boolean;
  gracePlateNumber?: number;
}

export interface Branch {
  id: string;
  restaurantCode: string;
  code: string; // e.g. "BR-MAIN", "BR-EAST"
  name: string; // e.g. "Main Campus Dining Hall", "East Science Cafeteria"
  address: string;
  phone: string;
  managerName: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface StationUser {
  id: string;
  restaurantCode: string;
  branchId: string;
  branchName: string;
  stationId: string;
  stationName: string;
  name: string;
  username: string;
  phone: string;
  role: 'stand_staff' | 'reception' | 'scanner' | 'cashier';
  status: 'active' | 'blocked';
  passwordHash: string;
  pin: string;
  authType?: 'pin8' | 'password' | 'both';
  createdAt: string;
  lastLoginAt?: string;
  lastActiveAt?: string;
}

export type ApprovalType = 'new_customer' | 'balance_topup';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface PendingApproval {
  id: string;
  restaurantCode: string;
  branchId: string;
  branchName: string;
  type: ApprovalType;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerPhoto?: string;
  memberNo: string;
  packageId?: string;
  packageName?: string;
  platesRequested: number;
  amountRwf: number;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  registeredByStaffId: string;
  registeredByStaffName: string;
  stationId: string;
  stationName: string;
  gracePlatesAllowed: number; // max 3
  gracePlatesConsumed: number; // plates consumed before boss approved
  createdAt: string;
  status: ApprovalStatus;
  requiresSuperAdminCoSign?: boolean; // Required for high-value liability (> 120 plates / 2 months)
  coSignStatus?: 'not_required' | 'pending_super_admin' | 'co_signed' | 'rejected_super_admin';
  coSignedAt?: string;
  coSignedBySuperAdminName?: string;
  coSignature?: string;
  reviewedAt?: string;
  reviewedByAdminName?: string;
  rejectionReason?: string;
}

export type MenuCategory = 'breakfast' | 'lunch' | 'dinner' | 'special';

export interface MenuItem {
  id: string;
  restaurantCode: string;
  name: string;
  category: MenuCategory;
  priceRwf: number;
  costRwf?: number;
  description: string;
  isAvailable: boolean;
  targetDailyVolume?: number;
}

export interface ScanPoint {
  id: string;
  restaurantCode: string;
  branchId?: string;
  branchName?: string;
  name: string; // e.g. "Stand 1 - Main Buffet"
  deviceModel: string;
  deviceType?: 'phone' | 'tablet' | 'laptop_scanner' | 'pos_terminal';
  pairingCode: string;
  pairingKey?: string; // 6-character code e.g. "PAIR-9932" for laptop USB/BT scanners
  pairingToken?: string; // Signed cryptographic device token
  isPaired?: boolean;
  pairedAt?: string;
  pairedDeviceFingerprint?: string;
  status: 'active' | 'offline';
  lastHeartbeat: string;
  isCurrentDevice?: boolean;
  assignedStaffUserId?: string;
  assignedStaffUserName?: string;
}

export interface PlateTransfer {
  id: string;
  restaurantCode: string;
  senderCustomerId: string;
  recipientCustomerId: string;
  senderMemberNo: string;
  recipientMemberNo: string;
  senderName: string;
  recipientName: string;
  plates: number;
  timestamp: string;
  status: 'completed' | 'reversed';
  reversedAt?: string;
  reversedByAdminId?: string;
}

export interface Package {
  id: string;
  restaurantCode: string;
  name: string;
  platesCount: number;
  priceRwf: number;
  description: string;
}

export type PaymentMethod = 'cash' | 'mtn_momo' | 'airtel_money' | 'bank_transfer';

export interface PaymentRecord {
  id: string;
  restaurantCode: string;
  branchId?: string;
  branchName?: string;
  customerId: string;
  customerName: string;
  memberNo: string;
  packageId?: string;
  platesAdded: number;
  amountRwf: number;
  paymentMethod: PaymentMethod;
  reference: string;
  adminStaffId: string;
  adminStaffName: string;
  isProvisional?: boolean;
  approvalId?: string;
  timestamp: string;
}

export type ExpenseCategory =
  | 'food_supplies'
  | 'fuel_gas_charcoal'
  | 'staff_wages'
  | 'rent_utilities'
  | 'packaging_logistics'
  | 'other';

export interface RestaurantExpense {
  id: string;
  restaurantCode: string;
  category: ExpenseCategory;
  categoryLabel?: string;
  amountRwf: number;
  description: string;
  supplierName?: string;
  receiptNumber?: string;
  recordedByRole: string;
  recordedByName: string;
  recordedAt: string; // ISO date
}

export interface SubscriptionPayment {
  id: string;
  restaurantCode: string;
  restaurantName: string;
  periodCovered: string; // e.g. "October 2026"
  amountRwf: number;
  paidAt: string;
  paymentMethod: string;
  reference: string;
}

export interface SyncOutboxItem {
  id: string;
  restaurantCode: string;
  sequenceNo: number;
  entityType: 'ledger_entry' | 'customer' | 'scan_event' | 'card_update' | 'transfer';
  entityId: string;
  payload: any;
  createdAt: string;
  syncedToCloud: boolean;
}

export interface SyncCommand {
  id: string;
  restaurantCode: string;
  type: 'transfer_plates' | 'lock_card' | 'change_pin';
  payload: any;
  status: 'pending' | 'executed' | 'rejected';
  queuedAt: string;
  executedAt?: string;
}

export interface AuditLogItem {
  id: string;
  restaurantCode?: string;
  branchId?: string;
  branchName?: string;
  actorRole: UserRole | 'reception';
  actorName: string;
  action: string;
  details: string;
  timestamp: string;
  deviceModel?: string;
  ipAddress?: string;
}

export type NotificationType = 
  | 'system_broadcast'
  | 'admin_direct'
  | 'low_balance'
  | 'meal_served'
  | 'topup_success'
  | 'card_security'
  | 'plate_transfer'
  | 'balance_adjustment'
  | 'account_activated'
  | 'security_alert';

export type NotificationPriority = 'normal' | 'important' | 'urgent';

export interface AppNotification {
  id: string;
  restaurantCode: string;
  target: 'all' | string; // 'all' or customerId
  targetName?: string;
  senderRole: 'restaurant_admin' | 'system';
  senderName: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  timestamp: string;
  readByCustomerIds: string[];
  actionTab?: string;
}

export type ShiftStatus = 'open' | 'closed';

export interface ShiftRecord {
  id: string;
  restaurantCode: string;
  branchId: string;
  branchName: string;
  stationId: string;
  stationName: string;
  operatorId: string;
  operatorName: string;
  startedAt: string;
  closedAt?: string;
  openingCashRwf: number;
  closingCashRwf?: number;
  cashCollectedRwf: number;
  expectedCashRwf?: number;
  cashVarianceRwf?: number; // closing - expected (0 = balanced, negative = shortage, positive = overage)
  platesServedCount: number;
  provisionalCustomersRegistered: number;
  topUpsProcessedCount: number;
  status: ShiftStatus;
  closingNotes?: string;
  reconciliationAuditId?: string;
  signedOffByPinHash?: string;
}

export type CashierSessionStatus = 'active' | 'revoked' | 'closed';

export interface CashierSession {
  id: string; // sess_xxx
  restaurantCode: string;
  stationId: string;
  stationName: string;
  branchId?: string;
  branchName?: string;
  staffUserId: string;
  staffName: string;
  staffUsername: string;
  deviceType: 'phone' | 'tablet' | 'laptop_scanner' | 'pos_terminal';
  deviceModel: string;
  deviceFingerprint: string;
  ipAddress: string;
  sessionToken: string;
  startedAt: string;
  lastHeartbeat: string;
  status: CashierSessionStatus;
  revokedAt?: string;
  revokedReason?: string;
  revokedByActor?: string;
}

// ----------------------------------------------------
// RestoPass Student Digital Monetization & Subscription Types
// ----------------------------------------------------
export type StudentSubscriptionStatus =
  | 'inactive'
  | 'pending_payment'
  | 'active'
  | 'grace_period'
  | 'expired'
  | 'cancelled'
  | 'complimentary';

export interface StudentSubscriptionSettings {
  enabled: boolean; // default false (disabled at launch)
  priceRwf: number; // default 500 RWF
  currency: string; // 'RWF'
  period: 'monthly';
  graceDays: number; // default 3 days (72 hours)
  requireForTransfers: boolean; // default true
  requireForDashboard: boolean; // default true
  updatedAt: string;
  updatedBy?: string;
}

export interface CustomerSubscription {
  id: string;
  customerId: string;
  memberNo: string;
  restaurantCode: string;
  status: StudentSubscriptionStatus;
  planName: string;
  priceRwf: number;
  currency: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  gracePeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  paymentMethod?: 'mtn_momo' | 'airtel_money' | 'complimentary';
  lastPaymentRef?: string;
  complimentaryReason?: string;
  complimentaryGrantedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentSubscriptionPayment {
  id: string;
  subscriptionId: string;
  customerId: string;
  memberNo: string;
  restaurantCode: string;
  internalReference: string;
  provider: 'mtn_momo' | 'airtel_money';
  phoneNumber: string;
  providerTransactionId?: string;
  amountRwf: number;
  currency: string;
  status: 'pending' | 'verified' | 'failed';
  initiatedAt: string;
  verifiedAt?: string;
  failureReason?: string;
}

export type StudentEntitlementFeature =
  | 'physical_card_scan'
  | 'digital_qr'
  | 'customer_dashboard'
  | 'digital_plate_transfer'
  | 'customer_transaction_history';

export interface StudentEntitlementResult {
  allowed: boolean;
  feature: StudentEntitlementFeature;
  status: StudentSubscriptionStatus;
  inGracePeriod: boolean;
  enforcementEnabled: boolean;
  reason?: string;
  expiresAt?: string;
  gracePeriodEnd?: string;
}

export interface CustomerActivationRequest {
  id: string;
  customerId: string;
  memberNo: string;
  phone: string;
  restaurantCode: string;
  activationCode: string; // 6-character single-use code
  codeHash: string;
  authorizingStaffId: string;
  authorizingStaffName: string;
  expiresAt: string; // 15-minute validity
  used: boolean;
  usedAt?: string;
  createdAt: string;
}

export interface CustomerPinRecoveryRequest {
  id: string;
  customerId: string;
  memberNo: string;
  phone: string;
  restaurantCode: string;
  reason: string;
  idVerificationMethod: 'student_id_check' | 'national_id_check' | 'photo_match' | 'manager_override';
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  recoveryCode?: string;
  recoveryCodeHash?: string;
  authorizingStaffId?: string;
  authorizingStaffName?: string;
  approvedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  createdAt: string;
}
