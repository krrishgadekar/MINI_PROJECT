import { useMemo } from "react";
import { Users, Receipt, TrendingDown, RefreshCw } from "lucide-react";
import StatCard from "../components/StatCard";
import GraphVisualizer from "../components/GraphVisualizer";
import RiskBadge from "../components/RiskBadge";
import Footer from "../components/Footer";
import {
  seedData,
  totalDebtVolume,
  computeMockRiskScores,
  detectMockCycles,
} from "../data/seedData";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const RISK_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

/**
 * Dashboard — Overview page with stat cards, interactive graph, and risk chart.
 *
 * Uses seed_data.json for all data until Chetan's backend is ready.
 */
export default function Dashboard() {
  const riskScores = useMemo(() => computeMockRiskScores(), []);
  const cycles = useMemo(() => detectMockCycles(), []);

  const riskChartData = useMemo(
    () =>
      riskScores.map((r) => ({
        name: r.merchant_id.replace("_", " "),
        risk: Math.round(r.risk_score * 100),
        category: r.risk_category,
      })),
    [riskScores]
  );

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>
          {seedData.scenario_name} — {seedData.merchants.length} merchants in
          network
        </p>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid stagger-children">
        <StatCard
          label="Total Merchants"
          value={seedData.merchants.length}
          icon={<Users size={20} color="#6366f1" />}
          iconBg="rgba(99, 102, 241, 0.12)"
          subtitle="Active in network"
        />
        <StatCard
          label="Active Debts"
          value={seedData.debts.length}
          icon={<Receipt size={20} color="#f59e0b" />}
          iconBg="rgba(245, 158, 11, 0.12)"
          subtitle="Pending settlement"
        />
        <StatCard
          label="Total Debt Volume"
          value={`₹${(totalDebtVolume / 1000).toFixed(0)}K`}
          icon={<TrendingDown size={20} color="#ef4444" />}
          iconBg="rgba(239, 68, 68, 0.12)"
          subtitle={`₹${totalDebtVolume.toLocaleString("en-IN")} total`}
        />
        <StatCard
          label="Circular Debt Cycles"
          value={cycles.cycles.length}
          icon={<RefreshCw size={20} color="#22c55e" />}
          iconBg="rgba(34, 197, 94, 0.12)"
          subtitle={
            cycles.has_cycle ? "Netting opportunity detected" : "No cycles found"
          }
        />
      </div>

      {/* Main Content: Graph + Risk Chart */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 18,
          marginBottom: 28,
        }}
      >
        {/* Graph Visualizer */}
        <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 22px 10px" }}>
            <h3
              style={{
                fontSize: "var(--font-size-md)",
                fontWeight: 600,
                marginBottom: 2,
              }}
            >
              Merchant Debt Network
            </h3>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              Click a node to run BFS and highlight reachable merchants
            </p>
          </div>
          <GraphVisualizer
            merchants={seedData.merchants}
            debts={seedData.debts}
            riskProfiles={riskScores}
            height={420}
          />
        </div>

        {/* Risk Overview Panel */}
        <div className="glass-card" style={{ display: "flex", flexDirection: "column" }}>
          <h3
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: 600,
              marginBottom: 18,
            }}
          >
            Risk Overview
          </h3>

          {/* Risk Bar Chart */}
          <div style={{ flex: 1, minHeight: 200 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={riskChartData}
                layout="vertical"
                margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    background: "#111827",
                    border: "1px solid rgba(99,102,241,0.2)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#f1f5f9",
                  }}
                  formatter={(value: number) => [`${value}%`, "Risk Score"]}
                />
                <Bar dataKey="risk" radius={[0, 4, 4, 0]} barSize={16}>
                  {riskChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={RISK_COLORS[entry.category] || "#6366f1"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Risk List */}
          <div style={{ marginTop: 14 }}>
            {riskScores.map((r) => (
              <div
                key={r.merchant_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border-secondary)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {r.merchant_id.replace("_", " ")}
                </span>
                <RiskBadge category={r.risk_category} />
              </div>
            ))}

            {/* Merchants without risk data */}
            {seedData.merchants
              .filter(
                (m) => !riskScores.find((r) => r.merchant_id === m)
              )
              .slice(0, 3)
              .map((m) => (
                <div
                  key={m}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border-secondary)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--font-size-sm)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {m.replace("_", " ")}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--text-muted)",
                    }}
                  >
                    No data
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Detected Cycles */}
      {cycles.has_cycle && (
        <div className="glass-card">
          <h3
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: 600,
              marginBottom: 14,
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
            These cycles can be netted to reduce total transactions without any
            money moving.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {cycles.cycles.map((cycle, i) => (
              <div
                key={i}
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "var(--border-radius-sm)",
                  padding: "10px 16px",
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-accent)",
                  fontWeight: 500,
                }}
              >
                {cycle.map((m) => m.replace("_", " ")).join(" → ")} →{" "}
                {cycle[0].replace("_", " ")}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ margin: '40px -28px -28px -28px' }}>
        <Footer />
      </div>
    </div>
  );
}
