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
