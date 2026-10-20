/**
 * api/mock/risk.mock.ts — Mock Implementation for Risk Domain (Slice C)
 *
 * In-memory risk state seeded from seedData.ts with simulated calculation
 * of Poisson default risk, z-test, correlations, and default contagion cascade.
 */

import { seedData, computeMockRiskScores } from '../../data/seedData';
import type {
  RiskScoreResponse,
  PortfolioRiskResponse,
  RiskAssessmentV2,
  RiskLabel,
  MonthRecord,
} from '../../types';
import type {
  GroupRiskResponse,
  MerchantRiskV2Response,
  RecomputeRiskResponse,
  ContagionSimulationRequest,
  ContagionSimulationResponse,
  ZTestCalculateRequest,
  ZTestCalculateResponse,
  CorrelationCalculateRequest,
  CorrelationCalculateResponse,
  ScoreMerchantRiskRequest,
  PortfolioRiskRequest,
  MerchantRiskResponse,
  RiskTrendResponse,
  RiskTrendPoint,
} from '../contract';

// In-memory store initialized from seed data
const baseScores = computeMockRiskScores();

let inMemoryAssessments: RiskAssessmentV2[] = baseScores.map((score) => {
  const lateRate = score.late_payment_events / Math.max(1, score.months_observed);
  const zScore = (lateRate - 0.05) / Math.sqrt((0.05 * 0.95) / Math.max(1, score.months_observed));
  const pValue = Math.max(0.0001, Math.min(1, 1 - (zScore > 0 ? 0.5 + Math.min(0.499, zScore * 0.2) : 0.5)));
  const corr = 0.45;

  let label: RiskLabel = 'LOW';
  if (score.risk_score >= 0.85) label = 'CRITICAL';
  else if (score.risk_score >= 0.66) label = 'HIGH';
  else if (score.risk_score >= 0.33) label = 'MEDIUM';

  return {
    merchantId: score.merchant_id,
    lambda: score.lambda_rate,
    zScore: parseFloat(zScore.toFixed(2)),
    pValue: parseFloat(pValue.toFixed(4)),
    correlation: corr,
    riskScore: score.risk_score,
    riskLabel: label,
    computedAt: new Date().toISOString(),
  };
});

// Add other merchants from seedData if not already in assessments
seedData.merchants.forEach((m) => {
  if (!inMemoryAssessments.some((a) => a.merchantId === m)) {
    inMemoryAssessments.push({
      merchantId: m,
      lambda: 0.05,
      zScore: 0.0,
      pValue: 0.5,
      correlation: 0.0,
      riskScore: 0.0488,
      riskLabel: 'LOW',
      computedAt: new Date().toISOString(),
    });
  }
});

