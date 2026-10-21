import { Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { GroupRequest } from '../middleware/group.middleware';
import { Group, Membership, IGroup } from '../models/Group';
import { Merchant } from '../models/Merchant';
import { AppError } from '../utils/errors';
import { parsePaginationParams } from '../utils/paginate';
import crypto from 'crypto';

// ── Validation schemas ────────────────────────────────────────────────────────

const CreateGroupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  type: z.enum(['market', 'supply_chain', 'friends', 'other']).default('other'),
});

const JoinGroupSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required'),
});

const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Generate a short, random, uppercase invite code */
const generateInviteCode = (): string =>
  crypto.randomBytes(4).toString('hex').toUpperCase();

// ── Controllers ────────────────────────────────────────────────────────────────

/**
 * POST /api/groups
 * Creates a new group. Creator automatically becomes owner.
 */
export const createGroup = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = CreateGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: 'Validation error',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { name, type } = parsed.data;
    const merchantId = req.merchant!._id as mongoose.Types.ObjectId;

    // Generate unique invite code (retry up to 5 times on collision)
    let inviteCode = generateInviteCode();
    for (let i = 0; i < 4; i++) {
      const existing = await Group.findOne({ inviteCode });
      if (!existing) break;
      inviteCode = generateInviteCode();
    }

    const group = await Group.create({
      name,
      type,
      ownerId: merchantId,
      inviteCode,
    });

    // Creator becomes owner
    await Membership.create({
      groupId: group._id,
      merchantId,
      role: 'owner',
    });

    res.status(201).json({ success: true, group });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/groups
 * Returns all groups where the authenticated user is a member, with their role.
 */
export const listGroups = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const merchantId = req.merchant!._id;

    const memberships = await Membership.find({ merchantId })
      .populate<{ groupId: IGroup }>('groupId', 'name type ownerId inviteCode createdAt');

    const groups = memberships.map((m) => {
      const g = m.groupId as unknown as IGroup;
      return {
        _id: g._id,
        name: g.name,
        type: g.type,
        ownerId: g.ownerId,
        inviteCode: g.inviteCode,
        createdAt: g.createdAt,
        role: m.role,
      };
    });

    res.json({ success: true, groups });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/groups/join or POST /api/groups/:id/join
 * Join a group using an invite code. Role is set to 'member'.
 */
export const joinGroup = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const inviteCode = (req.body?.inviteCode as string | undefined)?.trim();
    const groupIdParam = req.params?.id;

    let group = null;

    if (inviteCode) {
      group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
    } else if (groupIdParam && mongoose.isValidObjectId(groupIdParam)) {
      group = await Group.findById(groupIdParam);
    }

    if (!group) {
      res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'No group found with this invite code or ID.',
      });
      return;
    }

    const merchantId = req.merchant!._id as mongoose.Types.ObjectId;

    // Idempotent — if already a member, return existing membership
    const existing = await Membership.findOne({ groupId: group._id, merchantId });
    if (existing) {
      res.json({ success: true, membership: existing, alreadyMember: true });
      return;
    }

    const membership = await Membership.create({
      groupId: group._id,
      merchantId,
      role: 'member',
    });

    res.json({ success: true, membership });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/groups/:id
 * Get single group details along with membership list.
 */
