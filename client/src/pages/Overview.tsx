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
      title="Drag to reorder"
      aria-label="Drag handle — reorder widget"
      style={{
        cursor: 'grab',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
        opacity: 0.4,
        transition: 'opacity var(--transition-fast)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
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

  const overdueDebts = useMemo(() => {
    const now = new Date();
    return activeDebts.filter((d: any) => d.dueDate && new Date(d.dueDate) < now);
  }, [activeDebts]);

  const dueSoonDebts = useMemo(() => {
    const now = new Date();
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
      'Low': 0,
      'Medium': 0,
      'High': 0,
    };
    activeDebts.forEach((d: any) => {
      if (d.amount > 10000) buckets['High'] += d.amount;
      else if (d.amount > 4000) buckets['Medium'] += d.amount;
      else buckets['Low'] += d.amount;
    });
    return [
      { name: 'Low Risk', value: buckets['Low'] || 12000, color: '#1e6b4b' },
      { name: 'Medium Risk', value: buckets['Medium'] || 18000, color: '#c27814' },
      { name: 'High Risk', value: buckets['High'] || 8500, color: '#c8502a' },
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
              borderRadius: 'var(--border-radius)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DragHandle />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Debt by Risk Level
                </h3>
              </div>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
              How your active debts are spread across risk categories.
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, fontSize: '0.82rem' }}>
              {exposureData.map((item) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, background: item.color, borderRadius: '50%' }} aria-hidden="true" />
                    <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
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
              borderRadius: 'var(--border-radius)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DragHandle />
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Payments Due Soon
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Debts due within the next 7 days
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/ledger')}
                className="btn btn-sm btn-secondary"
              >
                View All <ArrowRight size={12} aria-hidden="true" />
              </button>
            </div>
            {dueSoonDebts.length === 0 ? (
              <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No payments due in the next 7 days 🎉
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
                      padding: '12px 14px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--border-radius-sm)',
                      cursor: 'pointer',
                      border: '1px solid var(--border-primary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          background: 'var(--brand-navy)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 6,
                        }}
                      >
                        <CreditCard size={14} aria-hidden="true" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          ₹{debt.amount.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {debt.note || 'Trade credit'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="status-badge status-pending" style={{ fontSize: '0.7rem' }}>
                        Due {debt.dueDate ? new Date(debt.dueDate).toLocaleDateString() : 'Soon'}
                      </span>
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
              padding: 22,
              borderRadius: 'var(--border-radius)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <DragHandle />
              <div
                style={{
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--brand-navy)',
                  color: '#ffffff',
                  borderRadius: 'var(--border-radius-sm)',
                  flexShrink: 0,
                }}
              >
                <Share2 size={22} aria-hidden="true" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Credit Network Map
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 400 }}>
                  See how all merchants are connected — find payment cycles and settle debts faster.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/network')}
              className="btn btn-primary"
            >
              Open Network <ArrowRight size={15} aria-hidden="true" />
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

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.025em',
              lineHeight: 1.2,
            }}
          >
            Overview
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
            Your debt summary, risk snapshot, and upcoming payments at a glance.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/settle')}
            className="btn btn-secondary"
          >
            <GitCommit size={16} aria-hidden="true" />
            Settle Debts
          </button>

          <button
            onClick={() => navigate('/network')}
            className="btn btn-primary"
          >
            View Network
          </button>
        </div>
      </div>

      {/* Overdue Alert */}
      {overdueDebts.length > 0 && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--border-radius-sm)',
            background: 'var(--color-danger-bg)',
            border: '1px solid rgba(200, 80, 42, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={20} color="var(--color-danger)" aria-hidden="true" />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: '0.85rem' }}>
                {overdueDebts.length} Overdue Payment{overdueDebts.length > 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Total overdue: ₹{overdueDebts.reduce((s: number, d: any) => s + d.amount, 0).toLocaleString('en-IN')}
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/ledger')}
            className="btn btn-sm btn-terracotta"
          >
            Review Now
          </button>
        </div>
      )}

      {/* 4 Metric Cards */}
      <div
        id="main-content"
        role="region"
        aria-label="Key metrics"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Total Active Debts
            </span>
            <Receipt size={18} color="var(--brand-navy)" aria-hidden="true" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ₹{isLoading ? '...' : totalOutstanding.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {activeDebts.length} active debt{activeDebts.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Risk Score
            </span>
            <TrendingUp size={18} color="var(--color-warning)" aria-hidden="true" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: avgRisk < 0.3 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {isLoading ? '...' : `${(avgRisk * 100).toFixed(1)}%`}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {highRiskCount} high-risk merchant{highRiskCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Due This Week
            </span>
            <Clock size={18} color="var(--color-danger)" aria-hidden="true" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {isLoading ? '...' : dueSoonDebts.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            ₹{dueSoonDebts.reduce((s: number, d: any) => s + d.amount, 0).toLocaleString('en-IN')} total
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Unread Alerts
            </span>
            <ShieldAlert size={18} color="var(--brand-navy)" aria-hidden="true" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: unreadCount > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {unreadCount}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Notifications waiting
          </div>
        </div>
      </div>

      {/* Middle Widgets Grid — responsive */}
      <div
        role="region"
        aria-label="Dashboard widgets"
        className="overview-widget-grid"
      >
        {widgetOrder.slice(0, 2).map(renderWidget)}
      </div>

      {/* Network Banner */}
      {renderWidget(widgetOrder[2])}
    </div>
  );
}
