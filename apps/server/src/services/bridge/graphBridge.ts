import { http, ENGINE_URL, handleEngineError } from './http';
import { DebtEdge } from './settlementBridge';

// ── Graph Bridge types ──────────────────────────────────────────────────────

export interface GraphBuildResult {
  merchants: string[];
  edges: DebtEdge[];
  adjacency_matrix: Record<string, Record<string, number | null>>;
}

export interface TransitiveClosureResult {
  closure: Record<string, Record<string, boolean>>;
  cyclic_risk_pairs: [string, string][];
}

export interface ReachableResult {
  source: string;
  reachable: string[];
}

export interface SccResult {
  components: string[][];
  component_count: number;
}
