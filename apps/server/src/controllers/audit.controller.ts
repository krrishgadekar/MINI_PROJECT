import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { GroupRequest } from '../middleware/group.middleware';
import { AuditLog } from '../models/AuditLog';
import { Debt } from '../models/Debt';
import { parsePaginationParams } from '../utils/paginate';
import { AppError } from '../utils/errors';

/**
 * GET /api/audit
 * Tenant-isolated audit log explorer.
 * Query params: ?entityId=&entityType=&page=&limit=&sort=
 * Permissions:
 *   admin / owner: sees all group audit logs
 *   member: sees logs where they are actorId or party to the Debt entity
 */
export const getAuditLogs = async (
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
    const merchantId = req.merchant!._id;
    const { page, limit, skip, sort } = parsePaginationParams(req.query, { createdAt: -1 });

    const filter: Record<string, unknown> = {
      groupId: new mongoose.Types.ObjectId(groupId),
    };

    if (req.query.entityId) {
      if (mongoose.isValidObjectId(req.query.entityId as string)) {
        filter.entityId = new mongoose.Types.ObjectId(req.query.entityId as string);
      } else {
        filter.entityId = req.query.entityId;
      }
    }

    if (req.query.entityType) {
      filter.entityType = req.query.entityType;
    }

    // Role-based visibility check
    if (role === 'member') {
      // Find all debt IDs where caller is debtor or creditor in this group
      const userDebts = await Debt.find({
        groupId: new mongoose.Types.ObjectId(groupId),
        $or: [{ debtorId: merchantId }, { creditorId: merchantId }],
      }).select('_id');

      const userDebtIds = userDebts.map((d) => d._id);

      filter.$or = [
        { actorId: merchantId },
        { entityType: 'Debt', entityId: { $in: userDebtIds } },
      ];
    }

    const total = await AuditLog.countDocuments(filter);
    const audit = await AuditLog.find(filter)
      .populate('actorId', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      count: audit.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      audit,
    });
  } catch (error) {
    next(error);
  }
};
