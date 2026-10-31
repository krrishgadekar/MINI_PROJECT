import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { bfs, buildAdjacencyList } from "../graph/traversal";
import type { DebtEdge, RiskScoreResponse, GraphNode, GraphLink } from "../types";
import { MousePointer2, RotateCcw, AlertTriangle } from "lucide-react";

interface GraphVisualizerProps {
  merchants: string[];
  debts: DebtEdge[];
  riskProfiles?: RiskScoreResponse[];
  height?: number;
  contagionSource?: string;
  contagionLossMap?: Record<string, number>;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "#16a34a",
  MEDIUM: "#d97706",
  HIGH: "#dc2626",
  CRITICAL: "#b91c1c",
};

const DEFAULT_COLOR = "#0f2b5b";
const HIGHLIGHT_EDGE = "#c8502a";

function lossColour(ratio: number): string {
  if (ratio <= 0) return "#22c55e";
  if (ratio <= 0.5) {
    const t = ratio * 2;
    return `rgb(${Math.round(34 + 211 * t)},${Math.round(197 - 39 * t)},${Math.round(94 - 83 * t)})`;
  }
  const t = (ratio - 0.5) * 2;
  return `rgb(${Math.round(245 - 6 * t)},${Math.round(158 - 90 * t)},${Math.round(11 + 57 * t)})`;
}

function lighten(hex: string, amt: number): string {
  if (!hex.startsWith("#")) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}

