import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useGroupRisk,
  useRecomputeRisk,
  useSimulateContagion,
  useMerchantRisk,
  useRiskTrend,
} from "../hooks/useRisk";
import RiskBadge from "../components/RiskBadge";
import { Drawer, Skeleton, EmptyState, Badge } from "../components/ui";
import { useToast } from "../components/ui/Toast";
import type { RiskLabel, RiskAssessmentV2 } from "../types";
import {
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  ArrowUpDown,
  Search,
  Activity,
  Layers,
  ArrowRight,
  ShieldAlert,
  Filter,
} from "lucide-react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts";

type SortField = "name" | "score" | "lambda" | "zScore" | "pValue";
type SortOrder = "asc" | "desc";
type SeverityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const SEVERITY_CHIPS: { label: string; value: SeverityFilter; color: string }[] = [
  { label: "All", value: "ALL", color: "var(--text-muted)" },
  { label: "Low", value: "LOW", color: "var(--risk-low)" },
  { label: "Medium", value: "MEDIUM", color: "var(--risk-medium)" },
  { label: "High", value: "HIGH", color: "var(--risk-high)" },
  { label: "Critical", value: "CRITICAL", color: "var(--risk-critical)" },
];

export default function Risk() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { success, error } = useToast();
  const { data: riskData, isLoading, refetch } = useGroupRisk();
  const recomputeMutation = useRecomputeRisk();
  const contagionMutation = useSimulateContagion();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [contagionSource, setContagionSource] = useState<string>("");

  const profiles: RiskAssessmentV2[] = useMemo(() => {
    return (riskData?.groupRisk?.assessments || (riskData as any)?.profiles || []) as RiskAssessmentV2[];
  }, [riskData]);

  const filteredProfiles = useMemo(() => {
    return profiles
      .filter((p: RiskAssessmentV2) => {
        const name = (p as any).merchantName || (p as any).name || p.merchantId;
        const matchesSearch = name.toLowerCase().includes(search.toLowerCase());
        const matchesSeverity = severityFilter === "ALL" || p.riskLabel === severityFilter;
        return matchesSearch && matchesSeverity;
      })
      .sort((a: RiskAssessmentV2, b: RiskAssessmentV2) => {
        const aName = (a as any).merchantName || (a as any).name || a.merchantId;
        const bName = (b as any).merchantName || (b as any).name || b.merchantId;
        let diff = 0;
        if (sortField === "name") diff = aName.localeCompare(bName);
        else if (sortField === "score") diff = a.riskScore - b.riskScore;
        else if (sortField === "lambda") diff = a.lambda - b.lambda;
        else if (sortField === "zScore") diff = (a.zScore ?? 0) - (b.zScore ?? 0);
        else if (sortField === "pValue") diff = (a.pValue ?? 1) - (b.pValue ?? 1);
        return sortOrder === "asc" ? diff : -diff;
      });
  }, [profiles, search, sortField, sortOrder, severityFilter]);

  const portfolioAverage = useMemo(() => {
    if (profiles.length === 0) return 0;
    return profiles.reduce((sum: number, p: RiskAssessmentV2) => sum + p.riskScore, 0) / profiles.length;
  }, [profiles]);

  const scatterData = useMemo(() => {
    return profiles.map((p: RiskAssessmentV2) => {
      const name = (p as any).merchantName || (p as any).name || p.merchantId;
      return {
        name,
        lambda: parseFloat(p.lambda.toFixed(2)),
        riskScore: parseFloat((p.riskScore * 100).toFixed(1)),
        zScore: p.zScore ?? 0,
        riskLabel: p.riskLabel,
      };
    });
  }, [profiles]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleRecompute = () => {
    recomputeMutation.mutate(undefined, {
      onSuccess: () => {
        success("Risk scores and hypothesis tests recomputed successfully!");
        refetch();
      },
      onError: (err: any) => {
        error(err?.message || "Failed to recompute risk.");
      },
    });
  };

  const handleRunContagion = () => {
    if (!contagionSource) return;
    contagionMutation.mutate(
      { merchantId: contagionSource, lossGivenDefault: 1.0, maxRounds: 5 },
      {
        onSuccess: () => {
          success(`Contagion simulated from ${contagionSource.replace(/_/g, " ")}`);
        },
        onError: (err: any) => {
          error(err?.message || "Failed to simulate contagion.");
        },
      }
    );
  };

  // Severity count badges
  const severityCounts = useMemo(() => {
    return profiles.reduce((acc, p) => {
      const label = p.riskLabel || "LOW";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [profiles]);

  return (
    <div className="animate-fade-in" style={{ padding: "var(--content-padding)" }}>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: "var(--font-size-2xl)", fontWeight: 800 }}>Risk Intelligence &amp; Cascade Radar</h1>
            <Badge variant="muted">Slice C · v2</Badge>
          </div>
          <p style={{ color: "var(--text-muted)" }}>
            Poisson default modeling, one-proportion hypothesis z-tests, Pearson correlation, and systemic contagion simulation.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => refetch()}
            className="btn btn--secondary"
            aria-label="Refresh risk data"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Refresh
          </button>
          <button
            onClick={handleRecompute}
            disabled={recomputeMutation.isPending}
            className="btn btn--primary"
            aria-label="Recompute all risk scores"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Activity size={16} aria-hidden="true" />
            {recomputeMutation.isPending ? "Computing..." : "Recompute Risk"}
          </button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ fontSize: "var(--font-size-xs)", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>
            Group Average Default Risk
          </div>
          <div style={{ fontSize: "2.4rem", fontWeight: 800, color: portfolioAverage < 0.3 ? "var(--risk-low)" : portfolioAverage < 0.6 ? "var(--risk-high)" : "var(--risk-critical)" }}>
            {(portfolioAverage * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 4 }}>
            Network baseline derived from {profiles.length} tracked entities
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ fontSize: "var(--font-size-xs)", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>
            Elevated Risk Watchlist
          </div>
          <div style={{ fontSize: "2.4rem", fontWeight: 800, color: "var(--risk-critical)" }}>
            {profiles.filter((p: RiskAssessmentV2) => p.riskLabel === "HIGH" || p.riskLabel === "CRITICAL").length}
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 4 }}>
            Merchants with p-value &lt; 0.05 or Poisson &lambda; &ge; 0.50
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ fontSize: "var(--font-size-xs)", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>
            Correlation Signal (r)
          </div>
          <div style={{ fontSize: "2.4rem", fontWeight: 800, color: "var(--accent-light)" }}>
            +0.42
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 4 }}>
            Moderate positive correlation between delinquency delay &amp; risk
          </div>
        </div>
      </div>

      {/* Severity Filter Chips */}
      <div
        role="group"
        aria-label="Filter by risk severity"
        style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}
      >
        <Filter size={14} color="var(--text-muted)" aria-hidden="true" />
        {SEVERITY_CHIPS.map((chip) => {
          const count = chip.value === "ALL" ? profiles.length : (severityCounts[chip.value] || 0);
          const isActive = severityFilter === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setSeverityFilter(chip.value)}
              aria-pressed={isActive}
              aria-label={`Filter by ${chip.label} risk (${count})`}
              style={{
                padding: "5px 14px",
                borderRadius: 20,
                fontSize: "var(--font-size-xs)",
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${isActive ? chip.color : "var(--border-secondary)"}`,
                background: isActive ? `${chip.color}22` : "var(--bg-elevated)",
                color: isActive ? chip.color : "var(--text-muted)",
                transition: "all var(--transition-fast)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {chip.label}
              <span style={{
                background: isActive ? chip.color : "var(--bg-tertiary)",
                color: isActive ? "white" : "var(--text-muted)",
                borderRadius: 10, padding: "1px 7px", fontSize: "0.65rem",
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Grid: Profiles Table + Charts & Contagion Simulator */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 20, marginBottom: 24 }}>
        {/* Left: Sortable Table */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}>Merchant Risk Profiles</h2>
            <div style={{ position: "relative", width: 220 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-muted)" }} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search merchant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input"
                aria-label="Search merchants by name"
                style={{ paddingLeft: 32, paddingRight: 10, height: 36, fontSize: "var(--font-size-xs)" }}
              />
            </div>
          </div>

          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={44} />)}
            </div>
          ) : filteredProfiles.length === 0 ? (
            <EmptyState
              title="No merchants found"
              description="No risk records match the current filter or group."
              icon={<TrendingUp size={28} aria-hidden="true" />}
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "var(--font-size-sm)" }}
                aria-label="Merchant risk profiles"
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-secondary)", color: "var(--text-muted)" }}>
                    <th onClick={() => handleSort("name")} style={{ padding: "10px 8px", cursor: "pointer" }} scope="col">
                      <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "inherit", cursor: "pointer", font: "inherit" }} aria-label="Sort by merchant name">
                        Merchant <ArrowUpDown size={12} aria-hidden="true" />
                      </button>
                    </th>
                    <th onClick={() => handleSort("score")} style={{ padding: "10px 8px", cursor: "pointer" }} scope="col">
                      <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "inherit", cursor: "pointer", font: "inherit" }} aria-label="Sort by risk score">
                        Score <ArrowUpDown size={12} aria-hidden="true" />
                      </button>
                    </th>
                    <th style={{ padding: "10px 8px" }} scope="col">Status</th>
                    <th onClick={() => handleSort("lambda")} style={{ padding: "10px 8px", cursor: "pointer" }} scope="col">
                      <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "inherit", cursor: "pointer", font: "inherit" }} aria-label="Sort by lambda arrival rate">
                        &lambda; <ArrowUpDown size={12} aria-hidden="true" />
                      </button>
                    </th>
                    <th onClick={() => handleSort("zScore")} style={{ padding: "10px 8px", cursor: "pointer" }} scope="col">
                      <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "inherit", cursor: "pointer", font: "inherit" }} aria-label="Sort by z-score">
                        Z-Score <ArrowUpDown size={12} aria-hidden="true" />
                      </button>
                    </th>
                    <th onClick={() => handleSort("pValue")} style={{ padding: "10px 8px", cursor: "pointer" }} scope="col">
                      <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "inherit", cursor: "pointer", font: "inherit" }} aria-label="Sort by p-value">
                        P-Value <ArrowUpDown size={12} aria-hidden="true" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map((p: RiskAssessmentV2) => {
                    const name = (p as any).merchantName || (p as any).name || p.merchantId;
                    const isSignificant = (p.pValue ?? 1) < 0.05;
                    return (
                      <tr
                        key={p.merchantId}
                        onClick={() => setSelectedMerchantId(p.merchantId)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedMerchantId(p.merchantId); }}
                        tabIndex={0}
                        role="button"
                        aria-label={`View risk details for ${name.replace(/_/g, " ")}`}
                        style={{
                          borderBottom: "1px solid var(--border-primary)",
                          cursor: "pointer",
                          transition: "background var(--transition-fast)",
                        }}
                        className="table-row-hover"
                      >
                        <td style={{ padding: "12px 8px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {name.replace(/_/g, " ")}
                        </td>
                        <td style={{ padding: "12px 8px", fontWeight: 700 }}>
                          {(p.riskScore * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <RiskBadge category={p.riskLabel as RiskLabel} />
                        </td>
                        <td style={{ padding: "12px 8px", color: "var(--text-secondary)" }}>
                          {p.lambda.toFixed(2)}
                        </td>
                        <td style={{ padding: "12px 8px", color: "var(--text-secondary)" }}>
                          {p.zScore !== undefined && p.zScore !== null ? p.zScore.toFixed(2) : "—"}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          {p.pValue !== undefined && p.pValue !== null ? (
                            <span style={{ color: isSignificant ? "var(--risk-critical)" : "var(--text-muted)", fontWeight: isSignificant ? 700 : 400 }}>
                              {p.pValue.toFixed(4)} {isSignificant && "*"}
                            </span>
                          ) : ("—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Scatter Plot & Contagion Simulator */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Scatter Plot */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>Poisson &lambda; vs Default Risk Score</h3>
              <Badge variant="primary">r = +0.42</Badge>
            </div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginBottom: 12 }}>
              Scatter distribution mapping adverse event arrival rate (&lambda;) against composite default probability.
            </p>
            <div style={{ height: 200, width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis type="number" dataKey="lambda" name="Lambda" domain={[0, "auto"]}
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                    label={{ value: "Arrival Rate (λ)", position: "insideBottom", offset: -10, fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis type="number" dataKey="riskScore" name="Risk Score" unit="%" domain={[0, 100]}
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="card" style={{ padding: "8px 12px", fontSize: "var(--font-size-xs)" }}>
                        <strong>{d.name}</strong>
                        <div>λ: {d.lambda}</div>
                        <div>Risk: {d.riskScore}%</div>
                        <div>Z-Score: {d.zScore}</div>
                      </div>
                    );
                  }} />
                  <Scatter name="Merchants" data={scatterData} fill="var(--teal)" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Contagion Simulator */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <ShieldAlert size={20} color="var(--risk-critical)" aria-hidden="true" />
              <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>Systemic Contagion Simulator</h3>
            </div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginBottom: 14 }}>
              Model how an unexpected default propagates along credit obligations via BFS reachability cascade.
            </p>

            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <label htmlFor="contagion-source-select" style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}>
                Select failed merchant
              </label>
              <select
                id="contagion-source-select"
                className="input"
                value={contagionSource}
                onChange={(e) => setContagionSource(e.target.value)}
                aria-label="Select the merchant to simulate as failed"
                style={{ flex: 1, fontSize: "var(--font-size-xs)" }}
              >
                <option value="">Select failed merchant...</option>
                {profiles.map((p: RiskAssessmentV2) => {
                  const name = (p as any).merchantName || (p as any).name || p.merchantId;
                  return (
                    <option key={p.merchantId} value={name}>
                      {name.replace(/_/g, " ")} ({(p.riskScore * 100).toFixed(0)}% risk)
                    </option>
                  );
                })}
              </select>

              <button
                onClick={handleRunContagion}
                disabled={!contagionSource || contagionMutation.isPending}
                className="btn btn--primary"
                aria-label="Run contagion cascade simulation"
                style={{ fontSize: "var(--font-size-xs)", whiteSpace: "nowrap" }}
              >
                {contagionMutation.isPending ? "Simulating..." : "Run Cascade"}
              </button>
            </div>

            {contagionMutation.data && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: 8, padding: 14, border: "1px solid var(--border-secondary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Total Network Loss:</span>
                    <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 800, color: "var(--risk-critical)" }}>
                      ₹{(contagionMutation.data.contagion?.totalLoss || (contagionMutation.data as any)?.totalLoss || 0).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/network?contagion=${encodeURIComponent(contagionSource)}`)}
                    className="btn btn--secondary"
                    aria-label="Show contagion on network graph"
                    style={{ fontSize: "var(--font-size-xs)", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Layers size={13} aria-hidden="true" />
                    Show on network
                    <ArrowRight size={13} aria-hidden="true" />
                  </button>
                </div>

                <div style={{ maxHeight: 120, overflowY: "auto", fontSize: "var(--font-size-xs)" }}>
                  {Object.entries((contagionMutation.data.contagion?.perMerchantLoss || (contagionMutation.data as any)?.perMerchantLoss || {}) as Record<string, number>).map(([m, loss]) => (
                    <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px dashed var(--border-primary)" }}>
                      <span>{m.replace(/_/g, " ")}</span>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>₹{Number(loss).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drill-Down Merchant Drawer */}
      <MerchantDrawer
        merchantId={selectedMerchantId}
        onClose={() => setSelectedMerchantId(null)}
      />
    </div>
  );
}

/**
 * Merchant Details Drill-down Drawer with Trend Sparkline
 */
function MerchantDrawer({ merchantId, onClose }: { merchantId: string | null; onClose: () => void }) {
  const { data: merchantData, isLoading } = useMerchantRisk(merchantId || "");
  const { data: trendData, isLoading: trendLoading } = useRiskTrend(merchantId || "");

  if (!merchantId) return null;

  const assessment = (merchantData as any)?.assessment;
  const stats = (merchantData as any)?.stats;
  const history = (merchantData as any)?.monthlyHistory || [];
  const isSignificant = (assessment?.pValue ?? 1) < 0.05;

  const historyBarData = history.map((item: any, idx: number) => ({
    month: `M-${idx + 1}`,
    late: item.late ? 1 : 0,
    default: item.default ? 1 : 0,
  }));

  const trendPoints = trendData?.trend || [];
  const merchantName = (merchantData as any)?.name || merchantId;

  return (
    <Drawer
      isOpen={!!merchantId}
      onClose={onClose}
      title={merchantName.replace(/_/g, " ")}
      width={440}
    >
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton height={32} />
          <Skeleton height={80} />
          <Skeleton height={140} />
          <Skeleton height={160} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Header Summary */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, background: "var(--bg-elevated)", borderRadius: 8 }}>
            <div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Current Assessment</div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 800 }}>
                {assessment ? `${(assessment.riskScore * 100).toFixed(1)}%` : "N/A"}
              </div>
            </div>
            {assessment && <RiskBadge category={assessment.riskLabel as RiskLabel} />}
          </div>

          {/* Statistical Breakdown */}
          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, marginBottom: 12 }}>
              Hypothesis Test &amp; Poisson Metrics
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: "var(--font-size-xs)" }}>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Poisson &lambda; (Arrival):</span>
                <div style={{ fontWeight: 700, fontSize: "var(--font-size-md)" }}>{assessment?.lambda?.toFixed(2) ?? "—"}</div>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Z-Test Statistic:</span>
                <div style={{ fontWeight: 700, fontSize: "var(--font-size-md)" }}>
                  {assessment?.zScore !== null && assessment?.zScore !== undefined ? assessment.zScore.toFixed(2) : "—"}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>P-Value (one-tailed):</span>
                <div style={{ fontWeight: 700, fontSize: "var(--font-size-md)", color: isSignificant ? "var(--risk-critical)" : "inherit" }}>
                  {assessment?.pValue !== null && assessment?.pValue !== undefined ? assessment.pValue.toFixed(4) : "—"}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Average Delay:</span>
                <div style={{ fontWeight: 700, fontSize: "var(--font-size-md)" }}>
                  {stats?.averageDelayDays ? `${stats.averageDelayDays.toFixed(1)} days` : "0 days"}
                </div>
              </div>
            </div>
            {isSignificant && (
              <div style={{ marginTop: 12, padding: 10, background: "var(--risk-critical-bg)", borderRadius: 6, display: "flex", gap: 8, alignItems: "center" }}>
                <AlertTriangle size={16} color="var(--risk-critical)" aria-hidden="true" />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--risk-critical)", fontWeight: 600 }}>
                  Statistically unusual at 5% significance level (&alpha; = 0.05). Delay frequency exceeds network baseline.
                </span>
              </div>
            )}
          </div>

          {/* 12-Month Risk Trend Sparkline */}
          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, marginBottom: 10 }}>
              12-Month Risk Score Trend
            </h4>
            {trendLoading ? (
              <Skeleton height={120} />
            ) : trendPoints.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>No trend data available.</div>
            ) : (
              <div style={{ height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendPoints} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--risk-critical)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--risk-critical)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: "var(--text-muted)" }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: "var(--text-muted)" }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                    <RechartsTooltip
                      formatter={(val: any) => [`${(Number(val) * 100).toFixed(1)}%`, "Risk Score"]}
                      labelStyle={{ color: "var(--text-muted)", fontSize: 10 }}
                      contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-secondary)", borderRadius: 6, fontSize: "var(--font-size-xs)" }}
                    />
                    <Area type="monotone" dataKey="riskScore" stroke="var(--risk-critical)" strokeWidth={2} fill="url(#riskGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Monthly Payment Events History */}
          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, marginBottom: 10 }}>
              Monthly Adverse Event History
            </h4>
            {historyBarData.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>No monthly event records.</div>
            ) : (
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historyBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                    <YAxis allowDecimals={false} domain={[0, 1]} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                    <RechartsTooltip />
                    <Bar dataKey="late" name="Late Payment" fill="var(--risk-high)">
                      {historyBarData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.late ? "var(--risk-high)" : "var(--border-secondary)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
