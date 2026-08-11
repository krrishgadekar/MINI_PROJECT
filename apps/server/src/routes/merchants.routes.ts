import { Router } from 'express';
import { getAllMerchants, getMerchantById } from '../controllers/merchants.controller';
import { protect } from '../middleware/auth.middleware';

export const merchantsRouter = Router();

merchantsRouter.use(protect); // all merchant routes require auth

merchantsRouter.get('/', getAllMerchants);
merchantsRouter.get('/:id', getMerchantById);
