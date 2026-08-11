import { useMemo, useState } from "react";
import { computeMockRiskScores, seedData } from "../data/seedData";
import RiskBadge from "../components/RiskBadge";
import type { RiskScoreResponse } from "../types";
import { ShieldAlert, X, AlertTriangle, Info } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const RISK_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

/**
 * Risk — Risk Analysis dashboard.
 *
 * Displays portfolio summary (average risk gauge), merchant risk table
 * with drill-down panel showing lambda, risk_score, and Poisson model details.
 */
export default function Risk() {
  const riskScores = useMemo(() => computeMockRiskScores(), []);
  const [selectedMerchant, setSelectedMerchant] = useState<RiskScoreResponse | null>(null);

  const portfolioAverage = useMemo(() => {
    if (riskScores.length === 0) return 0;
    return (
      riskScores.reduce((sum, r) => sum + r.risk_score, 0) / riskScores.length
    );
  }, [riskScores]);

  // Category distribution for pie chart
  const categoryDist = useMemo(() => {
    const counts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    riskScores.forEach((r) => {
      counts[r.risk_category] = (counts[r.risk_category] || 0) + 1;
    });

    // Also count merchants without risk data as "UNKNOWN"
    const noDataCount =
      seedData.merchants.length -
      riskScores.length;

    const data = Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([cat, count]) => ({
        name: cat,
        value: count,
        color: RISK_COLORS[cat],
      }));

    if (noDataCount > 0) {
      data.push({ name: "NO DATA", value: noDataCount, color: "#334155" });
    }

    return data;
  }, [riskScores]);

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h2>Risk Analysis</h2>
        <p>
          Poisson-based credit risk scoring — P(X≥1) = 1 - e<sup>-λ</sup>
        </p>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 280px",
          gap: 18,
          marginBottom: 24,
        }}
      >
        {/* Portfolio Average */}
        <div className="glass-card" style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "var(--font-size-xs)",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontWeight: 600,
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            Portfolio Average Risk
          </div>
          <div
            style={{
              fontSize: "3rem",
              fontWeight: 700,
              color:
                portfolioAverage < 0.1
                  ? "var(--risk-low)"
                  : portfolioAverage < 0.3
                  ? "var(--risk-medium)"
                  : "var(--risk-high)",
              letterSpacing: "-0.02em",
            }}
          >
            {(portfolioAverage * 100).toFixed(1)}%
          </div>
          <div
            style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}
          >
            Across {riskScores.length} profiled merchants
          </div>
        </div>

        {/* Model Info */}
        <div className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Info size={16} color="var(--accent)" />
            <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
              Poisson Risk Model
            </span>
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.7 }}>
            <p><strong>λ (lambda)</strong> = adverse events / months observed</p>
            <p><strong>Risk Score</strong> = 1 - e<sup>-λ</sup> (probability of ≥1 adverse event)</p>
            <p style={{ marginTop: 6 }}>
              <strong>Thresholds:</strong> LOW &lt;10% · MEDIUM 10-30% · HIGH 30-60% · CRITICAL ≥60%
            </p>
            <p><strong>Cold start:</strong> λ = 0.05 prior for &lt;3 months data</p>
          </div>
        </div>

        {/* Category Distribution Pie */}
        <div className="glass-card" style={{ padding: "14px" }}>
          <div
            style={{
              fontSize: "var(--font-size-xs)",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontWeight: 600,
              letterSpacing: "0.05em",
              marginBottom: 4,
              textAlign: "center",
            }}
          >
            Category Distribution
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={categoryDist}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={65}
                dataKey="value"
                stroke="none"
                paddingAngle={3}
              >
                {categoryDist.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#111827",
                  border: "1px solid rgba(99,102,241,0.2)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#f1f5f9",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {categoryDist.map((c) => (
              <span
                key={c.name}
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: c.color,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: c.color,
                    display: "inline-block",
                  }}
                />
                {c.name} ({c.value})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Merchant Risk Table + Drill-down */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedMerchant ? "1fr 380px" : "1fr",
          gap: 18,
        }}
      >
        {/* Risk Table */}
        <div className="glass-card">
          <h3
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            Merchant Risk Profiles
          </h3>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Risk Score</th>
                  <th>Category</th>
                  <th>λ Rate</th>
                  <th>Months</th>
                  <th>Late</th>
                  <th>Defaults</th>
                  <th>Cold Start</th>
                </tr>
              </thead>
              <tbody>
                {riskScores.map((r) => (
                  <tr
                    key={r.merchant_id}
                    onClick={() => setSelectedMerchant(r)}
                    style={{
                      cursor: "pointer",
                      background:
                        selectedMerchant?.merchant_id === r.merchant_id
                          ? "var(--accent-subtle)"
                          : undefined,
                    }}
                  >
                    <td>{r.merchant_id.replace("_", " ")}</td>
                    <td
                      style={{
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        color:
                          RISK_COLORS[r.risk_category] || "var(--text-primary)",
                      }}
                    >
                      {(r.risk_score * 100).toFixed(2)}%
                    </td>
                    <td>
                      <RiskBadge category={r.risk_category} />
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {r.lambda_rate.toFixed(4)}
                    </td>
                    <td>{r.months_observed}</td>
                    <td>{r.late_payment_events}</td>
                    <td>
                      {r.default_events > 0 ? (
                        <span style={{ color: "var(--risk-critical)", fontWeight: 600 }}>
                          {r.default_events}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>0</span>
                      )}
                    </td>
                    <td>
                      {r.cold_start ? (
                        <span
                          style={{
                            color: "var(--risk-medium)",
                            fontSize: "var(--font-size-xs)",
                          }}
                        >
                          <AlertTriangle
                            size={12}
                            style={{ verticalAlign: "middle", marginRight: 4 }}
                          />
                          Yes
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drill-down Panel */}
        {selectedMerchant && (
          <div className="glass-card animate-fade-in" style={{ alignSelf: "start" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 18,
              }}
            >
              <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 600 }}>
                <ShieldAlert
                  size={18}
                  style={{
                    verticalAlign: "middle",
                    marginRight: 8,
                    color: RISK_COLORS[selectedMerchant.risk_category],
                  }}
                />
                {selectedMerchant.merchant_id.replace("_", " ")}
              </h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedMerchant(null)}
                style={{ padding: "4px 8px" }}
              >
                <X size={14} />
              </button>
            </div>

            <RiskBadge category={selectedMerchant.risk_category} />

            <div style={{ marginTop: 18 }}>
              {/* Risk Score */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border-secondary)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>Risk Score</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: RISK_COLORS[selectedMerchant.risk_category],
                  }}
                >
                  {(selectedMerchant.risk_score * 100).toFixed(2)}%
                </span>
              </div>

              {/* Lambda */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border-secondary)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>λ (Lambda Rate)</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {selectedMerchant.lambda_rate.toFixed(4)}
                </span>
              </div>

              {/* Formula */}
              <div
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border-secondary)",
                  borderRadius: "var(--border-radius-sm)",
                  padding: 12,
                  marginTop: 14,
                  fontSize: "var(--font-size-xs)",
                  color: "var(--text-accent)",
                  textAlign: "center",
                  fontFamily: "monospace",
                }}
              >
                P(X ≥ 1) = 1 - e<sup>-{selectedMerchant.lambda_rate.toFixed(4)}</sup> ={" "}
                <strong>{(selectedMerchant.risk_score * 100).toFixed(2)}%</strong>
              </div>

              {/* Stats */}
              <div style={{ marginTop: 14, fontSize: "var(--font-size-sm)" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border-secondary)",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>Months Observed</span>
                  <span>{selectedMerchant.months_observed}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border-secondary)",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>Late Payments</span>
                  <span>{selectedMerchant.late_payment_events}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border-secondary)",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>Defaults</span>
                  <span
                    style={{
                      color:
                        selectedMerchant.default_events > 0
                          ? "var(--risk-critical)"
                          : undefined,
                      fontWeight:
                        selectedMerchant.default_events > 0 ? 600 : undefined,
                    }}
                  >
                    {selectedMerchant.default_events}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border-secondary)",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>Cold Start</span>
                  <span>{selectedMerchant.cold_start ? "Yes (prior: λ=0.05)" : "No"}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>Model</span>
                  <span style={{ fontSize: "var(--font-size-xs)" }}>
                    {selectedMerchant.model}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
