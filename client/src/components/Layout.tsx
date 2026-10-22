import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import { Menu, Bell, LogOut } from 'lucide-react';
import { useUiStore } from '../store/useUiStore';
import { useNotifications } from '../hooks/useNotifications';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../state/AuthProvider';

import DemoPresentationBar from './DemoPresentationBar';

/**
 * Layout — App shell with responsive sidebar + topbar + content area + command palette.
 */
export default function Layout() {
  const { toggleSidebar } = useUiStore();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: notifData } = useNotifications();
  const unreadCount = notifData?.unreadCount ?? 0;

  // Mount realtime Socket.io connection once for the entire app
  useSocket();

  return (
    <div className="app-layout">
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
          <div
            style={{
              width: 24,
              height: 24,
              border: '1.5px solid #0d2247',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              padding: 2,
              gap: 2,
              background: '#ffffff',
            }}
          >
            <div style={{ background: '#0d2247' }} />
            <div style={{ background: '#c8502a' }} />
            <div style={{ background: '#1e6b4b' }} />
            <div style={{ border: '1px solid #0d2247' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--font-size-md)', color: '#0d2247' }}>
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
                  background: 'var(--risk-critical)',
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
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              color: '#f87171',
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
