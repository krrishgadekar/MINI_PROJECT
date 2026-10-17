import { http, ENGINE_URL, handleEngineError } from './http';

// ── Typed request/response shapes ───────────────────────────────────────────

export interface DebtEdge {
  debtor: string;   // merchant name (as stored in seed_data.json)
  creditor: string;
  amount: number;
}

export interface TransactionItem {
  payer: string;
  payee: string;
  amount: number;
}

export interface SettlementResult {
  net_balances: Record<string, number>;
  transactions: TransactionItem[];
  transaction_count: number;
  total_amount_settled: number;
  algorithm: string;
}

export interface CycleResult {
  has_cycle: boolean;
  cycles: string[][];
}

export interface CycleNettingResult {
  cycle: string[];
  net_flows: Record<string, number>;
  amount_netted: number;
}

// ── Settlement Bridge functions ─────────────────────────────────────────────

/**
 * Calls POST /settlement on the Python engine.
 * Returns the greedy-minimized transaction list.
 */
export const callSettlement = async (
  merchants: string[],
  debts: DebtEdge[],
): Promise<SettlementResult> => {
  try {
    const { data } = await http.post<SettlementResult>(`${ENGINE_URL}/settlement`, {
      merchants,
      debts,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

/**
 * Calls POST /settlement/cycles on the Python engine.
 * Returns detected circular debt chains.
 */
export const callCycleDetection = async (
  merchants: string[],
  debts: DebtEdge[],
): Promise<CycleResult> => {
  try {
    const { data } = await http.post<CycleResult>(`${ENGINE_URL}/settlement/cycles`, {
      merchants,
      debts,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

/**
 * Calls POST /settlement/net-cycle on the Python engine.
 * Returns netted cycle summary with updated flows.
 */
export const callNetCycle = async (
  merchants: string[],
  debts: DebtEdge[],
  cycle: string[],
): Promise<CycleNettingResult> => {
  try {
    const { data } = await http.post<CycleNettingResult>(`${ENGINE_URL}/settlement/net-cycle`, {
      merchants,
      debts,
      cycle,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

export interface ExactSettlementResult {
  net_balances: Record<string, number>;
  transactions: TransactionItem[];
  transaction_count: number;
  total_amount_settled: number;
  greedy_transaction_count: number;
  optimality_gap: number;
  algorithm: string;
  capped: boolean;
  message?: string;
}

export interface CycleNettingItem {
  cycle: string[];
  amount_netted: number;
}

export interface NetAllCyclesResult {
  cycles_netted: CycleNettingItem[];
  total_amount_netted: number;
  remaining_debts: DebtEdge[];
  initial_edge_count: number;
  remaining_edge_count: number;
  eliminated_edge_count: number;
}

export interface SettlementOptimizeResult {
  before_edges: DebtEdge[];
  after_netting_edges: DebtEdge[];
  cycles_netted: CycleNettingItem[];
  total_netted_amount: number;
  transactions: TransactionItem[];
  transaction_count: number;
  total_amount_settled: number;
  savings: number;
  before_total_debt: number;
  after_total_debt: number;
  exact_transaction_count?: number;
  optimality_gap?: number;
}

/**
 * Calls POST /settlement/exact on the Python engine.
 * Computes optimal settlement via bitmask DP / backtracking (≤12 balances).
 */
export const callExactSettlement = async (
  merchants: string[],
  debts: DebtEdge[],
): Promise<ExactSettlementResult> => {
  try {
    const { data } = await http.post<ExactSettlementResult>(`${ENGINE_URL}/settlement/exact`, {
      merchants,
      debts,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

/**
 * Calls POST /settlement/net-all on the Python engine.
 * Repeatedly nets circular debt loops until graph is acyclic.
 */
export const callNetAllCycles = async (
  merchants: string[],
  debts: DebtEdge[],
): Promise<NetAllCyclesResult> => {
  try {
    const { data } = await http.post<NetAllCyclesResult>(`${ENGINE_URL}/settlement/net-all`, {
      merchants,
      debts,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

/**
 * Calls POST /settlement/optimize on the Python engine.
 * Runs pre-netting pipeline followed by greedy & exact settlement.
 */
export const callOptimizeSettlement = async (
  merchants: string[],
  debts: DebtEdge[],
): Promise<SettlementOptimizeResult> => {
  try {
    const { data } = await http.post<SettlementOptimizeResult>(`${ENGINE_URL}/settlement/optimize`, {
      merchants,
      debts,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};
