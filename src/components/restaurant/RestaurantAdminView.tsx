import React, { useState } from 'react';
import {
  Customer,
  Language,
  Package,
  PaymentRecord,
  ScanPoint,
  ScanEvent,
  NotificationPriority,
  AppNotification,
  Branch,
  StationUser,
  PendingApproval,
} from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { CardPrintStudio } from './CardPrintStudio';
import { ExportTransactionsModal } from './ExportTransactionsModal';
import { PhotoCaptureInput } from '../common/PhotoCaptureInput';
import { PricingAnalyticsDashboard } from './PricingAnalyticsDashboard';
import { BossApprovalsManager } from './BossApprovalsManager';
import { BranchesAndStationsManager } from './BranchesAndStationsManager';
import { SecurityAndAuditLogsView } from './SecurityAndAuditLogsView';
import {
  exportTransactionsToCsv,
  exportTransactionsToJson,
  getEnrichedTransactions,
} from '../../services/exportService';
import {
  Users,
  UserPlus,
  CreditCard,
  Layers,
  Settings,
  ShieldAlert,
  BarChart3,
  Search,
  Plus,
  RotateCcw,
  Lock,
  Unlock,
  Key,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  Clock,
  Printer,
  FileCheck,
  Send,
  Download,
  FileSpreadsheet,
  FileCode,
  Filter,
  Sliders,
  Edit,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  Bell,
  Megaphone,
  Smartphone,
  Trash2,
  Tag,
  Sparkles,
  Calculator,
  TrendingUp,
  Coins,
  Building2,
  GitBranch,
  Shield,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';

interface RestaurantAdminViewProps {
  language: Language;
  activeSubTab: string;
  onSubTabChange: (tab: string) => void;
}

export const RestaurantAdminView: React.FC<RestaurantAdminViewProps> = ({
  language,
  activeSubTab,
  onSubTabChange,
}) => {
  const t = translations[language];
  const state = restoStore.getState();
  const restaurant = restoStore.getCurrentRestaurant();
  const terms = restoStore.getRestaurantTerms(state.currentRestaurantCode);
  const license = restoStore.getRestaurantLicense(state.currentRestaurantCode);

  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState<'all' | 'scan' | 'purchase' | 'transfer'>('all');

  // Registration Form State
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('+250 78');
  const [regIdType, setRegIdType] = useState<Customer['idType']>('student_id');
  const [regIdNumber, setRegIdNumber] = useState('');
  const [regOccupation, setRegOccupation] = useState('');
  const [regIsStudent, setRegIsStudent] = useState(true);
  const [regInstitution, setRegInstitution] = useState('University of Rwanda');
  const [regProgramme, setRegProgramme] = useState('BSc Economics');
  const [regYear, setRegYear] = useState(2);
  const [regRegNumber, setRegRegNumber] = useState('22200' + Math.floor(1000 + Math.random() * 9000));
  const [regPhotoUrl, setRegPhotoUrl] = useState('/src/assets/images/avatar_student_male_1790979380050.jpg');
  const [regPackageId, setRegPackageId] = useState('pkg_30');
  const [regPaymentMethod, setRegPaymentMethod] = useState<PaymentRecord['paymentMethod']>('mtn_momo');
  const [regPaymentRef, setRegPaymentRef] = useState('MOMO-' + Math.floor(1000000 + Math.random() * 9000000));
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Customer List Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'locked' | 'low_balance' | 'students'>('all');
  const [selectedCustomerForDetail, setSelectedCustomerForDetail] = useState<Customer | null>(null);

  // Full Member Management Modal State
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manageCustomer, setManageCustomer] = useState<Customer | null>(null);
  const [manageTab, setManageTab] = useState<'cards' | 'edit' | 'balance' | 'history' | 'notify'>('cards');
  const [manageCopiedToken, setManageCopiedToken] = useState(false);

  // Edit Member Profile State
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [editIdType, setEditIdType] = useState<Customer['idType']>('student_id');
  const [editIdNumber, setEditIdNumber] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [editIsStudent, setEditIsStudent] = useState(true);
  const [editInstitution, setEditInstitution] = useState('University of Rwanda');
  const [editProgramme, setEditProgramme] = useState('BSc Economics');
  const [editYear, setEditYear] = useState(2);
  const [editRegNumber, setEditRegNumber] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Balance Adjustment State inside Manage Modal
  const [adjustDelta, setAdjustDelta] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState('Manager courtesy meal / manual correction');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  // Action Toast Notification
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [deleteCustomerConfirmOpen, setDeleteCustomerConfirmOpen] = useState(false);

  // Top-Up Modal State
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpCustomer, setTopUpCustomer] = useState<Customer | null>(null);
  const [topUpPackageId, setTopUpPackageId] = useState('pkg_30');
  const [topUpMethod, setTopUpMethod] = useState<PaymentRecord['paymentMethod']>('mtn_momo');
  const [topUpRef, setTopUpRef] = useState('MOMO-' + Math.floor(1000000 + Math.random() * 9000000));
  const [isCustomTopUp, setIsCustomTopUp] = useState(false);
  const [customTopUpPlates, setCustomTopUpPlates] = useState<number>(10);
  const [customTopUpPrice, setCustomTopUpPrice] = useState<number>(12000);

  // Pricing & Packages Management State
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [editPkgName, setEditPkgName] = useState('');
  const [editPkgPlates, setEditPkgPlates] = useState<number>(30);
  const [editPkgPrice, setEditPkgPrice] = useState<number>(34000);
  const [editPkgDescription, setEditPkgDescription] = useState('');
  const [editPkgError, setEditPkgError] = useState<string | null>(null);
  const [editPkgSuccess, setEditPkgSuccess] = useState<string | null>(null);

  // Single-Plate Baseline Price & Price Simulator State
  const [customPlateRateInput, setCustomPlateRateInput] = useState<number>(() =>
    restoStore.getRestaurantDefaultPlatePrice(restoStore.getState().currentRestaurantCode)
  );
  const [simPlates, setSimPlates] = useState<number>(20);
  const [pricingSectionView, setPricingSectionView] = useState<'analytics' | 'bundles'>('analytics');

  // Create Package Modal State
  const [createPkgModalOpen, setCreatePkgModalOpen] = useState(false);
  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgPlates, setNewPkgPlates] = useState<number>(20);
  const [newPkgPrice, setNewPkgPrice] = useState<number>(24000);
  const [newPkgDescription, setNewPkgDescription] = useState('');
  const [newPkgError, setNewPkgError] = useState<string | null>(null);

  // Station Creation State
  const [newStationName, setNewStationName] = useState('');

  // In-App & System Notifications Studio State
  const [notifTargetType, setNotifTargetType] = useState<'all' | 'specific' | 'low_balance' | 'students'>('all');
  const [notifSpecificCustomerId, setNotifSpecificCustomerId] = useState<string>('');
  const [notifPriority, setNotifPriority] = useState<NotificationPriority>('normal');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifActionTab, setNotifActionTab] = useState<'none' | 'my_card' | 'history'>('none');
  const [notifSenderName, setNotifSenderName] = useState('Claire Mukamurenzi (Manager)');
  const [notifFeedFilter, setNotifFeedFilter] = useState<'all' | 'broadcast' | 'direct' | 'system'>('all');
  const [notifFeedSearch, setNotifFeedSearch] = useState('');
  const [notifSuccessToast, setNotifSuccessToast] = useState<string | null>(null);

  // Direct alert inside Manage Member Modal
  const [directAlertTitle, setDirectAlertTitle] = useState('');
  const [directAlertMessage, setDirectAlertMessage] = useState('');
  const [directAlertPriority, setDirectAlertPriority] = useState<NotificationPriority>('normal');
  const [directAlertSuccess, setDirectAlertSuccess] = useState<string | null>(null);

  // Pending Approvals (Boss Queue) State
  const [approvalTabMode, setApprovalTabMode] = useState<'pending' | 'history'>('pending');
  const [selectedApprovalToReject, setSelectedApprovalToReject] = useState<PendingApproval | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('Payment deposit not verified on Mobile Money statement');
  const [approvalActionToast, setApprovalActionToast] = useState<string | null>(null);

  // Multi-Branch Management State
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all');
  const [addBranchModalOpen, setAddBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('+250 788 000 000');
  const [newBranchManager, setNewBranchManager] = useState('');
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Scanning Station Users (Accounts) Management State
  const [stationSectionView, setStationSectionView] = useState<'users' | 'branches' | 'devices'>('users');
  const [addStationUserModalOpen, setAddStationUserModalOpen] = useState(false);
  const [newStationUserName, setNewStationUserName] = useState('');
  const [newStationUserUsername, setNewStationUserUsername] = useState('');
  const [newStationUserPhone, setNewStationUserPhone] = useState('+250 788 000 000');
  const [newStationUserBranchId, setNewStationUserBranchId] = useState('');
  const [newStationUserStationName, setNewStationUserStationName] = useState('');
  const [newStationUserRole, setNewStationUserRole] = useState<'stand_staff' | 'reception'>('stand_staff');
  const [newStationUserPassword, setNewStationUserPassword] = useState('StaffPass#2026');
  const [newStationUserPin, setNewStationUserPin] = useState('1122');

  const [resetPasswordModalUser, setResetPasswordModalUser] = useState<StationUser | null>(null);
  const [resetUserNewPassword, setResetUserNewPassword] = useState('StaffPass#2026');
  const [resetUserNewPin, setResetUserNewPin] = useState('1234');

  // Customer Account Deletion State
  const [deleteCustomerConfirm, setDeleteCustomerConfirm] = useState<Customer | null>(null);

  const handleApplyNotifTemplate = (templateId: string) => {
    switch (templateId) {
      case 'hours':
        setNotifTitle('Exam Week Extended Dinner Hours');
        setNotifMessage('Dinner buffet service is now open until 21:30 throughout mid-semester examination week at Stand 1 and Stand 2.');
        setNotifPriority('important');
        setNotifActionTab('none');
        break;
      case 'low_balance':
        setNotifTitle('Weekly Meal Balance Reminder');
        setNotifMessage('Avoid cafeteria lunch queues: Please check your prepaid plate balance and top up via MTN MoMo (*182#) or at the cashier desk.');
        setNotifPriority('normal');
        setNotifActionTab('history');
        break;
      case 'menu':
        setNotifTitle("Chef's Special: Rwandan Lake Tilapia & Plantains");
        setNotifMessage('Today at all buffet stands: Fresh grilled Lake Kivu tilapia, seasoned plantains, and local market salads included in standard plate.');
        setNotifPriority('normal');
        setNotifActionTab('none');
        break;
      case 'holiday':
        setNotifTitle('Holiday Cafeteria Service Schedule');
        setNotifMessage('Dining stands will operate on modified brunch hours (10:30 - 15:00) during the upcoming public holiday. Normal dinner service resumes tomorrow.');
        setNotifPriority('important');
        setNotifActionTab('none');
        break;
      case 'badge':
        setNotifTitle('Physical Card Badge Quality Inspection');
        setNotifMessage('If your card barcode is scratched or peeling, please visit the manager desk for an instant 60-second plastic re-print.');
        setNotifPriority('urgent');
        setNotifActionTab('my_card');
        break;
    }
  };

  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;

    if (notifTargetType === 'all') {
      restoStore.sendNotification({
        restaurantCode: state.currentRestaurantCode,
        target: 'all',
        senderRole: 'restaurant_admin',
        senderName: notifSenderName,
        type: 'system_broadcast',
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        priority: notifPriority,
        actionTab: notifActionTab !== 'none' ? notifActionTab : undefined,
      });
      setNotifSuccessToast('Broadcast announcement sent to all members!');
    } else if (notifTargetType === 'specific') {
      const targetCust = state.customers.find((c) => c.id === notifSpecificCustomerId) || state.customers.find((c) => c.restaurantCode === state.currentRestaurantCode);
      if (targetCust) {
        restoStore.sendNotification({
          restaurantCode: state.currentRestaurantCode,
          target: targetCust.id,
          targetName: `${targetCust.name} (#${targetCust.memberNo})`,
          senderRole: 'restaurant_admin',
          senderName: notifSenderName,
          type: 'admin_direct',
          title: notifTitle.trim(),
          message: notifMessage.trim(),
          priority: notifPriority,
          actionTab: notifActionTab !== 'none' ? notifActionTab : undefined,
        });
        setNotifSuccessToast(`Direct notification sent to ${targetCust.name} (#${targetCust.memberNo})!`);
      }
    } else if (notifTargetType === 'low_balance') {
      const lowBalMembers = state.customers.filter(
        (c) => c.restaurantCode === state.currentRestaurantCode && restoStore.getCustomerBalance(c.id) < 5
      );
      lowBalMembers.forEach((c) => {
        restoStore.sendNotification({
          restaurantCode: state.currentRestaurantCode,
          target: c.id,
          targetName: `${c.name} (#${c.memberNo})`,
          senderRole: 'restaurant_admin',
          senderName: notifSenderName,
          type: 'low_balance',
          title: notifTitle.trim(),
          message: notifMessage.trim(),
          priority: notifPriority,
          actionTab: notifActionTab !== 'none' ? notifActionTab : undefined,
        });
      });
      setNotifSuccessToast(`Dispatched low-balance alerts to ${lowBalMembers.length} member(s)!`);
    } else if (notifTargetType === 'students') {
      const students = state.customers.filter(
        (c) => c.restaurantCode === state.currentRestaurantCode && c.isStudent
      );
      students.forEach((c) => {
        restoStore.sendNotification({
          restaurantCode: state.currentRestaurantCode,
          target: c.id,
          targetName: `${c.name} (#${c.memberNo})`,
          senderRole: 'restaurant_admin',
          senderName: notifSenderName,
          type: 'system_broadcast',
          title: notifTitle.trim(),
          message: notifMessage.trim(),
          priority: notifPriority,
          actionTab: notifActionTab !== 'none' ? notifActionTab : undefined,
        });
      });
      setNotifSuccessToast(`Dispatched announcement to ${students.length} student member(s)!`);
    }

    setNotifTitle('');
    setNotifMessage('');
    setTimeout(() => setNotifSuccessToast(null), 4500);
  };

  const handleSendDirectAlertFromModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageCustomer || !directAlertTitle.trim() || !directAlertMessage.trim()) return;

    restoStore.sendNotification({
      restaurantCode: manageCustomer.restaurantCode,
      target: manageCustomer.id,
      targetName: `${manageCustomer.name} (#${manageCustomer.memberNo})`,
      senderRole: 'restaurant_admin',
      senderName: 'Claire Mukamurenzi (Manager)',
      type: 'admin_direct',
      title: directAlertTitle.trim(),
      message: directAlertMessage.trim(),
      priority: directAlertPriority,
      actionTab: 'history',
    });

    setDirectAlertSuccess(`Notification sent to ${manageCustomer.name}!`);
    setDirectAlertTitle('');
    setDirectAlertMessage('');
    setActionToast(`Direct notification delivered to #${manageCustomer.memberNo}.`);
    setTimeout(() => {
      setDirectAlertSuccess(null);
      setActionToast(null);
    }, 4000);
  };

  // Quick Export Handlers
  const handleQuickExportCsv = () => {
    const res = exportTransactionsToCsv(state.currentRestaurantCode);
    setExportToast(`Exported ${res.count} transactions to ${res.filename}`);
    setTimeout(() => setExportToast(null), 4000);
  };

  const handleQuickExportJson = () => {
    const res = exportTransactionsToJson(state.currentRestaurantCode);
    setExportToast(`Exported ${res.count} audit records to ${res.filename}`);
    setTimeout(() => setExportToast(null), 4000);
  };

  // Handle Registration
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    if (!regName.trim() || !regPhone.trim() || !regIdNumber.trim()) {
      setRegError('Full Name, Phone number, and ID number are required.');
      return;
    }

    const result = restoStore.registerCustomer({
      restaurantCode: state.currentRestaurantCode,
      name: regName,
      phone: regPhone,
      photoUrl: regPhotoUrl,
      idType: regIdType,
      idNumber: regIdNumber,
      occupation: regOccupation,
      isStudent: regIsStudent,
      studentProfile: regIsStudent
        ? {
            institution: regInstitution,
            programme: regProgramme,
            year: Number(regYear),
            registrationNumber: regRegNumber,
          }
        : undefined,
      packageId: regPackageId,
      paymentMethod: regPaymentMethod,
      paymentReference: regPaymentRef,
      adminStaffId: state.currentStaffId,
      adminStaffName: 'Claire Mukamurenzi (Cashier)',
    });

    if (result.success && result.customer) {
      setRegSuccess(`Successfully registered #${result.customer.memberNo} (${result.customer.name})! Card generated.`);
      // Reset form
      setRegName('');
      setRegPhone('+250 78');
      setRegIdNumber('');
      setRegPaymentRef('MOMO-' + Math.floor(1000000 + Math.random() * 9000000));
    } else {
      setRegError(result.error || 'Registration failed');
    }
  };

  // Open Top-Up Modal for customer with restaurant-scoped packages
  const openTopUpModalForCustomer = (cust: Customer) => {
    setTopUpCustomer(cust);
    const pkgs = restoStore.getRestaurantPackages(state.currentRestaurantCode);
    if (pkgs.length > 0) {
      setTopUpPackageId(pkgs[0].id);
    }
    const defRate = restoStore.getRestaurantDefaultPlatePrice(state.currentRestaurantCode);
    setCustomTopUpPlates(10);
    setCustomTopUpPrice(10 * defRate);
    setIsCustomTopUp(false);
    setTopUpRef('MOMO-' + Math.floor(1000000 + Math.random() * 9000000));
    setTopUpModalOpen(true);
  };

  // Handle Top-Up Execution
  const handleExecuteTopUp = () => {
    if (!topUpCustomer) return;
    const currentRestoPackages = restoStore.getRestaurantPackages(state.currentRestaurantCode);

    let plates = 0;
    let amount = 0;
    let packageIdToRecord: string | undefined = undefined;

    if (isCustomTopUp) {
      plates = Number(customTopUpPlates);
      amount = Number(customTopUpPrice);
    } else {
      const pkg = currentRestoPackages.find((p) => p.id === topUpPackageId) || currentRestoPackages[0];
      if (!pkg) return;
      plates = pkg.platesCount;
      amount = pkg.priceRwf;
      packageIdToRecord = pkg.id;
    }

    if (plates <= 0 || amount <= 0) return;

    restoStore.topUpCustomer({
      restaurantCode: state.currentRestaurantCode,
      customerId: topUpCustomer.id,
      plates,
      amountRwf: amount,
      paymentMethod: topUpMethod,
      reference: topUpRef,
      packageId: packageIdToRecord,
      adminStaffId: state.currentStaffId,
      adminStaffName: 'Claire Mukamurenzi (Cashier)',
    });
    setTopUpModalOpen(false);
    setIsCustomTopUp(false);
    setTopUpRef('MOMO-' + Math.floor(1000000 + Math.random() * 9000000));
    setActionToast(`Successfully credited ${plates} plates (${amount.toLocaleString()} RWF) to #${topUpCustomer.memberNo}.`);
    setTimeout(() => setActionToast(null), 4000);
  };

  // Package Management Handlers
  const handleOpenEditPackage = (pkg: Package) => {
    setEditingPackage(pkg);
    setEditPkgName(pkg.name);
    setEditPkgPlates(pkg.platesCount);
    setEditPkgPrice(pkg.priceRwf);
    setEditPkgDescription(pkg.description);
    setEditPkgError(null);
    setEditPkgSuccess(null);
  };

  const handleSaveEditPackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPackage) return;
    if (!editPkgName.trim() || editPkgPlates <= 0 || editPkgPrice <= 0) {
      setEditPkgError('Package name, plate count (> 0), and price (> 0) are required.');
      return;
    }

    const updated = restoStore.updatePackage(
      editingPackage.id,
      {
        name: editPkgName,
        platesCount: editPkgPlates,
        priceRwf: editPkgPrice,
        description: editPkgDescription,
      },
      'Claire Mukamurenzi (Manager)'
    );

    if (updated) {
      setEditPkgSuccess('Package updated successfully!');
      setActionToast(`Meal package "${updated.name}" updated to ${updated.priceRwf.toLocaleString()} RWF.`);
      setTimeout(() => {
        setEditingPackage(null);
        setActionToast(null);
      }, 1500);
    }
  };

  const handleCreatePackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPkgName.trim() || newPkgPlates <= 0 || newPkgPrice <= 0) {
      setNewPkgError('Bundle name, plate count (> 0), and price (> 0) are required.');
      return;
    }

    const created = restoStore.addPackage({
      restaurantCode: state.currentRestaurantCode,
      name: newPkgName,
      platesCount: newPkgPlates,
      priceRwf: newPkgPrice,
      description: newPkgDescription,
      actorName: 'Claire Mukamurenzi (Manager)',
    });

    setActionToast(`Created new meal bundle: ${created.name} (${created.priceRwf.toLocaleString()} RWF)`);
    setCreatePkgModalOpen(false);
    setNewPkgName('');
    setNewPkgPlates(20);
    setNewPkgPrice(24000);
    setNewPkgDescription('');
    setNewPkgError(null);
    setTimeout(() => setActionToast(null), 4000);
  };

  const handleDeletePackage = (pkg: Package) => {
    if (confirm(`Are you sure you want to delete the package "${pkg.name}" (${pkg.platesCount} plates)?`)) {
      restoStore.deletePackage(pkg.id, state.currentRestaurantCode, 'Claire Mukamurenzi (Manager)');
      setActionToast(`Deleted meal package "${pkg.name}".`);
      setTimeout(() => setActionToast(null), 4000);
    }
  };

  const handleResetPackagesDefault = () => {
    if (confirm(`Reset packages for this restaurant to standard default rates (10, 15, 30, 60 plates)?`)) {
      restoStore.resetRestaurantPackages(state.currentRestaurantCode, 'Claire Mukamurenzi (Manager)');
      setActionToast('Restored standard default plate bundles.');
      setTimeout(() => setActionToast(null), 4000);
    }
  };

  const handleSaveDefaultPlateRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (customPlateRateInput <= 0) return;
    const saved = restoStore.updateRestaurantDefaultPlatePrice(
      state.currentRestaurantCode,
      customPlateRateInput,
      'Claire Mukamurenzi (Manager)'
    );
    setActionToast(`Single plate baseline rate updated to ${saved.toLocaleString()} RWF / plate.`);
    setTimeout(() => setActionToast(null), 4000);
  };

  // Open Full Member Management Suite
  const openManageCustomer = (cust: Customer, defaultTab: 'cards' | 'edit' | 'balance' | 'history' | 'notify' = 'cards') => {
    setManageCustomer(cust);
    setManageTab(defaultTab);
    setEditName(cust.name);
    setEditPhone(cust.phone);
    setEditPhotoUrl(cust.photoUrl);
    setEditIdType(cust.idType);
    setEditIdNumber('');
    setEditOccupation(cust.occupation || '');
    setEditIsStudent(cust.isStudent);
    setEditInstitution(cust.studentProfile?.institution || 'University of Rwanda');
    setEditProgramme(cust.studentProfile?.programme || 'BSc Economics');
    setEditYear(cust.studentProfile?.year || 2);
    setEditRegNumber(cust.studentProfile?.registrationNumber || '');
    setEditError(null);
    setEditSuccess(null);
    setAdjustDelta(1);
    setAdjustReason('Manager courtesy / manual adjustment');
    setAdjustError(null);
    setAdjustSuccess(null);
    setManageModalOpen(true);
  };

  const handleToggleLock = (cust: Customer) => {
    const next = cust.cardStatus === 'locked' ? 'active' : 'locked';
    restoStore.setCustomerCardStatus(cust.id, next, 'Cashier Admin');
    const msg = next === 'locked'
      ? `Card for #${cust.memberNo} (${cust.name}) locked.`
      : `Card for #${cust.memberNo} (${cust.name}) reactivated.`;
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 4000);
    if (manageCustomer?.id === cust.id) {
      const updated = state.customers.find((c) => c.id === cust.id);
      if (updated) setManageCustomer({ ...updated });
    }
  };

  const handleReissueCard = (cust: Customer) => {
    const updated = restoStore.reissueCard(cust.id, 'Cashier Admin');
    if (updated) {
      if (manageCustomer?.id === cust.id) setManageCustomer({ ...updated });
      setActionToast(`Reissued card V${updated.cardVersion} for #${cust.memberNo}. Previous physical badge is invalidated.`);
      setTimeout(() => setActionToast(null), 4000);
    }
  };

  const handleReissuePhoneKey = (cust: Customer) => {
    const updated = restoStore.reissuePhoneKey(cust.id, 'Cashier Admin');
    if (updated) {
      if (manageCustomer?.id === cust.id) setManageCustomer({ ...updated });
      setActionToast(`Regenerated dynamic phone key for #${cust.memberNo} (Key V${updated.keyVersion}).`);
      setTimeout(() => setActionToast(null), 4000);
    }
  };

  const handleResetPin = (cust: Customer) => {
    restoStore.resetCustomerPin(cust.id, '1234', 'Cashier Admin');
    setActionToast(`Security PIN for #${cust.memberNo} reset to default 1234.`);
    setTimeout(() => setActionToast(null), 4000);
  };

  const handleDeleteCustomer = (cust: Customer) => {
    const success = restoStore.deleteCustomerAccount(cust.id, 'Restaurant Boss (Executive)');
    if (success) {
      setManageCustomer(null);
      setDeleteCustomerConfirmOpen(false);
      setActionToast(`Permanently deleted customer account #${cust.memberNo} (${cust.name}). All badges and credentials revoked.`);
      setTimeout(() => setActionToast(null), 4000);
    }
  };

  const [copiedOverviewRef, setCopiedOverviewRef] = useState<string | null>(null);

  const handleOverviewApprove = (apprId: string, memberNo: string) => {
    const res = restoStore.approvePendingRequest(apprId, 'Restaurant Boss (Executive)');
    if (res.success) {
      setActionToast(`Mobile Money verified! Member #${memberNo} card and portal account activated.`);
      setTimeout(() => setActionToast(null), 4500);
    }
  };

  const handleOverviewCopyRef = (ref: string, id: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedOverviewRef(id);
    setTimeout(() => setCopiedOverviewRef(null), 2500);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageCustomer) return;
    setEditError(null);
    setEditSuccess(null);

    const res = restoStore.updateCustomerProfile(
      manageCustomer.id,
      {
        name: editName,
        phone: editPhone,
        photoUrl: editPhotoUrl,
        idType: editIdType,
        idNumber: editIdNumber.trim() ? editIdNumber.trim() : undefined,
        occupation: editOccupation,
        isStudent: editIsStudent,
        studentProfile: editIsStudent
          ? {
              institution: editInstitution,
              programme: editProgramme,
              year: Number(editYear),
              registrationNumber: editRegNumber,
            }
          : undefined,
      },
      'Cashier Admin'
    );

    if (res.success && res.customer) {
      setManageCustomer(res.customer);
      setEditSuccess('Member profile successfully updated!');
      setActionToast(`Profile updated for #${res.customer.memberNo}.`);
      setTimeout(() => setActionToast(null), 4000);
    } else if (res.error) {
      setEditError(res.error);
    }
  };

  const handleManualAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageCustomer) return;
    setAdjustError(null);
    setAdjustSuccess(null);

    if (!adjustReason.trim()) {
      setAdjustError('Please specify a justification reason for the audit log.');
      return;
    }

    const res = restoStore.adjustCustomerBalance({
      restaurantCode: state.currentRestaurantCode,
      customerId: manageCustomer.id,
      platesDelta: adjustDelta,
      reason: adjustReason.trim(),
      adminStaffName: 'Cashier Admin',
    });

    if (res.success) {
      setAdjustSuccess(`Balance updated by ${adjustDelta > 0 ? `+${adjustDelta}` : adjustDelta} plates! Current balance: ${res.newBalance} plates.`);
      setActionToast(`Adjusted balance for #${manageCustomer.memberNo}: ${res.newBalance} plates.`);
      setTimeout(() => setActionToast(null), 4000);
    } else if (res.error) {
      setAdjustError(res.error);
    }
  };

  // Filtered Customers
  const filteredCustomers = state.customers.filter((c) => {
    if (c.restaurantCode !== state.currentRestaurantCode) return false;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      c.name.toLowerCase().includes(q) ||
      c.memberNo.includes(q) ||
      c.phone.includes(q);

    if (!matchSearch) return false;

    if (filterMode === 'active') {
      return c.cardStatus === 'active';
    }
    if (filterMode === 'low_balance') {
      return restoStore.getCustomerBalance(c.id) < 5;
    }
    if (filterMode === 'locked') {
      return c.cardStatus === 'locked';
    }
    if (filterMode === 'students') {
      return c.isStudent;
    }
    return true;
  });

  // Calculate Quick Stats
  const todayScans = state.scanEvents.filter(
    (e) =>
      e.restaurantCode === state.currentRestaurantCode &&
      (e.status === 'approved' || e.status === 'warning_confirmed')
  );
  const totalPlatesServedToday = todayScans.reduce((sum, e) => sum + e.platesDeducted, 0);

  const activeCustomersCount = state.customers.filter(
    (c) => c.restaurantCode === state.currentRestaurantCode
  ).length;

  const lowBalanceCount = state.customers.filter(
    (c) =>
      c.restaurantCode === state.currentRestaurantCode &&
      restoStore.getCustomerBalance(c.id) < 5
  ).length;

  const totalOutstandingPlates = state.customers
    .filter((c) => c.restaurantCode === state.currentRestaurantCode)
    .reduce((sum, c) => sum + restoStore.getCustomerBalance(c.id), 0);

  const totalCashCollectedRwf = state.payments
    .filter((p) => p.restaurantCode === state.currentRestaurantCode)
    .reduce((sum, p) => sum + p.amountRwf, 0);

  // Monthly Reconciliation & Pending Approvals (Boss Delegation & Accounting)
  const monthlyMetrics = restoStore.getRestaurantMonthlyMetrics(state.currentRestaurantCode);
  const pendingApprovals = restoStore.getRestaurantPendingApprovals(state.currentRestaurantCode);
  const pendingCount = pendingApprovals.filter((p) => p.status === 'pending').length;
  const restoBranches = restoStore.getRestaurantBranches(state.currentRestaurantCode);
  const restoStationUsers = restoStore.getRestaurantStationUsers(state.currentRestaurantCode);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Executive Navigation for Restaurant Bosses & Managers */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800 text-xs font-medium text-slate-400">
        {[
          { id: 'dashboard', label: 'Overview', icon: BarChart3 },
          {
            id: 'approvals',
            label: 'Pending Approvals',
            icon: Clock,
            badge: pendingCount,
          },
          { id: 'customers', label: 'Members', icon: Users },
          {
            id: 'notifications',
            label: 'Notifications',
            icon: Bell,
            badge: state.notifications.filter(
              (n) =>
                n.restaurantCode === state.currentRestaurantCode &&
                Date.now() - new Date(n.timestamp).getTime() < 24 * 3600 * 1000
            ).length,
          },
          { id: 'cards', label: 'Card Studio', icon: Printer },
          { id: 'pricing', label: 'Pricing & Trends', icon: TrendingUp },
          { id: 'reports', label: 'Reports & Sales', icon: FileCheck },
          { id: 'stations', label: 'Branches & Stations', icon: Building2 },
          { id: 'security', label: 'Security & Audit Logs', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected =
            activeSubTab === tab.id ||
            (tab.id === 'customers' && activeSubTab === 'registration');

          return (
            <button
              key={tab.id}
              onClick={() => onSubTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all font-bold text-xs cursor-pointer ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {Boolean(tab.badge && tab.badge > 0) && (
                <span
                  className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                    isSelected
                      ? 'bg-white text-emerald-900'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1. DASHBOARD VIEW */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Executive Monthly Reconciliation (Requirement 2b: Prepaid Plates & Cash, Used Plates & Cash, Remaining) */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                    <span>Executive Monthly Reconciliation</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {monthlyMetrics.monthLabel}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Prepaid food revenue intake, actual dining consumption, and outstanding patron liability across {restaurant?.name}.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                  Weighted Plate Rate: <strong className="text-emerald-400">{monthlyMetrics.avgPricePerPlate.toLocaleString()} RWF</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Monthly Prepaid Plates & Cash */}
              <div className="p-4 rounded-xl bg-slate-950 border border-emerald-900/50 relative overflow-hidden space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Monthly Prepaid (Intake)</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Credited</span>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-black font-mono text-white tabular-nums">
                    +{monthlyMetrics.monthlyPrepaidPlates.toLocaleString()} <span className="text-xs font-normal text-slate-400">plates</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    +{monthlyMetrics.monthlyPrepaidCashRwf.toLocaleString()} <span className="text-xs font-sans text-emerald-500/80">RWF</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-900 flex items-center justify-between">
                  <span>Pre-purchased meal inventory</span>
                  <span className="font-mono text-slate-300">{monthlyMetrics.monthlyTransactionsCount} deposits</span>
                </div>
              </div>

              {/* Card 2: Monthly Used Plates & Cash */}
              <div className="p-4 rounded-xl bg-slate-950 border border-blue-900/50 relative overflow-hidden space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span>Monthly Used (Dining Consumed)</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Realized</span>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-black font-mono text-white tabular-nums">
                    {monthlyMetrics.monthlyUsedPlates.toLocaleString()} <span className="text-xs font-normal text-slate-400">plates</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-blue-400">
                    {monthlyMetrics.monthlyUsedCashRwf.toLocaleString()} <span className="text-xs font-sans text-blue-500/80">RWF</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-900 flex items-center justify-between">
                  <span>Plates redeemed at stand buffers</span>
                  <span className="font-mono text-slate-300">{monthlyMetrics.monthlyServingsCount} meals</span>
                </div>
              </div>

              {/* Card 3: Remaining Plates & Cash (Liability) */}
              <div className="p-4 rounded-xl bg-slate-950 border border-amber-900/50 relative overflow-hidden space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Remaining Plates &amp; Cash (Liability)</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Outstanding</span>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-black font-mono text-white tabular-nums">
                    {monthlyMetrics.remainingPlates.toLocaleString()} <span className="text-xs font-normal text-slate-400">plates</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-amber-400">
                    {monthlyMetrics.remainingCashRwf.toLocaleString()} <span className="text-xs font-sans text-amber-500/80">RWF</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-900 flex items-center justify-between">
                  <span>Active customer liability held</span>
                  <span className="font-mono text-slate-300">{monthlyMetrics.totalCustomersCount} members</span>
                </div>
              </div>
            </div>
          </div>

          {/* Executive Overview Pending Approvals Queue (Requirement 4 & Clarifying Answer 3) */}
          {(() => {
            const overviewPendingList = (state.pendingApprovals || []).filter(
              (a) => a.restaurantCode === state.currentRestaurantCode && a.status === 'pending'
            );

            if (overviewPendingList.length === 0) {
              return (
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-white">
                        {t.approvals?.emptyPending || 'All Mobile Money deposits and registrations are verified.'}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Stand operators have no pending patron requests waiting for boss confirmation.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSubTabChange('approvals')}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-medium transition-colors text-xs cursor-pointer self-start sm:self-auto shrink-0"
                  >
                    View Approval History &rarr;
                  </button>
                </div>
              );
            }

            return (
              <div className="p-5 rounded-2xl bg-amber-950/20 border-2 border-amber-600/50 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-800/40 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 animate-pulse">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                        <span>{t.approvals?.pendingNotice || 'Pending Approvals Waiting for Boss'}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500 text-slate-950 shadow-xs">
                          {overviewPendingList.length} Action Required
                        </span>
                      </h3>
                      <p className="text-xs text-amber-200/80 mt-0.5">
                        {t.approvals?.pendingNoticeDesc || 'New customers and top-ups registered by stand staff while you were away. You can verify and approve them here.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSubTabChange('approvals')}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <span>Open Full Queue ({overviewPendingList.length})</span>
                    <span>&rarr;</span>
                  </button>
                </div>

                {/* Queue Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {overviewPendingList.map((appr) => {
                    const cust = state.customers.find((c) => c.id === appr.customerId);
                    const graceMeals = appr.gracePlatesConsumed || cust?.gracePlatesConsumed || 0;
                    const isCopied = copiedOverviewRef === appr.id;

                    return (
                      <div
                        key={appr.id}
                        className="p-4 rounded-xl bg-slate-950/90 border border-amber-500/30 space-y-3 relative hover:border-amber-400/60 transition-all shadow-lg"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={appr.customerPhoto || cust?.photoUrl || '/src/assets/images/avatar_patron_male_1790979396731.jpg'}
                              alt={appr.customerName}
                              className="w-10 h-10 rounded-full object-cover border-2 border-amber-500/60"
                            />
                            <div>
                              <div className="font-bold text-white text-xs flex items-center gap-1.5">
                                <span>{appr.customerName}</span>
                                <span className="text-[10px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-800/80">
                                  #{appr.memberNo}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>{appr.customerPhone}</span>
                                <span>•</span>
                                <span className="text-slate-400 truncate max-w-[130px]">{appr.branchName}</span>
                              </div>
                            </div>
                          </div>

                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            appr.type === 'new_customer'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                          }`}>
                            {appr.type === 'new_customer' ? 'New Member' : 'Top-Up'}
                          </span>
                        </div>

                        {/* Financial and MoMo Details */}
                        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                              {t.approvals?.momoReference || 'MoMo Reference'}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono font-bold text-white text-xs truncate max-w-[120px]">
                                {appr.paymentReference}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOverviewCopyRef(appr.paymentReference, appr.id)}
                                title="Copy Mobile Money Reference"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                              >
                                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                              {t.approvals?.amountRwf || 'Amount'}
                            </span>
                            <div className="font-mono font-bold text-emerald-400 text-xs mt-0.5">
                              {appr.amountRwf.toLocaleString()} RWF
                            </div>
                            <div className="text-[10px] text-slate-400">
                              +{appr.platesRequested} plates
                            </div>
                          </div>
                        </div>

                        {/* Grace Plate Serving Indicator */}
                        <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-800/40 text-[11px] flex items-center justify-between">
                          <span className="text-amber-300 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>Grace Plates Eaten:</span>
                          </span>
                          <span className="font-mono font-bold text-white">
                            {graceMeals} / {appr.gracePlatesAllowed || 3} meals
                            {graceMeals > 0 ? ' (pre-served)' : ' (waiting)'}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleOverviewApprove(appr.id, appr.memberNo)}
                            className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t.approvals?.verifyAndApprove || 'Verify & Confirm MoMo'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onSubTabChange('approvals')}
                            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            {t.approvals?.rejectDeposit || 'Reject'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Quick Stat Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-xs font-semibold text-slate-400">Plates Today</div>
              <div className="text-2xl font-black text-white font-mono tabular-nums mt-1">
                {totalPlatesServedToday}
              </div>
              <div className="text-[11px] text-emerald-400 mt-1">Served across stands</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-xs font-semibold text-slate-400">Active Patrons</div>
              <div className="text-2xl font-black text-white font-mono tabular-nums mt-1">
                {activeCustomersCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Enrolled members</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-xs font-semibold text-slate-400">Low Balance</div>
              <div className="text-2xl font-black text-amber-400 font-mono tabular-nums mt-1">
                {lowBalanceCount}
              </div>
              <div className="text-[11px] text-amber-400/80 mt-1">&lt; 5 plates remaining</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-xs font-semibold text-slate-400">Prepaid Plates</div>
              <div className="text-2xl font-black text-white font-mono tabular-nums mt-1">
                {totalOutstandingPlates}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">In customer balances</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 col-span-2 md:col-span-1">
              <div className="text-xs font-semibold text-slate-400">Cash / MoMo Intake</div>
              <div className="text-2xl font-black text-emerald-400 font-mono tabular-nums mt-1">
                {(totalCashCollectedRwf / 1000).toFixed(0)}k <span className="text-xs font-sans">RWF</span>
              </div>
              <div className="text-[11px] text-emerald-400/80 mt-1">Total revenue collected</div>
            </div>
          </div>

          {/* Quick Actions & Recent Activity Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Actions Panel */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Management Shortcuts
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => onSubTabChange('registration')}
                  className="w-full p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-between transition-colors shadow-sm cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    <span>Register New Member</span>
                  </span>
                  <span>+</span>
                </button>

                <button
                  onClick={() => onSubTabChange('cards')}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Printer className="w-4 h-4 text-emerald-400" />
                    <span>Card Studio (Print Passes &amp; Slips)</span>
                  </span>
                  <span>&rarr;</span>
                </button>

                <button
                  onClick={() => onSubTabChange('customers')}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <span>Member Directory &amp; Top-Ups</span>
                  </span>
                  <span>&rarr;</span>
                </button>

                <button
                  onClick={() => setIsExportModalOpen(true)}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Export Financial CSV / Excel</span>
                  </span>
                  <span>&rarr;</span>
                </button>
              </div>

              {/* License Status Card */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                  <span>LICENSE: {license?.id}</span>
                  <span className="text-emerald-400 uppercase font-semibold">Active</span>
                </div>
                <div className="text-slate-300">
                  Stations: <strong>{state.scanPoints.filter(sp => sp.restaurantCode === state.currentRestaurantCode).length} / {license?.maxScanPoints || 1}</strong> authorized
                </div>
                <div className="text-slate-400 text-[11px]">
                  Valid until: {new Date(license?.validUntil || Date.now()).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Recent Payments Received */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Recent Top-Up Receipts
                </h3>
                <span className="text-xs font-mono text-slate-400">Cash &amp; MoMo Intake</span>
              </div>

              <div className="divide-y divide-slate-800/80 max-h-72 overflow-y-auto">
                {state.payments
                  .filter((p) => p.restaurantCode === state.currentRestaurantCode)
                  .slice(0, 5)
                  .map((pay) => (
                  <div key={pay.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">
                        {pay.customerName} (#{pay.memberNo})
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Ref: {pay.reference} · via {pay.paymentMethod.toUpperCase()}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400 text-sm">
                        +{pay.platesAdded} plates
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {pay.amountRwf.toLocaleString()} RWF
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PENDING APPROVALS QUEUE (Boss Mobile Money & Grace Plates Verification) */}
      {activeSubTab === 'approvals' && (
        <BossApprovalsManager restaurantCode={state.currentRestaurantCode} language={language} />
      )}

      {/* 2. CUSTOMER REGISTRATION VIEW */}
      {activeSubTab === 'registration' && (
        <div className="max-w-3xl mx-auto p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <span>Register New Member</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enroll a student or patron, verify payment, and assign their meal package.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSubTabChange('customers')}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              &larr; Back to Members
            </button>
          </div>

          {regError && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{regError}</span>
            </div>
          )}

          {regSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{regSuccess}</span>
            </div>
          )}

          <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
            {/* Row 1: Name & Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Patrick Nshimiyimana"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Phone Number <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="+250 788 123 456"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                />
              </div>
            </div>

            {/* Row 2: ID Type & Number */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Identity Document Type <span className="text-rose-400">*</span>
                </label>
                <select
                  value={regIdType}
                  onChange={(e) => setRegIdType(e.target.value as Customer['idType'])}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                >
                  <option value="student_id">Student ID</option>
                  <option value="national_id">National ID (Indangamuntu)</option>
                  <option value="passport">Passport</option>
                  <option value="driver_license">Driver's License</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="font-semibold text-slate-300 block mb-1">
                  Document Number <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1 1999 8 0045678 1 22 or Student Reg No"
                  value={regIdNumber}
                  onChange={(e) => setRegIdNumber(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Encrypted with separate salt for duplicate check & masked in customer views
                </span>
              </div>
            </div>

            {/* Passport Photo Capture & File Attachment */}
            <PhotoCaptureInput
              photoUrl={regPhotoUrl}
              onChange={setRegPhotoUrl}
              label="Member Portrait Photo (Webcam or File Attachment)"
              required
            />

            {/* Student Block Toggle & Fields */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="studentCheckbox"
                  checked={regIsStudent}
                  onChange={(e) => setRegIsStudent(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0"
                />
                <label htmlFor="studentCheckbox" className="font-semibold text-white cursor-pointer">
                  Customer is a Student (Enables campus discount packages)
                </label>
              </div>

              {regIsStudent && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
                  <div className="md:col-span-2">
                    <label className="font-semibold text-slate-400 block mb-1">Institution</label>
                    <input
                      type="text"
                      value={regInstitution}
                      onChange={(e) => setRegInstitution(e.target.value)}
                      className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-400 block mb-1">Programme</label>
                    <input
                      type="text"
                      value={regProgramme}
                      onChange={(e) => setRegProgramme(e.target.value)}
                      className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-400 block mb-1">Year</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={regYear}
                      onChange={(e) => setRegYear(parseInt(e.target.value) || 1)}
                      className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Package & Payment Confirmation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Initial Plate Bundle</label>
                <select
                  value={regPackageId}
                  onChange={(e) => setRegPackageId(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                >
                  {restoStore.getRestaurantPackages(state.currentRestaurantCode).map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({pkg.platesCount} plates - {pkg.priceRwf.toLocaleString()} RWF)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Payment Method</label>
                <select
                  value={regPaymentMethod}
                  onChange={(e) => setRegPaymentMethod(e.target.value as PaymentRecord['paymentMethod'])}
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                >
                  <option value="mtn_momo">MTN Mobile Money</option>
                  <option value="airtel_money">Airtel Money</option>
                  <option value="cash">Cash Received</option>
                  <option value="bank_transfer">Bank Transfer (BK / Equity)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Payment Reference</label>
                <input
                  type="text"
                  required
                  value={regPaymentRef}
                  onChange={(e) => setRegPaymentRef(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                />
              </div>
            </div>

            {/* Mandatory Terms Checkbox */}
            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Customer acknowledged: <strong>Unused plates never expire. No refunds.</strong></span>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-colors shadow-sm"
            >
              Complete Registration &amp; Allocate Member #
            </button>
          </form>
        </div>
      )}

      {/* 3. CUSTOMER LIST & LEDGER VIEW */}
      {activeSubTab === 'customers' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                placeholder="Search by name, member #, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-emerald-500 outline-hidden"
              />
              <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5" />
            </div>

            {/* Filter buttons & Export button */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-xs">
              {[
                { id: 'all', label: 'All Members' },
                { id: 'active', label: 'Active Cards' },
                { id: 'locked', label: 'Locked Cards' },
                { id: 'low_balance', label: 'Low Balance (<5)' },
                { id: 'students', label: 'Students Only' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterMode(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    filterMode === f.id
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}

              <button
                onClick={() => onSubTabChange('registration')}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 ml-1 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Member</span>
              </button>

              <button
                onClick={() => setIsExportModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                title="Export transaction logs and customer ledger to CSV or JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Customers Table */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Phone &amp; ID</th>
                  <th className="py-3 px-4 text-right">Plate Balance</th>
                  <th className="py-3 px-4">Card Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredCustomers.map((cust) => {
                  const bal = restoStore.getCustomerBalance(cust.id);
                  return (
                    <tr key={cust.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div
                          onClick={() => openManageCustomer(cust, 'cards')}
                          className="flex items-center gap-3 cursor-pointer group"
                        >
                          <img
                            src={cust.photoUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover border border-slate-700 group-hover:border-emerald-500 transition-colors"
                          />
                          <div>
                            <div className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                              <span>{cust.name}</span>
                            </div>
                            <div className="text-slate-400 font-mono text-[11px]">
                              #{cust.memberNo} {cust.isStudent && '· Student'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        <div>{cust.phone}</div>
                        <div className="text-slate-500 text-[11px]">{cust.idNumberMasked}</div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="text-lg font-black font-mono tabular-nums text-white">
                          {bal} <span className="text-xs font-normal text-slate-400">plates</span>
                        </div>
                        {bal < 5 && (
                          <div className="text-[10px] text-amber-400 font-semibold">Low Balance</div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                          cust.cardStatus === 'active'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {cust.cardStatus} (V{cust.cardVersion})
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setTopUpCustomer(cust);
                            setTopUpModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer"
                        >
                          Top-Up
                        </button>

                        <button
                          onClick={() => handleToggleLock(cust)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                            cust.cardStatus === 'locked'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900'
                              : 'bg-rose-950 text-rose-400 border border-rose-800 hover:bg-rose-900'
                          }`}
                          title={cust.cardStatus === 'locked' ? 'Reactivate card access' : 'Lock card (temporarily disable taps)'}
                        >
                          {cust.cardStatus === 'locked' ? (
                            <>
                              <Unlock className="w-3 h-3" />
                              <span>Reactivate</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3" />
                              <span>Lock</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => openManageCustomer(cust, 'notify')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 hover:text-amber-200 text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                          title={`Send direct in-app notification to ${cust.name} (#${cust.memberNo})`}
                        >
                          <Bell className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Alert</span>
                        </button>

                        <button
                          onClick={() => openManageCustomer(cust, 'cards')}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Manage</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Customer Ledger Modal Drawer */}
          {selectedCustomerForDetail && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Member Meal History: {selectedCustomerForDetail.name}
                    </h3>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      Member #{selectedCustomerForDetail.memberNo} · Balance: {restoStore.getCustomerBalance(selectedCustomerForDetail.id)} plates
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedCustomerForDetail(null)}
                    className="text-slate-400 hover:text-white text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-800 text-xs">
                  {state.ledgerEntries
                    .filter((e) => e.customerId === selectedCustomerForDetail.id)
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map((entry) => (
                      <div key={entry.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-200 uppercase font-mono text-[11px]">
                            {entry.type}
                          </div>
                          <div className="text-slate-400 text-[11px]">
                            {entry.reason || entry.reference || 'Standard dining stand deduction'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {new Date(entry.timestamp).toLocaleString()}
                          </div>
                        </div>

                        <div className={`text-sm font-black font-mono tabular-nums ${
                          entry.platesDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {entry.platesDelta > 0 ? `+${entry.platesDelta}` : entry.platesDelta} plates
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. IN-APP & SYSTEM NOTIFICATIONS STUDIO VIEW */}
      {activeSubTab === 'notifications' && (() => {
        const restoNotifs = restoStore.getRestaurantNotifications(state.currentRestaurantCode);
        const broadcastCount = restoNotifs.filter((n) => n.target === 'all').length;
        const directCount = restoNotifs.filter((n) => n.target !== 'all').length;
        const urgentCount = restoNotifs.filter((n) => n.priority === 'urgent').length;

        const filteredNotifs = restoNotifs.filter((n) => {
          const q = notifFeedSearch.toLowerCase();
          const matchSearch =
            n.title.toLowerCase().includes(q) ||
            n.message.toLowerCase().includes(q) ||
            n.senderName.toLowerCase().includes(q) ||
            (n.targetName && n.targetName.toLowerCase().includes(q));

          if (!matchSearch) return false;

          if (notifFeedFilter === 'broadcast') return n.target === 'all';
          if (notifFeedFilter === 'direct') return n.target !== 'all' && n.senderRole === 'restaurant_admin';
          if (notifFeedFilter === 'system') return n.senderRole === 'system';
          return true;
        });

        const restoCustomers = state.customers.filter((c) => c.restaurantCode === state.currentRestaurantCode);
        const previewTargetCust = restoCustomers.find((c) => c.id === notifSpecificCustomerId) || restoCustomers[0];

        return (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Notifications Overview KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-xs font-semibold text-slate-400">Total Notifications</div>
                <div className="text-2xl font-black text-white font-mono tabular-nums mt-1">
                  {restoNotifs.length}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1">Broadcasts &amp; direct alerts</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-xs font-semibold text-slate-400">Public Announcements</div>
                <div className="text-2xl font-black text-white font-mono tabular-nums mt-1">
                  {broadcastCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Reaching all {restoCustomers.length} members</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-xs font-semibold text-slate-400">Direct Member Notices</div>
                <div className="text-2xl font-black text-white font-mono tabular-nums mt-1">
                  {directCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Targeted patron messages</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-xs font-semibold text-slate-400">Urgent Alerts</div>
                <div className="text-2xl font-black text-amber-400 font-mono tabular-nums mt-1">
                  {urgentCount}
                </div>
                <div className="text-[11px] text-amber-400 mt-1">High-priority banners</div>
              </div>
            </div>

            {/* Compose Notification & Live Preview Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Compose Card (7 cols) */}
              <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Megaphone className="w-5 h-5 text-emerald-400" />
                      <span>Compose Customer Notification</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Send real-time alerts and announcements to your dining patrons' phones
                    </p>
                  </div>
                </div>

                {/* Pre-set Templates Strip */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    Quick Templates (1-Click Fill)
                  </label>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
                    {[
                      { id: 'hours', label: 'Extended Hours' },
                      { id: 'low_balance', label: 'Low Balance Reminder' },
                      { id: 'menu', label: "Chef's Special" },
                      { id: 'holiday', label: 'Holiday Schedule' },
                      { id: 'badge', label: 'Badge Quality Check' },
                    ].map((tmp) => (
                      <button
                        key={tmp.id}
                        type="button"
                        onClick={() => handleApplyNotifTemplate(tmp.id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {tmp.label}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleSendNotification} className="space-y-4 text-xs">
                  {/* Target Audience */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">Target Audience</label>
                      <select
                        value={notifTargetType}
                        onChange={(e) => setNotifTargetType(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden font-medium"
                      >
                        <option value="all">Broadcast to All Members ({restoCustomers.length})</option>
                        <option value="specific">Specific Member (Choose...)</option>
                        <option value="low_balance">Low Balance Patrons Only (&lt; 5 plates)</option>
                        <option value="students">Student Members Only</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">Alert Priority Level</label>
                      <select
                        value={notifPriority}
                        onChange={(e) => setNotifPriority(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden font-medium"
                      >
                        <option value="normal">Normal (Standard announcement)</option>
                        <option value="important">Important (Highlighted banner)</option>
                        <option value="urgent">Urgent (Immediate attention)</option>
                      </select>
                    </div>
                  </div>

                  {/* Specific customer selector if selected */}
                  {notifTargetType === 'specific' && (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <label className="font-semibold text-slate-300 block mb-1">Select Member</label>
                      <select
                        value={notifSpecificCustomerId || restoCustomers[0]?.id}
                        onChange={(e) => setNotifSpecificCustomerId(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-emerald-500 outline-hidden font-medium"
                      >
                        {restoCustomers.map((cust) => (
                          <option key={cust.id} value={cust.id}>
                            #{cust.memberNo} · {cust.name} ({restoStore.getCustomerBalance(cust.id)} plates) · {cust.phone}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">
                      Notification Title / Subject
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Exam Week Extended Dinner Hours"
                      value={notifTitle}
                      onChange={(e) => setNotifTitle(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden text-xs"
                    />
                  </div>

                  {/* Message Body */}
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">
                      Message Body
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Write your announcement or notice here..."
                      value={notifMessage}
                      onChange={(e) => setNotifMessage(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden text-xs resize-none"
                    />
                  </div>

                  {/* Action Link & Sender */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">
                        In-App Action Button (Optional)
                      </label>
                      <select
                        value={notifActionTab}
                        onChange={(e) => setNotifActionTab(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                      >
                        <option value="none">None (Read-only notice)</option>
                        <option value="my_card">Link to My Digital QR Pass</option>
                        <option value="history">Link to Meal Activity &amp; Top-Ups</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">Sender Signature</label>
                      <input
                        type="text"
                        value={notifSenderName}
                        onChange={(e) => setNotifSenderName(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Delivered instantly to web/phone clients across all stations.
                    </span>

                    <button
                      type="submit"
                      disabled={!notifTitle.trim() || !notifMessage.trim()}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send Notification</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Live Smartphone Preview (5 cols) */}
              <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center space-y-4 shadow-xl">
                <div className="w-full flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span>Live Patron Smartphone Preview</span>
                  </span>
                  <span className="text-[10px] uppercase font-mono text-slate-400">Real-Time UI</span>
                </div>

                {/* Smartphone Device Mockup */}
                <div className="w-full max-w-xs bg-slate-950 border-4 border-slate-800 rounded-3xl p-4 shadow-2xl space-y-3 relative overflow-hidden">
                  <div className="w-20 h-4 bg-slate-800 rounded-full mx-auto" />

                  {/* Mini status header */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>RestoPass Mobile</span>
                    <span>12:00</span>
                  </div>

                  {/* Live Push Notification Card inside Mockup */}
                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-emerald-500/50 space-y-2 shadow-lg animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold">
                        <Bell className="w-3.5 h-3.5" />
                        <span>RestoPass Alert</span>
                      </div>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                        notifPriority === 'urgent'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : notifPriority === 'important'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}>
                        {notifPriority}
                      </span>
                    </div>

                    <div className="font-bold text-white text-xs leading-snug">
                      {notifTitle.trim() || 'Notification Title Preview...'}
                    </div>

                    <p className="text-slate-300 text-[11px] leading-relaxed break-words">
                      {notifMessage.trim() || 'The notification body text will render here as you type in the compose form.'}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800">
                      <span>{notifSenderName}</span>
                      <span>Just now</span>
                    </div>

                    {notifActionTab !== 'none' && (
                      <div className="pt-1 text-center">
                        <span className="inline-block w-full py-1 rounded-lg bg-emerald-600/90 text-white font-bold text-[10px]">
                          Open {notifActionTab === 'my_card' ? 'My QR Pass' : 'Activity'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Sample background patron card in mockup */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[10px] space-y-1 opacity-70">
                    <div className="text-slate-400 font-mono">
                      Patron: {notifTargetType === 'specific' && previewTargetCust ? previewTargetCust.name : 'All Active Members'}
                    </div>
                    <div className="text-emerald-400 font-bold font-mono">
                      Balance: {notifTargetType === 'specific' && previewTargetCust ? restoStore.getCustomerBalance(previewTargetCust.id) : 34} plates
                    </div>
                  </div>
                </div>

                <div className="text-center text-[11px] text-slate-400 max-w-xs">
                  Notifications immediately sync across phone apps and cafeteria terminals with sound and visual badges.
                </div>
              </div>
            </div>

            {/* Notification History & Delivery Ledger Table */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="relative w-full sm:w-80">
                  <input
                    type="text"
                    placeholder="Search past notifications & alerts..."
                    value={notifFeedSearch}
                    onChange={(e) => setNotifFeedSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-emerald-500 outline-hidden"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5" />
                </div>

                <div className="flex items-center gap-1.5 text-xs overflow-x-auto w-full sm:w-auto">
                  {[
                    { id: 'all', label: 'All Notifications' },
                    { id: 'broadcast', label: 'Broadcasts' },
                    { id: 'direct', label: 'Direct Notices' },
                    { id: 'system', label: 'System Logs' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setNotifFeedFilter(f.id as any)}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        notifFeedFilter === f.id
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feed table */}
              <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Subject &amp; Message</th>
                      <th className="py-3 px-4">Target Audience</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Sender &amp; Time</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredNotifs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                          No notifications found matching filter.
                        </td>
                      </tr>
                    ) : (
                      filteredNotifs.map((notif) => {
                        const targetCust = notif.target !== 'all' ? state.customers.find((c) => c.id === notif.target) : null;
                        const readCount = notif.target === 'all'
                          ? notif.readByCustomerIds.length
                          : notif.readByCustomerIds.includes(notif.target) ? 1 : 0;

                        return (
                          <tr key={notif.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 max-w-md">
                              <div className="flex items-start gap-2.5">
                                <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                                  notif.priority === 'urgent'
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : notif.priority === 'important'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-emerald-500/10 text-emerald-400'
                                }`}>
                                  <Bell className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <div className="font-bold text-white text-xs leading-snug">
                                    {notif.title}
                                  </div>
                                  <div className="text-slate-400 text-[11px] mt-0.5 line-clamp-2">
                                    {notif.message}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              {notif.target === 'all' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 text-[11px] font-semibold">
                                  <span>All Members</span>
                                  <span className="text-[10px] text-slate-400">({restoCustomers.length})</span>
                                </span>
                              ) : targetCust ? (
                                <div className="flex items-center gap-2">
                                  <img src={targetCust.photoUrl} alt="" className="w-6 h-6 rounded-md object-cover" />
                                  <div>
                                    <div className="font-semibold text-white text-[11px]">{targetCust.name}</div>
                                    <div className="text-slate-500 font-mono text-[10px]">#{targetCust.memberNo}</div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-mono">{notif.targetName || notif.target}</span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                notif.priority === 'urgent'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : notif.priority === 'important'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}>
                                {notif.priority}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono text-[11px]">
                              <div className="text-slate-300 font-sans font-medium">{notif.senderName}</div>
                              <div className="text-slate-500 text-[10px] mt-0.5">
                                {new Date(notif.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <span className="text-[11px] font-mono text-slate-400" title="Read confirmations">
                                  {notif.target === 'all' ? `${readCount} read` : readCount > 0 ? '✓ Read' : 'Unread'}
                                </span>

                                <button
                                  onClick={() => restoStore.deleteNotification(notif.id, 'Manager')}
                                  title="Delete / Recall this notification"
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. PVC CARD PRINT STUDIO VIEW */}
      {activeSubTab === 'cards' && <CardPrintStudio />}

      {/* 5. PACKAGES & PRICING VIEW */}
      {activeSubTab === 'pricing' && (() => {
        const restoPackages = restoStore.getRestaurantPackages(state.currentRestaurantCode);
        const currentResto = restoStore.getCurrentRestaurant();
        const defaultRate = restoStore.getRestaurantDefaultPlatePrice(state.currentRestaurantCode);

        // Calculate package metrics
        const minPricePkg = restoPackages.length > 0 ? [...restoPackages].sort((a, b) => a.priceRwf - b.priceRwf)[0] : null;
        const maxPlatesPkg = restoPackages.length > 0 ? [...restoPackages].sort((a, b) => b.platesCount - a.platesCount)[0] : null;
        const bestRatePkg = restoPackages.length > 0
          ? [...restoPackages].sort((a, b) => (a.priceRwf / a.platesCount) - (b.priceRwf / b.platesCount))[0]
          : null;

        // Simulator calculations
        const simExactPkg = restoPackages.find((p) => p.platesCount === simPlates);
        const simBaseTotal = simPlates * defaultRate;
        const simEffectivePrice = simExactPkg ? simExactPkg.priceRwf : simPlates * defaultRate;
        const simSavings = simExactPkg ? Math.max(0, simBaseTotal - simExactPkg.priceRwf) : 0;

        return (
          <div className="space-y-6">
            {/* View Switcher: Price Trends Dashboard vs Subscription Bundles */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPricingSectionView('analytics')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    pricingSectionView === 'analytics'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Menu Pricing &amp; Consumption Trends (Recharts)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPricingSectionView('bundles')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    pricingSectionView === 'bundles'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Tag className="w-4 h-4" />
                  <span>Subscription Bundles &amp; Single-Plate Rate</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-400 px-3 font-mono hidden md:block">
                Authority Node: {state.currentRestaurantCode}
              </div>
            </div>

            {pricingSectionView === 'analytics' ? (
              <PricingAnalyticsDashboard restaurantCode={state.currentRestaurantCode} />
            ) : (
              <div className="space-y-6">
                {/* Header with actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Tag className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-white tracking-tight">
                          Subscription Packages &amp; Pricing Management
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Tailor meal subscription prices for <strong>{currentResto?.name}</strong>. Changes take effect across cashier top-ups, member registration, and student mobile passes.
                        </p>
                      </div>
                    </div>
                  </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setCreatePkgModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Meal Package</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetPackagesDefault}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Restore baseline packages (10, 15, 30, 60 plates)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Defaults</span>
                </button>
              </div>
            </div>

            {/* Quick Pricing KPI Badges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Active Packages
                </div>
                <div className="text-2xl font-black text-white font-mono mt-1">
                  {restoPackages.length}
                </div>
                <div className="text-[11px] text-emerald-400 mt-0.5">Configured for cafeteria</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Single-Plate Baseline Rate
                </div>
                <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                  {defaultRate.toLocaleString()} <span className="text-xs font-normal text-slate-400">RWF</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Rate for custom plate top-ups</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Entry Plan
                </div>
                <div className="text-xl font-bold text-white font-mono mt-1">
                  {minPricePkg ? `${minPricePkg.platesCount} plates` : 'None'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {minPricePkg ? `${minPricePkg.priceRwf.toLocaleString()} RWF` : '-'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Best Value Tier
                </div>
                <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                  {bestRatePkg ? `${Math.round(bestRatePkg.priceRwf / bestRatePkg.platesCount).toLocaleString()} RWF/plate` : 'None'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {bestRatePkg ? bestRatePkg.name : '-'}
                </div>
              </div>
            </div>

            {/* Baseline Plate Rate Configuration */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    <span>Custom Top-Up Single-Plate Rate</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    When patrons or cashiers top up an arbitrary number of plates (e.g. 7 or 45 plates) instead of a fixed package, this rate is multiplied by the plate count.
                  </p>
                </div>

                <form onSubmit={handleSaveDefaultPlateRate} className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      min={100}
                      step={50}
                      value={customPlateRateInput}
                      onChange={(e) => setCustomPlateRateInput(Math.max(100, parseInt(e.target.value) || 100))}
                      className="w-36 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold text-xs focus:border-emerald-500 outline-hidden pr-12"
                    />
                    <span className="absolute right-3 top-2 text-[11px] font-mono text-slate-500">RWF</span>
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Rate</span>
                  </button>
                </form>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between flex-wrap gap-2">
                <span>Current active rate: <strong className="text-white font-mono">{defaultRate.toLocaleString()} RWF / plate</strong></span>
                <span className="text-slate-500">Auto-applies in member top-up calculator and custom plate cashier desk.</span>
              </div>
            </div>

            {/* Active Packages Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Active Subscription Bundles ({restoPackages.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Meal plans currently available for purchase by patrons of this restaurant.
                  </p>
                </div>
              </div>

              {restoPackages.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
                  <Tag className="w-8 h-8 text-slate-600 mx-auto" />
                  <div className="text-slate-300 font-bold text-sm">No packages configured for this restaurant</div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Every restaurant must have subscription packages for meal top-ups.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetPackagesDefault}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Load Standard Default Packages
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {restoPackages.map((pkg) => {
                    const unitPrice = Math.round(pkg.priceRwf / pkg.platesCount);
                    const perPlateSaving = defaultRate - unitPrice;
                    const discountPercent = perPlateSaving > 0 ? Math.round((perPlateSaving / defaultRate) * 100) : 0;

                    return (
                      <div
                        key={pkg.id}
                        className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 shadow-lg group relative"
                      >
                        {discountPercent > 0 && (
                          <div className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Save {discountPercent}%</span>
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 font-mono font-bold text-xs">
                              {pkg.platesCount} PLATES
                            </span>
                            <span className="text-slate-500 text-[10px] font-mono">
                              ID: {pkg.id.slice(-6)}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-bold text-white text-sm leading-snug">
                              {pkg.name}
                            </h4>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                              {pkg.description || `${pkg.platesCount} cafeteria meal credits`}
                            </p>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                            <div className="flex items-baseline justify-between">
                              <span className="text-[11px] text-slate-400">Total Price:</span>
                              <span className="text-lg font-black text-white font-mono">
                                {pkg.priceRwf.toLocaleString()} <span className="text-xs font-normal text-slate-400">RWF</span>
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-850">
                              <span>Unit Rate:</span>
                              <span className="font-bold text-emerald-400">
                                {unitPrice.toLocaleString()} RWF / plate
                              </span>
                            </div>
                            {perPlateSaving > 0 && (
                              <div className="text-[10px] text-emerald-400 font-medium">
                                ✓ Patron saves {perPlateSaving.toLocaleString()} RWF per meal
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleOpenEditPackage(pkg)}
                            className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Edit Details</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePackage(pkg)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete this meal package"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Interactive Pricing Simulator & Student Savings Calculator */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      Patron Pricing Simulator &amp; Savings Calculator
                    </h3>
                    <p className="text-xs text-slate-400">
                      Test how your restaurant's package rates compare against the baseline single-plate rate for cafeteria budgets.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                  {[10, 15, 20, 30, 45, 60].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setSimPlates(count)}
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold transition-colors cursor-pointer ${
                        simPlates === count
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {count}p
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                <div className="space-y-1">
                  <label className="text-slate-400 text-xs font-semibold block">Simulate Quantity:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={simPlates}
                      onChange={(e) => setSimPlates(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold text-sm focus:border-emerald-500 outline-hidden"
                    />
                    <span className="text-slate-400 text-xs font-bold font-mono">Plates</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-semibold uppercase">Single-Plate Cost</div>
                  <div className="text-lg font-black text-slate-200 font-mono mt-0.5">
                    {simBaseTotal.toLocaleString()} RWF
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    At {defaultRate.toLocaleString()} RWF / plate
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-semibold uppercase">Package Price</div>
                  <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                    {simEffectivePrice.toLocaleString()} RWF
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {simExactPkg ? `Matches "${simExactPkg.name}"` : 'Calculated at custom rate'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-700/80">
                  <div className="text-[11px] text-emerald-400 font-semibold uppercase">Patron Bundle Savings</div>
                  <div className="text-lg font-black text-emerald-300 font-mono mt-0.5">
                    {simSavings > 0 ? `-${simSavings.toLocaleString()} RWF` : 'Standard Rate'}
                  </div>
                  <div className="text-[10px] text-emerald-400/80 font-mono">
                    {simSavings > 0 ? `${Math.round((simSavings / simBaseTotal) * 100)}% cheaper in bundle` : 'No bundle discount for this qty'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
      })()}

      {/* 5. BRANCHES, STATIONS & OPERATOR ACCOUNTS VIEW */}
      {activeSubTab === 'stations' && (
        <BranchesAndStationsManager restaurantCode={state.currentRestaurantCode} language={language} />
      )}

      {/* 5B. SECURITY & FORENSIC AUDIT TRAIL VIEW */}
      {activeSubTab === 'security' && (
        <SecurityAndAuditLogsView restaurantCode={state.currentRestaurantCode} language={language} />
      )}

      {/* 6. OVERRIDES & SPOT-CHECKS VIEW */}
      {activeSubTab === 'overrides' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <h2 className="text-base font-bold text-white">Blocked Scans &amp; Staff Spot-Check Logs</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review serving limit breaches, approve overrides with justification, and audit staff Match/Reject decisions.
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Event Status</th>
                  <th className="py-3 px-4">Photo Check</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {state.scanEvents
                  .filter((ev) => ev.restaurantCode === state.currentRestaurantCode)
                  .slice(0, 15)
                  .map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium text-white">
                      {ev.customerName} (#{ev.memberNo})
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        ev.status === 'approved'
                          ? 'bg-emerald-950 text-emerald-400'
                          : ev.status === 'warning_confirmed'
                          ? 'bg-amber-950 text-amber-400'
                          : 'bg-rose-950 text-rose-400'
                      }`}>
                        {ev.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {ev.photoCheckResult !== 'none' ? ev.photoCheckResult.toUpperCase() : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-xs truncate">
                      {ev.blockedReason || ev.overrideReason || 'Standard meal serving'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. REPORTS VIEW */}
      {activeSubTab === 'reports' && (() => {
        const restoPackages = restoStore.getRestaurantPackages(state.currentRestaurantCode);
        const defaultRate = restoStore.getRestaurantDefaultPlatePrice(state.currentRestaurantCode);
        const currentResto = restoStore.getCurrentRestaurant();

        const restoPayments = state.payments.filter((p) => p.restaurantCode === state.currentRestaurantCode);
        const totalRevenue = restoPayments.reduce((s, p) => s + p.amountRwf, 0);
        const totalPlatesPurchased = restoPayments.reduce((s, p) => s + p.platesAdded, 0);
        const avgPricePerPlate = totalPlatesPurchased > 0 ? Math.round(totalRevenue / totalPlatesPurchased) : defaultRate;

        // Active Patron Balances across members
        const activePatronBalances = state.customers
          .filter((c) => c.restaurantCode === state.currentRestaurantCode)
          .reduce((s, c) => s + restoStore.getCustomerBalance(c.id), 0);

        // Estimated Liability (prepaid unserved food)
        const estimatedLiabilityRwf = activePatronBalances * avgPricePerPlate;

        // Dynamic serving windows (from approved scans)
        const allApprovedScans = state.scanEvents.filter(
          (ev) => ev.restaurantCode === state.currentRestaurantCode && ev.status === 'approved'
        );
        const breakfastScans = allApprovedScans.filter((ev) => {
          const h = new Date(ev.timestamp).getHours();
          return h < 10 || (h === 10 && new Date(ev.timestamp).getMinutes() <= 30);
        }).reduce((s, ev) => s + ev.platesDeducted, 0);

        const lunchScans = allApprovedScans.filter((ev) => {
          const h = new Date(ev.timestamp).getHours();
          return (h >= 10 && h < 15) || (h === 15 && new Date(ev.timestamp).getMinutes() <= 30);
        }).reduce((s, ev) => s + ev.platesDeducted, 0);

        const dinnerScans = allApprovedScans.filter((ev) => {
          const h = new Date(ev.timestamp).getHours();
          return h >= 15;
        }).reduce((s, ev) => s + ev.platesDeducted, 0);

        // Package Sales Breakdown
        const packageStats = restoPackages.map((pkg) => {
          const sales = restoPayments.filter((p) => p.packageId === pkg.id);
          const count = sales.length;
          const revenue = sales.reduce((s, p) => s + p.amountRwf, 0);
          const plates = sales.reduce((s, p) => s + p.platesAdded, 0);
          const share = totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 100) : 0;
          return {
            pkg,
            count,
            revenue,
            plates,
            share,
          };
        });

        // Custom Top-Ups (non-bundle)
        const customTopUpSales = restoPayments.filter((p) => !p.packageId || !restoPackages.some((pkg) => pkg.id === p.packageId));
        const customTopUpCount = customTopUpSales.length;
        const customTopUpRevenue = customTopUpSales.reduce((s, p) => s + p.amountRwf, 0);
        const customTopUpPlates = customTopUpSales.reduce((s, p) => s + p.platesAdded, 0);
        const customTopUpShare = totalRevenue > 0 ? Math.round((customTopUpRevenue / totalRevenue) * 100) : 0;

        // Payment Methods Breakdown
        const methodStats = [
          { id: 'mtn_momo', label: 'MTN Mobile Money' },
          { id: 'airtel_money', label: 'Airtel Money' },
          { id: 'cash', label: 'Cash Payment' },
          { id: 'bank_transfer', label: 'Bank Transfer' },
        ].map((m) => {
          const pays = restoPayments.filter((p) => p.paymentMethod === m.id);
          const rev = pays.reduce((s, p) => s + p.amountRwf, 0);
          const pct = totalRevenue > 0 ? Math.round((rev / totalRevenue) * 100) : 0;
          return {
            id: m.id,
            label: m.label,
            count: pays.length,
            revenue: rev,
            pct,
          };
        });

        return (
          <div className="space-y-6">
            {/* Reports Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Financial Reports &amp; Subscription Analytics
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Revenue performance, meal package sales, payment channel intake, and cafeteria dining volume for <strong>{currentResto?.name}</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSubTabChange('pricing')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Adjust Package Prices</span>
                </button>
              </div>
            </div>

            {/* Top-Line Financial KPI Badges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Total Top-Up Revenue
                </div>
                <div className="text-2xl font-black text-white font-mono mt-1">
                  {totalRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-400">RWF</span>
                </div>
                <div className="text-[11px] text-emerald-400 mt-0.5">
                  Across {restoPayments.length} recorded payments
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Prepaid Plates Sold
                </div>
                <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                  +{totalPlatesPurchased.toLocaleString()} <span className="text-xs font-normal text-slate-400">plates</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Pre-purchased meal inventory
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Weighted Avg Price / Plate
                </div>
                <div className="text-2xl font-black text-slate-200 font-mono mt-1">
                  {avgPricePerPlate.toLocaleString()} <span className="text-xs font-normal text-slate-400">RWF</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Base rate: {defaultRate.toLocaleString()} RWF
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Prepaid Food Liability
                </div>
                <div className="text-2xl font-black text-amber-400 font-mono mt-1">
                  {activePatronBalances.toLocaleString()} <span className="text-xs font-normal text-slate-400">plates</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  ~{estimatedLiabilityRwf.toLocaleString()} RWF unserved
                </div>
              </div>
            </div>

            {/* SUBSCRIPTION PACKAGES PERFORMANCE BREAKDOWN */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-400" />
                    <span>Package Sales &amp; Subscription Popularity Breakdown</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Revenue and volume distribution across your restaurant's configured subscription price tiers.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {restoPackages.length} active bundles configured
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Subscription Bundle</th>
                      <th className="py-2.5 px-3 text-right">Configured Price</th>
                      <th className="py-2.5 px-3 text-right">Rate / Plate</th>
                      <th className="py-2.5 px-3 text-right">Units Sold</th>
                      <th className="py-2.5 px-3 text-right">Plates Added</th>
                      <th className="py-2.5 px-3 text-right">Total Revenue</th>
                      <th className="py-2.5 px-3 w-36">Revenue Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {packageStats.map(({ pkg, count, revenue, plates, share }) => (
                      <tr key={pkg.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-3 font-sans font-medium text-white">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono font-bold">
                              {pkg.platesCount}p
                            </span>
                            <span>{pkg.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300 font-bold">
                          {pkg.priceRwf.toLocaleString()} RWF
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-400 font-bold">
                          {Math.round(pkg.priceRwf / pkg.platesCount).toLocaleString()} RWF
                        </td>
                        <td className="py-3 px-3 text-right text-white font-bold">
                          {count}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-400 font-bold">
                          +{plates}
                        </td>
                        <td className="py-3 px-3 text-right text-white font-black">
                          {revenue.toLocaleString()} RWF
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                              <div
                                className="bg-emerald-500 h-full rounded-full"
                                style={{ width: `${Math.min(100, share)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-slate-300 w-8 text-right font-mono">
                              {share}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* Custom Plate Top-Ups row if any */}
                    <tr className="hover:bg-slate-800/40 bg-slate-950/40">
                      <td className="py-3 px-3 font-sans font-medium text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono font-bold">
                            Custom
                          </span>
                          <span>Arbitrary / Custom Top-Ups</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-400">
                        Variable Rate
                      </td>
                      <td className="py-3 px-3 text-right text-slate-400">
                        ~{customTopUpPlates > 0 ? Math.round(customTopUpRevenue / customTopUpPlates).toLocaleString() : defaultRate.toLocaleString()} RWF
                      </td>
                      <td className="py-3 px-3 text-right text-slate-200 font-bold">
                        {customTopUpCount}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-400 font-bold">
                        +{customTopUpPlates}
                      </td>
                      <td className="py-3 px-3 text-right text-white font-black">
                        {customTopUpRevenue.toLocaleString()} RWF
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className="bg-blue-500 h-full rounded-full"
                              style={{ width: `${Math.min(100, customTopUpShare)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-300 w-8 text-right font-mono">
                            {customTopUpShare}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* PAYMENT CHANNELS & SERVICE MEAL WINDOWS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Payment Methods Intake */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>Payment Channel Breakdown</span>
                </h3>

                <div className="space-y-2.5 pt-1">
                  {methodStats.map((ms) => (
                    <div key={ms.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white">{ms.label}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {ms.count} transactions recorded
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white font-mono">
                          {ms.revenue.toLocaleString()} RWF
                        </div>
                        <div className="text-[11px] text-emerald-400 font-mono">
                          {ms.pct}% of total intake
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Serving Rush Windows */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Dining Volume by Meal Window</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-400">Breakfast (06:30 - 10:30)</div>
                    <div className="text-xl font-bold font-mono text-white">
                      {breakfastScans} <span className="text-xs font-normal text-slate-400">plates</span>
                    </div>
                    <div className="text-[10px] text-slate-500">Morning buffet line</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-400">Lunch (10:30 - 15:30)</div>
                    <div className="text-xl font-bold font-mono text-emerald-400">
                      {lunchScans} <span className="text-xs font-normal text-slate-400">plates</span>
                    </div>
                    <div className="text-[10px] text-emerald-500/80">Peak student rush</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-400">Dinner (15:30 - 21:00)</div>
                    <div className="text-xl font-bold font-mono text-white">
                      {dinnerScans} <span className="text-xs font-normal text-slate-400">plates</span>
                    </div>
                    <div className="text-[10px] text-slate-500">Evening service</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Total lifetime stand servings:</span>
                  <span className="font-bold text-white font-mono">
                    {allApprovedScans.reduce((s, ev) => s + ev.platesDeducted, 0)} plates deducted
                  </span>
                </div>
              </div>
            </div>

            {/* RECENT TOP-UP RECEIPTS LEDGER */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Recent Subscription Purchases &amp; Cashier Top-Ups</span>
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  {restoPayments.length} recorded payments
                </span>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Member</th>
                      <th className="py-2.5 px-3">Package / Top-Up Type</th>
                      <th className="py-2.5 px-3 text-right">Plates Added</th>
                      <th className="py-2.5 px-3 text-right">Amount (RWF)</th>
                      <th className="py-2.5 px-3">Channel &amp; Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {restoPayments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                          No top-up payments recorded yet for this restaurant.
                        </td>
                      </tr>
                    ) : (
                      restoPayments.slice(0, 10).map((pay) => {
                        const pkg = restoPackages.find((p) => p.id === pay.packageId);
                        return (
                          <tr key={pay.id} className="hover:bg-slate-900/40">
                            <td className="py-2.5 px-3 text-slate-400">
                              {new Date(pay.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-2.5 px-3 font-sans font-medium text-white">
                              {pay.customerName} (#{pay.memberNo})
                            </td>
                            <td className="py-2.5 px-3 font-sans text-slate-300">
                              {pkg ? pkg.name : `Custom Top-Up (${pay.platesAdded} plates)`}
                            </td>
                            <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                              +{pay.platesAdded}
                            </td>
                            <td className="py-2.5 px-3 text-right text-white font-bold">
                              {pay.amountRwf.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 font-sans truncate max-w-xs">
                              <span className="uppercase text-[10px] font-mono font-bold text-slate-300">
                                {pay.paymentMethod.replace('_', ' ')}
                              </span>
                              {' · '}
                              <span className="font-mono">{pay.reference}</span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* LOCAL AUDITING & TRANSACTION LOGS EXPORT PANEL */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Transaction Logs &amp; Accounting Export
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Download CSV spreadsheets or JSON audits for bookkeeping and cashier reconciliation.
                  </p>
                </div>

                {/* Action Buttons: CSV, JSON, and Custom Filter Modal */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleQuickExportCsv}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                    title="Download RFC 4180 CSV with UTF-8 BOM for Microsoft Excel or Google Sheets"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    onClick={handleQuickExportJson}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Download structured JSON format with complete metadata and journal"
                  >
                    <FileCode className="w-4 h-4 text-amber-400" />
                    <span>Export JSON</span>
                  </button>

                  <button
                    onClick={() => setIsExportModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <span>Filter Period...</span>
                  </button>
                </div>
              </div>

              {/* Audit Summary Badges */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">Total Ledger Records</div>
                  <div className="font-mono font-bold text-white text-lg mt-0.5">
                    {state.ledgerEntries.filter((e) => e.restaurantCode === state.currentRestaurantCode).length}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">Plates Deducted at Stands</div>
                  <div className="font-mono font-bold text-rose-400 text-lg mt-0.5">
                    {state.ledgerEntries
                      .filter((e) => e.restaurantCode === state.currentRestaurantCode && e.platesDelta < 0)
                      .reduce((sum, e) => sum + Math.abs(e.platesDelta), 0)} plates
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">Purchased Top-Up Plates</div>
                  <div className="font-mono font-bold text-emerald-400 text-lg mt-0.5">
                    +{state.ledgerEntries
                      .filter((e) => e.restaurantCode === state.currentRestaurantCode && e.platesDelta > 0 && e.type === 'purchase')
                      .reduce((sum, e) => sum + e.platesDelta, 0)} plates
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">Cash / MoMo Recorded</div>
                  <div className="font-mono font-bold text-white text-lg mt-0.5">
                    {totalRevenue.toLocaleString()} RWF
                  </div>
                </div>
              </div>

              {/* Live Search & Filter Bar for the on-screen ledger audit table */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="relative w-full sm:w-72">
                  <input
                    type="text"
                    placeholder="Filter logs by member, name, or ref..."
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:border-emerald-500 outline-hidden"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                </div>

                <div className="flex gap-1.5 text-xs w-full sm:w-auto overflow-x-auto">
                  {[
                    { id: 'all', label: 'All Transactions' },
                    { id: 'scan', label: 'Stand Servings' },
                    { id: 'purchase', label: 'Top-Ups' },
                    { id: 'transfer', label: 'Transfers' },
                  ].map((af) => (
                    <button
                      key={af.id}
                      onClick={() => setAuditTypeFilter(af.id as any)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap text-[11px] ${
                        auditTypeFilter === af.id
                          ? 'bg-slate-700 text-white font-bold'
                          : 'bg-slate-800/80 text-slate-400 hover:text-white'
                      }`}
                    >
                      {af.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Transaction Logs Audit Table */}
              <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Date &amp; Time</th>
                      <th className="py-2.5 px-3">Member</th>
                      <th className="py-2.5 px-3">Event Type</th>
                      <th className="py-2.5 px-3 text-right">Plates Delta</th>
                      <th className="py-2.5 px-3">Station / Desk</th>
                      <th className="py-2.5 px-3">Reference / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {(() => {
                      const allEnrichedLogs = getEnrichedTransactions(state.currentRestaurantCode).filter((log) => {
                        const q = auditSearchQuery.toLowerCase();
                        const matchSearch =
                          log.customerName.toLowerCase().includes(q) ||
                          log.memberNo.includes(q) ||
                          log.reference.toLowerCase().includes(q) ||
                          log.reason.toLowerCase().includes(q);
                        if (!matchSearch) return false;

                        if (auditTypeFilter === 'scan') {
                          return log.type === 'scan' || log.type === 'extra' || log.type === 'undo';
                        }
                        if (auditTypeFilter === 'purchase') {
                          return log.type === 'purchase';
                        }
                        if (auditTypeFilter === 'transfer') {
                          return log.type === 'transfer_out' || log.type === 'transfer_in' || log.type === 'reversal';
                        }
                        return true;
                      });

                      if (allEnrichedLogs.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                              No transactions matching search criteria.
                            </td>
                          </tr>
                        );
                      }

                      return allEnrichedLogs.slice(0, 8).map((log) => (
                        <tr key={log.id} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-3 text-slate-400">
                            {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-2.5 px-3 font-sans font-medium text-white">
                            {log.customerName} (#{log.memberNo})
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                              log.type === 'purchase'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : log.type === 'scan' || log.type === 'extra'
                                ? 'bg-blue-950 text-blue-400 border border-blue-800'
                                : log.type === 'undo' || log.type === 'reversal'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-purple-950 text-purple-400 border border-purple-800'
                            }`}>
                              {log.type}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold tabular-nums ${
                            log.platesDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {log.platesDelta > 0 ? `+${log.platesDelta}` : log.platesDelta}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 font-sans">
                            {log.scanPointName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 font-sans truncate max-w-xs">
                            {log.reference !== 'N/A' ? `${log.reference} · ` : ''}{log.reason}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 8. RESTAURANT SETTINGS VIEW */}
      {activeSubTab === 'settings' && (
        <div className="max-w-2xl p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="text-base font-bold text-white">Restaurant Operational Rules &amp; Limits</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Serving Window (minutes)</label>
              <input
                type="number"
                disabled
                value={terms.servingWindowMinutes}
                className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono"
              />
              <span className="text-[10px] text-slate-500">Configured in subscription terms (120 mins)</span>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Max Plates per Window</label>
              <input
                type="number"
                disabled
                value={terms.plateLimitPerWindow}
                className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono"
              />
              <span className="text-[10px] text-slate-500">Maximum 2 plates allowed before block</span>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Spot-Check Sample Rate</label>
              <input
                type="text"
                disabled
                value={`${(terms.defaultSpotCheckRate * 100).toFixed(0)}% (1 in 10 scans)`}
                className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Card &amp; Reissue Fee</label>
              <input
                type="text"
                disabled
                value={`${terms.customerCardFeeRwf.toLocaleString()} RWF`}
                className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* TOP-UP MODAL */}
      {topUpModalOpen && topUpCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Top-Up Plate Balance</h3>
                <div className="text-xs text-slate-400 mt-0.5">
                  Customer: {topUpCustomer.name} (#{topUpCustomer.memberNo})
                </div>
              </div>
              <button
                onClick={() => setTopUpModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-300">Top-Up Method</label>
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsCustomTopUp(false)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                      !isCustomTopUp ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Meal Bundle
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCustomTopUp(true)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                      isCustomTopUp ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Custom Plates
                  </button>
                </div>
              </div>

              {!isCustomTopUp ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-300">Select Restaurant Bundle</label>
                    <button
                      type="button"
                      onClick={() => {
                        setTopUpModalOpen(false);
                        onSubTabChange('pricing');
                      }}
                      className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Tag className="w-3 h-3" />
                      <span>Edit Prices</span>
                    </button>
                  </div>
                  <select
                    value={topUpPackageId}
                    onChange={(e) => setTopUpPackageId(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    {restoStore.getRestaurantPackages(state.currentRestaurantCode).map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.platesCount} plates - {pkg.priceRwf.toLocaleString()} RWF · {Math.round(pkg.priceRwf / pkg.platesCount).toLocaleString()} RWF/plate)
                      </option>
                    ))}
                  </select>

                  {/* Selected Bundle Summary Badge */}
                  {(() => {
                    const pkgs = restoStore.getRestaurantPackages(state.currentRestaurantCode);
                    const selectedPkg = pkgs.find((p) => p.id === topUpPackageId) || pkgs[0];
                    if (!selectedPkg) return null;
                    const unitPrice = Math.round(selectedPkg.priceRwf / selectedPkg.platesCount);
                    const defRate = restoStore.getRestaurantDefaultPlatePrice(state.currentRestaurantCode);
                    const perPlateSaving = Math.max(0, defRate - unitPrice);
                    return (
                      <div className="mt-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-[11px]">
                        <div>
                          <div className="text-white font-bold">{selectedPkg.name}</div>
                          <div className="text-slate-400 text-[10px]">{selectedPkg.description}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-emerald-400 font-bold font-mono text-xs">
                            {selectedPkg.priceRwf.toLocaleString()} RWF
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {unitPrice.toLocaleString()} RWF/plate
                            {perPlateSaving > 0 && (
                              <span className="text-emerald-400 ml-1">(-{perPlateSaving})</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-400 block mb-1 font-semibold">Plate Count</label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={customTopUpPlates}
                        onChange={(e) => {
                          const p = Math.max(1, parseInt(e.target.value) || 1);
                          const rate = restoStore.getRestaurantDefaultPlatePrice(state.currentRestaurantCode);
                          setCustomTopUpPlates(p);
                          setCustomTopUpPrice(p * rate);
                        }}
                        className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1 font-semibold">Price to Charge (RWF)</label>
                      <input
                        type="number"
                        min={100}
                        value={customTopUpPrice}
                        onChange={(e) => setCustomTopUpPrice(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-emerald-400 font-bold font-mono"
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Baseline Rate: {restoStore.getRestaurantDefaultPlatePrice(state.currentRestaurantCode).toLocaleString()} RWF/p</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      Effective: {customTopUpPlates > 0 ? Math.round(customTopUpPrice / customTopUpPlates).toLocaleString() : 0} RWF / plate
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Payment Method</label>
                <select
                  value={topUpMethod}
                  onChange={(e) => setTopUpMethod(e.target.value as any)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="mtn_momo">MTN Mobile Money</option>
                  <option value="airtel_money">Airtel Money</option>
                  <option value="cash">Cash Payment</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Payment Reference</label>
                <input
                  type="text"
                  value={topUpRef}
                  onChange={(e) => setTopUpRef(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleExecuteTopUp}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
              >
                Confirm Payment &amp; Credit Plates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL MEMBER MANAGEMENT SUITE MODAL */}
      {manageModalOpen && manageCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
              <div className="flex items-center gap-3.5">
                <img
                  src={manageCustomer.photoUrl}
                  alt={manageCustomer.name}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-700 shadow-md shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white">{manageCustomer.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      manageCustomer.cardStatus === 'active'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}>
                      {manageCustomer.cardStatus} · V{manageCustomer.cardVersion}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono flex items-center gap-2 mt-0.5 flex-wrap">
                    <span>Member #{manageCustomer.memberNo}</span>
                    <span>·</span>
                    <span>{manageCustomer.phone}</span>
                    <span>·</span>
                    <span className="text-emerald-400 font-bold">{restoStore.getCustomerBalance(manageCustomer.id)} plates</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setManageModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Sub-Tabs */}
            <div className="flex items-center gap-1 px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs overflow-x-auto">
              {[
                { id: 'cards', label: 'Card & Security Controls', icon: Lock },
                { id: 'edit', label: 'Edit Profile', icon: Edit },
                { id: 'balance', label: 'Balance & Adjustment', icon: DollarSign },
                { id: 'history', label: 'Meal & Account History', icon: Clock },
                { id: 'notify', label: 'Send Direct Alert', icon: Send },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setManageTab(tab.id as any);
                      setEditError(null);
                      setEditSuccess(null);
                      setAdjustError(null);
                      setAdjustSuccess(null);
                      setDirectAlertSuccess(null);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      manageTab === tab.id
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* TAB 1: CARD & SECURITY CONTROLS */}
              {manageTab === 'cards' && (
                <div className="space-y-4">
                  {/* Card Lock / Unlock Control Card */}
                  <div className={`p-4 rounded-2xl border transition-all ${
                    manageCustomer.cardStatus === 'active'
                      ? 'bg-emerald-950/30 border-emerald-800/80'
                      : 'bg-rose-950/30 border-rose-800/80'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {manageCustomer.cardStatus === 'active' ? (
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <ShieldAlert className="w-5 h-5 text-rose-400" />
                          )}
                          <h4 className="font-bold text-white text-sm">
                            Card Status: {manageCustomer.cardStatus.toUpperCase()}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 max-w-lg">
                          {manageCustomer.cardStatus === 'active'
                            ? 'Member card is currently ACTIVE and authorized to redeem meals at all stands.'
                            : 'Member card is currently LOCKED. Scanner stands will block attempts to take meals until reactivated.'}
                        </p>
                      </div>

                      <button
                        onClick={() => handleToggleLock(manageCustomer)}
                        className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-md ${
                          manageCustomer.cardStatus === 'active'
                            ? 'bg-rose-700 hover:bg-rose-600 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {manageCustomer.cardStatus === 'active' ? (
                          <>
                            <Lock className="w-4 h-4" />
                            <span>Lock Card (Report Lost / Hold)</span>
                          </>
                        ) : (
                          <>
                            <Unlock className="w-4 h-4" />
                            <span>Reactivate Card Access</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Card Reissuance Card */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-white text-sm flex items-center gap-2">
                          <Printer className="w-4 h-4 text-emerald-400" />
                          <span>Reissue Physical Badge (Invalidate Previous Card)</span>
                        </h4>
                        <p className="text-slate-400 text-xs mt-1 max-w-lg">
                          Generates card version <strong>V{manageCustomer.cardVersion + 1}</strong>. The member’s previous physical card will be permanently rejected if scanned.
                        </p>
                      </div>

                      <button
                        onClick={() => handleReissueCard(manageCustomer)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
                      >
                        Reissue Card (V{manageCustomer.cardVersion + 1})
                      </button>
                    </div>
                  </div>

                  {/* Phone App Security Key Reissue */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-white text-sm flex items-center gap-2">
                          <Key className="w-4 h-4 text-cyan-400" />
                          <span>Regenerate Phone Security Key (Key V{manageCustomer.keyVersion})</span>
                        </h4>
                        <p className="text-slate-400 text-xs mt-1 max-w-lg">
                          Cycles the member's cryptographic TOTP seed. Useful if a member lost their smartphone, invalidating old digital passes.
                        </p>
                      </div>

                      <button
                        onClick={() => handleReissuePhoneKey(manageCustomer)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
                      >
                        Regenerate Key (V{manageCustomer.keyVersion + 1})
                      </button>
                    </div>
                  </div>

                  {/* Reset PIN to default */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-white text-sm flex items-center gap-2">
                        <Key className="w-4 h-4 text-amber-400" />
                        <span>Security Transfer PIN</span>
                      </h4>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Required for peer plate transfers. Reset to default <strong>1234</strong> if patron forgot their PIN.
                      </p>
                    </div>

                    <button
                      onClick={() => handleResetPin(manageCustomer)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
                    >
                      Reset PIN to 1234
                    </button>
                  </div>

                  {/* QR Token Preview */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">Physical Card Token Payload:</span>
                      <button
                        onClick={() => {
                          const token = restoStore.getCustomerCardQr(manageCustomer);
                          navigator.clipboard?.writeText(token);
                          setManageCopiedToken(true);
                          setTimeout(() => setManageCopiedToken(false), 2500);
                        }}
                        className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {manageCopiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{manageCopiedToken ? 'Copied!' : 'Copy Token'}</span>
                      </button>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black border border-slate-800 font-mono text-[11px] text-emerald-400 break-all">
                      {restoStore.getCustomerCardQr(manageCustomer)}
                    </div>
                  </div>

                  {/* Danger Zone: Permanent Account Deletion */}
                  <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-rose-300 text-sm flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-rose-400" />
                        <span>Delete Customer Account &amp; Revoke Credentials</span>
                      </h4>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Permanently removes this patron's account, invalidates physical badge V{manageCustomer.cardVersion}, and terminates digital pass access.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeleteCustomerConfirmOpen(true)}
                      className="px-4 py-2 rounded-xl bg-rose-900/60 hover:bg-rose-700 border border-rose-700 text-rose-200 hover:text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: EDIT PROFILE */}
              {manageTab === 'edit' && (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  {editError && (
                    <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{editError}</span>
                    </div>
                  )}

                  {editSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{editSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">Phone Number</label>
                      <input
                        type="text"
                        required
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Photo picker */}
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">Member Photo</label>
                    <div className="flex items-center gap-3">
                      <img
                        src={editPhotoUrl}
                        alt="Preview"
                        className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0"
                      />
                      <div className="flex-1 space-y-1.5">
                        <input
                          type="text"
                          value={editPhotoUrl}
                          onChange={(e) => setEditPhotoUrl(e.target.value)}
                          placeholder="Photo image URL..."
                          className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                        />
                        <div className="flex gap-2">
                          {[
                            { label: 'Male Student', url: '/src/assets/images/avatar_student_male_1790979380050.jpg' },
                            { label: 'Female Student', url: '/src/assets/images/avatar_student_female_1790979395277.jpg' },
                            { label: 'Executive/Staff', url: '/src/assets/images/avatar_staff_cashier_1790979410389.jpg' },
                          ].map((av) => (
                            <button
                              key={av.label}
                              type="button"
                              onClick={() => setEditPhotoUrl(av.url)}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 cursor-pointer"
                            >
                              {av.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ID Document Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">Identity Document Type</label>
                      <select
                        value={editIdType}
                        onChange={(e) => setEditIdType(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                      >
                        <option value="student_id">Student ID</option>
                        <option value="national_id">National ID (Indangamuntu)</option>
                        <option value="passport">Passport</option>
                        <option value="driver_license">Driver's License</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">
                        New Document Number <span className="text-slate-500 font-normal">(Leave blank to keep masked)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Enter to update ID number..."
                        value={editIdNumber}
                        onChange={(e) => setEditIdNumber(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Student profile vs Occupation */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editIsStudent}
                        onChange={(e) => setEditIsStudent(e.target.checked)}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-bold text-white">This member is a university / college student</span>
                    </label>

                    {editIsStudent ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="text-slate-400 block mb-1">Institution</label>
                          <input
                            type="text"
                            value={editInstitution}
                            onChange={(e) => setEditInstitution(e.target.value)}
                            className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-1">Academic Programme</label>
                          <input
                            type="text"
                            value={editProgramme}
                            onChange={(e) => setEditProgramme(e.target.value)}
                            className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-1">Study Year</label>
                          <input
                            type="number"
                            min={1}
                            max={6}
                            value={editYear}
                            onChange={(e) => setEditYear(Number(e.target.value))}
                            className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-1">Student Reg #</label>
                          <input
                            type="text"
                            value={editRegNumber}
                            onChange={(e) => setEditRegNumber(e.target.value)}
                            className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="text-slate-400 block mb-1">Occupation / Employer</label>
                        <input
                          type="text"
                          value={editOccupation}
                          onChange={(e) => setEditOccupation(e.target.value)}
                          placeholder="e.g. Campus Lecturer, Hospital Staff"
                          className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors cursor-pointer shadow-md"
                    >
                      Save Profile Updates
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 3: BALANCE & ADJUSTMENTS */}
              {manageTab === 'balance' && (
                <div className="space-y-5">
                  {/* Current Balance Display */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-slate-400 text-xs">Current Meal Balance</div>
                      <div className="text-3xl font-black font-mono text-emerald-400 mt-0.5">
                        {restoStore.getCustomerBalance(manageCustomer.id)} plates
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setTopUpCustomer(manageCustomer);
                        setTopUpModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md cursor-pointer transition-colors"
                    >
                      + Standard Top-Up Bundle
                    </button>
                  </div>

                  {/* Manual Adjustment Form */}
                  <form onSubmit={handleManualAdjustment} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div>
                      <h4 className="font-bold text-white text-sm">Manager Courtesy / Balance Adjustment</h4>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Directly add or deduct plates for customer service courtesy, event meal credits, or cashier billing adjustments.
                      </p>
                    </div>

                    {adjustError && (
                      <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300">
                        {adjustError}
                      </div>
                    )}

                    {adjustSuccess && (
                      <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300">
                        {adjustSuccess}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="font-semibold text-slate-300 block mb-1">Plates Adjustment</label>
                        <select
                          value={adjustDelta}
                          onChange={(e) => setAdjustDelta(Number(e.target.value))}
                          className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold"
                        >
                          <option value={1}>+1 Plate (Courtesy Meal)</option>
                          <option value={2}>+2 Plates</option>
                          <option value={5}>+5 Plates (Promotion)</option>
                          <option value={10}>+10 Plates</option>
                          <option value={-1}>-1 Plate (Correction)</option>
                          <option value={-2}>-2 Plates</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-semibold text-slate-300 block mb-1">Audit Justification Reason</label>
                        <input
                          type="text"
                          required
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          placeholder="e.g. Courtesy meal granted by cafeteria manager"
                          className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold cursor-pointer transition-colors"
                      >
                        Apply Balance Adjustment
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 4: MEAL & TRANSACTION HISTORY */}
              {manageTab === 'history' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Member Transaction &amp; Meal History:</span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {state.ledgerEntries.filter((e) => e.customerId === manageCustomer.id).length} recorded events
                    </span>
                  </div>

                  <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800">
                    {state.ledgerEntries
                      .filter((e) => e.customerId === manageCustomer.id)
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((entry) => (
                        <div key={entry.id} className="p-3 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-200 uppercase font-mono text-[11px]">
                              {entry.type}
                            </div>
                            <div className="text-slate-400 text-[11px]">
                              {entry.reason || entry.reference || 'Dining stand serving'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {new Date(entry.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                          </div>

                          <div className={`text-sm font-black font-mono tabular-nums ${
                            entry.platesDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {entry.platesDelta > 0 ? `+${entry.platesDelta}` : entry.platesDelta} plates
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* TAB 5: SEND DIRECT ALERT & IN-APP NOTIFICATION */}
              {manageTab === 'notify' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                        <Bell className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">
                          Direct Alert to {manageCustomer.name} (#{manageCustomer.memberNo})
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Sends an immediate in-app push notice directly to this member's smartphone pass and alerts center.
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-mono text-xs hidden sm:inline">
                      Phone: {manageCustomer.phone}
                    </span>
                  </div>

                  {directAlertSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span className="font-semibold">{directAlertSuccess}</span>
                    </div>
                  )}

                  {/* Preset Quick Templates */}
                  <div className="space-y-2">
                    <label className="font-semibold text-slate-300 block">
                      Quick Notice Presets (Click to Auto-Fill):
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        {
                          label: '🪪 Badge Ready at Desk',
                          title: 'Physical Badge Ready for Pickup',
                          msg: `Hello ${manageCustomer.name.split(' ')[0]}, your replacement plastic PVC ID card has been printed and verified. Please collect it at the cafeteria manager desk.`,
                          prio: 'important' as NotificationPriority,
                        },
                        {
                          label: '⚠️ Low Meal Balance',
                          title: 'Prepaid Plate Balance Notice',
                          msg: `Your remaining meal balance is low (${restoStore.getCustomerBalance(manageCustomer.id)} plates). Top up via MTN MoMo (*182#) or cashier desk to avoid lunchtime queues.`,
                          prio: 'normal' as NotificationPriority,
                        },
                        {
                          label: '🎁 Courtesy Meal Credit',
                          title: 'Complimentary Meal Credited',
                          msg: `A complimentary meal has been credited to your account by the cafeteria manager. Bon appetit!`,
                          prio: 'normal' as NotificationPriority,
                        },
                        {
                          label: '✅ Card Reactivated',
                          title: 'Card Access Restored',
                          msg: `Your membership card has been verified and reactivated. You can now tap at any buffet stand scanner.`,
                          prio: 'important' as NotificationPriority,
                        },
                        {
                          label: '📋 Verify Student Enrollment',
                          title: 'Student Status Verification Required',
                          msg: `Please present your student ID card or proof of university enrollment at the front desk to maintain your student discounted meal bundle rate.`,
                          prio: 'urgent' as NotificationPriority,
                        },
                      ].map((t) => (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => {
                            setDirectAlertTitle(t.title);
                            setDirectAlertMessage(t.msg);
                            setDirectAlertPriority(t.prio);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Compose Form */}
                  <form onSubmit={handleSendDirectAlertFromModal} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="font-semibold text-slate-300 block mb-1">Alert Title</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Card Badge Ready for Collection..."
                          value={directAlertTitle}
                          onChange={(e) => setDirectAlertTitle(e.target.value)}
                          className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-emerald-500 outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-slate-300 block mb-1">Priority</label>
                        <select
                          value={directAlertPriority}
                          onChange={(e) => setDirectAlertPriority(e.target.value as any)}
                          className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-emerald-500 outline-hidden"
                        >
                          <option value="normal">Normal (Information)</option>
                          <option value="important">Important (Action Needed)</option>
                          <option value="urgent">Urgent (Immediate Attention)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">Message Body</label>
                      <textarea
                        required
                        rows={3}
                        placeholder="Write the personalized message to this member..."
                        value={directAlertMessage}
                        onChange={(e) => setDirectAlertMessage(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs resize-none focus:border-emerald-500 outline-hidden"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500">
                        Will appear on patron's digital pass with an unread badge.
                      </span>

                      <button
                        type="submit"
                        disabled={!directAlertTitle.trim() || !directAlertMessage.trim()}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Direct Alert</span>
                      </button>
                    </div>
                  </form>

                  {/* Customer's Notification History */}
                  <div className="space-y-2.5 pt-2">
                    <h5 className="font-bold text-white text-xs flex items-center justify-between">
                      <span>Previously Sent to this Member:</span>
                      <span className="text-slate-500 font-mono text-[10px]">
                        {restoStore.getCustomerNotifications(manageCustomer.id, manageCustomer.restaurantCode).length} messages
                      </span>
                    </h5>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {restoStore.getCustomerNotifications(manageCustomer.id, manageCustomer.restaurantCode).length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-500 text-xs">
                          No notifications delivered yet to this customer.
                        </div>
                      ) : (
                        restoStore.getCustomerNotifications(manageCustomer.id, manageCustomer.restaurantCode).map((n) => {
                          const isRead = n.readByCustomerIds.includes(manageCustomer.id);
                          return (
                            <div key={n.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white text-xs">{n.title}</span>
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                                    n.priority === 'urgent'
                                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                      : n.priority === 'important'
                                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  }`}>
                                    {n.priority}
                                  </span>
                                  <span className={`text-[10px] font-mono ${isRead ? 'text-emerald-400' : 'text-slate-500'}`}>
                                    {isRead ? '✓ Read' : 'Unread'}
                                  </span>
                                </div>
                                <p className="text-slate-300 text-xs mt-0.5 line-clamp-2">{n.message}</p>
                                <div className="text-[10px] text-slate-500 font-mono mt-1">
                                  {new Date(n.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} · By {n.senderName}
                                </div>
                              </div>

                              <button
                                onClick={() => restoStore.deleteNotification(n.id, 'Manager')}
                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 hover:text-rose-400 text-slate-500 transition-colors cursor-pointer"
                                title="Recall / delete notification"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE PACKAGE MODAL */}
      {createPkgModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Create New Meal Package</h3>
                  <p className="text-xs text-slate-400">Add a custom subscription bundle for this cafeteria</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreatePkgModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            {newPkgError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{newPkgError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePackage} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Package Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 20 Plates Monthly Saver"
                  value={newPkgName}
                  onChange={(e) => setNewPkgName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Plate Count <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={newPkgPlates}
                    onChange={(e) => setNewPkgPlates(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Price (RWF) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    required
                    value={newPkgPrice}
                    onChange={(e) => setNewPkgPrice(Math.max(100, parseInt(e.target.value) || 100))}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-emerald-400 font-mono font-bold focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Live Unit Rate Calculation */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">Effective Rate:</span>
                <span className="text-emerald-400 font-bold">
                  {newPkgPlates > 0 ? Math.round(newPkgPrice / newPkgPlates).toLocaleString() : 0} RWF / plate
                </span>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Description / Serving Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Recommended for 2 weeks of lunch buffets"
                  value={newPkgDescription}
                  onChange={(e) => setNewPkgDescription(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreatePkgModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-md"
                >
                  Create Package
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PACKAGE MODAL */}
      {editingPackage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Package Pricing</h3>
                  <p className="text-xs text-slate-400">Update rates for {editingPackage.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPackage(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            {editPkgError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editPkgError}</span>
              </div>
            )}

            {editPkgSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{editPkgSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditPackage} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Package Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editPkgName}
                  onChange={(e) => setEditPkgName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Plate Count <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={editPkgPlates}
                    onChange={(e) => setEditPkgPlates(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Price (RWF) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    required
                    value={editPkgPrice}
                    onChange={(e) => setEditPkgPrice(Math.max(100, parseInt(e.target.value) || 100))}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-emerald-400 font-mono font-bold focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Dynamic Rate Calculation */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">Effective Rate:</span>
                <span className="text-emerald-400 font-bold">
                  {editPkgPlates > 0 ? Math.round(editPkgPrice / editPkgPlates).toLocaleString() : 0} RWF / plate
                </span>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editPkgDescription}
                  onChange={(e) => setEditPkgDescription(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPackage(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Toast Notification */}
      {actionToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-emerald-500/80 text-white shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs font-semibold">{actionToast}</div>
        </div>
      )}

      {/* EXPORT TRANSACTIONS MODAL */}
      <ExportTransactionsModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        restaurantCode={state.currentRestaurantCode}
      />

      {/* Quick Download Toast Notification */}
      {exportToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-emerald-950 border border-emerald-600 text-white shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs font-semibold">{exportToast}</div>
        </div>
      )}

      {/* DELETE CUSTOMER CONFIRMATION MODAL */}
      {deleteCustomerConfirmOpen && manageCustomer && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white">Permanently Delete Member?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete member <strong>{manageCustomer.name} (#{manageCustomer.memberNo})</strong>?
              This action will revoke physical card V{manageCustomer.cardVersion}, digital passes, and remove their account from active cafeteria rosters.
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteCustomerConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCustomer(manageCustomer)}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                Yes, Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
