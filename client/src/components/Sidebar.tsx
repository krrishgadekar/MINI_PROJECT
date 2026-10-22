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

export const navItems = [
  { to: '/', code: '01', icon: LayoutDashboard, label: 'Overview' },
  { to: '/network', code: '02', icon: Share2, label: 'Network' },
  { to: '/ledger', code: '03', icon: Receipt, label: 'Ledger' },
  { to: '/settle', code: '04', icon: GitCommit, label: 'Settle' },
  { to: '/risk', code: '05', icon: ShieldAlert, label: 'Risk' },
  { to: '/groups', code: '06', icon: Users, label: 'Groups' },
  { to: '/inbox', code: '07', icon: Bell, label: 'Inbox', hasBadge: true },
  { to: '/activity', code: '08', icon: Activity, label: 'Activity' },
  { to: '/settings', code: '09', icon: Settings, label: 'Settings' },
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
    : (merchant?.email || 'Circle Owner · CreditFlow');

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
            background: 'rgba(13, 24, 41, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
          }}
          aria-hidden="true"
        />
      )}

      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`} style={{ zIndex: 999 }}>
        {/* Brand — Illoca Architectural Studio Header */}
        <div className="sidebar-brand" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Illoca Geometric Mark */}
            <div
              style={{
                width: 30,
                height: 30,
                border: '1.5px solid #0d2247',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: 2,
                gap: 2,
                background: '#ffffff',
                flexShrink: 0,
              }}
            >
              <div style={{ background: '#0d2247' }} />
              <div style={{ background: '#c8502a' }} />
              <div style={{ background: '#1e6b4b' }} />
              <div style={{ border: '1px solid #0d2247' }} />
            </div>

            <div className="sidebar-brand-text">
              <h1>CreditFlow</h1>
              <p>DEBT OS // SPEC 2.4</p>
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

        {/* Group Switcher Dropdown (Architectural Specification Field) */}
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #e8e2d8',
            background: '#faf7f2',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <Layers size={12} style={{ color: '#0d2247' }} />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              MARKET CIRCLE
            </span>
          </div>
          <select
            value={activeGroupId ?? ''}
            onChange={(e) => setActiveGroup(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: 2,
              background: '#ffffff',
              color: '#0d1829',
              border: '1px solid #dcd5cb',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
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
                  {g.name} [{g.role.toUpperCase()}]
                </option>
              ))
            )}
          </select>
        </div>

        {/* Quick Search Button (triggers Ctrl+K) */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #f0ebe2' }}>
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
              padding: '6px 10px',
              borderRadius: 2,
              background: '#ffffff',
              border: '1px solid #dcd5cb',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Search size={12} color="#0d2247" />
              <span>SEARCH...</span>
            </div>
            <kbd
              style={{
                fontSize: 9,
                padding: '2px 4px',
                borderRadius: 2,
                background: '#f4f0eb',
                border: '1px solid #dcd5cb',
                color: '#0d2247',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ^K
            </kbd>
          </button>
        </div>

        {/* Navigation Links with Monospace Sequence Indicators */}
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
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  width: 18,
                  fontWeight: 600,
                }}
              >
                {item.code}
              </span>
              <item.icon className="sidebar-icon" size={16} />
              <span style={{ flex: 1, letterSpacing: '-0.01em' }}>{item.label}</span>
              {item.hasBadge && unreadCount > 0 && (
                <span
                  style={{
                    background: '#c8502a',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    padding: '2px 5px',
                    borderRadius: 2,
                    lineHeight: 1,
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
              border: '1px solid #e8e2d8',
              background: '#faf8f4',
              color: '#c8502a',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 2,
            }}
          >
            <LogOut className="sidebar-icon" size={15} style={{ color: '#c8502a' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600 }}>
              DISCONNECT
            </span>
          </button>
        </div>

        {/* User Profile Footer — Architectural Sign-off Stamp */}
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
