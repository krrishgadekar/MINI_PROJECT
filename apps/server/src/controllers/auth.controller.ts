import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Merchant } from '../models/Merchant';
import { Membership, IGroup } from '../models/Group';
import { AuthRequest } from '../middleware/auth.middleware';

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Session } from '../models/Session';

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

const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

// ── Token helpers ───────────────────────────────────────────────────────────
const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const signAccessToken = (id: string): string =>
  jwt.sign({ id }, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  } as jwt.SignOptions);

const signRefreshToken = (id: string, familyId: string): string =>
  jwt.sign({ id, familyId, nonce: uuidv4() }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  } as jwt.SignOptions);

const extractDeviceInfo = (req: Request): string => {
  return (req.headers['user-agent'] as string) || (req.body?.deviceInfo as string) || 'Browser Client';
};

const extractIpAddress = (req: Request): string => {
  return req.ip || (req.socket?.remoteAddress as string) || '';
};

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

    const familyId = uuidv4();
    const accessToken = signAccessToken(merchant.id as string);
    const refreshToken = signRefreshToken(merchant.id as string, familyId);
    const tokenHash = hashToken(refreshToken);

    await Session.create({
      merchantId: merchant._id,
      familyId,
      tokenHash,
      deviceInfo: extractDeviceInfo(req),
      ipAddress: extractIpAddress(req),
      isRevoked: false,
      lastUsed: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

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

    const familyId = uuidv4();
    const accessToken = signAccessToken(merchant.id as string);
    const refreshToken = signRefreshToken(merchant.id as string, familyId);
    const tokenHash = hashToken(refreshToken);

    await Session.create({
      merchantId: merchant._id,
      familyId,
      tokenHash,
      deviceInfo: extractDeviceInfo(req),
      ipAddress: extractIpAddress(req),
      isRevoked: false,
      lastUsed: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

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
 * Rotates refresh token in session family; detects reuse of old token and revokes family.
 */
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ message: 'Refresh token is required.' });
      return;
    }

    let decoded: { id: string; familyId?: string };
    try {
      decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET as string,
      ) as { id: string; familyId?: string };
    } catch {
      res.status(401).json({ message: 'Invalid or expired refresh token.' });
      return;
    }

    const tokenHash = hashToken(refreshToken);
    const session = await Session.findOne({ tokenHash });

    // Reuse detection:
    // If token not found in Session but familyId exists, an old rotated token was presented
    if (!session) {
      if (decoded.familyId) {
        const existingFamily = await Session.findOne({ familyId: decoded.familyId });
        if (existingFamily) {
          // Compromised family: revoke all sessions in this family
          await Session.updateMany({ familyId: decoded.familyId }, { isRevoked: true });
          res.status(403).json({
            success: false,
            code: 'TOKEN_REUSE_DETECTED',
            message: 'Refresh token reuse detected. All sessions in this family have been revoked.',
          });
          return;
        }
      }
      res.status(401).json({ message: 'Invalid or expired refresh token.' });
      return;
    }

    // If token is found but already revoked: reuse detected!
    if (session.isRevoked) {
      await Session.updateMany({ familyId: session.familyId }, { isRevoked: true });
      res.status(403).json({
        success: false,
        code: 'TOKEN_REUSE_DETECTED',
        message: 'Refresh token reuse detected. All sessions in this family have been revoked.',
      });
      return;
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      session.isRevoked = true;
      await session.save();
      res.status(401).json({ message: 'Refresh token has expired.' });
      return;
    }

    // ROTATION:
    // Invalidate the current session token
    session.isRevoked = true;
    session.lastUsed = new Date();
    await session.save();

    // Issue new token pair with same familyId
    const newAccessToken = signAccessToken(decoded.id);
    const newRefreshToken = signRefreshToken(decoded.id, session.familyId);
    const newTokenHash = hashToken(newRefreshToken);

    await Session.create({
      merchantId: session.merchantId,
      familyId: session.familyId,
      tokenHash: newTokenHash,
      deviceInfo: extractDeviceInfo(req) || session.deviceInfo,
      ipAddress: extractIpAddress(req) || session.ipAddress,
      isRevoked: false,
      lastUsed: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/change-password  — Protected
 * Body: { oldPassword, newPassword }
 */
export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, code: 'VALIDATION', message: 'Validation error', errors: parsed.error.flatten() });
      return;
    }

    const { oldPassword, newPassword } = parsed.data;
    const merchant = await Merchant.findById(req.merchant!._id);
    if (!merchant) {
      res.status(404).json({ success: false, message: 'Merchant not found.' });
      return;
    }

    const isMatch = await bcrypt.compare(oldPassword, merchant.passwordHash);
    if (!isMatch) {
      res.status(400).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    merchant.passwordHash = passwordHash;
    await merchant.save();

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/sessions  — Protected
 * Lists all active non-revoked sessions for the current merchant.
 */
export const getSessions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sessions = await Session.find({
      merchantId: req.merchant!._id,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }).sort({ lastUsed: -1 });

    const formatted = sessions.map((s) => ({
      id: s._id.toString(),
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      lastUsed: s.lastUsed,
      createdAt: s.createdAt,
    }));

    res.json({ success: true, count: formatted.length, sessions: formatted });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/auth/sessions/:id  — Protected
 * Revokes a session and its entire token family.
 */
export const revokeSession = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const session = await Session.findOne({
      _id: id,
      merchantId: req.merchant!._id,
    });

    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found.' });
      return;
    }

    await Session.updateMany({ familyId: session.familyId }, { isRevoked: true });

    res.json({ success: true, message: 'Session revoked successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me  — Protected
 */
export const getMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Fetch groups + roles for the authenticated merchant
    const memberships = await Membership.find({ merchantId: req.merchant!._id })
      .populate<{ groupId: IGroup }>('groupId', 'name type ownerId inviteCode createdAt');

    const groups = memberships.map((m) => {
      const g = m.groupId as unknown as IGroup;
      return {
        _id: g?._id,
        name: g?.name,
        type: g?.type,
        ownerId: g?.ownerId,
        role: m.role,
      };
    });

    res.json({
      success: true,
      merchant: {
        id: req.merchant?.id,
        name: req.merchant?.name,
        email: req.merchant?.email,
        phone: req.merchant?.phone,
        businessName: req.merchant?.businessName,
        riskProfile: req.merchant?.riskProfile,
      },
      groups,
    });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/auth/me — Update profile ─────────────────────────────────────

const UpdateMeSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  businessName: z.string().optional(),
});

/**
 * PATCH /api/auth/me  — Protected
 * Body: { name?, phone?, businessName? }
 */
export const updateMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = UpdateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, code: 'VALIDATION', message: 'Validation error', errors: parsed.error.flatten() });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
    if (parsed.data.businessName !== undefined) updates.businessName = parsed.data.businessName;

    const merchant = await Merchant.findByIdAndUpdate(
      req.merchant!._id,
      { $set: updates },
      { new: true, select: '-passwordHash' },
    );

    res.json({ success: true, merchant });
  } catch (error) {
    next(error);
  }
};
