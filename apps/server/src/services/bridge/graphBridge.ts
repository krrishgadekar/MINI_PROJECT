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
  cyclic_components?: string[][];
  cyclic_component_count?: number;
}

/**
 * Calls POST /graph/scc on the Python engine.
 * Computes strongly connected components (Tarjan O(V+E)).
 */
export const callSccGroups = async (
  merchants: string[],
  debts: DebtEdge[],
): Promise<SccResult> => {
  try {
    const { data } = await http.post<SccResult>(`${ENGINE_URL}/graph/scc`, {
      merchants,
      debts,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};
