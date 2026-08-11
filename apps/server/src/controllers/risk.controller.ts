import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Merchant } from '../models/Merchant';
import { RiskAssessment } from '../models/RiskAssessment';
import { callRiskScore, callPortfolioRisk, MonthRecord } from '../services/pythonBridge';
import { getIO } from '../realtime/socket';

/**
 * POST /api/risk/score/:merchantId
 * Calls Python engine with merchant's payment history, saves result, returns it.
 * Body (optional): { history: [{ late, default }] }
 *
 * If no history is provided in body, uses an empty history (cold start).
 */
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

    // Call Python engine
    const result = await callRiskScore(merchant.name, history);

    // Persist result
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

    // Update the embedded riskProfile on the Merchant document
    merchant.riskProfile.riskScore = result.risk_score;
    merchant.riskProfile.riskCategory = result.risk_category as typeof merchant.riskProfile.riskCategory;
    merchant.riskProfile.lastUpdated = new Date();
    await merchant.save();

    // Emit real-time event
    getIO().emit('risk:updated', {
      merchantId: merchant.id,
      riskScore: result.risk_score,
      riskCategory: result.risk_category,
    });

    res.status(201).json({ success: true, assessment: result, assessmentId: assessment.id });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/risk/score/:merchantId
 * Returns the most recent saved RiskAssessment for a merchant.
 */
export const getLatestRisk = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const merchant = await Merchant.findById(req.params.merchantId).select('-passwordHash');
    if (!merchant) {
      res.status(404).json({ message: 'Merchant not found.' });
      return;
    }

    const assessment = await RiskAssessment.findOne({ merchantId: merchant.id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      merchant: { id: merchant.id, name: merchant.name, riskProfile: merchant.riskProfile },
      latestAssessment: assessment ?? null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/risk/portfolio
 * Scores all merchants using their embedded risk histories.
 * Body (optional): { merchants: [{ merchantId, history }] }
 *
 * If no body provided, uses empty history for all merchants (cold start for all).
 */
export const scorePortfolio = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const allMerchants = await Merchant.find().select('name');

    const payload = allMerchants.map((m) => ({
      merchant_id: m.name,
      history: [] as MonthRecord[],   // can be enhanced to pull from DB later
    }));

    const result = await callPortfolioRisk(payload);

    res.json({ success: true, portfolio: result });
  } catch (error) {
    next(error);
  }
};
