import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { GroupRequest } from '../middleware/group.middleware';
import { Debt, IDebt } from '../models/Debt';
import { Merchant } from '../models/Merchant';
import { Membership } from '../models/Group';
import { Settlement } from '../models/Settlement';
import { Payment } from '../models/Payment';
import {
  callSettlement,
  callCycleDetection,
  callNetCycle,
  callNetAllCycles,
  callOptimizeSettlement,
  DebtEdge,
} from '../services/pythonBridge';
import { casUpdate } from '../concurrency/optimisticLock';
import { emitToGroup } from '../realtime/socket';
import { notify } from '../utils/notify';

/**
 * Helper: Build the merchant names list and debt edges from MongoDB for Python engine.
 * When groupId is provided, scopes to group members and group debts only.
 */
const buildGraphPayload = async (
  groupId?: string,
): Promise<{ merchants: string[]; debts: DebtEdge[]; activeDebts: any[] }> => {
  let merchantIds: mongoose.Types.ObjectId[] | undefined;

  if (groupId) {
    const memberships = await Membership.find({
      groupId: new mongoose.Types.ObjectId(groupId),
    }).select('merchantId');
    merchantIds = memberships.map((m) => m.merchantId);
  }

  const merchantFilter = merchantIds ? { _id: { $in: merchantIds } } : {};
  const debtFilter: Record<string, unknown> = { status: 'active' };
  if (groupId) debtFilter.groupId = new mongoose.Types.ObjectId(groupId);

  const [allMerchants, activeDebts] = await Promise.all([
    Merchant.find(merchantFilter).select('name'),
    Debt.find(debtFilter)
      .populate<{ debtorId: { name: string } }>('debtorId', 'name')
      .populate<{ creditorId: { name: string } }>('creditorId', 'name'),
  ]);

  const merchants = allMerchants.map((m) => m.name);
  const debts: DebtEdge[] = activeDebts
    .filter((d) => d.debtorId && d.creditorId)
    .map((d) => ({
      debtor: (d.debtorId as unknown as { name: string }).name,
      creditor: (d.creditorId as unknown as { name: string }).name,
      amount: d.amount,
    }));

  return { merchants, debts, activeDebts };
};

/**
 * POST /api/settlement
 * Fetches active debts → sends to Python engine → saves Settlement doc with debtSnapshot → returns result
 */
export const computeSettlement = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    const { merchants, debts, activeDebts } = await buildGraphPayload(groupId);

    if (debts.length === 0) {
      res.status(400).json({ message: 'No active debts found to settle.' });
      return;
    }

    // Call Python engine
    const result = await callSettlement(merchants, debts);

    // Persist the settlement batch with debtSnapshot for CAS confirmation
    const batchId = uuidv4();
    const debtSnapshot = activeDebts.map((d) => ({
      debtId: d._id,
      version: d.version ?? 0,
      amount: d.amount,
    }));

    const settlementData: Record<string, unknown> = {
      batchId,
      transactions: result.transactions,
      debtSnapshot,
      algorithmUsed: result.algorithm,
      status: 'pending',
      totalAmountSettled: result.total_amount_settled,
      transactionCount: result.transaction_count,
      initiatedBy: req.merchant!.id,
    };
    if (groupId) settlementData.groupId = new mongoose.Types.ObjectId(groupId);

    const settlement = await Settlement.create(settlementData);

    // Emit real-time event scoped to group and notify admins + involved merchants
    const eventPayload = {
      batchId,
      transactions: result.transactions,
      transactionCount: result.transaction_count,
    };
    if (groupId) {
      emitToGroup(groupId, 'settlement:ready', eventPayload);

      Membership.find({ groupId: new mongoose.Types.ObjectId(groupId), role: { $in: ['admin', 'owner'] } })
        .select('merchantId')
        .then(async (adminMemberships) => {
          const involvedNames = new Set((result.transactions || []).flatMap((t: any) => [t.from || t.debtor || t.payer, t.to || t.creditor || t.payee]));
          const involvedMerchants = await Merchant.find({ name: { $in: Array.from(involvedNames) } }).select('_id');
          const recipientIds = Array.from(new Set([
            ...adminMemberships.map((m) => m.merchantId.toString()),
            ...involvedMerchants.map((m) => m._id.toString()),
          ]));
          notify(groupId, recipientIds, 'settlement:ready', `Settlement plan ready: ${result.transaction_count || 0} transactions settling ₹${(result.total_amount_settled || 0).toLocaleString()}.`, { refType: 'settlement', refId: settlement.id }).catch(console.error);
        })
        .catch(console.error);
    }

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
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { merchants, debts } = await buildGraphPayload(req.groupId);
    const result = await callCycleDetection(merchants, debts);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settlement/net-cycle
 * Nets a circular debt cycle and updates affected debt balances in MongoDB.
 * Defect fixes:
 * 1. Validates cycle length >= 2 and distinct merchants (no self-loops).
 * 2. Supports duplicate debts between the same pair by distributing the netted amount.
 * 3. Applies float rounding guard Math.round(v * 100) / 100 to avoid precision leaks (e.g. 0.1+0.2).
 */
