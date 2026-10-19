import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { GroupRequest } from '../middleware/group.middleware';
import { Merchant } from '../models/Merchant';
import { Debt } from '../models/Debt';
import { RiskAssessment } from '../models/RiskAssessment';
import { PaymentEvent } from '../models/PaymentEvent';
import {
  callRiskScore,
  callPortfolioRisk,
  callZTest,
  callCorrelation,
  callContagion,
  MonthRecord,
  MerchantCorrelationRecord,
} from '../services/pythonBridge';
import { emitToGroup } from '../realtime/socket';
import { notify } from '../utils/notify';
import { Membership } from '../models/Group';
import { AppError } from '../utils/errors';

/**
 * Helper to aggregate monthly history from PaymentEvent records for a merchant.
 */
const buildMerchantHistory = (
  events: any[],
): { history: MonthRecord[]; lateCount: number; totalCount: number; avgDelay: number } => {
  if (events.length === 0) {
    return { history: [], lateCount: 0, totalCount: 0, avgDelay: 0 };
  }

  // Group events by YYYY-MM
  const monthBuckets = new Map<string, { late: boolean; default: boolean; delaySum: number; count: number }>();

  let lateCount = 0;
  let totalDelay = 0;

  for (const ev of events) {
    const d = new Date(ev.dueDate || ev.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    if (!monthBuckets.has(key)) {
      monthBuckets.set(key, { late: false, default: false, delaySum: 0, count: 0 });
    }

    const bucket = monthBuckets.get(key)!;
    bucket.count += 1;
    bucket.delaySum += ev.delayDays || 0;
    totalDelay += ev.delayDays || 0;

    if (ev.wasLate) {
      bucket.late = true;
      lateCount += 1;
    }
    // Consider severe delays > 60 days as default event
    if (ev.delayDays > 60) {
      bucket.default = true;
    }
  }

  // Convert month buckets to chronological array
  const sortedKeys = Array.from(monthBuckets.keys()).sort();
  const history: MonthRecord[] = sortedKeys.map((k) => {
    const b = monthBuckets.get(k)!;
    return {
      late: b.late,
      default: b.default,
    };
  });

  const avgDelay = events.length > 0 ? totalDelay / events.length : 0;

  return {
    history,
    lateCount,
    totalCount: events.length,
    avgDelay,
  };
};

/**
 * GET /api/risk/group
 * Returns latest group portfolio risk assessments, average risk, and group correlation metrics.
 */
export const getGroupRisk = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId || (req.query.groupId as string);
    const filter: any = {};
    if (groupId) {
      filter.groupId = groupId;
    }

    const assessments = await RiskAssessment.find(filter)
      .sort({ riskScore: -1 })
      .populate('merchantId', 'name email riskProfile')
      .lean();

    const avgRisk =
      assessments.length > 0
        ? assessments.reduce((sum, a) => sum + (a.riskScore || 0), 0) / assessments.length
        : 0;

    res.json({
      success: true,
      merchants: assessments.length,
      portfolioAverageRisk: avgRisk,
      profiles: assessments.map((a: any) => ({
        merchantId: a.merchantId?._id?.toString() || a.merchantId?.toString(),
        merchantName: a.merchantId?.name || 'Unknown',
        riskScore: a.riskScore,
        riskCategory: a.riskCategory,
        riskLabel: a.riskLabel || a.riskCategory,
        lambda: a.lambda || a.lambdaRate,
        zScore: a.zScore ?? 0,
        pValue: a.pValue ?? 1,
        correlation: a.correlation ?? 0,
        coldStart: a.coldStart,
        computedAt: a.computedAt || a.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/risk/merchant/:id
 * Returns a single merchant's latest risk profile, hypothesis z-test details, and monthly history.
 */
export const getMerchantRisk = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(400, 'VALIDATION', 'Invalid merchant ID format.');
    }

    const merchant = await Merchant.findById(id).lean();
    if (!merchant) {
      throw new AppError(404, 'NOT_FOUND', 'Merchant not found.');
    }

    const latestAssessment = await RiskAssessment.findOne({ merchantId: id })
      .sort({ createdAt: -1 })
      .lean();

    const paymentEvents = await PaymentEvent.find({ merchantId: id })
      .sort({ dueDate: -1 })
      .lean();

    const { history, lateCount, totalCount, avgDelay } = buildMerchantHistory(paymentEvents);

    res.json({
      success: true,
      merchantId: id,
      name: merchant.name,
      riskProfile: merchant.riskProfile,
      assessment: latestAssessment
        ? {
            id: latestAssessment._id.toString(),
            lambda: latestAssessment.lambda || latestAssessment.lambdaRate,
            riskScore: latestAssessment.riskScore,
            riskCategory: latestAssessment.riskCategory,
            riskLabel: latestAssessment.riskLabel || latestAssessment.riskCategory,
            zScore: latestAssessment.zScore ?? null,
            pValue: latestAssessment.pValue ?? null,
            correlation: latestAssessment.correlation ?? null,
            coldStart: latestAssessment.coldStart,
            computedAt: latestAssessment.computedAt || latestAssessment.createdAt,
          }
        : null,
      stats: {
        totalPaymentEvents: totalCount,
        latePayments: lateCount,
        averageDelayDays: avgDelay,
        monthsObserved: history.length,
      },
      monthlyHistory: history,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/risk/recompute
 * Recomputes risk scores, hypothesis Z-tests, and Pearson correlation for all merchants in the group.
 * Emits 'risk:flagged' for merchants assessed as HIGH or CRITICAL.
 */
export const recomputeGroupRisk = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId || 'default';

    // Fetch all merchants and group payment events
    const merchants = await Merchant.find().lean();
    const groupEvents = await PaymentEvent.find().lean();

    // Baseline calculation: group-wide late payment rate
    const totalGroupEvents = groupEvents.length;
    const totalGroupLate = groupEvents.filter((e) => e.wasLate).length;
    const baselineLateRate = totalGroupEvents > 0 ? totalGroupLate / totalGroupEvents : 0.05;

    // Collect correlation records
    const correlationRecords: MerchantCorrelationRecord[] = [];
    const merchantHistories = new Map<string, ReturnType<typeof buildMerchantHistory>>();

    for (const m of merchants) {
      const mEvents = groupEvents.filter(
        (e) => e.merchantId?.toString() === m._id.toString(),
      );
      const hist = buildMerchantHistory(mEvents);
      merchantHistories.set(m._id.toString(), hist);

      correlationRecords.push({
        merchant_id: m.name,
        avg_delay: hist.avgDelay,
        avg_amount: 5000, // standard baseline
        frequency: hist.totalCount,
        late_rate: hist.totalCount > 0 ? hist.lateCount / hist.totalCount : 0,
      });
    }

    // Call Pearson correlation on Python engine
    let groupCorrelationR = 0;
    try {
      if (correlationRecords.length >= 3) {
        const corrRes = await callCorrelation({ records: correlationRecords });
        groupCorrelationR = corrRes.frequency_vs_late_rate?.r ?? 0;
      }
    } catch {
      // Fallback
    }

    const updatedAssessments: any[] = [];

    // Recompute each merchant
    for (const m of merchants) {
      const mId = m._id.toString();
      const hist = merchantHistories.get(mId)!;

      // 1. Call Poisson risk score
      let riskResult;
      try {
        riskResult = await callRiskScore(m.name, hist.history);
      } catch {
        riskResult = {
          lambda_rate: hist.totalCount > 0 ? hist.lateCount / Math.max(1, hist.history.length) : 0.05,
          risk_score: 0.1,
          risk_category: 'LOW',
          cold_start: hist.history.length < 3,
        };
      }

      // 2. Call Hypothesis Z-Test
      let zResult;
      try {
        zResult = await callZTest(
          m.name,
          hist.lateCount,
          Math.max(1, hist.totalCount),
          baselineLateRate,
          0.05,
          hist.avgDelay,
        );
      } catch {
        zResult = {
          z_score: 0,
          p_value: 1,
          is_significant: false,
          composite_risk_score: riskResult.risk_score,
        };
      }

      // Determine final risk label
      let riskLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN' = 'LOW';
      const finalScore = zResult.composite_risk_score ?? riskResult.risk_score;

      if (hist.totalCount === 0 && riskResult.cold_start) {
        riskLabel = 'UNKNOWN';
      } else if (finalScore >= 0.85 || riskResult.risk_category === 'CRITICAL') {
        riskLabel = 'CRITICAL';
      } else if (finalScore >= 0.66 || riskResult.risk_category === 'HIGH') {
        riskLabel = 'HIGH';
      } else if (finalScore >= 0.33 || riskResult.risk_category === 'MEDIUM') {
        riskLabel = 'MEDIUM';
      }

      // 3. Persist RiskAssessment
      const assessment = await RiskAssessment.create({
        merchantId: m._id,
        groupId,
        lambdaRate: riskResult.lambda_rate,
        lambda: riskResult.lambda_rate,
        riskScore: finalScore,
        riskCategory: riskLabel,
        riskLabel,
        zScore: zResult.z_score,
        pValue: zResult.p_value,
        correlation: groupCorrelationR,
        coldStart: riskResult.cold_start,
        monthsObserved: hist.history.length,
        latePaymentEvents: hist.lateCount,
        defaultEvents: 0,
        computedAt: new Date(),
      });

      // 4. Update Merchant riskProfile
      await Merchant.findByIdAndUpdate(m._id, {
        $set: {
          'riskProfile.riskScore': finalScore,
          'riskProfile.riskCategory': riskLabel,
          'riskProfile.lastUpdated': new Date(),
        },
      });

      // 5. Emit real-time flag and notification if HIGH or CRITICAL
      if (riskLabel === 'HIGH' || riskLabel === 'CRITICAL') {
        emitToGroup(groupId, 'risk:flagged', {
          merchantId: mId,
          merchantName: m.name,
          riskScore: finalScore,
          riskLabel,
          zScore: zResult.z_score,
          pValue: zResult.p_value,
          computedAt: new Date(),
        });

        Membership.find({ groupId: new Types.ObjectId(groupId), role: { $in: ['admin', 'owner'] } })
          .select('merchantId')
          .then((admins) => {
            const recipients = Array.from(new Set([mId, ...admins.map((a) => a.merchantId.toString())]));
            notify(groupId, recipients, 'risk:flagged', `Risk Alert: ${m.name} elevated to ${riskLabel} risk (score: ${finalScore}).`, { refType: 'risk', refId: mId }).catch(console.error);
          })
          .catch(console.error);
      }

      updatedAssessments.push(assessment);
    }

    res.json({
      success: true,
      recomputedCount: updatedAssessments.length,
      baselineLateRate,
      correlation: groupCorrelationR,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/risk/contagion
 * Runs default cascade simulation using the group's active network graph.
 */
export const simulateContagion = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { failedMerchant, lossGivenDefault, maxRounds } = req.body;
    if (!failedMerchant) {
      throw new AppError(400, 'VALIDATION', 'Missing failedMerchant parameter.');
    }

    const merchants = await Merchant.find().lean();
    const merchantNames = merchants.map((m) => m.name);

    // Build active debts from MongoDB
    const debts = await Debt.find({ status: 'active' })
      .populate('debtorId creditorId')
      .lean();

    const formattedDebts = debts
      .filter((d: any) => d.debtorId?.name && d.creditorId?.name)
      .map((d: any) => ({
        debtor: d.debtorId.name,
        creditor: d.creditorId.name,
        amount: d.amount,
      }));

    const result = await callContagion(
      merchantNames,
      formattedDebts,
      failedMerchant,
      lossGivenDefault ?? 1.0,
      maxRounds ?? 5,
    );

    res.json({
      success: true,
      simulation: result,
    });
  } catch (error) {
    next(error);
  }
};

// ── Backwards-compatible Legacy Handlers ─────────────────────────────────────

export const scoreMerchant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const merchant = await Merchant.findById(req.params.merchantId);
    if (!merchant) {
      res.status(404).json({ message: 'Merchant not found.' });
      return;
    }

    const history: MonthRecord[] = req.body.history ?? [];
    const result = await callRiskScore(merchant.name, history);

    const assessment = await RiskAssessment.create({
      merchantId: merchant.id,
      lambdaRate: result.lambda_rate,
      riskScore: result.risk_score,
      riskCategory: result.risk_category,
      coldStart: result.cold_start,
      monthsObserved: result.months_observed,
      latePaymentEvents: result.late_payment_events,
      defaultEvents: result.default_events,
    });

    merchant.riskProfile.riskScore = result.risk_score;
    merchant.riskProfile.riskCategory = result.risk_category as any;
    merchant.riskProfile.lastUpdated = new Date();
    await merchant.save();

    res.status(201).json({ success: true, assessment: result, assessmentId: assessment.id });
  } catch (error) {
    next(error);
  }
};

export const scorePortfolio = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const merchants = await Merchant.find();
    if (merchants.length === 0) {
      res.status(200).json({ success: true, count: 0, assessments: [] });
      return;
    }

    const payload = merchants.map((m) => ({
      merchant_id: m.name,
      history: [] as MonthRecord[],
    }));

    const result = await callPortfolioRisk(payload);
    res.json({
      success: true,
      count: result.merchants,
      portfolio: result,
      summary: result,
    });
  } catch (error) {
    next(error);
  }
};

export const portfolioSummary = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const assessments = await RiskAssessment.find().sort({ createdAt: -1 });
    res.json({ success: true, count: assessments.length, assessments });
  } catch (error) {
    next(error);
  }
};

export const getLatestRisk = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const merchant = await Merchant.findById(req.params.merchantId);
    if (!merchant) {
      res.status(404).json({ message: 'Merchant not found.' });
      return;
    }

    const assessment = await RiskAssessment.findOne({ merchantId: req.params.merchantId })
      .sort({ createdAt: -1 });
    if (!assessment) {
      res.status(404).json({ message: 'No risk assessment found for this merchant.' });
      return;
    }

    res.json({
      success: true,
      merchant: { id: merchant.id, name: merchant.name, email: merchant.email },
      latestAssessment: assessment,
      assessment,
    });
  } catch (error) {
    next(error);
  }
};