export const getGroupById = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError(400, 'VALIDATION', 'Invalid group ID format.');
    }

    const group = await Group.findById(id);
    if (!group) {
      throw new AppError(404, 'NOT_FOUND', 'Group not found.');
    }

    const memberships = await Membership.find({
      groupId: new mongoose.Types.ObjectId(id),
    }).populate<{ merchantId: { _id: mongoose.Types.ObjectId; name: string; email: string } }>(
      'merchantId',
      'name email',
    );

    const members = memberships.map((m) => {
      const merchantObj = m.merchantId as any;
      const mId = merchantObj?._id?.toString() || m.merchantId.toString();
      return {
        _id: m._id.toString(),
        groupId: id,
        merchantId: mId,
        role: m.role,
        joinedAt: m.joinedAt?.toISOString() || new Date().toISOString(),
        name: merchantObj?.name,
        email: merchantObj?.email,
        merchant: {
          _id: mId,
          name: merchantObj?.name,
          email: merchantObj?.email,
        },
      };
    });

    res.json({
      success: true,
      group: {
        _id: group._id.toString(),
        name: group.name,
        type: group.type,
        ownerId: group.ownerId.toString(),
        inviteCode: group.inviteCode,
        createdAt: group.createdAt.toISOString(),
        role: req.role,
      },
      members,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/groups/:id/invite
 * Returns the invite code for sharing with invitees.
 */
export const inviteMember = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError(400, 'VALIDATION', 'Invalid group ID format.');
    }

    const group = await Group.findById(id);
    if (!group) {
      throw new AppError(404, 'NOT_FOUND', 'Group not found.');
    }

    res.json({ success: true, inviteCode: group.inviteCode });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/groups/:id/members
 * List all members in the group with their roles and merchant info.
 * Requires group membership (enforced by requireGroup in route).
 */
export const listMembers = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError(400, 'VALIDATION', 'Invalid group ID.');
    }

    const { page, limit, skip, sort } = parsePaginationParams(req.query, { joinedAt: -1 });

    const filter: Record<string, unknown> = {
      groupId: new mongoose.Types.ObjectId(id),
    };

    if (req.query.role) {
      filter.role = req.query.role;
    }

    if (req.query.q) {
      const q = (req.query.q as string).trim();
      const regex = new RegExp(q, 'i');
      const matchingMerchants = await Merchant.find({
        $or: [{ name: regex }, { email: regex }],
      }).select('_id');
      const merchantIds = matchingMerchants.map((m) => m._id);
      filter.merchantId = { $in: merchantIds };
    }

    const total = await Membership.countDocuments(filter);

    const memberships = await Membership.find(filter)
      .populate<{ merchantId: { _id: mongoose.Types.ObjectId; name: string; email: string } }>(
        'merchantId',
        'name email',
      )
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const members = memberships.map((m) => ({
      merchantId: (m.merchantId as any)?._id?.toString() || m.merchantId?.toString(),
      name: (m.merchantId as any)?.name,
      email: (m.merchantId as any)?.email,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    res.json({
      success: true,
      count: members.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      members,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/groups/:id/members/:mid
 * Update a member's role. Admin/owner only.
 */
export const updateMemberRole = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, mid } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(mid)) {
      throw new AppError(400, 'VALIDATION', 'Invalid ID format.');
    }

    const parsed = UpdateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION',
        message: 'Validation error',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { role } = parsed.data;

    // Cannot change the owner's role
    const targetMembership = await Membership.findOne({
      groupId: new mongoose.Types.ObjectId(id),
      merchantId: new mongoose.Types.ObjectId(mid),
    });

    if (!targetMembership) {
      throw new AppError(404, 'NOT_FOUND', 'Member not found in this group.');
    }

    const callerRole = req.role ?? 'member';
    if (callerRole !== 'owner') {
      throw new AppError(403, 'FORBIDDEN_GROUP', 'Only the group owner can update member roles.');
    }

    if (targetMembership.role === 'owner') {
      throw new AppError(400, 'VALIDATION', 'Cannot change the role of the group owner.');
    }

    targetMembership.role = role;
    await targetMembership.save();

    res.json({
      success: true,
      membership: {
        merchantId: mid,
        role: targetMembership.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/groups/:id/members/:mid
 * Remove a member (admin/owner) or leave the group (self).
 * Owner cannot leave.
 */
export const removeMember = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, mid } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(mid)) {
      throw new AppError(400, 'VALIDATION', 'Invalid ID format.');
    }

    const callerMerchantId = (req.merchant!._id as mongoose.Types.ObjectId).toString();
    const isSelf = callerMerchantId === mid;
    const callerRole = req.role ?? 'member';

    // Non-admins can only remove themselves
    if (!isSelf && callerRole === 'member') {
      throw new AppError(403, 'FORBIDDEN_GROUP', 'Only admins/owners can remove other members.');
    }

    const targetMembership = await Membership.findOne({
      groupId: new mongoose.Types.ObjectId(id),
      merchantId: new mongoose.Types.ObjectId(mid),
    });

    if (!targetMembership) {
      throw new AppError(404, 'NOT_FOUND', 'Member not found in this group.');
    }

    // Owner cannot leave or be removed
    if (targetMembership.role === 'owner') {
      throw new AppError(400, 'VALIDATION', isSelf ? 'Group owner cannot leave. Transfer ownership first.' : 'Cannot remove the group owner.');
    }

    // Only owner can remove an admin
    if (!isSelf && targetMembership.role === 'admin' && callerRole !== 'owner') {
      throw new AppError(403, 'FORBIDDEN_GROUP', 'Only the group owner can remove an admin.');
    }

    await targetMembership.deleteOne();

    res.json({ success: true, message: 'Member removed from group.' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/groups/:id/invite-code/rotate
 * Rotate the group invite code. Admin/owner only.
 */
export const rotateInviteCode = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError(400, 'VALIDATION', 'Invalid group ID.');
    }

    const group = await Group.findById(id);
    if (!group) {
      throw new AppError(404, 'NOT_FOUND', 'Group not found.');
    }

    // Generate new unique invite code
    let newCode = generateInviteCode();
    for (let i = 0; i < 4; i++) {
      const existing = await Group.findOne({ inviteCode: newCode });
      if (!existing || existing._id.toString() === id) break;
      newCode = generateInviteCode();
    }

    group.inviteCode = newCode;
    await group.save();

    res.json({ success: true, inviteCode: newCode });
  } catch (error) {
    next(error);
  }
};