export const netCycleController = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { cycle } = req.body;
    if (!Array.isArray(cycle) || cycle.length < 2) {
      res.status(400).json({ message: 'A valid cycle array of at least 2 merchants is required.' });
      return;
    }

    if (new Set(cycle).size !== cycle.length) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: 'Cycle must contain distinct merchants (no self-loops).',
      });
      return;
    }

    const groupId = req.groupId;
    const { merchants, debts } = await buildGraphPayload(groupId);
    const result = await callNetCycle(merchants, debts, cycle);

    // Apply netting reductions to MongoDB active debts
    const amountNetted = result.amount_netted;
    if (amountNetted > 0) {
      for (let i = 0; i < cycle.length; i++) {
        const debtorName = cycle[i];
        const creditorName = cycle[(i + 1) % cycle.length];

        const [debtor, creditor] = await Promise.all([
          Merchant.findOne({ name: debtorName }),
          Merchant.findOne({ name: creditorName }),
        ]);

        if (debtor && creditor) {
          const debtFilter: Record<string, unknown> = {
            debtorId: debtor._id,
            creditorId: creditor._id,
            status: 'active',
          };
          if (groupId) debtFilter.groupId = new mongoose.Types.ObjectId(groupId);

          // Find all matching active debts to handle duplicates between this pair
          const matchingDebts = await Debt.find(debtFilter).sort({ createdAt: 1 });

          let remainingToNet = amountNetted;
          for (const debt of matchingDebts) {
            if (remainingToNet <= 0) break;
            const deduction = Math.min(debt.amount, remainingToNet);
            const rawNew = Math.max(0, Math.round((debt.amount - deduction) * 100) / 100);
            const newAmount = rawNew < 1e-4 ? 0 : rawNew;

            debt.amount = newAmount;
            if (newAmount === 0) {
              debt.status = 'netted';
            }
            debt.version += 1;
            await debt.save();

            remainingToNet = Math.max(0, Math.round((remainingToNet - deduction) * 100) / 100);

            const populated = await debt.populate([
              { path: 'debtorId', select: 'name email' },
              { path: 'creditorId', select: 'name email' },
            ]);
            if (groupId) {
              emitToGroup(groupId, 'debt:updated', { debt: populated });
            }
          }
        }
      }
    }

    const cyclePayload = {
      cycle: result.cycle,
      amountNetted: result.amount_netted,
      netFlows: result.net_flows,
    };
    if (groupId) {
      emitToGroup(groupId, 'cycle:netted', cyclePayload);

      Merchant.find({ name: { $in: result.cycle || [] } })
        .select('_id')
        .then((merchants) => {
          notify(groupId, merchants.map((m) => m._id.toString()), 'cycle:netted', `Debt cycle netted: ₹${(result.amount_netted || 0).toLocaleString()} cleared across ${result.cycle?.length || 0} merchants.`, { refType: 'settlement' }).catch(console.error);
        })
        .catch(console.error);
    }

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settlement/confirm/:batchId
 * Confirms a settlement batch.
 * Lifecycle & Concurrency:
 * 1. Atomically transitions settlement status from 'pending' to 'executing'.
 *    Prevents double-execution races; concurrent calls get 409 CONCURRENT_MODIFICATION.
 * 2. Uses casUpdate on each debt in debtSnapshot.
 *    If any debt was modified mid-confirm, casUpdate throws ConcurrentModificationError;
 *    the batch is marked 'failed' and returns 409 STALE_SETTLEMENT.
 * 3. On success, writes Payment audit records with kind: 'settlement', marks batch 'confirmed'.
 */
