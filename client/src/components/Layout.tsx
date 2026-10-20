import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import { Menu, Bell, Sparkles } from 'lucide-react';
import { useUiStore } from '../store/useUiStore';
import { useNotifications } from '../hooks/useNotifications';
import { useSocket } from '../hooks/useSocket';

/**
 * Layout — App shell with responsive sidebar + topbar + content area + command palette.
 */
export default function Layout() {
  const { toggleSidebar } = useUiStore();
  const navigate = useNavigate();
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
          <div className="sidebar-brand-icon" style={{ width: 28, height: 28 }}>
            <Sparkles size={14} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--text-primary)' }}>
            CreditFlow
          </span>
        </div>

        {/* Notification Bell Placeholder */}
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
      </header>

      <Sidebar />

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
