import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDebts } from '../hooks/useDebts';
import { useGroupRisk } from '../hooks/useRisk';
import { useSimulateContagion } from '../hooks/useRisk';
import GraphVisualizer from '../components/GraphVisualizer';
import { Badge, Skeleton } from '../components/ui';
import type { DebtEdge, RiskScoreResponse } from '../types';
import {
  Share2, AlertTriangle, ShieldAlert, Layers,
  Zap, X,
} from 'lucide-react';

export default function Network() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const contagionSource = searchParams.get('contagion') || undefined;

  const { data: debtsData, isLoading: debtsLoading } = useDebts({ status: 'active' });
  const { data: riskData, isLoading: riskLoading } = useGroupRisk();

  // Stored contagion simulation results for loss-shading the graph
  const [contagionLossMap, setContagionLossMap] = useState<Record<string, number>>({});
  const [totalLoss, setTotalLoss] = useState<number>(0);
  const contagionMutation = useSimulateContagion();

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

  // When contagionSource is in the URL and we don't have loss data yet, run simulation
  useMemo(() => {
    if (contagionSource && merchants.length > 0 && Object.keys(contagionLossMap).length === 0) {
      contagionMutation.mutate(
        { merchantId: contagionSource, lossGivenDefault: 1.0, maxRounds: 5 },
        {
          onSuccess: (data: any) => {
            const lossData = data.contagion?.perMerchantLoss || data?.perMerchantLoss || {};
            setContagionLossMap(lossData);
            setTotalLoss(data.contagion?.totalLoss || data?.totalLoss || 0);
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contagionSource, merchants.length]);

  const totalDebtVolume = useMemo(() => {
    return debts.reduce((sum, d) => sum + d.amount, 0);
  }, [debts]);

  const clearContagion = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('contagion');
    setSearchParams(nextParams);
    setContagionLossMap({});
    setTotalLoss(0);
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
            aria-label="Go to risk radar page"
            style={{ fontSize: 'var(--font-size-xs)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ShieldAlert size={14} color="var(--risk-critical)" aria-hidden="true" />
            Risk Radar
          </button>
          <button
            onClick={() => navigate('/settle')}
            className="btn btn--primary"
            aria-label="Go to netting and settlement page"
            style={{ fontSize: 'var(--font-size-xs)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Layers size={14} aria-hidden="true" />
            Netting &amp; Settlement
          </button>
        </div>
      </div>

      {/* Contagion Simulation Alert Banner */}
      {contagionSource && (
        <div
          role="alert"
          aria-live="polite"
          className="card"
          style={{
            marginBottom: 20, padding: '14px 20px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--risk-critical)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={24} color="var(--risk-critical)" aria-hidden="true" />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--risk-critical)', fontSize: 'var(--font-size-sm)' }}>
                Systemic Default Contagion Simulation Active
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                Source: <strong>{contagionSource.replace(/_/g, ' ')}</strong> (red node).
                Downstream nodes shaded by loss magnitude.
                {totalLoss > 0 && (
                  <span style={{ marginLeft: 8, color: 'var(--risk-critical)', fontWeight: 700 }}>
                    Total network loss: ₹{totalLoss.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Contagion simulation status chip */}
            {contagionMutation.isPending && (
              <span style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 'var(--font-size-xs)',
                background: 'rgba(251, 191, 36, 0.15)', color: 'var(--risk-medium)',
                border: '1px solid var(--risk-medium)', display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <Zap size={12} aria-hidden="true" /> Simulating...
              </span>
            )}

            {/* Clear overlay chip */}
            <button
              onClick={clearContagion}
              className="btn btn--secondary"
              aria-label="Clear contagion shading and return to normal view"
              style={{ fontSize: 'var(--font-size-xs)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <X size={13} aria-hidden="true" />
              Clear Overlay
            </button>
          </div>
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
            <Share2 size={48} color="var(--text-muted)" style={{ marginBottom: 12 }} aria-hidden="true" />
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
            contagionLossMap={contagionLossMap}
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
