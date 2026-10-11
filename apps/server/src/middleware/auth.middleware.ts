import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Merchant, IMerchant } from '../models/Merchant';

export interface AuthRequest extends Request {
  merchant?: IMerchant;
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided. Authorization denied.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as { id: string };
    const merchant = await Merchant.findById(decoded.id).select('-passwordHash');

    if (!merchant) {
      res.status(401).json({ message: 'Token valid but merchant not found.' });
      return;
    }

    req.merchant = merchant;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};
