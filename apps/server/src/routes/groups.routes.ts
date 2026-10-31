import { Router } from 'express';
import {
  createGroup,
  listGroups,
  joinGroup,
  getGroupById,
  listMembers,
  updateMemberRole,
  removeMember,
  rotateInviteCode,
  inviteMember,
  setGroupDomain,
} from '../controllers/groups.controller';
import { protect } from '../middleware/auth.middleware';
import { requireGroup, requireRole } from '../middleware/group.middleware';
import rateLimit from 'express-rate-limit';

const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many join attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const groupsRouter = Router();

// All group routes require authentication
groupsRouter.use(protect);

// Routes that do NOT require existing group membership (no X-Group-Id)
groupsRouter.post('/', createGroup);
groupsRouter.get('/', listGroups);
groupsRouter.post('/join', joinLimiter, joinGroup);
groupsRouter.post('/:id/join', joinLimiter, joinGroup);

// Routes that DO require group membership (X-Group-Id header)
groupsRouter.get(
  '/:id',
  (req, _res, next) => {
    req.headers['x-group-id'] = req.params.id;
    next();
  },
  requireGroup,
  getGroupById,
);

groupsRouter.get(
  '/:id/members',
  (req, _res, next) => {
    // Copy :id param into the X-Group-Id header context for requireGroup
    req.headers['x-group-id'] = req.params.id;
    next();
  },
  requireGroup,
  listMembers,
);

groupsRouter.patch(
  '/:id/members/:mid',
  (req, _res, next) => {
    req.headers['x-group-id'] = req.params.id;
    next();
  },
  requireGroup,
  requireRole('owner'),
  updateMemberRole,
);

groupsRouter.delete(
  '/:id/members/:mid',
  (req, _res, next) => {
    req.headers['x-group-id'] = req.params.id;
    next();
  },
  requireGroup,
  removeMember,
);

groupsRouter.post(
  '/:id/invite-code/rotate',
  (req, _res, next) => {
    req.headers['x-group-id'] = req.params.id;
    next();
  },
  requireGroup,
  requireRole('admin'),
  rotateInviteCode,
);

groupsRouter.post(
  '/:id/invite',
  (req, _res, next) => {
    req.headers['x-group-id'] = req.params.id;
    next();
  },
  requireGroup,
  inviteMember,
);

groupsRouter.patch(
  '/:id/domain',
  (req, _res, next) => {
    req.headers['x-group-id'] = req.params.id;
    next();
  },
  requireGroup,
  requireRole('admin'),
  setGroupDomain,
);
