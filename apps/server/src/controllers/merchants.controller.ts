import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Merchant } from '../models/Merchant';

/**
 * GET /api/merchants
 * Returns all merchants (without passwordHash)
 */
export const getAllMerchants = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const merchants = await Merchant.find().select('-passwordHash');
    res.json({ success: true, count: merchants.length, merchants });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/merchants/:id
 */
export const getMerchantById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const merchant = await Merchant.findById(req.params.id).select('-passwordHash');
    if (!merchant) {
      res.status(404).json({ message: 'Merchant not found.' });
      return;
    }
    res.json({ success: true, merchant });
  } catch (error) {
    next(error);
  }
};
