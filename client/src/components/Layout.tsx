import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import { Menu, Bell, LogOut } from 'lucide-react';
import { useUiStore } from '../store/useUiStore';
import { useNotifications } from '../hooks/useNotifications';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../state/AuthProvider';
import Logo from './Logo';

import DemoPresentationBar from './DemoPresentationBar';

/**
 * Layout — App shell with responsive sidebar + topbar + content area.
 */
export default function Layout() {
  const { toggleSidebar, sidebarCollapsed } = useUiStore();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: notifData } = useNotifications();
  const unreadCount = notifData?.unreadCount ?? 0;

  // Mount realtime Socket.io connection once for the entire app
  useSocket();

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette />

      {/* Mobile Top Header (visible at <= 768px) */}
      <header className="mobile-topbar">
        <button
          onClick={toggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            padding: 6,
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>

        <div
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <Logo size={26} />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
            CreditFlow
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Notification Bell */}
          <button
            onClick={() => navigate('/inbox')}
            style={{
              position: 'relative',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="View notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--color-danger)',
                }}
              />
            )}
          </button>

          {/* Quick Logout Button */}
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            style={{
              background: 'var(--color-danger-bg)',
              border: '1px solid rgba(200, 80, 42, 0.2)',
              color: 'var(--color-danger)',
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Log Out"
            aria-label="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <Sidebar />

      <main className="app-content" style={{ display: 'flex', flexDirection: 'column' }}>
        <DemoPresentationBar />
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
