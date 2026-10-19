import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../hooks/useNotifications';
import { useDebts, useConfirmDebt, useRejectDebt } from '../hooks/useDebts';
import { Skeleton, EmptyState, Badge } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import {
  Bell,
  CheckCheck,
  Clock,
  ShieldAlert,
  CreditCard,
  RefreshCw,
  ArrowRight,
  Check,
  X,
  FileText,
  AlertCircle,
} from 'lucide-react';

export default function Inbox() {
  const navigate = useNavigate();
  const { success, error } = useToast();

  const { data: notifData, isLoading: notifLoading, refetch: refetchNotifs } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Pending Debts Approval Flow
  const { data: pendingDebtsData, isLoading: debtsLoading, refetch: refetchDebts } = useDebts({ status: 'pending' });
  const confirmDebt = useConfirmDebt();
  const rejectDebt = useRejectDebt();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const notifications = notifData?.notifications || [];
  const unreadCount = notifData?.unreadCount || 0;

  const pendingDebts = useMemo(() => {
    return pendingDebtsData?.debts || [];
  }, [pendingDebtsData]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n: any) => !n.readAt);
    }
    return notifications;
  }, [notifications, filter]);

  const handleDeepLink = (notif: any) => {
    // Mark as read when navigating
    if (!notif.readAt) {
      markRead.mutate(notif.id);
    }

    if (notif.refType === 'debt' && notif.refId) {
      navigate(`/ledger/${notif.refId}`);
    } else if (notif.refType === 'settlement' || notif.type.startsWith('settlement')) {
      navigate('/settle');
    } else if (notif.refType === 'risk' || notif.type.startsWith('risk')) {
      navigate('/risk');
    }
  };

  const handleApproveDebt = (id: string) => {
    confirmDebt.mutate(id, {
      onSuccess: () => {
        success('Debt agreement confirmed and activated.');
        refetchDebts();
      },
      onError: (err: any) => {
        error(err?.message || 'Failed to confirm debt.');
      },
    });
  };

  const handleRejectDebt = (id: string) => {
    rejectDebt.mutate(id, {
      onSuccess: () => {
        success('Debt agreement request rejected.');
        refetchDebts();
      },
      onError: (err: any) => {
        error(err?.message || 'Failed to reject debt.');
      },
    });
  };

  return (
    <div className="animate-fade-in" style={{ padding: 'var(--content-padding)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Notification &amp; Approval Inbox</h1>
            {unreadCount > 0 && <Badge variant="warning">{unreadCount} Unread</Badge>}
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Real-time credit alerts, counterparty debt approval requests, and settlement confirmations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              refetchNotifs();
              refetchDebts();
            }}
            className="btn btn--secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate(undefined, { onSuccess: () => success('All notifications marked as read') })}
              className="btn btn--primary"
              disabled={markAllRead.isPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <CheckCheck size={16} />
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Pending Debt Requests (Awaiting Confirmation) */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} color="var(--accent-light)" />
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>Pending Debt Approval Requests</h2>
            {pendingDebts.length > 0 && <Badge variant="warning">{pendingDebts.length} Pending</Badge>}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Debts require mutual counterparty sign-off before entering the settlement network
          </span>
        </div>

        {debtsLoading ? (
          <Skeleton height={50} />
        ) : pendingDebts.length === 0 ? (
          <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            No pending debt requests awaiting your approval.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingDebts.map((debt: any) => (
              <div
                key={debt._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 14,
                  background: 'var(--bg-elevated)',
                  borderRadius: 8,
                  border: '1px solid var(--border-secondary)',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                    ₹{debt.amount.toLocaleString()} obligation
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    Note: {debt.note || 'No note specified'} · Due: {debt.dueDate ? new Date(debt.dueDate).toLocaleDateString() : 'Immediate'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleApproveDebt(debt._id)}
                    disabled={confirmDebt.isPending}
                    className="btn btn--primary"
                    style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Check size={14} />
                    Approve
                  </button>
                  <button
                    onClick={() => handleRejectDebt(debt._id)}
                    disabled={rejectDebt.isPending}
                    className="btn btn--secondary"
                    style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <X size={14} />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Realtime Notifications Feed */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={18} color="var(--teal)" />
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>Activity &amp; Alert Feed</h2>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setFilter('all')}
              className={`btn ${filter === 'all' ? 'btn--primary' : 'btn--secondary'}`}
              style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`btn ${filter === 'unread' ? 'btn--primary' : 'btn--secondary'}`}
              style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}
            >
              Unread
            </button>
          </div>
        </div>

        {notifLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="card" style={{ padding: 16 }}>
                <Skeleton width="40%" height={16} style={{ marginBottom: 8 }} />
                <Skeleton width="75%" height={18} />
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <EmptyState
            title="Inbox Zero"
            description="You are fully caught up. Credit and settlement updates will arrive here automatically in real time."
            icon={<Bell size={32} />}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredNotifications.map((notif: any) => {
              const isUnread = !notif.readAt;
              const isRisk = notif.type.startsWith('risk');
              const isDebt = notif.type.startsWith('debt');
              const isSettlement = notif.type.startsWith('settlement') || notif.type.includes('cycle');

              return (
                <div
                  key={notif.id}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderLeft: isUnread
                      ? isRisk
                        ? '4px solid var(--risk-critical)'
                        : '4px solid var(--accent)'
                      : '4px solid var(--border-secondary)',
                    background: isUnread ? 'var(--bg-elevated)' : 'var(--bg-card)',
                    border: '1px solid var(--border-primary)',
                    transition: 'all var(--transition-fast)',
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: isRisk
                          ? 'var(--risk-critical-bg)'
                          : isSettlement
                          ? 'var(--accent-subtle)'
                          : 'var(--teal-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isRisk ? (
                        <ShieldAlert size={20} color="var(--risk-critical)" />
                      ) : isDebt ? (
                        <CreditCard size={20} color="var(--teal)" />
                      ) : (
                        <AlertCircle size={20} color="var(--accent-light)" />
                      )}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: isUnread ? 700 : 500, color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)' }}>
                          {notif.message}
                        </span>
                        {isUnread && <Badge variant="danger">New</Badge>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                        <Clock size={12} />
                        <span>{new Date(notif.createdAt).toLocaleTimeString()} · {new Date(notif.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {notif.refType && (
                      <button
                        onClick={() => handleDeepLink(notif)}
                        className="btn btn--secondary"
                        style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        View {notif.refType}
                        <ArrowRight size={12} />
                      </button>
                    )}

                    {isUnread && (
                      <button
                        onClick={() => markRead.mutate(notif.id)}
                        className="btn btn--secondary"
                        style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px' }}
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
