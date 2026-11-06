import React from 'react';
import { AppNotification, Customer } from '../../types';
import { CustomerPortalPage } from './CustomerPortalLayout';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Utensils,
  DollarSign,
  ShieldAlert,
  ArrowRightLeft,
  Megaphone,
  Clock,
  ExternalLink,
} from 'lucide-react';

export type CustomerNotificationFilter = 'all' | 'unread' | 'broadcast' | 'alerts';

interface CustomerNotificationsPageProps {
  customer: Customer;
  notifications: AppNotification[];
  unreadNotifCount: number;
  activeFilter: CustomerNotificationFilter;
  onChangeFilter: (filter: CustomerNotificationFilter) => void;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onNavigatePage: (page: CustomerPortalPage) => void;
}

export const CustomerNotificationsPage: React.FC<CustomerNotificationsPageProps> = ({
  customer,
  notifications,
  unreadNotifCount,
  activeFilter,
  onChangeFilter,
  onMarkAsRead,
  onMarkAllAsRead,
  onNavigatePage,
}) => {
  // Strictly enforce tenant and customer scoping
  const scopedNotifications = notifications.filter(
    (n) =>
      n.restaurantCode === customer.restaurantCode &&
      (n.target === 'all' || n.target === customer.id || (n.target === 'students' && customer.isStudent))
  );

  const filteredNotifs = scopedNotifications.filter((n) => {
    if (activeFilter === 'unread') return !n.readByCustomerIds.includes(customer.id);
    if (activeFilter === 'broadcast') return n.target === 'all' || n.type === 'system_broadcast';
    if (activeFilter === 'alerts') {
      return (
        n.type === 'low_balance' ||
        n.type === 'card_security' ||
        n.type === 'meal_served' ||
        n.type === 'topup_success' ||
        n.type === 'plate_transfer'
      );
    }
    return true;
  });

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-400" />
              <span>Notifications &amp; Announcements</span>
              {unreadNotifCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs">
                  {unreadNotifCount} unread
                </span>
              )}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Restaurant announcements, meal deductions, and security notices for #{customer.memberNo}
            </p>
          </div>

          {unreadNotifCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <CheckCheck className="w-4 h-4 text-emerald-400" />
              <span>Mark all read</span>
            </button>
          )}
        </div>

        <div className="flex gap-1.5 p-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs sm:text-sm overflow-x-auto">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: `Unread (${unreadNotifCount})` },
            { id: 'broadcast', label: 'Announcements' },
            { id: 'alerts', label: 'Meal & Security Alerts' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChangeFilter(f.id as CustomerNotificationFilter)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap ${
                activeFilter === f.id
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filteredNotifs.length === 0 ? (
        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Bell className="w-6 h-6 opacity-60" />
          </div>
          <div className="text-sm font-bold text-slate-200">No notifications in this category</div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xs mx-auto">
            When you redeem meals at dining stands or your restaurant posts announcements, they appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifs.map((n) => {
            const isUnread = !n.readByCustomerIds.includes(customer.id);
            return (
              <div
                key={n.id}
                onClick={() => onMarkAsRead(n.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                  isUnread
                    ? 'bg-slate-800/90 border-emerald-500/60 shadow-md'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                {isUnread && (
                  <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-emerald-400" />
                )}

                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      n.priority === 'urgent'
                        ? 'bg-rose-500/15 border border-rose-500/40 text-rose-300'
                        : n.priority === 'important'
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                        : 'bg-slate-800 border border-slate-700 text-emerald-300'
                    }`}
                  >
                    {n.type === 'low_balance' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : n.type === 'meal_served' ? (
                      <Utensils className="w-4 h-4 text-emerald-400" />
                    ) : n.type === 'topup_success' ? (
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                    ) : n.type === 'card_security' ? (
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                    ) : n.type === 'plate_transfer' ? (
                      <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                    ) : (
                      <Megaphone className="w-4 h-4 text-amber-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm leading-snug">{n.title}</span>
                    </div>

                    <p className="text-slate-200 text-sm mt-1 leading-relaxed">{n.message}</p>

                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono mt-2.5 pt-2 border-t border-slate-800">
                      <span>{n.senderName}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 opacity-70" />
                        {new Date(n.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} ·{' '}
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {n.actionTab && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsRead(n.id);
                          if (n.actionTab === 'history') onNavigatePage('activity');
                          else if (n.actionTab === 'my_card') onNavigatePage('my_card');
                        }}
                        className="mt-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                      >
                        <span>Open in {n.actionTab === 'my_card' ? 'My Card' : 'Activity'}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

