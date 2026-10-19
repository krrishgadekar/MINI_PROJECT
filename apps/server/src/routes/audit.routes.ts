import { Router } from 'express';
import { getAuditLogs } from '../controllers/audit.controller';
import { protect } from '../middleware/auth.middleware';
import { requireGroup } from '../middleware/group.middleware';

export const auditRouter = Router();

auditRouter.use(protect);
auditRouter.use(requireGroup);

auditRouter.get('/', getAuditLogs);
