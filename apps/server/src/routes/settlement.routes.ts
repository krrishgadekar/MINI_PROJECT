import { Router } from 'express';
import {
  computeSettlement,
  detectCycles,
  netCycleController,
  confirmSettlement,
  optimizeSettlementController,
  netAllController,
} from '../controllers/settlement.controller';
import { protect } from '../middleware/auth.middleware';
import { requireGroup } from '../middleware/group.middleware';

export const settlementRouter = Router();

settlementRouter.use(protect);
settlementRouter.use(requireGroup);

settlementRouter.post('/', computeSettlement);
settlementRouter.post('/cycles', detectCycles);
settlementRouter.post('/net-cycle', netCycleController);
settlementRouter.post('/confirm/:batchId', confirmSettlement);
settlementRouter.post('/optimize', optimizeSettlementController);
settlementRouter.post('/net-all', netAllController);
