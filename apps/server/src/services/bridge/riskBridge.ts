import { http, ENGINE_URL, handleEngineError } from './http';
import { DebtEdge } from './settlementBridge';

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
  z_score?: number;
  p_value?: number;
  risk_label?: string;
  composite_score?: number;
}

export interface PortfolioRiskResult {
  merchants: number;
  portfolio_average_risk: number;
  profiles: RiskScoreResult[];
}

export interface CascadeRoundItem {
  round: number;
  type: string;
  losses: Record<string, number>;
  round_loss: number;
}

export interface ContagionResult {
  failed_merchant: string;
  direct_losses: Record<string, number>;
  second_order_losses: Record<string, number>;
  per_merchant_loss: Record<string, number>;
  total_network_loss: number;
  affected_merchants: string[];
  cascade_rounds: CascadeRoundItem[];
  network_vulnerability_score: number;
}

export interface CorrelationMetric {
  r: number;
  p_value: number;
  significant: boolean;
  sample_size: number;
  interpretation: string;
}

export interface CorrelationResult {
  delay_vs_amount?: CorrelationMetric;
  frequency_vs_late_rate?: CorrelationMetric;
  custom_pair?: CorrelationMetric;
  sample_size: number;
}

export interface MerchantCorrelationRecord {
  merchant_id: string;
  avg_delay: number;
  avg_amount: number;
  frequency: number;
  late_rate: number;
}

export interface ZTestResult {
  merchant_id: string;
  observed_p: number;
  baseline_p: number;
  z_score: number;
  p_value: number;
  p_value_two_tailed: number;
  is_significant: boolean;
  sample_size: number;
  interpretation: string;
  composite_risk_score: number;
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

/**
 * Calls POST /risk/contagion on the Python engine.
 * Simulates systemic cascade shock if failedMerchant defaults.
 */
export const callContagion = async (
  merchants: string[],
  debts: DebtEdge[],
  failedMerchant: string,
  lossGivenDefault: number = 1.0,
  maxRounds: number = 5,
): Promise<ContagionResult> => {
  try {
    const { data } = await http.post<ContagionResult>(`${ENGINE_URL}/risk/contagion`, {
      merchants,
      debts,
      failed_merchant: failedMerchant,
      loss_given_default: lossGivenDefault,
      max_rounds: maxRounds,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

/**
 * Calls POST /risk/correlation on the Python engine.
 * Computes Pearson r correlation between risk indicators.
 */
export const callPearson = async (
  input: {
    records?: MerchantCorrelationRecord[];
    series_a?: number[];
    series_b?: number[];
  },
): Promise<CorrelationResult> => {
  try {
    const { data } = await http.post<CorrelationResult>(`${ENGINE_URL}/risk/correlation`, input);
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

/**
 * Calls POST /risk/ztest on the Python engine.
 * Tests if merchant delinquency rate is statistically significantly above baseline.
 */
export const callZTest = async (
  merchantId: string,
  successes: number,
  trials: number,
  baselineP: number = 0.05,
  alpha: number = 0.05,
  avgDelayDays: number = 0.0,
): Promise<ZTestResult> => {
  try {
    const { data } = await http.post<ZTestResult>(`${ENGINE_URL}/risk/ztest`, {
      merchant_id: merchantId,
      successes,
      trials,
      baseline_p: baselineP,
      alpha,
      avg_delay_days: avgDelayDays,
    });
    return data;
  } catch (error) {
    return handleEngineError(error);
  }
};

/** Alias for callPearson matching spec */
export const callCorrelation = callPearson;

