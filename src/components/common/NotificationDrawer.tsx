import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import { AppNotification, NotificationPriority, NotificationType } from '../../types';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  AlertTriangle,
  Info,
  ShieldAlert,
  ShieldCheck,
  Utensils,
  DollarSign,
  ArrowRightLeft,
  Megaphone,
  Clock,
  Send,
  ExternalLink,
} from 'lucide-react';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tabId: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const state = restoStore.getState();
  const currentCustomer = restoStore.getCurrentCustomer();
  const isCustomer = state.currentRole === 'customer';
  const isAdmin = state.currentRole === 'restaurant_admin';

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'broadcast' | 'alerts'>('all');

  if (!isOpen) return null;

  // Retrieve relevant notifications
  const rawNotifications: AppNotification[] = isCustomer && currentCustomer
    ? restoStore.getCustomerNotifications(currentCustomer.id, state.currentRestaurantCode)
    : restoStore.getRestaurantNotifications(state.currentRestaurantCode);

  const notifications = rawNotifications.filter((n) => {
    if (activeFilter === 'unread' && isCustomer && currentCustomer) {
      return !n.readByCustomerIds.includes(currentCustomer.id);
    }
    if (activeFilter === 'broadcast') {
      return n.target === 'all' || n.type === 'system_broadcast';
    }
    if (activeFilter === 'alerts') {
      return n.type === 'low_balance' || n.type === 'card_security' || n.priority === 'urgent';
    }
    return true;
  });

  const unreadCount = isCustomer && currentCustomer
    ? restoStore.getUnreadNotificationCount(currentCustomer.id)
    : 0;

  const handleMarkAllRead = () => {
    if (isCustomer && currentCustomer) {
      restoStore.markAllNotificationsAsRead(currentCustomer.id);
    }
  };

  const handleNotificationClick = (notif: AppNotification) => {
    if (isCustomer && currentCustomer) {
      restoStore.markNotificationAsRead(notif.id, currentCustomer.id);
    }
    if (notif.actionTab && onNavigateTab) {
      onNavigateTab(notif.actionTab);
      onClose();
    }
  };

  const handleDeleteNotif = (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    restoStore.deleteNotification(notifId, 'Manager');
  };

  const getNotificationIcon = (type: NotificationType, priority: NotificationPriority) => {
    switch (type) {
      case 'low_balance':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'meal_served':
        return <Utensils className="w-4 h-4 text-emerald-400" />;
      case 'topup_success':
        return <DollarSign className="w-4 h-4 text-emerald-400" />;
      case 'card_security':
        return priority === 'urgent' ? (
          <ShieldAlert className="w-4 h-4 text-rose-400" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
        );
      case 'plate_transfer':
        return <ArrowRightLeft className="w-4 h-4 text-purple-400" />;
      case 'balance_adjustment':
        return <DollarSign className="w-4 h-4 text-blue-400" />;
      case 'system_broadcast':
      case 'admin_direct':
      default:
        return priority === 'urgent' ? (
          <AlertTriangle className="w-4 h-4 text-rose-400" />
        ) : (
          <Megaphone className="w-4 h-4 text-amber-400" />
        );
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const date = new Date(iso);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / (60 * 1000));
      const diffHours = Math.floor(diffMs / (3600 * 1000));
      const diffDays = Math.floor(diffMs / (24 * 3600 * 1000));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[11px] font-mono">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {isCustomer && currentCustomer
                  ? `Alerts for ${currentCustomer.name} (#${currentCustomer.memberNo})`
                  : `Live broadcast & system alert feed`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isCustomer && unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                title="Mark all as read"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Read all</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => {
                  if (onNavigateTab) onNavigateTab('notifications');
                  onClose();
                }}
                title="Open full Notifications Studio"
                className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Compose</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Strip */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs overflow-x-auto">
          {[
            { id: 'all', label: 'All' },
            ...(isCustomer ? [{ id: 'unread', label: `Unread (${unreadCount})` }] : []),
            { id: 'broadcast', label: 'Announcements' },
            { id: 'alerts', label: 'Security & Alerts' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id as any)}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeFilter === f.id
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Notification Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-slate-500 flex items-center justify-center mx-auto">
                <Bell className="w-5 h-5 opacity-40" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-300">No notifications here</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  You are all caught up with alerts and cafeteria updates.
                </p>
              </div>
            </div>
          ) : (
            notifications.map((n) => {
              const isUnread = isCustomer && currentCustomer
                ? !n.readByCustomerIds.includes(currentCustomer.id)
                : false;

              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative group ${
                    isUnread
                      ? 'bg-slate-800/90 border-emerald-500/40 shadow-sm'
                      : 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700 hover:bg-slate-850'
                  }`}
                >
                  {isUnread && (
                    <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                  )}

                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      n.priority === 'urgent'
                        ? 'bg-rose-500/10 border border-rose-500/30'
                        : n.priority === 'important'
                        ? 'bg-amber-500/10 border border-amber-500/30'
                        : 'bg-slate-800 border border-slate-700'
                    }`}>
                      {getNotificationIcon(n.type, n.priority)}
                    </div>

                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-xs leading-snug">
                          {n.title}
                        </span>

                        {n.priority === 'urgent' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-800">
                            Urgent
                          </span>
                        )}
                        {n.priority === 'important' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-950 text-amber-300 border border-amber-800">
                            Important
                          </span>
                        )}
                      </div>

                      <p className="text-slate-300 text-xs mt-1 leading-relaxed break-words">
                        {n.message}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-2 pt-2 border-t border-slate-800/60">
                        <div className="flex items-center gap-1.5 truncate">
                          <span>{n.senderName}</span>
                          {n.target === 'all' && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-sans">
                              Broadcast
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="flex items-center gap-1 text-[10px]">
                            <Clock className="w-3 h-3 opacity-60" />
                            {formatTimestamp(n.timestamp)}
                          </span>

                          {isAdmin && (
                            <button
                              onClick={(e) => handleDeleteNotif(e, n.id)}
                              title="Delete notification"
                              className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {n.actionTab && (
                        <div className="mt-2 text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                          <span>View in {n.actionTab.replace('_', ' ')}</span>
                          <ExternalLink className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/80 text-center text-[11px] text-slate-500">
          Autogenerated &amp; Admin-Issued Cafeteria Notification System
        </div>
      </div>
    </div>
  );
};
