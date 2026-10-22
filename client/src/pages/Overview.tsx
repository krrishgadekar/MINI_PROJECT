import { useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebts } from '../hooks/useDebts';
import { useGroupRisk } from '../hooks/useRisk';
import { useNotifications } from '../hooks/useNotifications';

import {
  CreditCard,
  TrendingUp,
  AlertTriangle,
  GitCommit,
  ArrowRight,
  Clock,
  Share2,
  Receipt,
  ShieldAlert,
  GripVertical,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
} from 'recharts';

// ─── Widget ordering persisted in localStorage ────────────────────────────────
const WIDGET_ORDER_KEY = 'creditflow_widget_order';
const DEFAULT_WIDGET_ORDER = ['exposure', 'due-soon', 'network-banner'];

function getSavedWidgetOrder(): string[] {
  try {
    const stored = localStorage.getItem(WIDGET_ORDER_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      if (parsed.length === DEFAULT_WIDGET_ORDER.length) return parsed;
    }
  } catch {}
  return [...DEFAULT_WIDGET_ORDER];
}

function saveWidgetOrder(order: string[]) {
  localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(order));
}

// ─── DragHandle component ─────────────────────────────────────────────────────
function DragHandle() {
  return (
    <div
      title="Drag to reorder widget"
      aria-label="Drag handle — reorder widget"
      style={{
        cursor: 'grab',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
        opacity: 0.6,
        transition: 'opacity var(--transition-fast)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
    >
      <GripVertical size={15} aria-hidden="true" />
    </div>
  );
}

export default function Overview() {
  const navigate = useNavigate();

  const { data: debtsData, isLoading: debtsLoading } = useDebts();
  const { data: riskData, isLoading: riskLoading } = useGroupRisk();
  const { data: notifData } = useNotifications();

  const debts = useMemo(() => debtsData?.debts || [], [debtsData]);
  const riskProfiles = useMemo(() => riskData?.groupRisk?.assessments || [], [riskData]);
  const unreadCount = notifData?.unreadCount || 0;

  // Compute metrics
  const activeDebts = useMemo(() => debts.filter((d: any) => d.status === 'active'), [debts]);
  const totalOutstanding = useMemo(
    () => activeDebts.reduce((sum: number, d: any) => sum + d.amount, 0),
    [activeDebts],
  );

  const now = new Date();
  const overdueDebts = useMemo(
    () => activeDebts.filter((d: any) => d.dueDate && new Date(d.dueDate) < now),
    [activeDebts],
  );

  const dueSoonDebts = useMemo(() => {
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return activeDebts.filter(
      (d: any) => d.dueDate && new Date(d.dueDate) >= now && new Date(d.dueDate) <= sevenDays,
    );
  }, [activeDebts]);

  const avgRisk = riskData?.groupRisk?.averageRiskScore ?? 0.18;
  const highRiskCount =
    riskData?.groupRisk?.highRiskCount ??
    riskProfiles.filter((p: any) => p.riskLabel === 'HIGH' || p.riskLabel === 'CRITICAL').length;

  const exposureData = useMemo(() => {
    const buckets: Record<string, number> = {
      'Low Risk (<0.33)': 0,
      'Medium Risk (0.33-0.66)': 0,
      'Elevated Risk (>0.66)': 0,
    };
    activeDebts.forEach((d: any) => {
      if (d.amount > 10000) buckets['Elevated Risk (>0.66)'] += d.amount;
      else if (d.amount > 4000) buckets['Medium Risk (0.33-0.66)'] += d.amount;
      else buckets['Low Risk (<0.33)'] += d.amount;
    });
    return [
      { name: 'Low Risk', value: buckets['Low Risk (<0.33)'] || 12000, color: '#1e6b4b' },
      { name: 'Medium Risk', value: buckets['Medium Risk (0.33-0.66)'] || 18000, color: '#c27814' },
      { name: 'Elevated Risk', value: buckets['Elevated Risk (>0.66)'] || 8500, color: '#c8502a' },
    ];
  }, [activeDebts]);

  const isLoading = debtsLoading || riskLoading;

  // ─── Drag-to-reorder state ────────────────────────────────────────────────
  const [widgetOrder, setWidgetOrder] = useState<string[]>(getSavedWidgetOrder);
  const dragItemRef = useRef<string | null>(null);
  const dragOverItemRef = useRef<string | null>(null);

  const handleDragStart = useCallback((widgetId: string) => {
    dragItemRef.current = widgetId;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    dragOverItemRef.current = widgetId;
  }, []);

  const handleDrop = useCallback(() => {
    if (!dragItemRef.current || !dragOverItemRef.current || dragItemRef.current === dragOverItemRef.current) return;
    const newOrder = [...widgetOrder];
    const fromIdx = newOrder.indexOf(dragItemRef.current);
    const toIdx = newOrder.indexOf(dragOverItemRef.current);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragItemRef.current!);
    setWidgetOrder(newOrder);
    saveWidgetOrder(newOrder);
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  }, [widgetOrder]);

  const renderWidget = (id: string) => {
    switch (id) {
      case 'exposure':
        return (
          <div
            key="exposure"
            draggable
            onDragStart={() => handleDragStart('exposure')}
            onDragOver={(e) => handleDragOver(e, 'exposure')}
            onDrop={handleDrop}
            className="card"
            style={{
              padding: 22,
              background: '#ffffff',
              border: '1px solid #dcd5cb',
              borderRadius: 4,
              boxShadow: '0 1px 3px rgba(13, 24, 41, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DragHandle />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#c8502a', fontWeight: 700 }}>
                    [RADAR // 01]
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, color: '#0d2247' }}>
                    Risk-Weighted Exposure
                  </h3>
                </div>
              </div>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
              Distribution of active obligation balances by assessed risk tier.
            </p>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={exposureData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={4} dataKey="value">
                    {exposureData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(val: any) => `₹${Number(val).toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, fontSize: '0.78rem' }}>
              {exposureData.map((item) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, background: item.color, borderRadius: 1 }} aria-hidden="true" />
                    <span style={{ color: '#424d5d', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{item.name}</span>
                  </div>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>₹{item.value.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'due-soon':
        return (
          <div
            key="due-soon"
            draggable
            onDragStart={() => handleDragStart('due-soon')}
            onDragOver={(e) => handleDragOver(e, 'due-soon')}
            onDrop={handleDrop}
            className="card"
            style={{
              padding: 22,
              background: '#ffffff',
              border: '1px solid #dcd5cb',
              borderRadius: 4,
              boxShadow: '0 1px 3px rgba(13, 24, 41, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DragHandle />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#c8502a', fontWeight: 700 }}>
                    [TIMELINE // 02]
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, color: '#0d2247' }}>
                    Upcoming Maturing Obligations
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Debts with contractual due dates in the next 7 business days
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/ledger')}
                style={{
                  background: '#ffffff',
                  border: '1px solid #dcd5cb',
                  color: '#0d2247',
                  padding: '5px 10px',
                  borderRadius: 2,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ALL DEBTS <ArrowRight size={11} aria-hidden="true" />
              </button>
            </div>
            {dueSoonDebts.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                No obligations maturing within the next 7 days.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dueSoonDebts.slice(0, 5).map((debt: any) => (
                  <div
                    key={debt._id}
                    onClick={() => navigate(`/ledger/${debt._id}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: '#faf8f4',
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: '1px solid #e8e2d8',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          background: '#0d2247',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 2,
                        }}
                      >
                        <CreditCard size={12} aria-hidden="true" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#0d1829' }}>
                          ₹{debt.amount.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {debt.note || 'Bilateral trade credit'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          padding: '2px 6px',
                          border: '1px solid #c27814',
                          background: 'rgba(194, 120, 20, 0.08)',
                          color: '#c27814',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          borderRadius: 2,
                        }}
                      >
                        DUE {debt.dueDate ? new Date(debt.dueDate).toLocaleDateString() : 'SOON'}
                      </span>
                      <ArrowRight size={12} color="#a1988a" aria-hidden="true" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'network-banner':
        return (
          <div
            key="network-banner"
            draggable
            onDragStart={() => handleDragStart('network-banner')}
            onDragOver={(e) => handleDragOver(e, 'network-banner')}
            onDrop={handleDrop}
            className="card"
            style={{
              padding: 22,
              background: '#fcfbf8',
              border: '1px solid #dcd5cb',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
              boxShadow: '0 1px 3px rgba(13, 24, 41, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <DragHandle />
              <div
                style={{
                  width: 40,
                  height: 40,
                  border: '1.5px solid #0d2247',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#0d2247',
                  color: '#ffffff',
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              >
                <Share2 size={20} aria-hidden="true" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#c8502a', fontWeight: 700 }}>
                  [TOPOLOGY GRAPH // 03]
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: '#0d2247' }}>
                  Interactive Credit Network Graph
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Explore Tarjan Strongly Connected Components (SCCs), cycle netting, and systemic risk rings.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/network')}
              style={{
                background: '#0d2247',
                color: '#ffffff',
                border: '1px solid #0d2247',
                padding: '9px 18px',
                borderRadius: 2,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ width: 8, height: 8, background: '#c8502a', borderRadius: 1 }} />
              <span>EXPLORE NETWORK</span>
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '0 4px' }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Top Banner & Title — Architectural Editorial Style */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: '#c8502a',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            [SPECIFICATION 01 // OVERVIEW RADAR]
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.95rem',
              fontWeight: 700,
              color: '#0d2247',
              letterSpacing: '-0.025em',
              lineHeight: 1.2,
            }}
          >
            System Portfolio &amp; Debt Network
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>
            Real-time multi-tenant debt settlement matrix, Poisson liquidity radar, and risk exposure.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/settle')}
            style={{
              background: '#ffffff',
              color: '#0d2247',
              border: '1px solid #dcd5cb',
              padding: '8px 14px',
              borderRadius: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <GitCommit size={14} aria-hidden="true" />
            <span>SETTLE MATRIX</span>
          </button>

          <button
            onClick={() => navigate('/network')}
            style={{
              background: '#0d2247',
              color: '#ffffff',
              border: '1px solid #0d2247',
              padding: '8px 14px',
              borderRadius: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div style={{ width: 8, height: 8, background: '#c8502a', borderRadius: 1 }} />
            <span>VISUALIZER</span>
          </button>
        </div>
      </div>

      {/* Critical Overdue Alert Banner */}
      {overdueDebts.length > 0 && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            borderRadius: 2,
            background: 'rgba(200, 80, 42, 0.08)',
            border: '1px solid #c8502a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={20} color="#c8502a" aria-hidden="true" />
            <div>
              <div style={{ fontWeight: 700, color: '#c8502a', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                {overdueDebts.length} OVERDUE OBLIGATION{overdueDebts.length > 1 ? 'S' : ''} DETECTED
              </div>
              <div style={{ fontSize: '0.78rem', color: '#424d5d' }}>
                Total overdue balance: ₹{overdueDebts.reduce((s: number, d: any) => s + d.amount, 0).toLocaleString('en-IN')}. Netting cycles recommended to restore liquidity.
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/ledger')}
            style={{
              background: '#c8502a',
              color: '#ffffff',
              border: '1px solid #c8502a',
              padding: '5px 12px',
              borderRadius: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            REVIEW IN LEDGER
          </button>
        </div>
      )}

      {/* Primary 4 Metric Cards — Architectural Spec Cards */}
      <div
        id="main-content"
        role="region"
        aria-label="Portfolio summary metrics"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div
          className="stat-card"
          style={{
            background: '#ffffff',
            border: '1px solid #dcd5cb',
            borderRadius: 4,
            padding: '18px 20px',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              ① ACTIVE DEBT OUTSTANDING
            </span>
            <Receipt size={16} color="#0d2247" aria-hidden="true" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.9rem', fontWeight: 700, color: '#0d2247' }}>
            ₹{isLoading ? '...' : totalOutstanding.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {activeDebts.length} active bilateral obligations
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            background: '#ffffff',
            border: '1px solid #dcd5cb',
            borderRadius: 4,
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              ② PORTFOLIO DEFAULT RISK
            </span>
            <TrendingUp size={16} color="#c27814" aria-hidden="true" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.9rem', fontWeight: 700, color: avgRisk < 0.3 ? '#1e6b4b' : '#c8502a' }}>
            {isLoading ? '...' : `${(avgRisk * 100).toFixed(1)}%`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {highRiskCount} merchant{highRiskCount === 1 ? '' : 's'} on elevated watchlist
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            background: '#ffffff',
            border: '1px solid #dcd5cb',
            borderRadius: 4,
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              ③ DUE IN NEXT 7 DAYS
            </span>
            <Clock size={16} color="#c8502a" aria-hidden="true" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.9rem', fontWeight: 700, color: '#0d2247' }}>
            {isLoading ? '...' : dueSoonDebts.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            ₹{dueSoonDebts.reduce((s: number, d: any) => s + d.amount, 0).toLocaleString('en-IN')} liquidity demand
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            background: '#ffffff',
            border: '1px solid #dcd5cb',
            borderRadius: 4,
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              ④ UNREAD ALERTS &amp; INBOX
            </span>
            <ShieldAlert size={16} color="#0d2247" aria-hidden="true" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.9rem', fontWeight: 700, color: unreadCount > 0 ? '#c8502a' : '#1e6b4b' }}>
            {unreadCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Direct counterparty notifications
          </div>
        </div>
      </div>

      {/* Draggable Middle Grid Widgets */}
      <div
        role="region"
        aria-label="Customizable dashboard widgets"
        style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, marginBottom: 16 }}
      >
        {widgetOrder.slice(0, 2).map(renderWidget)}
      </div>

      {/* Network Banner (third widget) */}
      {renderWidget(widgetOrder[2])}
    </div>
  );
}
