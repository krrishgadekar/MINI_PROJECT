import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Share2,
  Receipt,
  GitCommit,
  ShieldAlert,
  Users,
  Bell,
  Activity,
  Settings,
  LogOut,
  X,
  Layers,
  Search,
} from 'lucide-react';
import { useUiStore } from '../store/useUiStore';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../state/AuthProvider';
import { useGroup } from '../state/GroupProvider';
import { TaxBadge } from './tax/TaxBadge';
import Logo from './Logo';

export const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/network', icon: Share2, label: 'Network' },
  { to: '/ledger', icon: Receipt, label: 'Ledger' },
  { to: '/settle', icon: GitCommit, label: 'Settle' },
  { to: '/risk', icon: ShieldAlert, label: 'Risk' },
  { to: '/groups', icon: Users, label: 'Groups' },
  { to: '/inbox', icon: Bell, label: 'Inbox', hasBadge: true },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { sidebarOpen, closeSidebar } = useUiStore();
  const { data: notifData } = useNotifications();
  const unreadCount = notifData?.unreadCount ?? 0;

  const { merchant, groups, logout } = useAuth();
  const { activeGroupId, activeGroup, setActiveGroup } = useGroup();

  const userName = merchant?.name || 'Wholesale_A';
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const userRole = activeGroup
    ? `${activeGroup.name} · ${activeGroup.role}`
    : (merchant?.email || 'Member');

  const handleLogout = () => {
    logout();
    closeSidebar();
    navigate('/login');
  };

  return (
    <>
      {/* Backdrop for mobile <=768px */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
          }}
          aria-hidden="true"
        />
      )}

      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`} style={{ zIndex: 999 }}>
        {/* Brand Header */}
        <div className="sidebar-brand" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={32} />
            <div className="sidebar-brand-text">
              <h1>CreditFlow</h1>
              <p>Debt Settlement Platform</p>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            onClick={closeSidebar}
            className="mobile-close-btn"
            style={{
              display: sidebarOpen ? 'flex' : 'none',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
            }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Group Switcher */}
        <div
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={13} style={{ color: 'var(--text-muted)' }} />
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                }}
              >
                Your Group
              </span>
            </div>
            {activeGroup && (
              <TaxBadge domain={activeGroup.domain || 'none'} size="xs" />
            )}
          </div>
          <select
            value={activeGroupId ?? ''}
            onChange={(e) => setActiveGroup(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 6,
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {groups.length === 0 ? (
              <option value="">No Groups Joined</option>
            ) : (
              groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name} [{g.role}]
                </option>
              ))
            )}
          </select>
        </div>

        {/* Quick Search Button */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-primary)' }}>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={14} color="var(--text-muted)" />
              <span>Search...</span>
            </div>
            <kbd
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#ffffff',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-muted)',
              }}
            >
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Navigation Links */}
        <div className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' active' : ''}`
              }
            >
              <item.icon className="sidebar-icon" size={18} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.hasBadge && unreadCount > 0 && (
                <span
                  style={{
                    background: 'var(--brand-terracotta)',
                    color: '#ffffff',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 10,
                    lineHeight: 1.2,
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </NavLink>
          ))}

          <div style={{ flex: 1, minHeight: 12 }} />

          <button
            className="sidebar-link"
            onClick={handleLogout}
            style={{
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              color: 'var(--color-danger)',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <LogOut className="sidebar-icon" size={16} style={{ color: 'var(--color-danger)' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Log Out
            </span>
          </button>
        </div>

        {/* User Profile Footer */}
        <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div
            className="sidebar-user sidebar-user-link"
            onClick={() => {
              closeSidebar();
              navigate('/profile');
            }}
            style={{ flex: 1, minWidth: 0, padding: 4 }}
          >
            <div className="sidebar-avatar">{userInitials}</div>
            <div className="sidebar-user-info" style={{ overflow: 'hidden' }}>
              <div className="sidebar-user-name" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {userName}
              </div>
              <div className="sidebar-user-role" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {userRole}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
