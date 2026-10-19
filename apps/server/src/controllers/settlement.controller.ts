import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { GroupRequest } from '../middleware/group.middleware';
import { Debt } from '../models/Debt';
import { Merchant } from '../models/Merchant';
import { Membership } from '../models/Group';
import { Settlement } from '../models/Settlement';
import { callSettlement, callCycleDetection, callNetCycle, DebtEdge } from '../services/pythonBridge';
import { getIO } from '../realtime/socket';
import mongoose from 'mongoose';

/**
 * Helper: Build the merchant names list and debt edges from MongoDB for Python engine.
 * When groupId is provided, scopes to group members and group debts only.
 */
const buildGraphPayload = async (
  groupId?: string,
): Promise<{ merchants: string[]; debts: DebtEdge[] }> => {
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
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    const { merchants, debts } = await buildGraphPayload(groupId);

    if (debts.length === 0) {
      res.status(400).json({ message: 'No active debts found to settle.' });
      return;
    }

    // Call Python engine
    const result = await callSettlement(merchants, debts);

    // Persist the settlement batch
    const batchId = uuidv4();
    const settlementData: Record<string, unknown> = {
      batchId,
      transactions: result.transactions,
      algorithmUsed: result.algorithm,
      status: 'pending',
      totalAmountSettled: result.total_amount_settled,
      transactionCount: result.transaction_count,
      initiatedBy: req.merchant!.id,
    };
    if (groupId) settlementData.groupId = new mongoose.Types.ObjectId(groupId);

    const settlement = await Settlement.create(settlementData);

    // Emit real-time event scoped to group
    const io = getIO();
    const eventPayload = {
      batchId,
      transactions: result.transactions,
      transactionCount: result.transaction_count,
    };
    if (groupId) {
      io.to(`group:${groupId}`).emit('settlement:ready', eventPayload);
    } else {
      io.emit('settlement:ready', eventPayload);
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
 * Nets a circular debt cycle and updates affected debt balances in MongoDB
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

          const debt = await Debt.findOne(debtFilter);

          if (debt) {
            const newAmount = Math.max(0, debt.amount - amountNetted);
            debt.amount = newAmount;
            if (newAmount === 0) {
              debt.status = 'netted';
            }
            debt.version += 1;
            await debt.save();

            const populated = await debt.populate([
              { path: 'debtorId', select: 'name email' },
              { path: 'creditorId', select: 'name email' },
            ]);
            if (groupId) {
              getIO().to(`group:${groupId}`).emit('debt:updated', { debt: populated });
            } else {
              getIO().emit('debt:updated', { debt: populated });
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
      getIO().to(`group:${groupId}`).emit('cycle:netted', cyclePayload);
    } else {
      getIO().emit('cycle:netted', cyclePayload);
    }

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
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { batchId } = req.params;
    const groupId = req.groupId;

    const settlementFilter: Record<string, unknown> = { batchId };
    if (groupId) settlementFilter.groupId = new mongoose.Types.ObjectId(groupId);

    const settlement = await Settlement.findOne(settlementFilter);

    if (!settlement) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Settlement batch not found.' });
      return;
    }
    if (settlement.status === 'confirmed') {
      res.status(400).json({ message: 'This settlement has already been confirmed.' });
      return;
    }

    // Mark only group-scoped active debts as settled
    const debtFilter: Record<string, unknown> = { status: 'active' };
    if (groupId) debtFilter.groupId = new mongoose.Types.ObjectId(groupId);
    await Debt.updateMany(debtFilter, { $set: { status: 'settled', amount: 0 }, $inc: { version: 1 } });

    settlement.status = 'confirmed';
    await settlement.save();

    const confirmPayload = { batchId };
    if (groupId) {
      getIO().to(`group:${groupId}`).emit('settlement:confirmed', confirmPayload);
    } else {
      getIO().emit('settlement:confirmed', confirmPayload);
    }

    res.json({ success: true, message: 'Settlement confirmed. All debts marked as settled.', batchId });
  } catch (error) {
    next(error);
  }
};

