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
  Sparkles,
  X,
  Layers,
  Search,
} from 'lucide-react';
import { useUiStore } from '../store/useUiStore';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../state/AuthProvider';
import { useGroup } from '../state/GroupProvider';

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

  const userName = merchant?.name || 'Parth Goggi';
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const userRole = activeGroup
    ? `${activeGroup.name} · ${activeGroup.role}`
    : (merchant?.email || 'Slice C · Risk Engine');

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
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
          }}
          aria-hidden="true"
        />
      )}

      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`} style={{ zIndex: 999 }}>
        {/* Brand */}
        <div className="sidebar-brand" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="sidebar-brand-icon">
              <Sparkles size={18} />
            </div>
            <div className="sidebar-brand-text">
              <h1>CreditFlow</h1>
              <p>Smart Settlements</p>
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
            <X size={20} />
          </button>
        </div>

        {/* Group Switcher Dropdown (FE-03) */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Layers size={13} style={{ color: 'var(--accent-light, #a78bfa)' }} />
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted, #94a3b8)',
              }}
            >
              Active Group
            </span>
          </div>
          <select
            value={activeGroupId ?? ''}
            onChange={(e) => setActiveGroup(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'var(--bg-card, #1e293b)',
              color: 'var(--text-primary, #f1f5f9)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {groups.length === 0 ? (
              <option value="">No Groups Joined</option>
            ) : (
              groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name} ({g.role})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Quick Search Button (triggers Ctrl+K) */}
        <div style={{ padding: '8px 16px' }}>
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
              borderRadius: 8,
              background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.04))',
              border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.08))',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={14} />
              <span>Search...</span>
            </div>
            <kbd style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: 'var(--bg-elevated, rgba(255, 255, 255, 0.1))', color: 'var(--text-secondary)' }}>
              Ctrl+K
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
              style={{ position: 'relative' }}
            >
              <item.icon className="sidebar-icon" size={19} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.hasBadge && unreadCount > 0 && (
                <span
                  style={{
                    background: 'var(--risk-critical)',
                    color: '#ffffff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '10px',
                    lineHeight: 1,
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </NavLink>
          ))}

          <div style={{ flex: 1, minHeight: 16 }} />

          <button
            className="sidebar-link"
            onClick={handleLogout}
            style={{
              border: 'none',
              background: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <LogOut className="sidebar-icon" size={19} />
            <span>Logout</span>
          </button>
        </div>

        {/* User Profile Footer */}
        <div className="sidebar-footer">
          <div
            className="sidebar-user sidebar-user-link"
            onClick={() => {
              closeSidebar();
              navigate('/profile');
            }}
          >
            <div className="sidebar-avatar">{userInitials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{userName}</div>
              <div className="sidebar-user-role">{userRole}</div>
              <div className="sidebar-user-view">View Profile</div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
