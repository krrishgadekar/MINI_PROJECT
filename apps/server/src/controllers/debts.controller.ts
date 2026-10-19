import { Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { GroupRequest } from '../middleware/group.middleware';
import { Debt, IDebt } from '../models/Debt';
import { Merchant } from '../models/Merchant';
import { Membership } from '../models/Group';
import { Payment, PaymentKind } from '../models/Payment';
import { PaymentEvent } from '../models/PaymentEvent';
import { AuditLog } from '../models/AuditLog';
import { IdempotencyRecord } from '../models/Idempotency';
import { casUpdate, withRetry } from '../concurrency/optimisticLock';
import { audit } from '../utils/audit';
import { parsePaginationParams } from '../utils/paginate';
import { getIO } from '../realtime/socket';
import { AppError, ValidationError } from '../utils/errors';

const CreateDebtSchema = z.object({
  debtorId: z.string(),
  creditorId: z.string(),
  amount: z.number().positive(),
  dueDate: z.string().optional(),
  note: z.string().optional(),
});

const UpdateDebtSchema = z.object({
  amount: z.number().positive(),
  expectedVersion: z.number().optional(),
});

const DisputeDebtSchema = z.object({
  reason: z.string().optional().default(''),
});

const RecordPaymentSchema = z.object({
  amount: z.number().positive(),
  expectedVersion: z.number().optional(),
  kind: z.enum(['partial', 'settlement', 'netting']).optional(),
  note: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * GET /api/debts
 * Group-scoped. Query params: ?scope=mine|all&status=&debtorId=&creditorId=&page=&limit=&sort=&q=
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

    // Status filter
    if (req.query.status) {
      const statusParam = req.query.status as string;
      if (statusParam === 'overdue') {
        filter.dueDate = { $lt: new Date() };
        filter.status = { $in: ['active', 'pending'] };
      } else {
        filter.status = statusParam;
      }
    }

    // Merchant filters
    if (req.query.debtorId && requestedScope === 'all') {
      filter.debtorId = new mongoose.Types.ObjectId(req.query.debtorId as string);
    }
    if (req.query.creditorId && requestedScope === 'all') {
      filter.creditorId = new mongoose.Types.ObjectId(req.query.creditorId as string);
    }

    // Search query q
    if (req.query.q) {
      const q = (req.query.q as string).trim();
      const regex = new RegExp(q, 'i');
      const matchingMerchants = await Merchant.find({ name: regex }).select('_id');
      const merchantIds = matchingMerchants.map((m) => m._id);

      const searchConditions: Record<string, unknown>[] = [
        { note: regex },
        { debtorId: { $in: merchantIds } },
        { creditorId: { $in: merchantIds } },
      ];

      if (filter.$or) {
        // combine with scope $or
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    const { page, limit, skip, sort } = parsePaginationParams(req.query, { createdAt: -1 });

    const total = await Debt.countDocuments(filter);
    const debts = await Debt.find(filter)
      .populate('debtorId', 'name email')
      .populate('creditorId', 'name email')
      .populate('confirmedBy', 'name email')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      count: debts.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      debts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/debts/:id
 * Click-through single transaction detail returning debt, payment timeline, and audit log.
 * Permissions: Caller must be debtor, creditor, or group admin/owner.
 */
export const getDebtById = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const debt = await Debt.findById(req.params.id)
      .populate('debtorId', 'name email')
      .populate('creditorId', 'name email')
      .populate('confirmedBy', 'name email')
      .populate('createdBy', 'name email');

    if (!debt) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Debt not found.' });
      return;
    }

    // Tenant isolation check
    if (req.groupId && debt.groupId?.toString() !== req.groupId) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Debt does not belong to this group.'));
    }

    // Role / party permission check
    const role = req.role ?? 'member';
    const callerId = req.merchant!._id.toString();
    const debtorId = (debt.debtorId as any)?._id?.toString() ?? debt.debtorId?.toString();
    const creditorId = (debt.creditorId as any)?._id?.toString() ?? debt.creditorId?.toString();

    const isParty = callerId === debtorId || callerId === creditorId;
    const isAdmin = role === 'admin' || role === 'owner';

    if (!isParty && !isAdmin) {
      return next(
        new AppError(403, 'FORBIDDEN_GROUP', 'Only transaction parties and admins can view this debt.'),
      );
    }

    // Fetch payments & audit entries
    const [payments, auditEntries] = await Promise.all([
      Payment.find({ debtId: debt._id })
        .populate('recordedBy', 'name email')
        .sort({ createdAt: -1 }),
      AuditLog.find({ entityId: debt._id })
        .populate('actorId', 'name email')
        .sort({ createdAt: -1 }),
    ]);

    res.json({
      success: true,
      debt,
      payments,
      audit: auditEntries,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/debts
 * Creates a new debt stamped with groupId and createdBy, starting in 'pending' status.
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
      status: 'pending',
      confirmedBy: null,
      createdBy: req.merchant?._id,
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
      { path: 'createdBy', select: 'name email' },
    ]);

    // Record audit log
    await audit(req, 'DEBT_CREATED', 'Debt', debt._id, {
      amount,
      originalAmount: amount,
      status: 'pending',
      debtorId: debtor._id,
      creditorId: creditor._id,
    });

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
 * POST /api/debts/:id/confirm
 * Counterparty confirms pending debt -> status: 'active'.
 * Rule: Only the OTHER party can confirm. Admin may force-confirm.
 */
export const confirmDebt = async (
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

    if (debt.status !== 'pending') {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: `Cannot confirm debt with status '${debt.status}'. Only pending debts can be confirmed.`,
      });
      return;
    }

    const callerId = req.merchant!._id.toString();
    const role = req.role ?? 'member';
    const isAdmin = role === 'admin' || role === 'owner';
    const debtorId = debt.debtorId.toString();
    const creditorId = debt.creditorId.toString();
    const createdBy = debt.createdBy?.toString();

    // Verification:
    // If not admin:
    // - Caller must be debtor or creditor
    // - Caller CANNOT be the one who created it (must be the OTHER party)
    if (!isAdmin) {
      if (callerId !== debtorId && callerId !== creditorId) {
        return next(
          new AppError(403, 'FORBIDDEN_GROUP', 'You are not a party to this debt.'),
        );
      }

      if (createdBy && callerId === createdBy) {
        return next(
          new AppError(
            403,
            'FORBIDDEN_GROUP',
            'Creator cannot self-confirm this debt. Only the counterparty or group admin can confirm.',
          ),
        );
      }
    }

    await casUpdate(Debt, debt._id, debt.version, {
      status: 'active',
      confirmedBy: req.merchant!._id,
    });

    const updated = await Debt.findById(debt._id).populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
      { path: 'confirmedBy', select: 'name email' },
    ]);

    await audit(req, 'DEBT_CONFIRMED', 'Debt', debt._id, {
      status: 'active',
      confirmedBy: req.merchant!._id,
      forced: isAdmin && createdBy !== undefined && callerId === createdBy,
    });

    const groupId = req.groupId;
    if (groupId) {
      getIO().to(`group:${groupId}`).emit('debt:updated', { debt: updated });
    } else {
      getIO().emit('debt:updated', { debt: updated });
    }

    res.json({ success: true, debt: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/debts/:id/reject
 * Counterparty or admin rejects pending debt -> status: 'cancelled'.
 */
export const rejectDebt = async (
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

    if (req.groupId && debt.groupId?.toString() !== req.groupId) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Debt does not belong to this group.'));
    }

    if (debt.status !== 'pending') {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: `Cannot reject debt with status '${debt.status}'. Only pending debts can be rejected.`,
      });
      return;
    }

    const callerId = req.merchant!._id.toString();
    const role = req.role ?? 'member';
    const isAdmin = role === 'admin' || role === 'owner';
    const isParty = callerId === debt.debtorId.toString() || callerId === debt.creditorId.toString();

    if (!isParty && !isAdmin) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'You lack permission to reject this debt.'));
    }

    await casUpdate(Debt, debt._id, debt.version, {
      status: 'cancelled',
    });

    const updated = await Debt.findById(debt._id).populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
    ]);

    await audit(req, 'DEBT_REJECTED', 'Debt', debt._id, {
      status: 'cancelled',
      rejectedBy: req.merchant!._id,
    });

    const groupId = req.groupId;
    if (groupId) {
      getIO().to(`group:${groupId}`).emit('debt:updated', { debt: updated });
    } else {
      getIO().emit('debt:updated', { debt: updated });
    }

    res.json({ success: true, message: 'Debt request rejected', debt: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/debts/:id/dispute
 * Flags an active debt as 'disputed' (excluded from settlement graph).
 */
export const disputeDebt = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = DisputeDebtSchema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : '';

    const debt = await Debt.findById(req.params.id);
    if (!debt) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Debt not found.' });
      return;
    }

    if (req.groupId && debt.groupId?.toString() !== req.groupId) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Debt does not belong to this group.'));
    }

    if (debt.status !== 'active') {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: `Cannot dispute debt with status '${debt.status}'. Only active debts can be disputed.`,
      });
      return;
    }

    const callerId = req.merchant!._id.toString();
    const role = req.role ?? 'member';
    const isAdmin = role === 'admin' || role === 'owner';
    const isParty = callerId === debt.debtorId.toString() || callerId === debt.creditorId.toString();

    if (!isParty && !isAdmin) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Only transaction parties or admins can dispute this debt.'));
    }

    const updatedNote = reason
      ? (debt.note ? `${debt.note} | Dispute: ${reason}` : `Dispute: ${reason}`)
      : debt.note;

    await casUpdate(Debt, debt._id, debt.version, {
      status: 'disputed',
      note: updatedNote,
    });

    const updated = await Debt.findById(debt._id).populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
    ]);

    await audit(req, 'DEBT_DISPUTED', 'Debt', debt._id, {
      status: 'disputed',
      reason,
      disputedBy: req.merchant!._id,
    });

    const groupId = req.groupId;
    if (groupId) {
      getIO().to(`group:${groupId}`).emit('debt:updated', { debt: updated });
    } else {
      getIO().emit('debt:updated', { debt: updated });
    }

    res.json({ success: true, debt: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/debts/:id/payments
 * Records partial or settlement payment using casUpdate + withRetry.
 * Writes Payment + PaymentEvent, sets status to 'settled' if remaining amount is 0.
 * Handles IdempotencyKey (BE-25).
 */
export const recordPayment = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = RecordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: 'Validation error',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { amount, note, kind, idempotencyKey } = parsed.data;
    const debtId = req.params.id;

    if (!mongoose.isValidObjectId(debtId)) {
      res.status(400).json({ success: false, code: 'VALIDATION', message: 'Invalid debt ID.' });
      return;
    }

    const debtObjectId = new mongoose.Types.ObjectId(debtId);

    // Idempotency check (BE-25)
    if (idempotencyKey) {
      const existing = await IdempotencyRecord.findOne({
        debtId: debtObjectId,
        key: idempotencyKey,
      });

      if (existing) {
        res.status(200).json({
          ...existing.response,
          code: 'IDEMPOTENT_REPLAY',
          idempotentReplay: true,
        });
        return;
      }
    }

    const initialDebt = await Debt.findById(debtObjectId);
    if (!initialDebt) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Debt not found.' });
      return;
    }

    // Tenant isolation check
    if (req.groupId && initialDebt.groupId?.toString() !== req.groupId) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Debt does not belong to this group.'));
    }

    // Permission check: debtor, creditor, or admin
    const callerId = req.merchant!._id.toString();
    const role = req.role ?? 'member';
    const isAdmin = role === 'admin' || role === 'owner';
    const isParty =
      callerId === initialDebt.debtorId.toString() ||
      callerId === initialDebt.creditorId.toString();

    if (!isParty && !isAdmin) {
      return next(
        new AppError(403, 'FORBIDDEN_GROUP', 'Only parties or admins can record payments on this debt.'),
      );
    }

    // CAS Update with retry
    const result = await withRetry(async (_attempt) => {
      const currentDebt = await Debt.findById(debtObjectId);
      if (!currentDebt) {
        throw new AppError(404, 'NOT_FOUND', 'Debt not found during payment.');
      }

      if (currentDebt.status !== 'active') {
        throw new ValidationError(
          `Cannot record payment on a debt with status '${currentDebt.status}'. Only active debts accept payments.`,
        );
      }

      if (amount > currentDebt.amount) {
        throw new ValidationError('Payment amount exceeds remaining debt amount.');
      }

      const newAmount = currentDebt.amount - amount;
      const newStatus = newAmount === 0 ? 'settled' : 'active';

      await casUpdate(Debt, currentDebt._id, currentDebt.version, {
        amount: newAmount,
        status: newStatus,
      });

      return { currentDebt, newAmount, newStatus };
    });

    const paymentKind: PaymentKind =
      kind || (result.newStatus === 'settled' ? 'settlement' : 'partial');

    // Write Payment record
    const payment = await Payment.create({
      groupId: result.currentDebt.groupId,
      debtId: result.currentDebt._id,
      amount,
      kind: paymentKind,
      recordedBy: req.merchant!._id,
      note,
      createdAt: new Date(),
    });

    // Write PaymentEvent (BE-11)
    const now = new Date();
    const dueDate = result.currentDebt.dueDate || now;
    const wasLate = result.currentDebt.dueDate ? now.getTime() > result.currentDebt.dueDate.getTime() : false;
    const delayDays =
      wasLate && result.currentDebt.dueDate
        ? Math.max(1, Math.ceil((now.getTime() - result.currentDebt.dueDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

    await PaymentEvent.create({
      groupId: result.currentDebt.groupId,
      merchantId: result.currentDebt.debtorId,
      debtId: result.currentDebt._id,
      dueDate,
      paidDate: now,
      wasLate,
      delayDays,
      amount,
    });

    // Write AuditLog entry
    await audit(req, 'PAYMENT_RECORDED', 'Debt', result.currentDebt._id, {
      amount,
      remaining: result.newAmount,
      status: result.newStatus,
      paymentId: payment._id,
    });

    const updatedDebt = await Debt.findById(debtObjectId).populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
    ]);

    const responsePayload = {
      success: true,
      payment,
      debt: updatedDebt,
    };

    // Store in idempotency store if key was provided
    if (idempotencyKey) {
      await IdempotencyRecord.create({
        debtId: debtObjectId,
        key: idempotencyKey,
        response: responsePayload,
      }).catch((e) => console.warn('Idempotency write conflict:', e.message));
    }

    // Emit real-time events
    const groupId = req.groupId;
    if (groupId) {
      getIO().to(`group:${groupId}`).emit('debt:updated', { debt: updatedDebt });
      if (result.newStatus === 'settled') {
        getIO().to(`group:${groupId}`).emit('debt:settled', { debtId: result.currentDebt._id });
      }
    } else {
      getIO().emit('debt:updated', { debt: updatedDebt });
      if (result.newStatus === 'settled') {
        getIO().emit('debt:settled', { debtId: result.currentDebt._id });
      }
    }

    res.status(201).json(responsePayload);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/debts/:id
 * Body: { amount, expectedVersion? } or header If-Match.
 * Refactored to use casUpdate optimistic locking.
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

    const ifMatch = req.headers['if-match'];
    const expectedVersion =
      parsed.data.expectedVersion ??
      (ifMatch !== undefined ? parseInt(ifMatch as string, 10) : debt.version);

    await casUpdate(Debt, debt._id, expectedVersion, {
      amount: parsed.data.amount,
    });

    const populated = await Debt.findById(debt._id).populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
    ]);

    await audit(req, 'DEBT_UPDATED', 'Debt', debt._id, {
      previousAmount: debt.amount,
      amount: parsed.data.amount,
    });

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
 * DELETE /api/debts/:id — marks debt as 'settled' using casUpdate.
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

    const ifMatch = req.headers['if-match'];
    const bodyVersion = req.body && req.body.expectedVersion;
    const expectedVersion =
      bodyVersion ?? (ifMatch !== undefined ? parseInt(ifMatch as string, 10) : debt.version);

    await casUpdate(Debt, debt._id, expectedVersion, {
      status: 'settled',
      amount: 0,
    });

    if (debt.amount > 0 && req.groupId) {
      await Payment.create({
        groupId: debt.groupId,
        debtId: debt._id,
        amount: debt.amount,
        kind: 'settlement',
        recordedBy: req.merchant!._id,
        note: 'Admin settled debt directly',
      }).catch((e) => console.warn('Payment record warning:', e.message));
    }

    await audit(req, 'DEBT_SETTLED', 'Debt', debt._id, {
      settledAmount: debt.amount,
      status: 'settled',
    });

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
