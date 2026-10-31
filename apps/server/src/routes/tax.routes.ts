import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { requireGroup } from '../middleware/group.middleware';
import {
  getTaxDomains,
  getTaxRules,
  previewTax,
  getTaxSummary,
} from '../controllers/tax.controller';

export const taxRouter = Router();

// All tax routes require authentication and group membership
taxRouter.use(protect);
taxRouter.use(requireGroup);

taxRouter.get('/domains', getTaxDomains);
taxRouter.get('/rules', getTaxRules);
taxRouter.post('/preview', previewTax);
taxRouter.get('/summary', getTaxSummary);

