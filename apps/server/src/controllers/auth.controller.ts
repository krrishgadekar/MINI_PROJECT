import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Merchant } from '../models/Merchant';
import { AuthRequest } from '../middleware/auth.middleware';

// ── Validation schemas ──────────────────────────────────────────────────────
const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── Token helpers ───────────────────────────────────────────────────────────
const signAccessToken = (id: string): string =>
  jwt.sign({ id }, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  } as jwt.SignOptions);

const signRefreshToken = (id: string): string =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  } as jwt.SignOptions);

// ── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { name, email, password }
 */
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() });
      return;
    }

    const { name, email, password } = parsed.data;

    const existing = await Merchant.findOne({ email });
    if (existing) {
      res.status(409).json({ message: 'A merchant with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const merchant = await Merchant.create({ name, email, passwordHash });

    const accessToken = signAccessToken(merchant.id as string);
    const refreshToken = signRefreshToken(merchant.id as string);

    res.status(201).json({
      success: true,
      accessToken,
      refreshToken,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        riskProfile: merchant.riskProfile,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() });
      return;
    }

    const { email, password } = parsed.data;

    const merchant = await Merchant.findOne({ email });
    if (!merchant) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, merchant.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const accessToken = signAccessToken(merchant.id as string);
    const refreshToken = signRefreshToken(merchant.id as string);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        riskProfile: merchant.riskProfile,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ message: 'Refresh token is required.' });
      return;
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string,
    ) as { id: string };

    const accessToken = signAccessToken(decoded.id);
    res.json({ success: true, accessToken });
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired refresh token.' });
  }
};

/**
 * GET /api/auth/me  — Protected
 */
export const getMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({
      success: true,
      merchant: {
        id: req.merchant?.id,
        name: req.merchant?.name,
        email: req.merchant?.email,
        riskProfile: req.merchant?.riskProfile,
      },
    });
  } catch (error) {
    next(error);
  }
};