export const riskMock = {
  score: async (
    merchantId: string,
    data?: ScoreMerchantRiskRequest
  ): Promise<MerchantRiskResponse> => {
    const existing = inMemoryAssessments.find((a) => a.merchantId === merchantId);
    const months = data?.history ? data.history.length : 12;
    const late = data?.history ? data.history.filter((m: MonthRecord) => m.late || m.default).length : 2;
    const defaults = data?.history ? data.history.filter((m: MonthRecord) => m.default).length : 0;
    const lambda = months > 0 ? late / months : 0.05;
    const scoreVal = 1 - Math.exp(-lambda);

    let cat = 'LOW';
    if (scoreVal >= 0.6) cat = 'CRITICAL';
    else if (scoreVal >= 0.3) cat = 'HIGH';
    else if (scoreVal >= 0.1) cat = 'MEDIUM';

    const resp: RiskScoreResponse = {
      merchant_id: merchantId,
      months_observed: months,
      late_payment_events: late,
      default_events: defaults,
      lambda_rate: parseFloat(lambda.toFixed(4)),
      risk_score: parseFloat(scoreVal.toFixed(4)),
      risk_category: cat as any,
      model: 'poisson_v1',
      cold_start: months < 3,
      z_score: existing?.zScore ?? null,
      p_value: existing?.pValue ?? null,
      risk_label: (existing?.riskLabel ?? cat) as any,
    };

    return { success: true, assessment: resp };
  },

  getScore: async (
    merchantId: string
  ): Promise<MerchantRiskResponse> => {
    return riskMock.score(merchantId);
  },

  portfolio: async (
    _data?: PortfolioRiskRequest
  ): Promise<{ success: boolean; portfolio: PortfolioRiskResponse }> => {
    const profiles: RiskScoreResponse[] = inMemoryAssessments.map((a) => ({
      merchant_id: a.merchantId,
      months_observed: 12,
      late_payment_events: Math.round(a.lambda * 12),
      default_events: 0,
      lambda_rate: a.lambda,
      risk_score: a.riskScore,
      risk_category: a.riskLabel,
      model: 'poisson_v1',
      cold_start: false,
      z_score: a.zScore ?? null,
      p_value: a.pValue ?? null,
      risk_label: a.riskLabel,
    }));

    const avgRisk =
      profiles.reduce((acc, p) => acc + p.risk_score, 0) / Math.max(1, profiles.length);

    return {
      success: true,
      portfolio: {
        merchants: profiles.length,
        portfolio_average_risk: parseFloat(avgRisk.toFixed(4)),
        profiles,
      },
    };
  },

  group: async (): Promise<GroupRiskResponse> => {
    const total = inMemoryAssessments.length;
    const avg =
      inMemoryAssessments.reduce((acc, a) => acc + a.riskScore, 0) / Math.max(1, total);
    const highCount = inMemoryAssessments.filter(
      (a) => a.riskLabel === 'HIGH' || a.riskLabel === 'CRITICAL'
    ).length;

    return {
      success: true,
      groupRisk: {
        averageRiskScore: parseFloat(avg.toFixed(4)),
        totalMerchants: total,
        highRiskCount: highCount,
        assessments: [...inMemoryAssessments],
      },
    };
  },

  merchant: async (id: string): Promise<MerchantRiskV2Response> => {
    let item = inMemoryAssessments.find((a) => a.merchantId === id);
    if (!item) {
      item = {
        merchantId: id,
        lambda: 0.1,
        zScore: 0.5,
        pValue: 0.3,
        correlation: 0.2,
        riskScore: 0.095,
        riskLabel: 'LOW',
        computedAt: new Date().toISOString(),
      };
      inMemoryAssessments.push(item);
    }
    return { success: true, assessment: { ...item } };
  },

  recompute: async (): Promise<RecomputeRiskResponse> => {
    inMemoryAssessments = inMemoryAssessments.map((a) => ({
      ...a,
      computedAt: new Date().toISOString(),
    }));
    const total = inMemoryAssessments.length;
    const avg =
      inMemoryAssessments.reduce((acc, a) => acc + a.riskScore, 0) / Math.max(1, total);
    const highCount = inMemoryAssessments.filter(
      (a) => a.riskLabel === 'HIGH' || a.riskLabel === 'CRITICAL'
    ).length;

    return {
      success: true,
      recomputedCount: total,
      groupRisk: {
        averageRiskScore: parseFloat(avg.toFixed(4)),
        totalMerchants: total,
        highRiskCount: highCount,
        assessments: [...inMemoryAssessments],
      },
    };
  },

  contagion: async (
    data: ContagionSimulationRequest
  ): Promise<ContagionSimulationResponse> => {
    const source = data.merchantId;
    const directLosses: Record<string, number> = {};
    const perMerchantLoss: Record<string, number> = {};
    let totalLoss = 0;

    seedData.debts.forEach((debt) => {
      if (debt.debtor === source) {
        directLosses[debt.creditor] = (directLosses[debt.creditor] || 0) + debt.amount;
        perMerchantLoss[debt.creditor] = (perMerchantLoss[debt.creditor] || 0) + debt.amount;
        totalLoss += debt.amount;
      }
    });

    return {
      success: true,
      contagion: {
        source,
        totalLoss,
        perMerchantLoss,
        directLosses,
        levels: [[source], Object.keys(directLosses)],
        affectedMerchants: Object.keys(perMerchantLoss),
        networkVulnerabilityScore: parseFloat((totalLoss / 100000).toFixed(2)),
      },
    };
  },

  ztest: async (data: ZTestCalculateRequest): Promise<ZTestCalculateResponse> => {
    const p0 = data.baselineP ?? 0.05;
    const pHat = data.successes / Math.max(1, data.trials);
    const se = Math.sqrt((p0 * (1 - p0)) / Math.max(1, data.trials));
    const z = (pHat - p0) / (se || 1);
    const pVal = Math.max(0.0001, Math.min(1, 1 - (z > 0 ? 0.5 + Math.min(0.499, z * 0.2) : 0.5)));

    return {
      success: true,
      result: {
        merchantId: data.merchantId,
        observedP: parseFloat(pHat.toFixed(4)),
        baselineP: p0,
        zScore: parseFloat(z.toFixed(4)),
        pValue: parseFloat(pVal.toFixed(4)),
        pValueTwoTailed: parseFloat((pVal * 2).toFixed(4)),
        isSignificant: pVal < (data.alpha ?? 0.05),
        sampleSize: data.trials,
        interpretation: `Observed delinquency ${pHat.toFixed(2)} with z-score ${z.toFixed(2)}`,
        compositeRiskScore: parseFloat((0.4 * (1 - Math.exp(-pHat)) + 0.4 * (1 - pVal)).toFixed(4)),
      },
    };
  },

  correlation: async (
    _data: CorrelationCalculateRequest
  ): Promise<CorrelationCalculateResponse> => {
    return {
      success: true,
      result: {
        delayVsAmount: {
          r: 0.68,
          pValue: 0.012,
          significant: true,
          sampleSize: 8,
          interpretation: 'Moderate positive correlation between delay and debt amount',
        },
        frequencyVsLateRate: {
          r: -0.42,
          pValue: 0.089,
          significant: false,
          sampleSize: 8,
          interpretation: 'Weak negative correlation between trade volume and default',
        },
        sampleSize: 8,
      },
    };
  },

  trend: async (merchantId: string): Promise<RiskTrendResponse> => {
    const months = [
      '2025-11', '2025-12', '2026-01', '2026-02',
      '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10',
    ];
    const baseScore = inMemoryAssessments.find((a) => a.merchantId === merchantId)?.riskScore ?? 0.25;
    const trend: RiskTrendPoint[] = months.map((month, idx) => {
      const factor = Math.sin(idx) * 0.08;
      const score = Math.max(0.02, Math.min(0.95, baseScore + factor));
      return {
        month,
        riskScore: parseFloat(score.toFixed(3)),
        lateRate: parseFloat((score * 0.4).toFixed(3)),
        eventCount: 10 + (idx % 5),
        lateCount: Math.round(score * 4),
        avgDelayDays: Math.round(score * 12),
      };
    });
    return {
      success: true,
      merchantId,
      months: 12,
      trend,
    };
  },

  // Simulated Socket Emitter for risk alert events
  emitMockRiskFlag: (merchantId: string, riskScore: number, riskLabel: RiskLabel = 'HIGH') => {
    return {
      event: 'risk:flagged',
      payload: {
        merchantId,
        riskScore,
        riskLabel,
        computedAt: new Date().toISOString(),
      },
    };
  },
};

