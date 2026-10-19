import { useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDebts } from '../hooks/useDebts';
import { useGroupRisk } from '../hooks/useRisk';
import GraphVisualizer from '../components/GraphVisualizer';
import { Badge, Skeleton } from '../components/ui';
import type { DebtEdge, RiskScoreResponse } from '../types';
import { Share2, AlertTriangle, RotateCcw, ShieldAlert, Layers } from 'lucide-react';

export default function Network() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const contagionSource = searchParams.get('contagion') || undefined;

  const { data: debtsData, isLoading: debtsLoading } = useDebts({ status: 'active' });
  const { data: riskData, isLoading: riskLoading } = useGroupRisk();

  // Format active debts as DebtEdges
  const { debts, merchants, riskProfiles } = useMemo(() => {
    const rawDebts = debtsData?.debts || [];
    const formattedDebts: DebtEdge[] = rawDebts.map((d: any) => ({
      debtor: d.debtorId?.name || d.debtorId,
      creditor: d.creditorId?.name || d.creditorId,
      amount: d.amount,
    }));

    const merchantSet = new Set<string>();
    formattedDebts.forEach((d) => {
      if (d.debtor) merchantSet.add(d.debtor);
      if (d.creditor) merchantSet.add(d.creditor);
    });

    const assessments = (riskData?.groupRisk?.assessments || (riskData as any)?.profiles || []) as any[];
    assessments.forEach((a: any) => {
      const name = a.merchantName || a.name || a.merchantId;
      if (name) merchantSet.add(name);
    });

    const formattedRisk: RiskScoreResponse[] = assessments.map((a: any) => ({
      merchant_id: a.merchantName || a.name || a.merchantId,
      months_observed: a.monthsObserved ?? 0,
      late_payment_events: a.latePaymentEvents ?? 0,
      default_events: a.defaultEvents ?? 0,
      lambda_rate: a.lambda ?? 0,
      risk_score: a.riskScore ?? 0,
      risk_category: a.riskLabel ?? 'LOW',
      model: 'poisson_gamma_v2',
      cold_start: a.coldStart ?? false,
      z_score: a.zScore ?? null,
      p_value: a.pValue ?? null,
      risk_label: a.riskLabel ?? 'LOW',
      composite_score: a.riskScore ?? 0,
    }));

    return {
      debts: formattedDebts,
      merchants: Array.from(merchantSet),
      riskProfiles: formattedRisk,
    };
  }, [debtsData, riskData]);

  const totalDebtVolume = useMemo(() => {
    return debts.reduce((sum, d) => sum + d.amount, 0);
  }, [debts]);

  const clearContagion = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('contagion');
    setSearchParams(nextParams);
  };

  const isLoading = debtsLoading || riskLoading;

  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Obligation Network &amp; Cascade Graph</h1>
            <Badge variant="primary">{merchants.length} Nodes · {debts.length} Active Edges</Badge>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Real-time multi-tenant debt topology visualizer with client-side BFS traversal and systemic default contagion shading.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => navigate('/risk')}
            className="btn btn--secondary"
            style={{ fontSize: 'var(--font-size-xs)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ShieldAlert size={14} color="var(--risk-critical)" />
            Risk Radar
          </button>
          <button
            onClick={() => navigate('/settle')}
            className="btn btn--primary"
            style={{ fontSize: 'var(--font-size-xs)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Layers size={14} />
            Netting &amp; Settlement
          </button>
        </div>
      </div>

      {/* Contagion Simulation Alert Banner */}
      {contagionSource && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            padding: '14px 20px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--risk-critical)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={24} color="var(--risk-critical)" />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--risk-critical)', fontSize: 'var(--font-size-sm)' }}>
                Systemic Default Contagion Simulation Active
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                Shading obligations initiated by default of <strong>{contagionSource.replace(/_/g, ' ')}</strong> (red). Downstream exposed creditors highlighted in amber.
              </div>
            </div>
          </div>

          <button
            onClick={clearContagion}
            className="btn btn--secondary"
            style={{ fontSize: 'var(--font-size-xs)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={13} />
            Clear Contagion Shading
          </button>
        </div>
      )}

      {/* Interactive Graph Canvas */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24, position: 'relative' }}>
        {isLoading ? (
          <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Skeleton width="100%" height={520} />
          </div>
        ) : merchants.length === 0 ? (
          <div style={{ height: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Share2 size={48} color="var(--text-muted)" style={{ marginBottom: 12 }} />
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>No active debt obligations</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
              Create or confirm debts in the Ledger to populate the network graph.
            </p>
          </div>
        ) : (
          <GraphVisualizer
            merchants={merchants}
            debts={debts}
            riskProfiles={riskProfiles}
            contagionSource={contagionSource}
            height={520}
          />
        )}
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
            Total Network Obligations
          </div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--text-primary)' }}>
            ₹{totalDebtVolume.toLocaleString()}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--teal)', marginTop: 4 }}>
            Across {debts.length} active credit edges
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
            Network Density &amp; Vertices
          </div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--accent-light)' }}>
            {merchants.length} Merchants
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            {debts.length > 0 ? (debts.length / Math.max(1, merchants.length * (merchants.length - 1))).toFixed(3) : '0.000'} graph density
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
            Contagion Vulnerability Status
          </div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: contagionSource ? 'var(--risk-critical)' : 'var(--teal)' }}>
            {contagionSource ? 'CASCADE ACTIVE' : 'SECURE / NORMAL'}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            {contagionSource ? `Traced from ${contagionSource.replace(/_/g, ' ')}` : 'Click any node to run BFS traversal'}
          </div>
        </div>
      </div>
    </div>
  );
}
