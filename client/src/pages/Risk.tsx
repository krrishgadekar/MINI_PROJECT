import { useMemo, useState } from "react";
import { computeMockRiskScores, seedData } from "../data/seedData";
import RiskBadge from "../components/RiskBadge";
import type { RiskScoreResponse } from "../types";
import { ShieldAlert, X, TrendingUp, AlertTriangle } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const RISK_COLORS: Record<string, string> = {
  LOW: "#34d399",
  MEDIUM: "#fbbf24",
  HIGH: "#fb923c",
  CRITICAL: "#f87171",
};

const RISK_LABELS: Record<string, string> = {
  LOW: "Reliable",
  MEDIUM: "Needs Watching",
  HIGH: "Risky",
  CRITICAL: "Very Risky",
};

export default function Risk() {
  const riskScores = useMemo(() => computeMockRiskScores(), []);
  const [selectedMerchant, setSelectedMerchant] = useState<RiskScoreResponse | null>(null);

  const portfolioAverage = useMemo(() => {
    if (riskScores.length === 0) return 0;
    return riskScores.reduce((sum, r) => sum + r.risk_score, 0) / riskScores.length;
  }, [riskScores]);

  const categoryDist = useMemo(() => {
    const counts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    riskScores.forEach((r) => {
      counts[r.risk_category] = (counts[r.risk_category] || 0) + 1;
    });

    const noDataCount = seedData.merchants.length - riskScores.length;

    const data = Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([cat, count]) => ({
        name: RISK_LABELS[cat] || cat,
        value: count,
        color: RISK_COLORS[cat],
      }));

    if (noDataCount > 0) {
      data.push({ name: "No Data", value: noDataCount, color: "#334155" });
    }

    return data;
  }, [riskScores]);

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h2>Risk Analysis</h2>
        <p>See how reliable each merchant is based on their payment history</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 300px", gap: 18, marginBottom: 24 }}>
        {/* Portfolio Average */}
        <div className="glass-card" style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "var(--font-size-xs)",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            fontWeight: 600,
            letterSpacing: "0.06em",
            marginBottom: 10,
          }}>
            Average Risk Level
          </div>
          <div style={{
            fontSize: "3rem",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            color: portfolioAverage < 0.3 ? "var(--risk-low)" : portfolioAverage < 0.6 ? "var(--risk-high)" : "var(--risk-critical)",
          }}>
            {(portfolioAverage * 100).toFixed(1)}%
          </div>
          <div style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--text-muted)",
            marginTop: 6,
          }}>
            across {riskScores.length} merchants with data
          </div>
        </div>

        {/* How it works */}
        <div className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <TrendingUp size={20} color="var(--accent-light)" />
            <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>How We Score Risk</h3>
          </div>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            We analyze each merchant's history of late payments and defaults. 
            The more issues in their past, the higher their risk score. 
            Merchants with very little history get a "new" rating until we have more data.
          </p>
        </div>

        {/* Pie Chart */}
        <div className="glass-card">
          <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: 8, color: "var(--text-muted)" }}>
            MERCHANT BREAKDOWN
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={categoryDist}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {categoryDist.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "rgba(10, 17, 40, 0.95)",
                  border: "1px solid rgba(124, 58, 237, 0.2)",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "#f1f5f9",
                }}
                formatter={(value: number, name: string) => [`${value} merchants`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
            {categoryDist.map((cat) => (
              <div key={cat.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-xs)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color }} />
                <span style={{ color: "var(--text-muted)" }}>{cat.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Merchant Risk Table */}
      <div className="glass-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>
            Merchant Profiles
          </h3>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            Click a row for details
          </span>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Months Tracked</th>
                <th>Late Payments</th>
                <th>Defaults</th>
                <th>Risk Level</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {riskScores
                .sort((a, b) => b.risk_score - a.risk_score)
                .map((r) => (
                  <tr
                    key={r.merchant_id}
                    onClick={() => setSelectedMerchant(r)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      {r.merchant_id.replace("_", " ")}
                      {r.cold_start && (
                        <span style={{
                          fontSize: "var(--font-size-xs)",
                          color: "var(--text-muted)",
                          marginLeft: 8,
                          background: "var(--bg-tertiary)",
                          padding: "2px 8px",
                          borderRadius: 4,
                        }}>
                          NEW
                        </span>
                      )}
                    </td>
                    <td>{r.months_observed}</td>
                    <td style={{ color: r.late_payment_events > 0 ? "var(--risk-medium)" : "var(--text-muted)" }}>
                      {r.late_payment_events}
                    </td>
                    <td style={{ color: r.default_events > 0 ? "var(--risk-critical)" : "var(--text-muted)" }}>
                      {r.default_events}
                    </td>
                    <td><RiskBadge category={r.risk_category} /></td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: RISK_COLORS[r.risk_category],
                      }}>
                        {(r.risk_score * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}

              {/* Merchants without risk data */}
              {seedData.merchants
                .filter((m) => !riskScores.find((r) => r.merchant_id === m))
                .map((m) => (
                  <tr key={m}>
                    <td style={{ color: "var(--text-muted)" }}>
                      {m.replace("_", " ")}
                      <span style={{
                        fontSize: "var(--font-size-xs)",
                        color: "var(--text-muted)",
                        marginLeft: 8,
                        background: "var(--bg-tertiary)",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}>
                        NO DATA
                      </span>
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>—</td>
                    <td style={{ color: "var(--text-muted)" }}>—</td>
                    <td style={{ color: "var(--text-muted)" }}>—</td>
                    <td><span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>—</span></td>
                    <td><span style={{ color: "var(--text-muted)" }}>—</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedMerchant && (
        <div
          className="glass-card animate-slide-in"
          style={{
            position: "fixed",
            top: 80,
            right: 32,
            width: 380,
            zIndex: 200,
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-lg), var(--shadow-glow-strong)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>
              {selectedMerchant.merchant_id.replace("_", " ")}
            </h3>
            <button
              onClick={() => setSelectedMerchant(null)}
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-secondary)",
                borderRadius: 8,
                padding: 6,
                cursor: "pointer",
                display: "flex",
                color: "var(--text-muted)",
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <div style={{ background: "var(--bg-tertiary)", borderRadius: 10, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginBottom: 4 }}>Risk Score</div>
              <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 800, color: RISK_COLORS[selectedMerchant.risk_category] }}>
                {(selectedMerchant.risk_score * 100).toFixed(1)}%
              </div>
            </div>
            <div style={{ background: "var(--bg-tertiary)", borderRadius: 10, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginBottom: 4 }}>Status</div>
              <div style={{ marginTop: 4 }}><RiskBadge category={selectedMerchant.risk_category} /></div>
            </div>
          </div>

          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", lineHeight: 1.8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-secondary)" }}>
              <span>Months Tracked</span><span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{selectedMerchant.months_observed}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-secondary)" }}>
              <span>Late Payments</span><span style={{ fontWeight: 600, color: selectedMerchant.late_payment_events > 0 ? "var(--risk-medium)" : "var(--text-primary)" }}>{selectedMerchant.late_payment_events}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-secondary)" }}>
              <span>Defaults</span><span style={{ fontWeight: 600, color: selectedMerchant.default_events > 0 ? "var(--risk-critical)" : "var(--text-primary)" }}>{selectedMerchant.default_events}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
              <span>New Merchant?</span><span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{selectedMerchant.cold_start ? "Yes" : "No"}</span>
            </div>
          </div>

          {selectedMerchant.risk_score > 0.3 && (
            <div style={{
              marginTop: 16,
              padding: "12px 14px",
              background: "var(--risk-critical-bg)",
              borderRadius: 10,
              border: "1px solid rgba(248, 113, 113, 0.15)",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}>
              <AlertTriangle size={16} color="var(--risk-critical)" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--risk-critical)", lineHeight: 1.5 }}>
                This merchant has a high likelihood of missing future payments. Consider reducing exposure.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
