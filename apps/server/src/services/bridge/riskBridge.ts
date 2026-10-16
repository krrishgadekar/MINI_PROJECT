import { http, ENGINE_URL, handleEngineError } from './http';

// ── Typed request/response shapes ───────────────────────────────────────────

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

// ── Risk Bridge functions ───────────────────────────────────────────────────

/**
 * Calls POST /risk/score on the Python engine.
 * Returns Poisson-based default probability for one merchant.
 */
export const callRiskScore = async (
  merchantId: string,
  history: MonthRecord[],
): Promise<RiskScoreResult> => {
  try {
    const { data } = await http.post<RiskScoreResult>(`${ENGINE_URL}/risk/score`, {
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
    const { data } = await http.post<PortfolioRiskResult>(`${ENGINE_URL}/risk/portfolio`, {
      merchants,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};
