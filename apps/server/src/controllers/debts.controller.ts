import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { GroupRequest } from '../middleware/group.middleware';
import { Debt } from '../models/Debt';
import { Merchant } from '../models/Merchant';
import { Membership } from '../models/Group';
import { getIO } from '../realtime/socket';
import { AppError } from '../utils/errors';

import mongoose from 'mongoose';

const CreateDebtSchema = z.object({
  debtorId: z.string(),
  creditorId: z.string(),
  amount: z.number().positive(),
  dueDate: z.string().optional(),
  note: z.string().optional(),
});

const UpdateDebtSchema = z.object({
  amount: z.number().positive(),
});

/**
 * GET /api/debts
 * Group-scoped. Query params: ?scope=mine|all&status=&debtorId=&creditorId=
 * Role rules:
 *   admin/owner: default scope=all (can see all group debts)
 *   member: forced to scope=mine (debts where they are debtor or creditor)
 */
export const getAllDebts = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    const role = req.role ?? 'member';
    const requestedScope = (req.query.scope as string) ?? (role === 'member' ? 'mine' : 'all');

    // Members cannot request 'all' scope
    if (role === 'member' && requestedScope === 'all') {
      return next(
        new AppError(403, 'FORBIDDEN_GROUP', 'Members may only query scope=mine.'),
      );
    }

    const filter: Record<string, unknown> = {};

    // Group filter
    if (groupId) {
      filter.groupId = new mongoose.Types.ObjectId(groupId);
    }

    // Scope filter
    if (requestedScope === 'mine') {
      const merchantId = req.merchant!._id;
      filter.$or = [
        { debtorId: merchantId },
        { creditorId: merchantId },
      ];
    }

    // Optional query params (admin convenience)
    if (req.query.status) filter.status = req.query.status;
    if (req.query.debtorId && requestedScope === 'all') filter.debtorId = req.query.debtorId;
    if (req.query.creditorId && requestedScope === 'all') filter.creditorId = req.query.creditorId;

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
 * Creates a new debt stamped with groupId. Both parties must be group members.
 * Body: { debtorId, creditorId, amount, dueDate?, note? }
 */
export const createDebt = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = CreateDebtSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: 'Validation error',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { debtorId: debtorKey, creditorId: creditorKey, amount, dueDate, note } = parsed.data;
    const groupId = req.groupId;

    const findMerchant = async (key: string) => {
      if (mongoose.isValidObjectId(key)) {
        const byId = await Merchant.findById(key);
        if (byId) return byId;
      }
      return Merchant.findOne({ name: key });
    };

    const [debtor, creditor] = await Promise.all([
      findMerchant(debtorKey),
      findMerchant(creditorKey),
    ]);
    if (!debtor) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Debtor merchant not found.' });
      return;
    }
    if (!creditor) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Creditor merchant not found.' });
      return;
    }

    // Both parties must be members of the group (if groupId is present)
    if (groupId) {
      const groupObjId = new mongoose.Types.ObjectId(groupId);
      const [debtorMembership, creditorMembership] = await Promise.all([
        Membership.findOne({ groupId: groupObjId, merchantId: debtor._id }),
        Membership.findOne({ groupId: groupObjId, merchantId: creditor._id }),
      ]);

      if (!debtorMembership) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION',
          message: 'Debtor is not a member of this group.',
        });
        return;
      }
      if (!creditorMembership) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION',
          message: 'Creditor is not a member of this group.',
        });
        return;
      }
    }

    const debtData: Record<string, unknown> = {
      debtorId: debtor._id,
      creditorId: creditor._id,
      amount,
      originalAmount: amount,
      status: 'pending',  // v2: new debts start as pending
      version: 0,
    };
    if (groupId) {
      debtData.groupId = new mongoose.Types.ObjectId(groupId);
    }
    if (dueDate) debtData.dueDate = new Date(dueDate);
    if (note) debtData.note = note;

    const debt = await Debt.create(debtData);
    const populated = await debt.populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
    ]);

    // Emit real-time event scoped to group
    if (groupId) {
      getIO().to(`group:${groupId}`).emit('debt:created', { debt: populated });
    } else {
      getIO().emit('debt:created', { debt: populated });
    }

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
  req: GroupRequest,
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
    if (!debt) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Debt not found.' });
      return;
    }

    // Tenant isolation check
    if (req.groupId && debt.groupId?.toString() !== req.groupId) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Debt does not belong to this group.'));
    }

    if (debt.status !== 'active' && debt.status !== 'pending') {
      res.status(400).json({ message: 'Cannot update a settled or netted debt.' });
      return;
    }

    debt.amount = parsed.data.amount;
    debt.version += 1;
    await debt.save();

    const populated = await debt.populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
    ]);

    const groupId = req.groupId;
    if (groupId) {
      getIO().to(`group:${groupId}`).emit('debt:updated', { debt: populated });
    } else {
      getIO().emit('debt:updated', { debt: populated });
    }
    res.json({ success: true, debt: populated });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/debts/:id  — marks debt as 'settled'
 */
export const settleDebt = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const debt = await Debt.findById(req.params.id);
    if (!debt) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Debt not found.' });
      return;
    }

    // Tenant isolation check
    if (req.groupId && debt.groupId?.toString() !== req.groupId) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Debt does not belong to this group.'));
    }

    debt.status = 'settled';
    debt.amount = 0;
    debt.version += 1;
    await debt.save();

    const groupId = req.groupId;
    if (groupId) {
      getIO().to(`group:${groupId}`).emit('debt:settled', { debtId: debt.id });
    } else {
      getIO().emit('debt:settled', { debtId: debt.id });
    }
    res.json({ success: true, message: 'Debt marked as settled.', debtId: debt.id });
  } catch (error) {
    next(error);
  }
};
