import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../hooks/useNotifications';
import { Skeleton, EmptyState, Badge } from '../components/ui';
import { Bell, CheckCheck, Clock, ShieldAlert, CreditCard, RefreshCw } from 'lucide-react';

/**
 * Inbox — Realtime notifications, alerts, and risk flags (Slice C).
 */
export default function Inbox() {
  const { data, isLoading, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Notification Inbox</h1>
            {unreadCount > 0 && <Badge variant="warning">{unreadCount} Unread</Badge>}
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Real-time credit alerts, counterparty debt events, and settlement confirmations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => refetch()}
            className="btn btn--secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
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

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <Skeleton width="30%" height={16} style={{ marginBottom: 10 }} />
              <Skeleton width="80%" height={20} />
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="You are fully caught up. Credit and settlement updates will appear here in real-time."
          icon={<Bell size={32} />}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notifications.map((notif) => {
            const isUnread = !notif.readAt;
            const isRisk = notif.type.startsWith('risk');
            const isDebt = notif.type.startsWith('debt');

            return (
              <div
                key={notif.id}
                className="card"
                style={{
                  padding: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderLeft: isUnread
                    ? isRisk
                      ? '4px solid var(--risk-critical)'
                      : '4px solid var(--accent)'
                    : '4px solid var(--border-secondary)',
                  background: isUnread ? 'var(--bg-elevated)' : 'var(--bg-glass)',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: isRisk ? 'var(--risk-critical-bg)' : 'var(--accent-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isRisk ? (
                      <ShieldAlert size={20} color="var(--risk-critical)" />
                    ) : isDebt ? (
                      <CreditCard size={20} color="var(--teal)" />
                    ) : (
                      <Bell size={20} color="var(--accent-light)" />
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: isUnread ? 700 : 500, color: 'var(--text-primary)' }}>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
