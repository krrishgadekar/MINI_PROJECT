import { Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { GroupRequest } from '../middleware/group.middleware';
import { Debt, IDebt, ITaxBreakupItem } from '../models/Debt';
import { Merchant } from '../models/Merchant';
import { Group, Membership, TaxDomain } from '../models/Group';
import { Payment, PaymentKind } from '../models/Payment';
import { PaymentEvent } from '../models/PaymentEvent';
import { AuditLog } from '../models/AuditLog';
import { IdempotencyRecord } from '../models/Idempotency';
import { casUpdate, withRetry } from '../concurrency/optimisticLock';
import { audit } from '../utils/audit';
import { parsePaginationParams } from '../utils/paginate';
import { emitToGroup } from '../realtime/socket';
import { notify } from '../utils/notify';
import { AppError, ValidationError } from '../utils/errors';
import { applyTax } from '../tax';

const CreateDebtSchema = z.object({
  debtorId: z.string().optional(),
  debtor: z.string().optional(),
  creditorId: z.string().optional(),
  creditor: z.string().optional(),
  amount: z.number().positive().optional(),
  baseAmount: z.number().positive().optional(),
  taxType: z.string().optional(),
  taxInputs: z.record(z.any()).optional(),
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

    const debtorKey = (req.body.debtorId || req.body.debtor) as string | undefined;
    const creditorKey = (req.body.creditorId || req.body.creditor) as string | undefined;

    if (!debtorKey || !creditorKey) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: 'debtor and creditor are required.',
      });
      return;
    }

    const groupId = req.groupId;
    let groupDomain: TaxDomain = (req.group?.domain || 'none') as TaxDomain;
    if (groupId) {
      const grp = await Group.findById(groupId);
      if (grp?.domain) {
        groupDomain = grp.domain;
      }
    }

    const hasTaxFields =
      req.body.taxType !== undefined ||
      req.body.taxInputs !== undefined ||
      (req.body.baseAmount !== undefined && req.body.amount === undefined);

    if (groupDomain === 'none') {
      if (hasTaxFields) {
        throw new AppError(
          400,
          'DOMAIN_REQUIRED',
          'Tax debts cannot be created in a non-tax group (domain: none).',
        );
      }
      if (req.body.amount === undefined || typeof req.body.amount !== 'number' || req.body.amount <= 0) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION',
          message: 'amount is required and must be positive.',
        });
        return;
      }
    } else {
      // In a tax group, require baseAmount and taxType; server IGNORES client amount
      if (req.body.baseAmount === undefined || typeof req.body.baseAmount !== 'number' || req.body.baseAmount <= 0) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION',
          message: 'baseAmount is required and must be positive in a tax group.',
        });
        return;
      }
      if (!req.body.taxType || typeof req.body.taxType !== 'string') {
        res.status(400).json({
          success: false,
          code: 'VALIDATION',
          message: 'taxType is required in a tax group.',
        });
        return;
      }
    }

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

    if (debtor._id.toString() === creditor._id.toString()) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: 'A merchant cannot owe themselves (self-loop not permitted).',
      });
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

    let payableAmount: number;
    let originalAmount: number;
    let baseAmount: number;
    let taxType: string | undefined;
    let taxEffect: 'add' | 'deduct' | undefined;
    let taxAmount = 0;
    let taxRate: number | undefined;
    let taxBreakup: ITaxBreakupItem[] = [];
    let taxInputs: Record<string, any> | undefined;
    let taxRuleVersion: string | undefined;

    if (groupDomain === 'none') {
      payableAmount = req.body.amount;
      originalAmount = req.body.amount;
      baseAmount = req.body.amount;
    } else {
      const taxResult = applyTax(
        groupDomain,
        req.body.taxType,
        req.body.baseAmount,
        req.body.taxInputs,
      );
      baseAmount = taxResult.baseAmount;
      taxType = req.body.taxType;
      taxEffect = taxResult.effect;
      taxAmount = taxResult.taxAmount;
      taxRate = taxResult.taxRate;
      taxBreakup = taxResult.breakup;
      taxInputs = req.body.taxInputs ?? {};
      taxRuleVersion = taxResult.ruleVersion;
      payableAmount = taxResult.payable;
      originalAmount = taxResult.payable;
    }

    const debtData: Record<string, unknown> = {
      debtorId: debtor._id,
      creditorId: creditor._id,
      amount: payableAmount,
      originalAmount,
      baseAmount,
      taxAmount,
      taxBreakup,
      status: 'pending',
      confirmedBy: null,
      createdBy: req.merchant?._id,
      version: 0,
    };
    if (taxType) debtData.taxType = taxType;
    if (taxEffect) debtData.taxEffect = taxEffect;
    if (taxRate !== undefined) debtData.taxRate = taxRate;
    if (taxInputs) debtData.taxInputs = taxInputs;
    if (taxRuleVersion) debtData.taxRuleVersion = taxRuleVersion;
    if (groupId) {
      debtData.groupId = new mongoose.Types.ObjectId(groupId);
    }
    if (req.body.dueDate) debtData.dueDate = new Date(req.body.dueDate);
    if (req.body.note) debtData.note = req.body.note;

    const debt = await Debt.create(debtData);
    const populated = await debt.populate([
      { path: 'debtorId', select: 'name email' },
      { path: 'creditorId', select: 'name email' },
      { path: 'createdBy', select: 'name email' },
    ]);

    // Record audit log with tax fields included in meta
    await audit(req, 'DEBT_CREATED', 'Debt', debt._id, {
      amount: payableAmount,
      originalAmount,
      status: 'pending',
      debtorId: debtor._id,
      creditorId: creditor._id,
      baseAmount,
      taxType,
      taxEffect,
      taxAmount,
      taxRate,
      taxBreakup,
      taxInputs,
      taxRuleVersion,
    });

    // Notify counterparty of debt request and emit group event
    const callerId = req.merchant!._id.toString();
    const counterpartyId = callerId === debtor._id.toString() ? creditor._id.toString() : debtor._id.toString();
    if (groupId) {
      notify(
        groupId,
        counterpartyId,
        'debt:requested',
        `New debt request of ₹${payableAmount.toLocaleString()} from ${req.merchant!.name}`,
        { refType: 'debt', refId: debt._id.toString() },
      ).catch(console.error);
      emitToGroup(groupId, 'debt:created', { debt: populated });
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
    const counterpartyId = callerId === debt.debtorId.toString() ? debt.creditorId.toString() : debt.debtorId.toString();
    if (groupId) {
      notify(groupId, counterpartyId, 'debt:confirmed', `Debt obligation of ₹${debt.amount.toLocaleString()} was confirmed.`, { refType: 'debt', refId: debt._id.toString() }).catch(console.error);
      emitToGroup(groupId, 'debt:updated', { debt: updated });
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
    const counterpartyId = callerId === debt.debtorId.toString() ? debt.creditorId.toString() : debt.debtorId.toString();
    if (groupId) {
      notify(groupId, counterpartyId, 'debt:rejected', `Debt request of ₹${debt.amount.toLocaleString()} was rejected.`, { refType: 'debt', refId: debt._id.toString() }).catch(console.error);
      emitToGroup(groupId, 'debt:updated', { debt: updated });
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
    const counterpartyId = callerId === debt.debtorId.toString() ? debt.creditorId.toString() : debt.debtorId.toString();
    if (groupId) {
      notify(groupId, counterpartyId, 'debt:disputed', `Debt of ₹${debt.amount.toLocaleString()} was flagged as disputed.`, { refType: 'debt', refId: debt._id.toString() }).catch(console.error);
      emitToGroup(groupId, 'debt:updated', { debt: updated });
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
        key: idempotencyKey,
      });

      if (existing) {
        if (existing.debtId.toString() !== debtObjectId.toString()) {
          throw new AppError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key has already been used for a different debt.',
          );
        }
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

    // Emit real-time events and notify counterparty
    const groupId = req.groupId;
    const counterpartyId = callerId === result.currentDebt.debtorId.toString() ? result.currentDebt.creditorId.toString() : result.currentDebt.debtorId.toString();
    if (groupId) {
      notify(groupId, counterpartyId, 'payment:recorded', `Payment of ₹${amount.toLocaleString()} recorded for debt.`, { refType: 'debt', refId: debtObjectId.toString() }).catch(console.error);
      emitToGroup(groupId, 'debt:updated', { debt: updatedDebt });
      if (result.newStatus === 'settled') {
        emitToGroup(groupId, 'debt:settled', { debtId: result.currentDebt._id });
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

    // Role / party permission check
    const role = req.role ?? 'member';
    const callerId = req.merchant!._id.toString();
    const debtorId = debt.debtorId?.toString();
    const creditorId = debt.creditorId?.toString();
    const isParty = callerId === debtorId || callerId === creditorId;
    const isAdmin = role === 'admin' || role === 'owner';

    if (!isParty && !isAdmin) {
      return next(
        new AppError(403, 'FORBIDDEN_GROUP', 'Only transaction parties and admins can update this debt.'),
      );
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
      emitToGroup(groupId, 'debt:updated', { debt: populated });
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

    // Role / party permission check
    const settleRole = req.role ?? 'member';
    const settleCallerId = req.merchant!._id.toString();
    const settleDebtorId = debt.debtorId?.toString();
    const settleCreditorId = debt.creditorId?.toString();
    const settleIsParty = settleCallerId === settleDebtorId || settleCallerId === settleCreditorId;
    const settleIsAdmin = settleRole === 'admin' || settleRole === 'owner';

    if (!settleIsParty && !settleIsAdmin) {
      return next(
        new AppError(403, 'FORBIDDEN_GROUP', 'Only transaction parties and admins can settle this debt.'),
      );
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
      emitToGroup(groupId, 'debt:settled', { debtId: debt.id });
    }
    res.json({ success: true, message: 'Debt marked as settled.', debtId: debt.id });
  } catch (error) {
    next(error);
  }
};

const DebtImportRowSchema = z.object({
  debtor: z.string().min(1, 'Debtor is required'),
  creditor: z.string().min(1, 'Creditor is required'),
  amount: z.preprocess((val) => Number(val), z.number().positive('Amount must be positive')),
  dueDate: z.string().optional(),
  note: z.string().optional(),
});

function parseCsv(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map((h) => h.replace(/^"|"$/g, '').trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] ? values[idx].replace(/^"|"$/g, '') : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * GET /api/debts/export.csv
 * Group/role scoped streaming CSV export of debts.
 */
export const exportDebtsCsv = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    if (!groupId) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Group access requires X-Group-Id header.'));
    }

    const role = req.role ?? 'member';
    const requestedScope = (req.query.scope as string) ?? (role === 'member' ? 'mine' : 'all');

    if (role === 'member' && requestedScope === 'all') {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Members may only query scope=mine.'));
    }

    const filter: Record<string, unknown> = {
      groupId: new mongoose.Types.ObjectId(groupId),
    };

    if (requestedScope === 'mine') {
      const merchantId = req.merchant!._id;
      filter.$or = [{ debtorId: merchantId }, { creditorId: merchantId }];
    }

    if (req.query.status) {
      filter.status = req.query.status as string;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="debts_export.csv"');

    const escapeCsv = (val: any): string => {
      let str = String(val ?? '');
      if (/^[=+@\-\t\r]/.test(str)) {
        str = `'${str}`;
      }
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    res.write('id,debtorId,debtorName,debtorEmail,creditorId,creditorName,creditorEmail,amount,remainingAmount,status,dueDate,note,createdAt\n');

    const cursor = Debt.find(filter)
      .populate('debtorId', 'name email')
      .populate('creditorId', 'name email')
      .sort({ createdAt: -1 })
      .cursor();

    for await (const doc of cursor) {
      const debtor = doc.debtorId as any;
      const creditor = doc.creditorId as any;
      const debtorIdStr = debtor?._id ? debtor._id.toString() : (doc.debtorId?.toString() || '');
      const creditorIdStr = creditor?._id ? creditor._id.toString() : (doc.creditorId?.toString() || '');

      const row = [
        doc._id.toString(),
        debtorIdStr,
        escapeCsv(debtor?.name || ''),
        escapeCsv(debtor?.email || ''),
        creditorIdStr,
        escapeCsv(creditor?.name || ''),
        escapeCsv(creditor?.email || ''),
        doc.originalAmount ?? doc.amount,
        doc.amount,
        doc.status,
        doc.dueDate ? doc.dueDate.toISOString() : '',
        escapeCsv(doc.note || ''),
        doc.createdAt ? doc.createdAt.toISOString() : '',
      ].join(',');

      res.write(row + '\n');
    }

    res.end();
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/debts/import
 * Admin only. Multipart CSV or raw/json CSV import.
 * Zod row validation, dry-run mode returning per-row errors, creates 'active' debts, audits.
 */
export const importDebtsCsv = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    if (!groupId) {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Group access requires X-Group-Id header.'));
    }

    const role = req.role ?? 'member';
    if (role !== 'admin' && role !== 'owner') {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Admin role required to import debts.'));
    }

    const isDryRun =
      req.query.dryRun === 'true' ||
      req.body?.dryRun === 'true' ||
      req.body?.dryRun === true;

    let csvContent = '';
    if (req.file && req.file.buffer) {
      csvContent = req.file.buffer.toString('utf-8');
    } else if (typeof req.body === 'string') {
      csvContent = req.body;
    } else if (req.body?.csvText) {
      csvContent = req.body.csvText;
    } else if (req.body?.csv) {
      csvContent = req.body.csv;
    }

    if (!csvContent.trim()) {
      res.status(400).json({ success: false, message: 'CSV file or content is required.' });
      return;
    }

    // Protection against oversized files (>2MB)
    if (csvContent.length > 2 * 1024 * 1024) {
      res.status(400).json({
        success: false,
        code: 'FILE_TOO_LARGE',
        message: 'CSV file size exceeds the 2MB limit.',
      });
      return;
    }

    const { rows } = parseCsv(csvContent);
    if (rows.length === 0) {
      res.status(400).json({ success: false, message: 'CSV contains no data rows.' });
      return;
    }

    // Protection against excessive rows DoS (>1000 rows)
    if (rows.length > 1000) {
      res.status(400).json({
        success: false,
        code: 'TOO_MANY_ROWS',
        message: 'CSV exceeds maximum limit of 1000 rows per import.',
      });
      return;
    }

    // Fetch all group memberships once for quick in-memory validation
    const groupMemberships = await Membership.find({
      groupId: new mongoose.Types.ObjectId(groupId),
    }).populate<{ merchantId: { _id: mongoose.Types.ObjectId; email: string; name: string } }>(
      'merchantId',
      'email name',
    );

    const memberByEmail = new Map<string, mongoose.Types.ObjectId>();
    const memberById = new Map<string, mongoose.Types.ObjectId>();

    for (const m of groupMemberships) {
      const merchant = m.merchantId as any;
      if (merchant?._id) {
        memberById.set(merchant._id.toString(), merchant._id);
        if (merchant.email) {
          memberByEmail.set(merchant.email.toLowerCase(), merchant._id);
        }
      }
    }

    const validRows: Array<{
      debtorId: mongoose.Types.ObjectId;
      creditorId: mongoose.Types.ObjectId;
      amount: number;
      dueDate?: Date;
      note?: string;
      debtorIdentifier: string;
      creditorIdentifier: string;
    }> = [];

    const errors: Array<{
      row: number;
      data: Record<string, string>;
      errors: string[];
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const rowNum = i + 1;
      const rowErrors: string[] = [];

      const debtorKey = Object.keys(rawRow).find((k) => /^debtor/i.test(k));
      const creditorKey = Object.keys(rawRow).find((k) => /^creditor/i.test(k));
      const amountKey = Object.keys(rawRow).find((k) => /^amount/i.test(k));
      const dueDateKey = Object.keys(rawRow).find((k) => /^due/i.test(k));
      const noteKey = Object.keys(rawRow).find((k) => /^note|description/i.test(k));

      const debtorVal = debtorKey ? rawRow[debtorKey] : '';
      const creditorVal = creditorKey ? rawRow[creditorKey] : '';
      const amountVal = amountKey ? rawRow[amountKey] : '';
      const dueDateVal = dueDateKey ? rawRow[dueDateKey] : '';
      const noteVal = noteKey ? rawRow[noteKey] : '';

      const parseResult = DebtImportRowSchema.safeParse({
        debtor: debtorVal,
        creditor: creditorVal,
        amount: amountVal,
        dueDate: dueDateVal || undefined,
        note: noteVal || undefined,
      });

      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`);
        rowErrors.push(...issues);
      } else {
        const { debtor, creditor, amount, dueDate, note } = parseResult.data;

        const resolvedDebtorId = memberById.get(debtor) || memberByEmail.get(debtor.toLowerCase());
        if (!resolvedDebtorId) {
          rowErrors.push(`Debtor '${debtor}' is not a member of this group.`);
        }

        const resolvedCreditorId = memberById.get(creditor) || memberByEmail.get(creditor.toLowerCase());
        if (!resolvedCreditorId) {
          rowErrors.push(`Creditor '${creditor}' is not a member of this group.`);
        }

        if (resolvedDebtorId && resolvedCreditorId && resolvedDebtorId.equals(resolvedCreditorId)) {
          rowErrors.push('Debtor and creditor cannot be the same merchant.');
        }

        let parsedDueDate: Date | undefined = undefined;
        if (dueDate) {
          const d = new Date(dueDate);
          if (isNaN(d.getTime())) {
            rowErrors.push(`Invalid due date format '${dueDate}'.`);
          } else {
            parsedDueDate = d;
          }
        }

        if (rowErrors.length === 0 && resolvedDebtorId && resolvedCreditorId) {
          const sanitizedNote = note ? (/^[=+@\-\t\r]/.test(note) ? `'${note}` : note) : '';
          validRows.push({
            debtorId: resolvedDebtorId,
            creditorId: resolvedCreditorId,
            amount,
            dueDate: parsedDueDate,
            note: sanitizedNote,
            debtorIdentifier: debtor,
            creditorIdentifier: creditor,
          });
        }
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: rowNum,
          data: rawRow,
          errors: rowErrors,
        });
      }
    }

    if (isDryRun) {
      res.json({
        success: true,
        dryRun: true,
        totalRows: rows.length,
        validCount: validRows.length,
        errorCount: errors.length,
        errors,
        preview: validRows.slice(0, 50),
      });
      return;
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION_FAILED',
        message: `Import rejected: ${errors.length} validation errors found across ${rows.length} rows. Run with dryRun=true to preview.`,
        totalRows: rows.length,
        validCount: validRows.length,
        errorCount: errors.length,
        errors,
      });
      return;
    }

    const createdDebts: IDebt[] = [];
    for (const item of validRows) {
      const debt = await Debt.create({
        groupId: new mongoose.Types.ObjectId(groupId),
        debtorId: item.debtorId,
        creditorId: item.creditorId,
        amount: item.amount,
        originalAmount: item.amount,
        dueDate: item.dueDate,
        note: item.note,
        status: 'active',
        createdBy: req.merchant!._id,
        confirmedBy: req.merchant!._id,
        confirmedAt: new Date(),
      });

      await audit(req, 'DEBT_IMPORT', 'Debt', debt._id, {
        import: true,
        amount: debt.amount,
        debtorId: item.debtorId,
        creditorId: item.creditorId,
      });

      createdDebts.push(debt);
      emitToGroup(groupId, 'debt:created', { debt });
    }

    res.status(201).json({
      success: true,
      dryRun: false,
      importedCount: createdDebts.length,
      debts: createdDebts,
    });
  } catch (error) {
    next(error);
  }
};
