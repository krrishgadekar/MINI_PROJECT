import axios, { AxiosError } from 'axios';

const ENGINE_URL = process.env.PYTHON_ENGINE_URL ?? 'http://localhost:8000';

// ── Typed request/response shapes (matching Krrish's schemas.py exactly) ───

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

export interface MonthRecord {
  late: boolean;
  default: boolean;
}

export interface RiskScoreResult {
  merchant_id: string;
  months_observed: number;
  late_payment_events: number;
  default_events: number;
  lambda_rate: number;
  risk_score: number;
  risk_category: string;
  model: string;
  cold_start: boolean;
}

export interface PortfolioRiskResult {
  merchants: number;
  portfolio_average_risk: number;
  profiles: RiskScoreResult[];
}

// ── Helper: translate 503 when Python engine is down ────────────────────────
const handleEngineError = (error: unknown): never => {
  if (error instanceof AxiosError) {
    if (!error.response) {
      const err = new Error('Python engine is unavailable. Please start it on port 8000.') as Error & { statusCode: number };
      err.statusCode = 503;
      throw err;
    }
    const err = new Error(error.response.data?.detail ?? 'Python engine returned an error.') as Error & { statusCode: number };
    err.statusCode = error.response.status;
    throw err;
  }
  throw error;
};

// ── Bridge functions ─────────────────────────────────────────────────────────

/**
 * Calls POST /settlement on the Python engine.
 * Returns the greedy-minimized transaction list.
 */
export const callSettlement = async (
  merchants: string[],
  debts: DebtEdge[],
): Promise<SettlementResult> => {
  try {
    const { data } = await axios.post<SettlementResult>(`${ENGINE_URL}/settlement`, {
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
    const { data } = await axios.post<CycleResult>(`${ENGINE_URL}/settlement/cycles`, {
      merchants,
      debts,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

/**
 * Calls POST /risk/score on the Python engine.
 * Returns Poisson-based default probability for one merchant.
 */
export const callRiskScore = async (
  merchantId: string,
  history: MonthRecord[],
): Promise<RiskScoreResult> => {
  try {
    const { data } = await axios.post<RiskScoreResult>(`${ENGINE_URL}/risk/score`, {
      merchant_id: merchantId,
      history,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

/**
 * Calls POST /risk/portfolio on the Python engine.
 * Returns risk profiles for all merchants in one shot.
 */
export const callPortfolioRisk = async (
  merchants: Array<{ merchant_id: string; history: MonthRecord[] }>,
): Promise<PortfolioRiskResult> => {
  try {
    const { data } = await axios.post<PortfolioRiskResult>(`${ENGINE_URL}/risk/portfolio`, {
      merchants,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};
