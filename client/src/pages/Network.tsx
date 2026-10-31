import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDebts } from '../hooks/useDebts';
import { useGroupRisk } from '../hooks/useRisk';
import { useSimulateContagion } from '../hooks/useRisk';
import GraphVisualizer from '../components/GraphVisualizer';
import { Skeleton } from '../components/ui';
import type { DebtEdge, RiskScoreResponse } from '../types';
import {
  Share2, AlertTriangle, ShieldAlert,
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
    <div className="page-container" style={{ padding: '0 4px' }}>
      {/* Header — Illoca Architectural Studio Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
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
            Network Explorer
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
              Credit Network Map
            </h1>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                padding: '3px 8px',
                border: '1px solid #0d2247',
                color: '#0d2247',
                background: '#faf8f4',
                borderRadius: 2,
                fontWeight: 700,
              }}
            >
              {merchants.length} Merchants · {debts.length} Debts
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>
            Interactive map showing how merchants are connected by debts and transaction flows.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => navigate('/risk')}
            style={{
              background: 'var(--bg-elevated)',
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
            <ShieldAlert size={14} color="#c8502a" aria-hidden="true" />
            <span>Risk Analysis</span>
          </button>
          <button
            onClick={() => navigate('/settle')}
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
            <span>Run Settlement</span>
          </button>
        </div>
      </div>

      {/* Contagion Simulation Alert Banner */}
      {contagionSource && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            marginBottom: 20,
            padding: '12px 18px',
            background: 'rgba(200, 80, 42, 0.08)',
            border: '1px solid #c8502a',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={20} color="#c8502a" aria-hidden="true" />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#c8502a', fontSize: '0.8rem' }}>
                SYSTEMIC DEFAULT CASCADE SIMULATION ACTIVE
              </div>
              <div style={{ fontSize: '0.78rem', color: '#424d5d' }}>
                Failure Source: <strong>{contagionSource.replace(/_/g, ' ')}</strong> (indicated in red).
                Downstream counterparties shaded by loss propagation.
                {totalLoss > 0 && (
                  <span style={{ marginLeft: 8, color: '#c8502a', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    Total Network Loss: ₹{totalLoss.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {contagionMutation.isPending && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 2,
                  fontSize: '0.72rem',
                  background: 'rgba(194, 120, 20, 0.1)',
                  color: '#c27814',
                  border: '1px solid #c27814',
                  fontFamily: 'var(--font-mono)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Zap size={11} aria-hidden="true" /> SIMULATING...
              </span>
            )}

            <button
              onClick={clearContagion}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid #dcd5cb',
                color: '#0d2247',
                padding: '4px 10px',
                borderRadius: 2,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <X size={12} aria-hidden="true" />
              CLEAR OVERLAY
            </button>
          </div>
        </div>
      )}

      {/* Interactive Graph Canvas — Drafting Sheet Frame */}
      <div
        style={{
          border: '1px solid #dcd5cb',
          borderRadius: 4,
          background: '#fdfbf7',
          padding: 0,
          overflow: 'hidden',
          marginBottom: 20,
          position: 'relative',
          boxShadow: '0 1px 3px rgba(13, 24, 41, 0.04)',
        }}
      >
        {isLoading ? (
          <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Skeleton width="100%" height={520} />
          </div>
        ) : merchants.length === 0 ? (
          <div style={{ height: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Share2 size={40} color="#a1988a" style={{ marginBottom: 12 }} aria-hidden="true" />
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600, color: '#0d2247' }}>
              No active debt obligations
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
              Record confirmed trades in the Ledger to populate the network graph.
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

      {/* Summary KPI Cards — Architectural Specification Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div
          className="stat-card"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid #dcd5cb',
            borderRadius: 8,
            padding: '16px 18px',
            overflow: 'hidden',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>
            Total Debt Volume
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: '#0d2247' }}>
            ₹{totalDebtVolume.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#1e6b4b', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            Across {debts.length} active debts
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid #dcd5cb',
            borderRadius: 8,
            padding: '16px 18px',
            overflow: 'hidden',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>
            Network Size
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: '#0d2247' }}>
            {merchants.length} Merchants
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            {debts.length > 0 ? (debts.length / Math.max(1, merchants.length * (merchants.length - 1))).toFixed(3) : '0.000'} graph density
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid #dcd5cb',
            borderRadius: 8,
            padding: '16px 18px',
            overflow: 'hidden',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>
            Network Status
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: contagionSource ? '#c8502a' : '#1e6b4b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {contagionSource ? 'CASCADE ACTIVE' : 'SECURE'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {contagionSource ? `Traced from ${contagionSource.replace(/_/g, ' ')}` : 'Click a node to simulate'}
          </div>
        </div>
      </div>
    </div>
  );
}
