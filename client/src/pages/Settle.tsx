import { useState, useMemo } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import TransactionList from '../components/TransactionList';
import { useGroup } from '../state/GroupProvider';
import { useTaxSummary } from '../hooks/useTax';
import {
  seedData,
  computeMockSettlement,
  detectMockCycles,
} from '../data/seedData';
import type { SettlementResponse } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';

export default function Settle() {
  const { activeGroup } = useGroup();
  const isTaxGroup = Boolean(activeGroup?.domain && activeGroup.domain !== 'none');
  const { data: taxSummary } = useTaxSummary();

  const [settlement, setSettlement] = useState<SettlementResponse | null>(() => computeMockSettlement());
  const [loading, setLoading] = useState(false);
  const [computed, setComputed] = useState(true);

  const cycles = useMemo(() => detectMockCycles(), []);

  const handleCompute = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const result = computeMockSettlement();
    setSettlement(result);
    setComputed(true);
    setLoading(false);
  };

  const balanceChartData = useMemo(() => {
    if (!settlement) return [];
    return Object.entries(settlement.net_balances)
      .map(([merchant, balance]) => ({
        name: merchant.replace('_', ' '),
        balance: Math.round(balance),
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [settlement]);

  return (
    <div className="animate-fade-in" style={{ padding: '0 4px' }}>
      {/* Header — Illoca Architectural Blueprint Header */}
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
            Settlement Optimizer
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
            Debt Settlement Optimizer
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>
            Automatically find circular debts and settle them to minimize total cash payments.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCompute}
          disabled={loading}
          style={{
            background: '#0d2247',
            color: '#ffffff',
            border: '1px solid #0d2247',
            padding: '8px 16px',
            borderRadius: 2,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div style={{ width: 8, height: 8, background: '#c8502a', borderRadius: 1 }} />
          <span>{loading ? 'SOLVING...' : 'OPTIMIZE NETTING'}</span>
        </button>
      </div>

      {/* Before / After Comparison Grid */}
      {computed && settlement && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr auto 1fr',
              alignItems: 'center',
              gap: 16,
              marginBottom: 20,
            }}
          >
            {/* Before Card */}
            <div
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid #dcd5cb',
                borderRadius: 4,
                padding: '16px 20px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                ORIGINAL TRANSACTIONS
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.4rem', fontWeight: 700, color: '#c8502a', marginTop: 4 }}>
                {seedData.debts.length}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Bilateral trade credit contracts
              </div>
            </div>

            <div style={{ color: '#0d2247', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowRight size={28} strokeWidth={2} />
            </div>

            {/* After Card */}
            <div
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid #0d2247',
                borderRadius: 4,
                padding: '16px 20px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#1e6b4b', fontWeight: 700 }}>
                OPTIMIZED CLEARING STEPS
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.4rem', fontWeight: 700, color: '#1e6b4b', marginTop: 4 }}>
                {settlement.transaction_count}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Direct settlement payments needed
              </div>
            </div>

            <div style={{ color: '#0d2247', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowRight size={28} strokeWidth={2} />
            </div>

            {/* Reduction Metric */}
            <div
              className="card"
              style={{
                background: '#f4f0eb',
                border: '1px solid #dcd5cb',
                borderRadius: 4,
                padding: '16px 20px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#0d2247', fontWeight: 700 }}>
                EFFICIENCY GAIN
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.4rem', fontWeight: 700, color: '#0d2247', marginTop: 4 }}>
                {Math.round(((seedData.debts.length - settlement.transaction_count) / seedData.debts.length) * 100)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#1e6b4b', fontWeight: 600 }}>
                {seedData.debts.length - settlement.transaction_count} redundant transfers eliminated
              </div>
            </div>
          </div>

          {/* Circular Cycles Banner */}
          {cycles.has_cycle && (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #dcd5cb',
                borderRadius: 4,
                padding: '16px 20px',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <CheckCircle2 size={16} color="#1e6b4b" />
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem', fontWeight: 700, color: '#0d2247' }}>
                  Circular Debt Loops Detected &amp; Annihilated
                </h3>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                These debts form directed closed cycles that can be offset locally without any cash leaving the market:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {cycles.cycles.map((cycle, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#faf8f4',
                      border: '1px solid #dcd5cb',
                      borderRadius: 2,
                      padding: '8px 12px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                    }}
                  >
                    <span style={{ color: '#0d2247', fontWeight: 600 }}>
                      {cycle.map((m) => m.replace('_', ' ')).join(' → ')} → {cycle[0].replace('_', ' ')}
                    </span>
                    <span
                      style={{
                        padding: '2px 6px',
                        background: 'rgba(30, 107, 75, 0.1)',
                        color: '#1e6b4b',
                        borderRadius: 2,
                        fontSize: '0.68rem',
                        fontWeight: 700,
                      }}
                    >
                      OFFSET
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two columns: Transactions + Net Balances */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Settlement Transactions */}
            <div
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid #dcd5cb',
                borderRadius: 4,
                padding: 20,
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#c8502a', fontWeight: 700, marginBottom: 4 }}>
                [SCHEDULE // EXECUTABLE CLEARINGS]
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, color: '#0d2247', marginBottom: 12 }}>
                Net Settlement Wire Transfers
              </h3>

              {/* Tax Note and Grand Totals (§2.2 D3-P) */}
              {isTaxGroup && (
                <div
                  data-testid="settle-tax-note"
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: '#0d2247',
                    background: '#faf8f4',
                    border: '1px solid #dcd5cb',
                    borderRadius: 2,
                    padding: '8px 12px',
                    marginBottom: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>Amounts are payable including tax</span>
                    <span style={{ color: '#c8502a', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                      {activeGroup?.domain} DOMAIN
                    </span>
                  </div>
                  {taxSummary && (
                    <div style={{ display: 'flex', gap: 14, color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 2, flexWrap: 'wrap' }}>
                      <span>Grand Base: <strong style={{ color: '#0d2247' }}>₹{taxSummary.grandBase.toLocaleString('en-IN')}</strong></span>
                      <span>Grand Tax: <strong style={{ color: '#c8502a' }}>₹{taxSummary.grandTax.toLocaleString('en-IN')}</strong></span>
                      <span>Grand Payable: <strong style={{ color: '#1e6b4b' }}>₹{taxSummary.grandPayable.toLocaleString('en-IN')}</strong></span>
                    </div>
                  )}
                </div>
              )}

              <TransactionList transactions={settlement.transactions} isTaxGroup={isTaxGroup} />
            </div>

            {/* Net Balances Chart */}
            <div
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid #dcd5cb',
                borderRadius: 4,
                padding: 20,
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#c8502a', fontWeight: 700, marginBottom: 4 }}>
                [BALANCE RADAR // SURPLUS &amp; DEFICIT]
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, color: '#0d2247', marginBottom: 6 }}>
                Net Balances Distribution
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
                Green = Net Creditor (Due to receive) · Orange = Net Debtor (Due to pay)
              </p>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={balanceChartData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#424d5d', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      axisLine={{ stroke: '#dcd5cb' }}
                      tickLine={false}
                      angle={-30}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis
                      tick={{ fill: '#718096', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      axisLine={{ stroke: '#dcd5cb' }}
                      tickLine={false}
                      tickFormatter={(v) => `₹${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#ffffff',
                        border: '1px solid #0d2247',
                        borderRadius: 2,
                        fontSize: 12,
                        fontFamily: 'JetBrains Mono',
                        color: '#0d1829',
                      }}
                      formatter={(value: any) => [
                        `₹${Number(value || 0).toLocaleString('en-IN')}`,
                        'Net Balance',
                      ]}
                    />
                    <ReferenceLine y={0} stroke="#0d2247" />
                    <Bar dataKey="balance" radius={[2, 2, 0, 0]} barSize={24}>
                      {balanceChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.balance >= 0 ? '#1e6b4b' : '#c8502a'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
