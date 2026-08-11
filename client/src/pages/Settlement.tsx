import { useState, useMemo } from "react";
import { ArrowRight, Zap, GitBranch } from "lucide-react";
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

/**
 * Settlement — Settlement computation page.
 *
 * Provides a "Compute Settlement" trigger, before/after comparison,
 * settlement transaction list, cycle detection panel, and net balances chart.
 */
export default function Settlement() {
  const [settlement, setSettlement] = useState<SettlementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [computed, setComputed] = useState(false);

  const cycles = useMemo(() => detectMockCycles(), []);

  const handleCompute = async () => {
    setLoading(true);
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const result = computeMockSettlement();
    setSettlement(result);
    setComputed(true);
    setLoading(false);
  };

  // Net balances chart data
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
        <h2>Debt Settlement</h2>
        <p>
          Compute the minimum number of transactions to settle all debts using a
          Greedy O(N log N) algorithm
        </p>
      </div>

      {/* Compute Button */}
      {!computed && (
        <div
          className="glass-card"
          style={{ textAlign: "center", padding: "48px 24px" }}
        >
          <GitBranch
            size={48}
            color="var(--accent)"
            style={{ marginBottom: 16 }}
          />
          <h3
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Ready to Settle
          </h3>
          <p
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--text-muted)",
              marginBottom: 24,
              maxWidth: 480,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            The greedy algorithm will compute the minimum set of transactions
            needed to clear all {seedData.debts.length} debts across{" "}
            {seedData.merchants.length} merchants.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleCompute}
            disabled={loading}
          >
            <Zap size={20} />
            {loading ? "Computing..." : "Compute Settlement"}
          </button>
        </div>
      )}

      {/* Settlement Results */}
      {computed && settlement && (
        <>
          {/* Before / After Comparison */}
          <div className="comparison-grid stagger-children">
            <div className="glass-card comparison-card before">
              <div className="comparison-label">Before (Original)</div>
              <div className="comparison-value">{seedData.debts.length}</div>
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                transactions
              </div>
            </div>

            <div className="comparison-arrow">
              <ArrowRight size={32} />
            </div>

            <div className="glass-card comparison-card after">
              <div className="comparison-label">After (Optimized)</div>
              <div className="comparison-value">
                {settlement.transaction_count}
              </div>
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                transactions
              </div>
            </div>
          </div>

          {/* Reduction stat */}
          <div
            className="glass-card"
            style={{
              textAlign: "center",
              marginBottom: 20,
              padding: "18px",
              border: "1px solid rgba(34, 197, 94, 0.2)",
            }}
          >
            <span
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--text-muted)",
              }}
            >
              Reduction:{" "}
            </span>
            <span
              style={{
                fontSize: "var(--font-size-lg)",
                fontWeight: 700,
                color: "var(--risk-low)",
              }}
            >
              {Math.round(
                ((seedData.debts.length - settlement.transaction_count) /
                  seedData.debts.length) *
                  100
              )}
              % fewer transactions
            </span>
            <span
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--text-muted)",
                marginLeft: 12,
              }}
            >
              | Total settled: ₹
              {settlement.total_amount_settled.toLocaleString("en-IN")}
            </span>
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-muted)",
                marginLeft: 12,
              }}
            >
              | Algorithm: {settlement.algorithm}
            </span>
          </div>

          {/* Two columns: Transactions + Net Balances */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
              marginBottom: 20,
            }}
          >
            {/* Settlement Transactions */}
            <div className="glass-card">
              <h3
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: 600,
                  marginBottom: 14,
                }}
              >
                Settlement Transactions
              </h3>
              <TransactionList transactions={settlement.transactions} />
            </div>

            {/* Net Balances Chart */}
            <div className="glass-card">
              <h3
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: 600,
                  marginBottom: 14,
                }}
              >
                Net Balances
              </h3>
              <p
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--text-muted)",
                  marginBottom: 16,
                }}
              >
                Positive = net creditor (owed money) · Negative = net debtor
                (owes money)
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={balanceChartData}
                  margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
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
                      `₹${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111827",
                      border: "1px solid rgba(99,102,241,0.2)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#f1f5f9",
                    }}
                    formatter={(value: number) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      "Net Balance",
                    ]}
                  />
                  <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
                  <Bar dataKey="balance" radius={[4, 4, 0, 0]} barSize={28}>
                    {balanceChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.balance >= 0 ? "#22c55e" : "#ef4444"}
                        fillOpacity={0.8}
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
              <h3
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Detected Circular Debt Cycles
              </h3>
              <p
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-muted)",
                  marginBottom: 16,
                }}
              >
                These cycles were detected using DFS O(V+E). They can be netted
                before settlement to further reduce transactions.
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
                      padding: "10px 16px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-accent)",
                        fontWeight: 500,
                      }}
                    >
                      {cycle.map((m) => m.replace("_", " ")).join(" → ")} →{" "}
                      {cycle[0].replace("_", " ")}
                    </span>
                    <button className="btn btn-secondary btn-sm">
                      Net Cycle
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recompute */}
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={handleCompute}>
              <Zap size={16} /> Recompute Settlement
            </button>
          </div>
        </>
      )}
    </div>
  );
}
