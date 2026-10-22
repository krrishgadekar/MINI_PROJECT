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
  /** perMerchantLoss: merchant name → loss amount from contagion simulation */
  contagionLossMap?: Record<string, number>;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "#1e6b4b",
  MEDIUM: "#c27814",
  HIGH: "#c8502a",
  CRITICAL: "#b83a2c",
};

const DEFAULT_NODE_COLOR = "#0d2247";
const HIGHLIGHT_NODE_COLOR = "#c8502a";
const EDGE_COLOR = "rgba(13, 34, 71, 0.22)";
const HIGHLIGHT_EDGE_COLOR = "#c8502a";

// Interpolates a hex colour from green→amber→red based on a 0..1 ratio
function lossColour(ratio: number): string {
  if (ratio <= 0) return "#22c55e";
  if (ratio <= 0.5) {
    // green → amber
    const t = ratio * 2;
    const r = Math.round(34 + (245 - 34) * t);
    const g = Math.round(197 + (158 - 197) * t);
    const b = Math.round(94 + (11 - 94) * t);
    return `rgb(${r},${g},${b})`;
  }
  // amber → red
  const t = (ratio - 0.5) * 2;
  const r = Math.round(245 + (239 - 245) * t);
  const g = Math.round(158 + (68 - 158) * t);
  const b = Math.round(11 + (68 - 11) * t);
  return `rgb(${r},${g},${b})`;
}

/**
 * GraphVisualizer — Interactive force-directed graph of the merchant debt network.
 *
 * CONCEPT TRACEABILITY (CE201 Graph Theory + CE202 Data Structures):
 *   - Renders merchants as nodes and debts as directed edges.
 *   - On node click: runs BFS (from graph/traversal.ts) to find and
 *     highlight all reachable merchants.
 *   - contagionLossMap: optional map passed from Network page when
 *     /network?contagion=ID is active, shading each node by loss amount.
 */
