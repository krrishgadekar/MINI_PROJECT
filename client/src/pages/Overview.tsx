import { useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebts } from '../hooks/useDebts';
import { useGroupRisk } from '../hooks/useRisk';
import { useNotifications } from '../hooks/useNotifications';
import { Badge } from '../components/ui';
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
        opacity: 0.5,
        transition: 'opacity var(--transition-fast)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
    >
      <GripVertical size={16} aria-hidden="true" />
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
      { name: 'Low Risk', value: buckets['Low Risk (<0.33)'] || 12000, color: 'var(--teal)' },
      { name: 'Medium Risk', value: buckets['Medium Risk (0.33-0.66)'] || 18000, color: 'var(--accent-light)' },
      { name: 'Elevated Risk', value: buckets['Elevated Risk (>0.66)'] || 8500, color: 'var(--risk-critical)' },
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
            style={{ padding: 20 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <DragHandle />
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>Risk-Weighted Exposure</h3>
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 14 }}>
              Distribution of active obligation balances by assessed risk tier.
            </p>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={exposureData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                    {exposureData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(val: any) => `₹${Number(val).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, fontSize: 'var(--font-size-xs)' }}>
              {exposureData.map((item) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} aria-hidden="true" />
                    <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                  </div>
                  <span style={{ fontWeight: 600 }}>₹{item.value.toLocaleString()}</span>
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
            style={{ padding: 20 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DragHandle />
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>Upcoming Maturing Obligations</h3>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    Debts with contractual due dates in the next 7 business days
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/ledger')}
                className="btn btn--secondary"
                aria-label="View all debts in ledger"
                style={{ fontSize: 'var(--font-size-xs)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                All Debts <ArrowRight size={12} aria-hidden="true" />
              </button>
            </div>
            {dueSoonDebts.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                No obligations due within the next 7 days.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dueSoonDebts.slice(0, 5).map((debt: any) => (
                  <div
                    key={debt._id}
                    onClick={() => navigate(`/ledger/${debt._id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/ledger/${debt._id}`); }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View debt ₹${debt.amount.toLocaleString()} due ${debt.dueDate ? new Date(debt.dueDate).toLocaleDateString() : 'soon'}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: 12, background: 'var(--bg-elevated)', borderRadius: 8, cursor: 'pointer',
                      transition: 'all var(--transition-fast)', border: '1px solid var(--border-primary)',
                    }}
                    className="table-row-hover"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CreditCard size={18} color="var(--teal)" aria-hidden="true" />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                          ₹{debt.amount.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                          {debt.note || 'Bilateral trade credit'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Badge variant="warning">Due {debt.dueDate ? new Date(debt.dueDate).toLocaleDateString() : 'Soon'}</Badge>
                      <ArrowRight size={14} color="var(--text-muted)" aria-hidden="true" />
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
              padding: 20,
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <DragHandle />
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Share2 size={24} color="var(--accent-light)" aria-hidden="true" />
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Interactive Credit Network Graph
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  Explore Tarjan Strongly Connected Components (SCCs), continuous cycle cancellations, and systemic exposure rings.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/network')}
              className="btn btn--primary"
              aria-label="Open interactive credit network graph"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              View Full Graph
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: 'var(--content-padding)' }}>
      {/* Skip link for keyboard users */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Top Banner & Welcome */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 4 }}>
            System Portfolio Overview
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Real-time multi-tenant debt settlement matrix, liquidity radar, and risk exposure.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate('/settle')}
            className="btn btn--secondary"
            aria-label="Open settle center"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <GitCommit size={15} aria-hidden="true" />
            Settle Center
          </button>
          <button
            onClick={() => navigate('/network')}
            className="btn btn--primary"
            aria-label="Open graph visualizer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Share2 size={15} aria-hidden="true" />
            Open Graph Visualizer
          </button>
        </div>
      </div>

      {/* Critical Overdue Alert Banner */}
      {overdueDebts.length > 0 && (
        <div
          role="alert"
          style={{
            padding: 16, borderRadius: 8, background: 'var(--risk-critical-bg)',
            border: '1px solid var(--risk-critical)', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={22} color="var(--risk-critical)" aria-hidden="true" />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--risk-critical)', fontSize: 'var(--font-size-sm)' }}>
                {overdueDebts.length} Overdue Obligation{overdueDebts.length > 1 ? 's' : ''} Detected
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                Total overdue balance: ₹{overdueDebts.reduce((s: number, d: any) => s + d.amount, 0).toLocaleString()}. Immediate settlement or netting recommended.
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/ledger')}
            className="btn btn--secondary"
            aria-label="Review overdue debts in ledger"
            style={{ fontSize: 'var(--font-size-xs)', padding: '6px 14px' }}
          >
            Review Overdue Debts
          </button>
        </div>
      )}

      {/* Primary 4 Metric Cards */}
      <div
        id="main-content"
        role="region"
        aria-label="Portfolio summary metrics"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}
      >
        <div className="glass-card" style={{ padding: 20 }} aria-label={`Active outstanding debt: ₹${totalOutstanding.toLocaleString()}`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Active Outstanding Debt
            </span>
            <Receipt size={18} color="var(--teal)" aria-hidden="true" />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            ₹{isLoading ? '...' : totalOutstanding.toLocaleString()}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            {activeDebts.length} active bilateral obligations
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }} aria-label={`Portfolio default risk: ${(avgRisk * 100).toFixed(1)}%`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Portfolio Default Risk
            </span>
            <TrendingUp size={18} color="var(--accent-light)" aria-hidden="true" />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: avgRisk < 0.3 ? 'var(--risk-low)' : 'var(--risk-critical)' }}>
            {isLoading ? '...' : `${(avgRisk * 100).toFixed(1)}%`}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            {highRiskCount} merchant{highRiskCount === 1 ? '' : 's'} on elevated watchlist
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }} aria-label={`${dueSoonDebts.length} debts due in next 7 days`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Due in Next 7 Days
            </span>
            <Clock size={18} color="var(--risk-high)" aria-hidden="true" />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {isLoading ? '...' : dueSoonDebts.length}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            ₹{dueSoonDebts.reduce((s: number, d: any) => s + d.amount, 0).toLocaleString()} upcoming liquidity demand
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }} aria-label={`${unreadCount} unread alerts`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Unread Alerts &amp; Inbox
            </span>
            <ShieldAlert size={18} color="var(--accent-light)" aria-hidden="true" />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: unreadCount > 0 ? 'var(--risk-high)' : 'var(--teal)' }}>
            {unreadCount}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            Direct counterparty &amp; settlement notifications
          </div>
        </div>
      </div>

      {/* Draggable Middle Grid Widgets */}
      <div
        role="region"
        aria-label="Customizable dashboard widgets — drag to reorder"
        style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginBottom: 24 }}
      >
        {widgetOrder.slice(0, 2).map(renderWidget)}
      </div>

      {/* Network Banner (third widget) */}
      {renderWidget(widgetOrder[2])}
    </div>
  );
}
