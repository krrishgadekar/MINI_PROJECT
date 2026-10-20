import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useGroup } from '../state/GroupProvider';
import {
  Search,
  LayoutDashboard,
  Share2,
  FileText,
  RefreshCw,
  AlertTriangle,
  Users,
  Bell,
  Activity,
  Settings,
  User,
  ArrowRight,
  CreditCard,
  Building,
} from 'lucide-react';

interface PaletteItem {
  id: string;
  category: 'Pages' | 'Merchants' | 'Debts';
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onSelect: () => void;
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const navigate = useNavigate();
  const { activeGroupId } = useGroup();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fetch active group members
  const { data: membersData } = useQuery({
    queryKey: ['group-members-palette', activeGroupId],
    queryFn: () => (activeGroupId ? api.groups.getMembers(activeGroupId) : Promise.resolve({ success: true, members: [] })),
    enabled: isOpen && Boolean(activeGroupId),
  });

  // Fetch active group debts
  const { data: debtsData } = useQuery({
    queryKey: ['group-debts-palette', activeGroupId],
    queryFn: () => (activeGroupId ? api.debts.list({ limit: 40 }) : Promise.resolve({ success: true, count: 0, debts: [] })),
    enabled: isOpen && Boolean(activeGroupId),
  });

  const members = (membersData as any)?.members || [];
  const debts = (debtsData as any)?.debts || [];

  // Build items list
  const pages: PaletteItem[] = useMemo(
    () => [
      { id: 'page-overview', category: 'Pages', title: 'Overview', subtitle: 'Dashboard & summary KPIs', icon: LayoutDashboard, onSelect: () => navigate('/') },
      { id: 'page-network', category: 'Pages', title: 'Network Graph', subtitle: 'Visual topology & contagion', icon: Share2, onSelect: () => navigate('/network') },
      { id: 'page-ledger', category: 'Pages', title: 'Trade Ledger', subtitle: 'Obligations, partial payments & history', icon: FileText, onSelect: () => navigate('/ledger') },
      { id: 'page-settle', category: 'Pages', title: 'Settle Center', subtitle: 'Cycle netting & greedy settlement', icon: RefreshCw, onSelect: () => navigate('/settle') },
      { id: 'page-risk', category: 'Pages', title: 'Risk Radar', subtitle: 'Poisson metrics & portfolio risk', icon: AlertTriangle, onSelect: () => navigate('/risk') },
      { id: 'page-groups', category: 'Pages', title: 'Groups & Members', subtitle: 'Manage circles and invite peers', icon: Users, onSelect: () => navigate('/groups') },
      { id: 'page-activity', category: 'Pages', title: 'Activity Feed', subtitle: 'Audit trail of all actions', icon: Activity, onSelect: () => navigate('/activity') },
      { id: 'page-inbox', category: 'Pages', title: 'Inbox & Approvals', subtitle: 'Actionable requests & alerts', icon: Bell, onSelect: () => navigate('/inbox') },
      { id: 'page-settings', category: 'Pages', title: 'Settings', subtitle: 'Preferences, sessions & password', icon: Settings, onSelect: () => navigate('/settings') },
      { id: 'page-profile', category: 'Pages', title: 'Profile', subtitle: 'Manage your merchant profile', icon: User, onSelect: () => navigate('/profile') },
    ],
    [navigate]
  );

  const merchantItems: PaletteItem[] = useMemo(() => {
    return members.map((m: any) => {
      const name = m.name || m.merchantId?.name || 'Member';
      const email = m.email || m.merchantId?.email || '';
      const role = m.role || 'member';
      return {
        id: `merchant-${m.merchantId || m._id || name}`,
        category: 'Merchants' as const,
        title: name,
        subtitle: `${email ? email + ' · ' : ''}Role: ${role}`,
        icon: Building,
        onSelect: () => navigate(`/ledger?q=${encodeURIComponent(name)}`),
      };
    });
  }, [members, navigate]);

