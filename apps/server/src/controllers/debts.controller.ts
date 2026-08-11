import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { Debt } from '../models/Debt';
import { Merchant } from '../models/Merchant';
import { getIO } from '../realtime/socket';

const CreateDebtSchema = z.object({
  debtorId: z.string().min(1),
  creditorId: z.string().min(1),
  amount: z.number().positive(),
});

const UpdateDebtSchema = z.object({
  amount: z.number().positive(),
});

/**
 * GET /api/debts
 * Optional query params: ?debtorId=&creditorId=&status=
 */
export const getAllDebts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.debtorId) filter.debtorId = req.query.debtorId;
    if (req.query.creditorId) filter.creditorId = req.query.creditorId;
    if (req.query.status) filter.status = req.query.status;

    const debts = await Debt.find(filter)
      .populate('debtorId', 'name email')
      .populate('creditorId', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: debts.length, debts });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/debts
 * Body: { debtorId, creditorId, amount }
 */
export const createDebt = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = CreateDebtSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() });
      return;
    }

    const { debtorId, creditorId, amount } = parsed.data;

    // Validate that both merchants exist
    const [debtor, creditor] = await Promise.all([
      Merchant.findById(debtorId),
      Merchant.findById(creditorId),
    ]);
    if (!debtor) { res.status(404).json({ message: 'Debtor merchant not found.' }); return; }
    if (!creditor) { res.status(404).json({ message: 'Creditor merchant not found.' }); return; }

    const debt = await Debt.create({ debtorId, creditorId, amount, originalAmount: amount });
    const populated = await debt.populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
    ]);

    // Emit real-time event to all connected clients
    getIO().emit('debt:created', { debt: populated });

    res.status(201).json({ success: true, debt: populated });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/debts/:id
 * Body: { amount }
 */
export const updateDebt = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = UpdateDebtSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() });
      return;
    }

    const debt = await Debt.findById(req.params.id);
    if (!debt) { res.status(404).json({ message: 'Debt not found.' }); return; }
    if (debt.status !== 'active') {
      res.status(400).json({ message: 'Cannot update a settled or netted debt.' });
      return;
    }

    debt.amount = parsed.data.amount;
    await debt.save();

    const populated = await debt.populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
    ]);

    getIO().emit('debt:updated', { debt: populated });
    res.json({ success: true, debt: populated });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/debts/:id  — marks debt as 'settled'
 */
export const settleDebt = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const debt = await Debt.findById(req.params.id);
    if (!debt) { res.status(404).json({ message: 'Debt not found.' }); return; }

    debt.status = 'settled';
    debt.amount = 0;
    await debt.save();

    getIO().emit('debt:settled', { debtId: debt.id });
    res.json({ success: true, message: 'Debt marked as settled.', debtId: debt.id });
  } catch (error) {
    next(error);
  }
};