export const confirmSettlement = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { batchId } = req.params;
    const groupId = req.groupId;

    const settlementFilter: Record<string, unknown> = { batchId };
    if (groupId) settlementFilter.groupId = new mongoose.Types.ObjectId(groupId);

    // Atomically transition from pending -> executing
    const settlement = await Settlement.findOneAndUpdate(
      { ...settlementFilter, status: 'pending' },
      { $set: { status: 'executing' } },
      { new: true },
    );

    if (!settlement) {
      const existing = await Settlement.findOne(settlementFilter);
      if (!existing) {
        res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Settlement batch not found.' });
        return;
      }
      if (existing.status === 'confirmed') {
        res.status(400).json({ success: false, code: 'ALREADY_CONFIRMED', message: 'This settlement has already been confirmed.' });
        return;
      }
      res.status(409).json({ success: false, code: 'CONCURRENT_MODIFICATION', message: 'Settlement batch is currently executing or failed.' });
      return;
    }

    // If debtSnapshot is present, CAS-update each debt in the snapshot
    if (settlement.debtSnapshot && settlement.debtSnapshot.length > 0) {
      try {
        for (const item of settlement.debtSnapshot) {
          await casUpdate(Debt, item.debtId, item.version, {
            status: 'settled',
            amount: 0,
          });
        }
      } catch (casErr) {
        settlement.status = 'failed';
        await settlement.save();
        res.status(409).json({
          success: false,
          code: 'STALE_SETTLEMENT',
          message: 'One or more debts were modified mid-confirm. Settlement aborted.',
        });
        return;
      }

      // Record payments for settled debts
      const paymentDocs = settlement.debtSnapshot.map((item) => ({
        groupId: settlement.groupId,
        debtId: item.debtId,
        amount: item.amount,
        kind: 'settlement' as const,
        recordedBy: req.merchant!._id,
        note: `Settlement batch ${batchId}`,
      }));
      if (paymentDocs.length > 0) {
        await Payment.insertMany(paymentDocs);
      }
    } else {
      // Fallback if no snapshot was captured
      const debtFilter: Record<string, unknown> = { status: 'active' };
      if (groupId) debtFilter.groupId = new mongoose.Types.ObjectId(groupId);
      await Debt.updateMany(debtFilter, { $set: { status: 'settled', amount: 0 }, $inc: { version: 1 } });
    }

    settlement.status = 'confirmed';
    await settlement.save();

    const confirmPayload = { batchId };
    if (groupId) {
      emitToGroup(groupId, 'settlement:confirmed', confirmPayload);

      Membership.find({ groupId: new mongoose.Types.ObjectId(groupId), status: 'active' })
        .select('merchantId')
        .then((members) => {
          notify(groupId, members.map((m) => m.merchantId.toString()), 'settlement:confirmed', `Settlement batch ${batchId} confirmed. All debts marked as settled.`, { refType: 'settlement', refId: settlement.id }).catch(console.error);
        })
        .catch(console.error);
    }

    res.json({ success: true, message: 'Settlement confirmed. All debts marked as settled.', batchId });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settlement/optimize
 * Pre-netting pipeline + greedy & exact settlement via Python engine.
 */
export const optimizeSettlementController = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    const { merchants, debts } = await buildGraphPayload(groupId);
    const result = await callOptimizeSettlement(merchants, debts);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settlement/net-all
 * Repeatedly nets circular debt loops until graph is acyclic.
 */
export const netAllController = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    const { merchants, debts } = await buildGraphPayload(groupId);
    const result = await callNetAllCycles(merchants, debts);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};
