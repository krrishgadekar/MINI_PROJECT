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
} from 'lucide-react';
import { useUiStore } from '../store/useUiStore';
import { useNotifications } from '../hooks/useNotifications';

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

  const handleLogout = () => {
    localStorage.removeItem('creditflow_token');
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
            <div className="sidebar-avatar">PG</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">Parth Goggi</div>
              <div className="sidebar-user-role">Slice C · Risk Engine</div>
              <div className="sidebar-user-view">View Profile</div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
