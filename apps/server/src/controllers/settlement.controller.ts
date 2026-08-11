import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../middleware/auth.middleware';
import { Debt } from '../models/Debt';
import { Merchant } from '../models/Merchant';
import { Settlement } from '../models/Settlement';
import { callSettlement, callCycleDetection, DebtEdge } from '../services/pythonBridge';
import { getIO } from '../realtime/socket';

/**
 * Helper: Build the merchant names list and debt edges from MongoDB for Python engine.
 * The Python engine works with merchant NAMES (strings), not ObjectIds.
 */
const buildGraphPayload = async (): Promise<{ merchants: string[]; debts: DebtEdge[] }> => {
  const [allMerchants, activeDebts] = await Promise.all([
    Merchant.find().select('name'),
    Debt.find({ status: 'active' })
      .populate<{ debtorId: { name: string } }>('debtorId', 'name')
      .populate<{ creditorId: { name: string } }>('creditorId', 'name'),
  ]);

  const merchants = allMerchants.map((m) => m.name);
  const debts: DebtEdge[] = activeDebts.map((d) => ({
    debtor: (d.debtorId as unknown as { name: string }).name,
    creditor: (d.creditorId as unknown as { name: string }).name,
    amount: d.amount,
  }));

  return { merchants, debts };
};

/**
 * POST /api/settlement
 * Fetches active debts → sends to Python engine → saves Settlement doc → returns result
 */
export const computeSettlement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { merchants, debts } = await buildGraphPayload();

    if (debts.length === 0) {
      res.status(400).json({ message: 'No active debts found to settle.' });
      return;
    }

    // Call Python engine
    const result = await callSettlement(merchants, debts);

    // Persist the settlement batch
    const batchId = uuidv4();
    const settlement = await Settlement.create({
      batchId,
      transactions: result.transactions,
      algorithmUsed: result.algorithm,
      status: 'pending',
      totalAmountSettled: result.total_amount_settled,
      transactionCount: result.transaction_count,
      initiatedBy: req.merchant!.id,
    });

    // Emit real-time event
    getIO().emit('settlement:ready', {
      batchId,
      transactions: result.transactions,
      transactionCount: result.transaction_count,
    });

    res.status(201).json({
      success: true,
      batchId,
      settlement: result,
      settlementId: settlement.id,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settlement/cycles
 * Detects circular debt chains in the current active debt graph
 */
export const detectCycles = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { merchants, debts } = await buildGraphPayload();
    const result = await callCycleDetection(merchants, debts);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settlement/confirm/:batchId
 * Confirms a settlement batch and marks all active debts as settled
 */
export const confirmSettlement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { batchId } = req.params;
    const settlement = await Settlement.findOne({ batchId });

    if (!settlement) {
      res.status(404).json({ message: 'Settlement batch not found.' });
      return;
    }
    if (settlement.status === 'confirmed') {
      res.status(400).json({ message: 'This settlement has already been confirmed.' });
      return;
    }

    // Mark all active debts as settled
    await Debt.updateMany({ status: 'active' }, { $set: { status: 'settled', amount: 0 } });

    settlement.status = 'confirmed';
    await settlement.save();

    getIO().emit('settlement:confirmed', { batchId });

    res.json({ success: true, message: 'Settlement confirmed. All debts marked as settled.', batchId });
  } catch (error) {
    next(error);
  }
};
