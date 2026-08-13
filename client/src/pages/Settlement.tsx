import { useState, useMemo } from "react";
import { ArrowRight, Zap, RefreshCw } from "lucide-react";
import TransactionList from "../components/TransactionList";
import {
  seedData,
  computeMockSettlement,
  detectMockCycles,
} from "../data/seedData";
import type { SettlementResponse } from "../types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

export default function Settlement() {
  const [settlement, setSettlement] = useState<SettlementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [computed, setComputed] = useState(false);

  const cycles = useMemo(() => detectMockCycles(), []);

  const handleCompute = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const result = computeMockSettlement();
    setSettlement(result);
    setComputed(true);
    setLoading(false);
  };

  const balanceChartData = useMemo(() => {
    if (!settlement) return [];
    return Object.entries(settlement.net_balances)
      .map(([merchant, balance]) => ({
        name: merchant.replace("_", " "),
        balance: Math.round(balance),
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [settlement]);

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h2>Settle All Debts</h2>
        <p>Find the smartest way to clear all debts with the fewest payments possible</p>
      </div>

      {/* Compute Button */}
      {!computed && (
        <div
          className="glass-card"
          style={{ textAlign: "center", padding: "56px 24px" }}
        >
          <div style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: 'var(--accent-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Zap size={32} color="var(--accent-light)" />
          </div>
          <h3 style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, marginBottom: 10 }}>
            Ready to Optimize
          </h3>
          <p style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--text-muted)",
            marginBottom: 28,
            maxWidth: 440,
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.7,
          }}>
            Our algorithm will analyze all {seedData.debts.length} debts between{" "}
            {seedData.merchants.length} merchants and find the minimum number of 
            payments needed to settle everything.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleCompute}
            disabled={loading}
            style={{ padding: '16px 36px', fontSize: 'var(--font-size-md)' }}
          >
            <Zap size={20} />
            {loading ? "Calculating..." : "Find Best Settlement"}
          </button>
        </div>
      )}

      {/* Settlement Results */}
      {computed && settlement && (
        <>
          {/* Before / After Comparison */}
          <div className="comparison-grid stagger-children">
            <div className="glass-card comparison-card before">
              <div className="comparison-label">Before</div>
              <div className="comparison-value">{seedData.debts.length}</div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", marginTop: 4 }}>
                payments needed
              </div>
            </div>

            <div className="comparison-arrow">
              <ArrowRight size={36} strokeWidth={2.5} />
            </div>

            <div className="glass-card comparison-card after">
              <div className="comparison-label">After</div>
              <div className="comparison-value">{settlement.transaction_count}</div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", marginTop: 4 }}>
                payments needed
              </div>
            </div>
          </div>

          {/* Reduction stat */}
          <div
            className="glass-card"
            style={{
              textAlign: "center",
              marginBottom: 20,
              padding: "20px",
              border: "1px solid rgba(52, 211, 153, 0.2)",
            }}
          >
            <span style={{ fontSize: "var(--font-size-2xl)", fontWeight: 800, color: "var(--risk-low)" }}>
              {Math.round(
                ((seedData.debts.length - settlement.transaction_count) / seedData.debts.length) * 100
              )}% fewer payments
            </span>
            <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", marginLeft: 16 }}>
              Total settled: {"\u20B9"}{settlement.total_amount_settled.toLocaleString("en-IN")}
            </span>
          </div>

          {/* Two columns: Transactions + Net Balances */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 20 }}>
            {/* Settlement Transactions */}
            <div className="glass-card">
              <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700, marginBottom: 14 }}>
                Who Pays Whom
              </h3>
              <TransactionList transactions={settlement.transactions} />
            </div>

            {/* Net Balances Chart */}
            <div className="glass-card">
              <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700, marginBottom: 8 }}>
                Balance Summary
              </h3>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginBottom: 16 }}>
                Green = is owed money · Red = owes money
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={balanceChartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    angle={-35}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      `\u20B9${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10, 17, 40, 0.95)",
                      border: "1px solid rgba(124, 58, 237, 0.2)",
                      borderRadius: 10,
                      fontSize: 12,
                      color: "#f1f5f9",
                    }}
                    formatter={(value: number) => [
                      `\u20B9${value.toLocaleString("en-IN")}`,
                      "Net Balance",
                    ]}
                  />
                  <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
                  <Bar dataKey="balance" radius={[6, 6, 0, 0]} barSize={28}>
                    {balanceChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.balance >= 0 ? "#34d399" : "#f87171"}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cycle Detection */}
          {cycles.has_cycle && (
            <div className="glass-card">
              <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700, marginBottom: 8 }}>
                Circular Debts Found
              </h3>
              <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", marginBottom: 16 }}>
                These are debts that go in a circle and can be canceled out before settling.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {cycles.cycles.map((cycle, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border-primary)",
                      borderRadius: "var(--border-radius-sm)",
                      padding: "12px 18px",
                    }}
                  >
                    <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-accent)", fontWeight: 500 }}>
                      {cycle.map((m) => m.replace("_", " ")).join(" \u2192 ")} \u2192{" "}
                      {cycle[0].replace("_", " ")}
                    </span>
                    <button className="btn btn-secondary btn-sm">Cancel Loop</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recompute */}
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button className="btn btn-secondary" onClick={handleCompute}>
              <RefreshCw size={16} /> Recalculate
            </button>
          </div>
        </>
      )}
    </div>
  );
}
