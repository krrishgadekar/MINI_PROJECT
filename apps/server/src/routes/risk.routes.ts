import { Router } from 'express';
import { scoreMerchant, getLatestRisk, scorePortfolio } from '../controllers/risk.controller';
import { protect } from '../middleware/auth.middleware';

export const riskRouter = Router();

riskRouter.use(protect);

riskRouter.post('/score/:merchantId', scoreMerchant);
riskRouter.get('/score/:merchantId', getLatestRisk);
riskRouter.post('/portfolio', scorePortfolio);
