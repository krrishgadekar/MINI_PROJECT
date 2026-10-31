import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { AppError } from '../utils/errors';
import { Membership, IGroup, TaxDomain } from '../models/Group';
import mongoose from 'mongoose';

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupRequest extends AuthRequest {
  groupId?: string;
  group?: {
    id: string;
    name?: string;
    domain?: TaxDomain;
  };
  role?: GroupRole;
}

/**
 * Middleware: requireGroup
 * Reads X-Group-Id header (with fallback to query / body groupId).
 * Verifies the authenticated merchant is a member of that group.
 * Attaches req.groupId, req.group, req.role.
 * Throws 403 AppError FORBIDDEN_GROUP if missing or not a member.
 */
export const requireGroup = async (
  req: GroupRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const groupId =
    (req.headers['x-group-id'] as string) ||
    (req.query.groupId as string) ||
    (req.body && (req.body.groupId as string));

  if (!groupId) {
    return next(new AppError(403, 'FORBIDDEN_GROUP', 'Group access requires X-Group-Id header.'));
  }

  if (!mongoose.isValidObjectId(groupId)) {
    return next(new AppError(403, 'FORBIDDEN_GROUP', 'Invalid group ID format.'));
  }

  const merchantId = req.merchant?._id;
  if (!merchantId) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  try {
    const membership = await Membership.findOne({
      groupId: new mongoose.Types.ObjectId(groupId),
      merchantId,
    }).populate<{ groupId: IGroup }>('groupId', 'name domain');

    if (!membership) {
      return next(
        new AppError(403, 'FORBIDDEN_GROUP', 'You are not a member of this group.'),
      );
    }

    const grp = membership.groupId as unknown as IGroup;
    req.groupId = groupId;
    req.role = membership.role as GroupRole;
    req.group = {
      id: groupId,
      name: grp?.name ?? `Group ${groupId}`,
      domain: grp?.domain ?? 'none',
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware: requireRole
 * Verifies that the user has at least the required role within the active group.
 * Must be used AFTER requireGroup so req.role is populated.
 */
export const requireRole = (requiredRole: GroupRole) => {
  return (req: GroupRequest, _res: Response, next: NextFunction): void => {
    const role = req.role ?? 'member';

    if (requiredRole === 'owner' && role !== 'owner') {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Action requires owner role.'));
    }

    if (requiredRole === 'admin' && role !== 'admin' && role !== 'owner') {
      return next(new AppError(403, 'FORBIDDEN_GROUP', 'Action requires admin or owner role.'));
    }

    next();
  };
};
