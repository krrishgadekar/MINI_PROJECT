import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { GroupRequest } from '../middleware/group.middleware';
import { Debt } from '../models/Debt';
import { Merchant } from '../models/Merchant';
import { Membership } from '../models/Group';
import { callSccGroups } from '../services/pythonBridge';

export interface GraphEdgeItem {
  debtId: string;
  debtor: string;
  creditor: string;
  amount: number;
}

/**
 * GET /api/graph
 * Query params: ?mode=full|ego
 *
 * Requirements & Invariants:
 * 1. Admin/owner defaults to 'full', can request 'ego'.
 * 2. Member MUST be forced to 'ego' (even if mode=full was requested).
 * 3. Only active debts (status: 'active') belonging to req.groupId are included.
 *    Disputed, pending, settled, and netted debts are excluded.
 * 4. In ego mode, only debts where caller is debtor or creditor are included.
 * 5. Returns merchants, edges, and adjacency_matrix.
 */
export const getGraph = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    const role = req.role ?? 'member';
    const callerId = req.merchant?._id;

    // Requirement: member requesting mode=full must be forced to ego
    const effectiveMode: 'full' | 'ego' =
      role === 'member'
        ? 'ego'
        : (req.query.mode as string) === 'ego'
          ? 'ego'
          : 'full';

    const groupObjId = new mongoose.Types.ObjectId(groupId);

    // Fetch all group member merchants
    const memberships = await Membership.find({ groupId: groupObjId }).select('merchantId');
    const memberIds = memberships.map((m) => m.merchantId);

    const groupMerchants = await Merchant.find({ _id: { $in: memberIds } }).select('name');
    const merchantNames = groupMerchants.map((m) => m.name);

    // Debt query: only active debts in this group (disputed/pending excluded)
    const debtFilter: Record<string, unknown> = {
      groupId: groupObjId,
      status: 'active',
    };

    if (effectiveMode === 'ego' && callerId) {
      debtFilter.$or = [
        { debtorId: callerId },
        { creditorId: callerId },
      ];
    }

    const activeDebts = await Debt.find(debtFilter)
      .populate<{ debtorId: { name: string } }>('debtorId', 'name')
      .populate<{ creditorId: { name: string } }>('creditorId', 'name');

    const edges: GraphEdgeItem[] = activeDebts
      .filter((d) => d.debtorId && d.creditorId)
      .map((d) => ({
        debtId: d._id.toString(),
        debtor: (d.debtorId as unknown as { name: string })?.name,
        creditor: (d.creditorId as unknown as { name: string })?.name,
        amount: d.amount,
      }));

    // Build adjacency matrix
    const matrix: Record<string, Record<string, number | null>> = {};
    for (const m1 of merchantNames) {
      matrix[m1] = {};
      for (const m2 of merchantNames) {
        matrix[m1][m2] = null;
      }
    }

    for (const edge of edges) {
      if (matrix[edge.debtor] && matrix[edge.debtor][edge.creditor] !== undefined) {
        const existing = matrix[edge.debtor][edge.creditor] || 0;
        matrix[edge.debtor][edge.creditor] = existing + edge.amount;
      }
    }

    res.json({
      success: true,
      mode: effectiveMode,
      merchants: merchantNames,
      edges,
      adjacency_matrix: matrix,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/graph/scc
 * Calls Python engine Tarjan's SCC on active debts of the group.
 */
export const getGraphScc = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    const groupObjId = new mongoose.Types.ObjectId(groupId);

    const memberships = await Membership.find({ groupId: groupObjId }).select('merchantId');
    const memberIds = memberships.map((m) => m.merchantId);

    const [merchantsDocs, activeDebts] = await Promise.all([
      Merchant.find({ _id: { $in: memberIds } }).select('name'),
      Debt.find({ groupId: groupObjId, status: 'active' })
        .populate<{ debtorId: { name: string } }>('debtorId', 'name')
        .populate<{ creditorId: { name: string } }>('creditorId', 'name'),
    ]);

    const merchants = merchantsDocs.map((m) => m.name);
    const debts = activeDebts
      .filter((d) => d.debtorId && d.creditorId)
      .map((d) => ({
        debtor: (d.debtorId as unknown as { name: string })?.name,
        creditor: (d.creditorId as unknown as { name: string })?.name,
        amount: d.amount,
      }));

    const result = await callSccGroups(merchants, debts);
    res.json({
      success: true,
      components: result.components,
      componentCount: result.component_count,
      cyclicComponents: result.cyclic_components,
      cyclicComponentCount: result.cyclic_component_count,
    });
  } catch (error) {
    next(error);
  }
};
