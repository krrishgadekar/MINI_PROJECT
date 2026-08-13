import { useMemo } from "react";
import { Users, Receipt, TrendingDown, RefreshCw, Sparkles } from "lucide-react";
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
  LOW: "#34d399",
  MEDIUM: "#fbbf24",
  HIGH: "#fb923c",
  CRITICAL: "#f87171",
};

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
      {/* Welcome Banner */}
      <div className="welcome-banner" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Sparkles size={22} color="var(--accent-light)" />
          <h2 style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 700,
            background: 'var(--accent-gradient-text)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Welcome to CreditFlow
          </h2>
        </div>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', maxWidth: 550 }}>
          Your smart dashboard for managing merchant debts, finding the fastest settlement paths, 
          and monitoring payment reliability across your network.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid stagger-children">
        <StatCard
          label="Merchants"
          value={seedData.merchants.length}
          icon={<Users size={20} color="#7c3aed" />}
          iconBg="rgba(124, 58, 237, 0.12)"
          subtitle="Active in network"
        />
        <StatCard
          label="Active Debts"
          value={seedData.debts.length}
          icon={<Receipt size={20} color="#fbbf24" />}
          iconBg="rgba(251, 191, 36, 0.12)"
          subtitle="Waiting to be settled"
        />
        <StatCard
          label="Total Volume"
          value={`\u20B9${(totalDebtVolume / 1000).toFixed(0)}K`}
          icon={<TrendingDown size={20} color="#f87171" />}
          iconBg="rgba(248, 113, 113, 0.12)"
          subtitle={`\u20B9${totalDebtVolume.toLocaleString("en-IN")} total`}
        />
        <StatCard
          label="Circular Debts"
          value={cycles.cycles.length}
          icon={<RefreshCw size={20} color="#34d399" />}
          iconBg="rgba(52, 211, 153, 0.12)"
          subtitle={
            cycles.has_cycle ? "Can be canceled automatically" : "No loops found"
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
          <div style={{ padding: "20px 24px 10px" }}>
            <h3
              style={{
                fontSize: "var(--font-size-md)",
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              Debt Network Map
            </h3>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              Click any merchant to see who they owe money to
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
              fontWeight: 700,
              marginBottom: 18,
            }}
          >
            Payment Reliability
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
                    background: "rgba(10, 17, 40, 0.95)",
                    border: "1px solid rgba(124, 58, 237, 0.2)",
                    borderRadius: 10,
                    fontSize: 12,
                    color: "#f1f5f9",
                    backdropFilter: 'blur(10px)',
                  }}
                  formatter={(value: number) => [`${value}%`, "Risk Level"]}
                />
                <Bar dataKey="risk" radius={[0, 6, 6, 0]} barSize={14}>
                  {riskChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={RISK_COLORS[entry.category] || "#7c3aed"}
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
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border-secondary)",
                }}
              >
                <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                  {r.merchant_id.replace("_", " ")}
                </span>
                <RiskBadge category={r.risk_category} />
              </div>
            ))}

            {seedData.merchants
              .filter((m) => !riskScores.find((r) => r.merchant_id === m))
              .slice(0, 3)
              .map((m) => (
                <div
                  key={m}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border-secondary)",
                  }}
                >
                  <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
                    {m.replace("_", " ")}
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    No data yet
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Detected Cycles */}
      {cycles.has_cycle && (
        <div className="glass-card animate-fade-in-up">
          <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700, marginBottom: 8 }}>
            Circular Debts Found
          </h3>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", marginBottom: 16 }}>
            These are loops where merchants owe each other in a circle. They can be canceled 
            out automatically without any money changing hands.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {cycles.cycles.map((cycle, i) => (
              <div
                key={i}
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "var(--border-radius-sm)",
                  padding: "12px 18px",
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-accent)",
                  fontWeight: 500,
                }}
              >
                {cycle.map((m) => m.replace("_", " ")).join(" \u2192 ")} \u2192{" "}
                {cycle[0].replace("_", " ")}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ margin: '40px -32px -32px -32px' }}>
        <Footer />
      </div>
    </div>
  );
}
