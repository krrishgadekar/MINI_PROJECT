import { Router } from 'express';
import { getAllMerchants, getMerchantById } from '../controllers/merchants.controller';
import { protect } from '../middleware/auth.middleware';

export const merchantsRouter = Router();

merchantsRouter.use(protect); // all merchant routes require auth
// Note: requireGroup is NOT applied here — merchants route supports both group-scoped
// (via optional X-Group-Id) and legacy unscoped access (for backwards compat).
// The controller handles scoping internally based on whether groupId is present.

merchantsRouter.get('/', getAllMerchants);
merchantsRouter.get('/:id', getMerchantById);