export default function GraphVisualizer({
  merchants,
  debts,
  riskProfiles = [],
  height = 520,
  contagionSource,
  contagionLossMap = {},
}: GraphVisualizerProps) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(new Set());

  const riskMap = useMemo(() => {
    const map: Record<string, RiskScoreResponse> = {};
    riskProfiles.forEach((p) => (map[p.merchant_id] = p));
    return map;
  }, [riskProfiles]);

  const exposureMap = useMemo(() => {
    const map: Record<string, number> = {};
    merchants.forEach((m) => (map[m] = 0));
    debts.forEach((d) => {
      map[d.debtor] = (map[d.debtor] || 0) + d.amount;
      map[d.creditor] = (map[d.creditor] || 0) + d.amount;
    });
    return map;
  }, [merchants, debts]);

  const maxExposure = useMemo(() => Math.max(...Object.values(exposureMap), 1), [exposureMap]);
  const maxLoss = useMemo(() => Math.max(...Object.values(contagionLossMap), 1), [contagionLossMap]);
  const isContagionActive = contagionSource && Object.keys(contagionLossMap).length > 0;

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = merchants.map((m) => ({
      id: m,
      name: m.replace(/_/g, " "),
      riskCategory: riskMap[m]?.risk_category,
      riskScore: riskMap[m]?.risk_score,
      totalExposure: exposureMap[m] || 0,
      val: 3 + (exposureMap[m] / maxExposure) * 8,
    }));
    const links: GraphLink[] = debts.map((d) => ({
      source: d.debtor,
      target: d.creditor,
      amount: d.amount,
    }));
    return { nodes, links };
  }, [merchants, debts, riskMap, exposureMap, maxExposure]);

  const adjacencyList = useMemo(() => buildAdjacencyList(merchants, debts), [merchants, debts]);

  // Apply strong repulsion force so nodes spread out
  useEffect(() => {
    const fg = fgRef.current;
    if (fg) {
      fg.d3Force("charge")?.strength(-300).distanceMax(400);
      fg.d3Force("link")?.distance(120);
      fg.d3Force("center")?.strength(0.05);
    }
  }, [graphData]);

  const handleNodeClick = useCallback(
    (node: any) => {
      const nodeId = node.id as string;
      if (selectedNode === nodeId) {
        setSelectedNode(null);
        setHighlightedNodes(new Set());
        setHighlightedEdges(new Set());
        fgRef.current?.zoomToFit(400, 50);
        return;
      }
      setSelectedNode(nodeId);
      const reachable = bfs(adjacencyList, nodeId);
      const hl = new Set([nodeId, ...reachable]);
      setHighlightedNodes(hl);
      const ek = new Set<string>();
      debts.forEach((d) => {
        if (hl.has(d.debtor) && hl.has(d.creditor)) ek.add(`${d.debtor}\u2192${d.creditor}`);
      });
      setHighlightedEdges(ek);
    },
    [selectedNode, adjacencyList, debts]
  );

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node ? (node.id as string) : null);
  }, []);

  useEffect(() => {
    if (contagionSource) {
      const match = merchants.find(
        (m) => m.toLowerCase() === contagionSource.toLowerCase() ||
               m.replace(/_/g, " ").toLowerCase() === contagionSource.toLowerCase()
      );
      if (match) {
        setSelectedNode(match);
        const reachable = bfs(adjacencyList, match);
        const hl = new Set([match, ...reachable]);
        setHighlightedNodes(hl);
        const ek = new Set<string>();
        debts.forEach((d) => {
          if (hl.has(d.debtor) && hl.has(d.creditor)) ek.add(`${d.debtor}\u2192${d.creditor}`);
        });
        setHighlightedEdges(ek);
      }
    }
  }, [contagionSource, adjacencyList, debts, merchants]);

  const handleReset = useCallback(() => {
    setSelectedNode(null);
    setHoveredNode(null);
    setHighlightedNodes(new Set());
    setHighlightedEdges(new Set());
    fgRef.current?.zoomToFit(400, 50);
  }, []);

  // ── Node Rendering ──
  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x: number = node.x;
      const y: number = node.y;
      if (x == null || y == null || !isFinite(x) || !isFinite(y)) return;

      const nodeId = node.id as string;
      const label = nodeId.replace(/_/g, " ");
      const isHL = highlightedNodes.size === 0 || highlightedNodes.has(nodeId);
      const isSel = nodeId === selectedNode;
      const isHov = nodeId === hoveredNode;
      const riskCat = riskMap[nodeId]?.risk_category;

      const baseR = 7 + ((exposureMap[nodeId] || 0) / maxExposure) * 12;
      const r = baseR * (isHov ? 1.15 : 1) * (isSel ? 1.1 : 1);
      const fs = Math.max(11 / globalScale, 3.5);

      // Color
      let fill: string;
      if (isContagionActive && isHL) {
        if (nodeId === selectedNode) {
          fill = "#ef4444";
        } else {
          const loss = contagionLossMap[nodeId] || contagionLossMap[label] || 0;
          fill = lossColour(maxLoss > 0 ? loss / maxLoss : 0);
        }
      } else if (contagionSource && isHL) {
        fill = nodeId === selectedNode ? "#ef4444" : "#f59e0b";
      } else {
        fill = riskCat ? (RISK_COLORS[riskCat] || DEFAULT_COLOR) : DEFAULT_COLOR;
      }

      ctx.globalAlpha = isHL ? 1 : 0.15;

      // Glow for selected/hovered
      if ((isSel || isHov) && isHL) {
        ctx.beginPath();
        ctx.arc(x, y, r + 8, 0, Math.PI * 2);
        ctx.fillStyle = fill + "22";
        ctx.fill();
      }

      // Gradient sphere
      const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      grad.addColorStop(0, lighten(fill, 40));
      grad.addColorStop(1, fill);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Selection ring
      if (isSel) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5 / globalScale;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = fill;
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      } else if (isHov && isHL) {
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Label
      ctx.font = `${isSel || isHov ? "700" : "600"} ${fs}px 'Inter', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const ly = y + r + 4;

      if (isHL) {
        const tw = ctx.measureText(label).width;
        const px = 4 / globalScale, py = 2 / globalScale;
        ctx.fillStyle = "rgba(255,253,249,0.85)";
        ctx.beginPath();
        ctx.roundRect(x - tw / 2 - px, ly - py, tw + px * 2, fs + py * 2, 3 / globalScale);
        ctx.fill();
      }

      ctx.fillStyle = isHL ? "#1a1a2e" : "#a1988a";
      ctx.fillText(label, x, ly);

      // Show exposure on hover/select
      if (isHL && (isSel || isHov)) {
        const exp = exposureMap[nodeId] || 0;
        if (exp > 0) {
          const sfs = Math.max(9 / globalScale, 2.5);
          ctx.font = `600 ${sfs}px 'JetBrains Mono', monospace`;
          ctx.fillStyle = fill;
          ctx.fillText(
            `\u20B9${exp >= 1000 ? (exp / 1000).toFixed(1) + "k" : exp.toLocaleString("en-IN")}`,
            x, ly + fs + 3
          );
        }
      }

      // Loss label for contagion
      if (isContagionActive && isHL && nodeId !== selectedNode) {
        const loss = contagionLossMap[nodeId] || contagionLossMap[label] || 0;
        if (loss > 0) {
          const sfs = Math.max(9 / globalScale, 2.5);
          ctx.font = `700 ${sfs}px 'JetBrains Mono', monospace`;
          ctx.fillStyle = "#dc2626";
          ctx.fillText(`\u20B9${(loss / 1000).toFixed(0)}k`, x, ly + fs + 3);
        }
      }

      ctx.globalAlpha = 1;
    },
    [highlightedNodes, selectedNode, hoveredNode, riskMap, exposureMap, maxExposure, contagionLossMap, maxLoss, isContagionActive, contagionSource]
  );

  // ── Link Rendering ──
  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const source = typeof link.source === "object" ? link.source : null;
      const target = typeof link.target === "object" ? link.target : null;
      if (!source || !target) return;
      if (!isFinite(source.x) || !isFinite(source.y) || !isFinite(target.x) || !isFinite(target.y)) return;

      const sourceId = source.id as string;
      const targetId = target.id as string;
      const edgeKey = `${sourceId}\u2192${targetId}`;
      const isHL = highlightedEdges.size === 0 || highlightedEdges.has(edgeKey);

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;

      ctx.globalAlpha = isHL ? 0.75 : 0.08;

      // Curved edge
      const mx = (source.x + target.x) / 2;
      const my = (source.y + target.y) / 2;
      const off = len * 0.07;
      const cpx = mx - (dy / len) * off;
      const cpy = my + (dx / len) * off;

      const edgeCol = contagionSource && isHL && highlightedEdges.size > 0
        ? "rgba(220,38,38,0.7)"
        : isHL && highlightedEdges.size > 0
          ? HIGHLIGHT_EDGE
          : "rgba(15,43,91,0.25)";

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(cpx, cpy, target.x, target.y);
      ctx.strokeStyle = edgeCol;
      ctx.lineWidth = (isHL && highlightedEdges.size > 0 ? 2 : 0.8) / globalScale;
      ctx.stroke();

      // Arrow
      const aLen = 7 / globalScale;
      const t2 = 0.82;
      const ax = (1 - t2) * (1 - t2) * source.x + 2 * (1 - t2) * t2 * cpx + t2 * t2 * target.x;
      const ay = (1 - t2) * (1 - t2) * source.y + 2 * (1 - t2) * t2 * cpy + t2 * t2 * target.y;
      const tx2 = 2 * (1 - t2) * (cpx - source.x) + 2 * t2 * (target.x - cpx);
      const ty2 = 2 * (1 - t2) * (cpy - source.y) + 2 * t2 * (target.y - cpy);
      const ang = Math.atan2(ty2, tx2);

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - aLen * Math.cos(ang - Math.PI / 7), ay - aLen * Math.sin(ang - Math.PI / 7));
      ctx.lineTo(ax - aLen * Math.cos(ang + Math.PI / 7), ay - aLen * Math.sin(ang + Math.PI / 7));
      ctx.closePath();
      ctx.fillStyle = edgeCol;
      ctx.fill();

      // Amount label
      if (isHL && highlightedEdges.size > 0) {
        const sfs = Math.max(9 / globalScale, 2.5);
        const amtTxt = `\u20B9${(link.amount / 1000).toFixed(0)}k`;
        ctx.font = `700 ${sfs}px 'JetBrains Mono', monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(amtTxt).width;
        ctx.fillStyle = "rgba(255,253,249,0.9)";
        ctx.beginPath();
        ctx.roundRect(cpx - tw / 2 - 3, cpy - sfs / 2 - 2, tw + 6, sfs + 4, 2);
        ctx.fill();
        ctx.fillStyle = edgeCol;
        ctx.fillText(amtTxt, cpx, cpy);
      }

      ctx.globalAlpha = 1;
    },
    [highlightedEdges, contagionSource]
  );

  return (
    <div
      ref={containerRef}
      className="graph-container"
      style={{ height, position: "relative", background: "linear-gradient(135deg, #fdfbf7 0%, #f5f0ea 100%)" }}
    >
      {/* Toolbar */}
      <div className="graph-controls" style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-secondary btn-sm" onClick={handleReset} style={{ borderRadius: 6 }}>
          <RotateCcw size={14} style={{ marginRight: 4 }} /> Reset
        </button>
      </div>

      {/* Hint */}
      {!selectedNode && highlightedNodes.size === 0 && (
        <div
          style={{
            position: "absolute", top: 14, left: 14, zIndex: 10,
            background: "rgba(255,253,249,0.88)", backdropFilter: "blur(6px)",
            border: "1px solid var(--border-primary)", borderRadius: 8,
            padding: "8px 12px", fontSize: "0.72rem", color: "var(--text-secondary)",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <MousePointer2 size={13} />
          Click a node to explore &middot; Scroll to zoom &middot; Drag to pan
        </div>
      )}

      {/* Risk Legend */}
      {!isContagionActive && (
        <div style={{
          position: "absolute", bottom: 14, left: 14, zIndex: 10,
          background: "rgba(255,253,249,0.92)", backdropFilter: "blur(8px)",
          border: "1px solid var(--border-primary)", borderRadius: 8,
          padding: "10px 14px", fontSize: "0.7rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Risk Level
          </div>
          {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((lv) => (
            <div key={lv} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: RISK_COLORS[lv], flexShrink: 0 }} />
              <span style={{ color: "var(--text-secondary)", textTransform: "capitalize", fontSize: "0.68rem" }}>{lv.toLowerCase()}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: DEFAULT_COLOR, flexShrink: 0 }} />
            <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>unknown</span>
          </div>
        </div>
      )}

      {/* Contagion Legend */}
      {isContagionActive && (
        <div style={{
          position: "absolute", bottom: 14, left: 14, zIndex: 10,
          background: "rgba(255,253,249,0.95)", backdropFilter: "blur(8px)",
          border: "1px solid var(--border-primary)", borderRadius: 8,
          padding: "10px 14px", fontSize: "0.7rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontWeight: 700, color: "#dc2626", fontSize: "0.68rem" }}>
            <AlertTriangle size={12} /> CASCADE SIMULATION
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, background: "#ef4444", borderRadius: "50%", flexShrink: 0 }} />
            <span style={{ color: "var(--text-secondary)", fontSize: "0.68rem" }}>Source (failed)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.62rem" }}>None</span>
            <div style={{ width: 60, height: 6, borderRadius: 3, background: "linear-gradient(to right, #16a34a, #d97706, #dc2626)", flexShrink: 0 }} />
            <span style={{ color: "var(--text-muted)", fontSize: "0.62rem" }}>{`\u20B9${(maxLoss / 1000).toFixed(0)}k`}</span>
          </div>
        </div>
      )}

      {/* Graph Canvas */}
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={linkCanvasObject}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        nodeRelSize={6}
        linkDirectionalArrowLength={0}
        backgroundColor="transparent"
        width={undefined}
        height={height}
        cooldownTicks={150}
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.25}
        warmupTicks={50}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
        enablePointerInteraction={true}
      />

      {/* Info Panel */}
      {selectedNode && (
        <div
          className="animate-fade-in"
          style={{
            position: "absolute", bottom: 14, right: 14, zIndex: 10,
            background: "rgba(255,253,249,0.95)", backdropFilter: "blur(12px)",
            border: "1px solid var(--border-primary)", borderRadius: 10,
            padding: "16px 20px", maxWidth: 260, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          }}
          role="status"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: riskMap[selectedNode] ? (RISK_COLORS[riskMap[selectedNode].risk_category] || DEFAULT_COLOR) : DEFAULT_COLOR,
            }} />
            <h4 style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              {selectedNode.replace(/_/g, " ")}
            </h4>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: "0.78rem" }}>
            <div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase" }}>Reachable</div>
              <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{highlightedNodes.size - 1} nodes</div>
            </div>
            <div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase" }}>Exposure</div>
              <div style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                {`\u20B9${(exposureMap[selectedNode] || 0).toLocaleString("en-IN")}`}
              </div>
            </div>
            {riskMap[selectedNode] && (
              <>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase" }}>Risk</div>
                  <div style={{ fontWeight: 700, color: RISK_COLORS[riskMap[selectedNode].risk_category] || "var(--text-primary)", textTransform: "capitalize" }}>
                    {riskMap[selectedNode].risk_category.toLowerCase()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase" }}>Score</div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {(riskMap[selectedNode].risk_score * 100).toFixed(1)}%
                  </div>
                </div>
              </>
            )}
          </div>

          {isContagionActive && contagionLossMap[selectedNode] !== undefined && (
            <div style={{ marginTop: 10, padding: "6px 10px", background: "rgba(220,38,38,0.06)", borderRadius: 6, border: "1px solid rgba(220,38,38,0.15)" }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#dc2626" }}>
                Cascade Loss: {`\u20B9${contagionLossMap[selectedNode].toLocaleString("en-IN")}`}
              </span>
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: "0.68rem", color: "var(--text-muted)" }}>
            Click again to deselect
          </div>
        </div>
      )}
    </div>
  );
}