  const debtItems: PaletteItem[] = useMemo(() => {
    return debts.map((d: any) => {
      const debtor = d.debtorId?.name || (typeof d.debtorId === 'string' ? d.debtorId : 'Debtor');
      const creditor = d.creditorId?.name || (typeof d.creditorId === 'string' ? d.creditorId : 'Creditor');
      const amount = d.amount != null ? d.amount : d.originalAmount;
      const formattedAmount = `₹${Number(amount || 0).toLocaleString('en-IN')}`;
      const debtId = d._id || d.id || '';

      return {
        id: `debt-${debtId}`,
        category: 'Debts' as const,
        title: `${debtor} → ${creditor} (${formattedAmount})`,
        subtitle: `Status: ${d.status} · ID: ${debtId.slice(-6)} ${d.note ? '· ' + d.note : ''}`,
        icon: CreditCard,
        onSelect: () => navigate(`/ledger/${debtId}`),
      };
    });
  }, [debts, navigate]);

  // Filter items based on user input query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...pages, ...merchantItems.slice(0, 5), ...debtItems.slice(0, 5)];
    }

    const matches = (item: PaletteItem) =>
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q));

    const p = pages.filter(matches);
    const m = merchantItems.filter(matches);
    const d = debtItems.filter(matches);

    return [...p, ...m, ...d];
  }, [query, pages, merchantItems, debtItems]);

  // Handle arrow keys and Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        selected.onSelect();
        setIsOpen(false);
      }
    }
  };

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={() => setIsOpen(false)}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'var(--bg-secondary, #0f172a)',
          border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.15))',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(124, 58, 237, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '75vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.08))',
            background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.02))',
          }}
        >
          <Search size={20} color="var(--accent-light, #a78bfa)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a page, merchant, or debt amount/ID..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary, #ffffff)',
              fontSize: 'var(--font-size-md, 16px)',
            }}
          />
          <kbd
            style={{
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              background: 'var(--bg-elevated, rgba(255, 255, 255, 0.08))',
              color: 'var(--text-muted, #94a3b8)',
              border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.1))',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                color: 'var(--text-muted, #94a3b8)',
                fontSize: 14,
              }}
            >
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon;

              return (
                <div
                  key={item.id}
                  data-selected={isSelected}
                  onClick={() => {
                    item.onSelect();
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: isSelected
                      ? 'var(--accent-subtle, rgba(124, 58, 237, 0.18))'
                      : 'transparent',
                    border: isSelected
                      ? '1px solid var(--accent, #7c3aed)'
                      : '1px solid transparent',
                    transition: 'all 0.1s ease',
                    marginBottom: 2,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: isSelected ? 'var(--accent, #7c3aed)' : 'var(--bg-tertiary, rgba(255, 255, 255, 0.06))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? 'white' : 'var(--text-muted, #94a3b8)',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: isSelected ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #cbd5e1)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted, #94a3b8)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: 1,
                          }}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--bg-elevated, rgba(255, 255, 255, 0.08))',
                        color: 'var(--text-muted, #94a3b8)',
                      }}
                    >
                      {item.category}
                    </span>
                    {isSelected && <ArrowRight size={14} color="var(--accent-light, #a78bfa)" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Hints */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderTop: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.08))',
            background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.02))',
            fontSize: 12,
            color: 'var(--text-muted, #94a3b8)',
          }}
        >
          <div style={{ display: 'flex', gap: 14 }}>
            <span><kbd style={{ fontWeight: 700 }}>↑</kbd> <kbd style={{ fontWeight: 700 }}>↓</kbd> to navigate</span>
            <span><kbd style={{ fontWeight: 700 }}>↵</kbd> to select</span>
            <span><kbd style={{ fontWeight: 700 }}>esc</kbd> to close</span>
          </div>
          <span style={{ fontSize: 11, opacity: 0.8 }}>CreditFlow Quick Search</span>
        </div>
      </div>
    </div>
  );
}
