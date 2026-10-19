import { Router } from 'express';
import { getAllDebts, createDebt, updateDebt, settleDebt } from '../controllers/debts.controller';
import { protect } from '../middleware/auth.middleware';
import { requireGroup } from '../middleware/group.middleware';

export const debtsRouter = Router();

// All debt routes require JWT auth + group membership verification
debtsRouter.use(protect);
debtsRouter.use(requireGroup);

debtsRouter.get('/', getAllDebts);
debtsRouter.post('/', createDebt);
debtsRouter.patch('/:id', updateDebt);
debtsRouter.delete('/:id', settleDebt);
