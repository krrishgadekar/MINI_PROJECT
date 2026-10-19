import { Router } from 'express';
import {
  getAllDebts,
  getDebtById,
  createDebt,
  updateDebt,
  settleDebt,
  confirmDebt,
  rejectDebt,
  disputeDebt,
  recordPayment,
} from '../controllers/debts.controller';
import { protect } from '../middleware/auth.middleware';
import { requireGroup } from '../middleware/group.middleware';

export const debtsRouter = Router();

// All debt routes require JWT auth + group membership verification
debtsRouter.use(protect);
debtsRouter.use(requireGroup);

debtsRouter.get('/', getAllDebts);
debtsRouter.post('/', createDebt);
debtsRouter.get('/:id', getDebtById);
debtsRouter.patch('/:id', updateDebt);
debtsRouter.delete('/:id', settleDebt);
debtsRouter.post('/:id/confirm', confirmDebt);
debtsRouter.post('/:id/reject', rejectDebt);
debtsRouter.post('/:id/dispute', disputeDebt);
debtsRouter.post('/:id/payments', recordPayment);