export default function GraphVisualizer({
  merchants,
  debts,
  riskProfiles = [],
  height = 450,
  contagionSource,
  contagionLossMap = {},
}: GraphVisualizerProps) {
  const fgRef = useRef<any>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(new Set());

  // Build risk lookup
  const riskMap = useMemo(() => {
    const map: Record<string, RiskScoreResponse> = {};
    riskProfiles.forEach((p) => (map[p.merchant_id] = p));
    return map;
  }, [riskProfiles]);

  // Compute total exposure per merchant for node sizing
  const exposureMap = useMemo(() => {
    const map: Record<string, number> = {};
    merchants.forEach((m) => (map[m] = 0));
    debts.forEach((d) => {
      map[d.debtor] = (map[d.debtor] || 0) + d.amount;
      map[d.creditor] = (map[d.creditor] || 0) + d.amount;
    });
    return map;
  }, [merchants, debts]);

  const maxExposure = useMemo(
    () => Math.max(...Object.values(exposureMap), 1),
    [exposureMap]
  );

  // Compute max loss for normalising the contagion colour scale
  const maxLoss = useMemo(
    () => Math.max(...Object.values(contagionLossMap), 1),
    [contagionLossMap]
  );

  const isContagionActive = contagionSource && Object.keys(contagionLossMap).length > 0;

  // Build graph data for react-force-graph
  const graphData = useMemo(() => {
    const nodes: GraphNode[] = merchants.map((m) => ({
      id: m,
      name: m.replace("_", " "),
      riskCategory: riskMap[m]?.risk_category,
      riskScore: riskMap[m]?.risk_score,
      totalExposure: exposureMap[m] || 0,
      val: 2 + (exposureMap[m] / maxExposure) * 6,
    }));

    const links: GraphLink[] = debts.map((d) => ({
      source: d.debtor,
      target: d.creditor,
      amount: d.amount,
    }));

    return { nodes, links };
  }, [merchants, debts, riskMap, exposureMap, maxExposure]);

  // Adjacency list for BFS (built once)
  const adjacencyList = useMemo(
    () => buildAdjacencyList(merchants, debts),
    [merchants, debts]
  );

  const handleNodeClick = useCallback(
    (node: any) => {
      const nodeId = node.id as string;

      if (selectedNode === nodeId) {
        setSelectedNode(null);
        setHighlightedNodes(new Set());
        setHighlightedEdges(new Set());
        return;
      }

      setSelectedNode(nodeId);
      const reachable = bfs(adjacencyList, nodeId);
      const newHighlighted = new Set([nodeId, ...reachable]);
      setHighlightedNodes(newHighlighted);

      const edgeKeys = new Set<string>();
      debts.forEach((d) => {
        if (newHighlighted.has(d.debtor) && newHighlighted.has(d.creditor)) {
          edgeKeys.add(`${d.debtor}→${d.creditor}`);
        }
      });
      setHighlightedEdges(edgeKeys);
    },
    [selectedNode, adjacencyList, debts]
  );

  useEffect(() => {
    if (contagionSource) {
      const match = merchants.find(
        (m) =>
          m.toLowerCase() === contagionSource.toLowerCase() ||
          m.replace(/_/g, " ").toLowerCase() === contagionSource.toLowerCase()
      );
      if (match) {
        setSelectedNode(match);
        const reachable = bfs(adjacencyList, match);
        const newHighlighted = new Set([match, ...reachable]);
        setHighlightedNodes(newHighlighted);

        const edgeKeys = new Set<string>();
        debts.forEach((d) => {
          if (newHighlighted.has(d.debtor) && newHighlighted.has(d.creditor)) {
            edgeKeys.add(`${d.debtor}→${d.creditor}`);
          }
        });
        setHighlightedEdges(edgeKeys);
      }
    }
  }, [contagionSource, adjacencyList, debts, merchants]);

  const handleReset = useCallback(() => {
    setSelectedNode(null);
    setHighlightedNodes(new Set());
    setHighlightedEdges(new Set());
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 50);
    }
  }, []);

  // Custom node rendering — loss-shaded when contagion active
  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const nodeId = node.id as string;
      const label = nodeId.replace("_", " ");
      const isHighlighted = highlightedNodes.size === 0 || highlightedNodes.has(nodeId);
      const isSelected = nodeId === selectedNode;
      const riskCat = riskMap[nodeId]?.risk_category;

      const baseRadius = 5 + ((exposureMap[nodeId] || 0) / maxExposure) * 8;
      const radius = isSelected ? baseRadius + 2 : baseRadius;
      const fontSize = Math.max(11 / globalScale, 3);

      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);

      if (isSelected) {
        ctx.shadowColor = contagionSource ? "#ef4444" : HIGHLIGHT_NODE_COLOR;
        ctx.shadowBlur = 18;
      }

      if (isContagionActive && isHighlighted) {
        if (nodeId === selectedNode) {
          // Failed source → always bright red
          ctx.fillStyle = "#ef4444";
          ctx.shadowColor = "#ef4444";
          ctx.shadowBlur = 20;
        } else {
          // Downstream merchants shaded by their loss amount (green→amber→red)
          const loss = contagionLossMap[nodeId] || contagionLossMap[label] || 0;
          const ratio = maxLoss > 0 ? loss / maxLoss : 0;
          ctx.fillStyle = lossColour(ratio);
          ctx.shadowColor = lossColour(ratio);
          ctx.shadowBlur = 10;
        }
      } else if (contagionSource && isHighlighted) {
        // Contagion active but no loss data — fallback amber
        if (nodeId === selectedNode) {
          ctx.fillStyle = "#ef4444";
        } else {
          ctx.fillStyle = "#f59e0b";
        }
      } else {
        ctx.fillStyle = !isHighlighted
          ? "rgba(100, 116, 139, 0.3)"
          : riskCat
          ? RISK_COLORS[riskCat]
          : DEFAULT_NODE_COLOR;
      }

      ctx.globalAlpha = isHighlighted ? 1 : 0.2;
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = isHighlighted ? 1 : 0.3;

      ctx.font = `${isSelected ? "700" : "600"} ${fontSize}px 'Space Grotesk', -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isHighlighted ? "#0d1829" : "#a1988a";
      ctx.fillText(label, node.x!, node.y! + radius + 3);

      // Show loss label if contagion active
      if (isContagionActive && isHighlighted && nodeId !== selectedNode) {
        const loss = contagionLossMap[nodeId] || contagionLossMap[label] || 0;
        if (loss > 0) {
          const lossLabel = `₹${(loss / 1000).toFixed(0)}k`;
          ctx.font = `700 ${Math.max(9 / globalScale, 2.5)}px 'JetBrains Mono', monospace`;
          ctx.fillStyle = "#c8502a";
          ctx.fillText(lossLabel, node.x!, node.y! + radius + fontSize + 5);
        }
      }

      ctx.globalAlpha = 1;
    },
    [highlightedNodes, selectedNode, riskMap, exposureMap, maxExposure, contagionLossMap, maxLoss, isContagionActive, contagionSource]
  );

  // Custom link rendering
  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const sourceId = typeof link.source === "object" ? link.source.id : link.source;
      const targetId = typeof link.target === "object" ? link.target.id : link.target;
      const edgeKey = `${sourceId}→${targetId}`;
      const isHighlighted = highlightedEdges.size === 0 || highlightedEdges.has(edgeKey);

      const source = typeof link.source === "object" ? link.source : null;
      const target = typeof link.target === "object" ? link.target : null;
      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;

      ctx.globalAlpha = isHighlighted ? 0.7 : 0.1;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      // Red tint for contagion edges
      const edgeColour = contagionSource && isHighlighted && highlightedEdges.size > 0
        ? "rgba(239, 68, 68, 0.6)"
        : isHighlighted ? HIGHLIGHT_EDGE_COLOR : EDGE_COLOR;
      ctx.strokeStyle = edgeColour;
      ctx.lineWidth = isHighlighted ? 1.5 / globalScale : 0.5 / globalScale;
      ctx.stroke();

      const arrowLen = 6 / globalScale;
      const angle = Math.atan2(dy, dx);
      const arrowX = target.x - (dx / len) * 10;
      const arrowY = target.y - (dy / len) * 10;

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - arrowLen * Math.cos(angle - Math.PI / 6), arrowY - arrowLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(arrowX - arrowLen * Math.cos(angle + Math.PI / 6), arrowY - arrowLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = edgeColour;
      ctx.fill();

      if (isHighlighted && highlightedEdges.size > 0) {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const fs = Math.max(9 / globalScale, 2.5);
        ctx.font = `600 ${fs}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = "#c8502a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`₹${(link.amount / 1000).toFixed(0)}k`, midX, midY - 5 / globalScale);
      }

      ctx.globalAlpha = 1;
    },
    [highlightedEdges, contagionSource]
  );

  return (
    <div className="graph-container" style={{ height, position: "relative" }}>
      {/* Controls */}
      <div className="graph-controls">
        <button className="btn btn-secondary btn-sm" onClick={handleReset} aria-label="Reset graph zoom and selection">
          <RotateCcw size={14} aria-hidden="true" /> Reset
        </button>
      </div>

      {/* Contagion Loss Legend */}
      {isContagionActive && (
        <div
          role="img"
          aria-label="Contagion loss legend: green = no loss, red = maximum loss"
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            zIndex: 10,
            background: "rgba(255, 255, 255, 0.95)",
            border: "1px solid #dcd5cb",
            borderRadius: 2,
            padding: "10px 14px",
            fontSize: "0.7rem",
            boxShadow: "0 4px 12px rgba(13, 24, 41, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontWeight: 700, color: "#c8502a", fontFamily: "var(--font-mono)" }}>
            <AlertTriangle size={12} aria-hidden="true" /> CONTAGION SCALE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontFamily: "var(--font-mono)" }}>
            <div style={{ width: 10, height: 10, background: "#ef4444", flexShrink: 0 }} />
            <span style={{ color: "#0d1829" }}>Source (failed node)</span>
          </div>
          {/* Gradient bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "#718096", fontSize: "0.65rem" }}>None</span>
            <div style={{
              width: 80, height: 6, borderRadius: 1,
              background: "linear-gradient(to right, #1e6b4b, #c27814, #c8502a)",
              flexShrink: 0,
            }} />
            <span style={{ color: "#718096", fontSize: "0.65rem" }}>Max ₹{(maxLoss / 1000).toFixed(0)}k</span>
          </div>
          <div style={{ color: "#718096", fontSize: "0.65rem", marginTop: 6, fontFamily: "var(--font-mono)" }}>
            Loss indicated on each node
          </div>
        </div>
      )}

      {/* Force-directed graph */}
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={linkCanvasObject}
        onNodeClick={handleNodeClick}
        nodeRelSize={6}
        linkDirectionalArrowLength={0}
        backgroundColor="transparent"
        width={undefined}
        height={height}
        cooldownTicks={100}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
      />

      {/* Info Panel */}
      {selectedNode && (
        <div className="graph-info-panel animate-fade-in" role="status" aria-live="polite">
          <h4>
            <MousePointer2 size={14} style={{ marginRight: 6, verticalAlign: "middle" }} aria-hidden="true" />
            {selectedNode.replace("_", " ")}
          </h4>
          <p>
            <strong>BFS Reachable:</strong> {highlightedNodes.size - 1} merchant
            {highlightedNodes.size - 1 !== 1 ? "s" : ""}
          </p>
          <p>
            <strong>Exposure:</strong> ₹{(exposureMap[selectedNode] || 0).toLocaleString("en-IN")}
          </p>
          {riskMap[selectedNode] && (
            <p>
              <strong>Risk:</strong> {riskMap[selectedNode].risk_category} (
              {(riskMap[selectedNode].risk_score * 100).toFixed(1)}%)
            </p>
          )}
          {isContagionActive && contagionLossMap[selectedNode] !== undefined && (
            <p style={{ color: "#f87171" }}>
              <strong>Contagion Loss:</strong> ₹{contagionLossMap[selectedNode].toLocaleString("en-IN")}
            </p>
          )}
          <p style={{ marginTop: 6, fontStyle: "italic", opacity: 0.7 }}>
            Click again to deselect · Traversal: BFS O(V+E)
          </p>
        </div>
      )}
    </div>
  );
}
