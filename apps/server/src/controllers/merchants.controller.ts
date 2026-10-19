import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { GroupRequest } from '../middleware/group.middleware';
import { Merchant } from '../models/Merchant';
import { Membership } from '../models/Group';

/**
 * GET /api/merchants
 * Group-scoped: when X-Group-Id is present, returns only members of that group.
 * Without X-Group-Id (legacy / backwards compat), returns all merchants.
 */
export const getAllMerchants = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;

    if (groupId) {
      // Find all merchant IDs that are members of this group
      const memberships = await Membership.find({
        groupId: new mongoose.Types.ObjectId(groupId),
      }).select('merchantId role');

      const merchantIds = memberships.map((m) => m.merchantId);

      const merchants = await Merchant.find({ _id: { $in: merchantIds } }).select('-passwordHash');

      // Annotate each merchant with their role in the group
      const merchantsWithRoles = merchants.map((m) => {
        const mem = memberships.find(
          (mb) => mb.merchantId.toString() === (m._id as mongoose.Types.ObjectId).toString(),
        );
        return {
          ...m.toObject(),
          role: mem?.role ?? 'member',
        };
      });

      res.json({ success: true, count: merchantsWithRoles.length, merchants: merchantsWithRoles });
    } else {
      // Legacy behaviour: return all merchants
      const merchants = await Merchant.find().select('-passwordHash');
      res.json({ success: true, count: merchants.length, merchants });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/merchants/:id
 */
export const getMerchantById = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const merchant = await Merchant.findById(req.params.id).select('-passwordHash');
    if (!merchant) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Merchant not found.' });
      return;
    }
    res.json({ success: true, merchant });
  } catch (error) {
    next(error);
  }
};
