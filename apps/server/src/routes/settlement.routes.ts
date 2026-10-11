import { Router } from 'express';
import {
  computeSettlement,
  detectCycles,
  netCycleController,
  confirmSettlement,
} from '../controllers/settlement.controller';
import { protect } from '../middleware/auth.middleware';

export const settlementRouter = Router();

settlementRouter.use(protect);

settlementRouter.post('/', computeSettlement);
settlementRouter.post('/cycles', detectCycles);
settlementRouter.post('/net-cycle', netCycleController);
settlementRouter.post('/confirm/:batchId', confirmSettlement);

