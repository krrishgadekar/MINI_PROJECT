import { Router } from 'express';
import { getAllDebts, createDebt, updateDebt, settleDebt } from '../controllers/debts.controller';
import { protect } from '../middleware/auth.middleware';

export const debtsRouter = Router();

debtsRouter.use(protect);

debtsRouter.get('/', getAllDebts);
debtsRouter.post('/', createDebt);
debtsRouter.patch('/:id', updateDebt);
debtsRouter.delete('/:id', settleDebt);
