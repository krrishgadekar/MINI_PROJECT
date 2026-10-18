import { Router } from 'express';
import {
  scoreMerchant,
  getLatestRisk,
  scorePortfolio,
  portfolioSummary,
  getGroupRisk,
  getMerchantRisk,
  recomputeGroupRisk,
  simulateContagion,
} from '../controllers/risk.controller';
import { protect } from '../middleware/auth.middleware';

export const riskRouter = Router();

riskRouter.use(protect);

// v2 Endpoints
riskRouter.get('/group', getGroupRisk);
riskRouter.get('/merchant/:id', getMerchantRisk);
riskRouter.post('/recompute', recomputeGroupRisk);
riskRouter.post('/contagion', simulateContagion);

// Legacy Endpoints
riskRouter.post('/score/:merchantId', scoreMerchant);
riskRouter.get('/score/:merchantId', getLatestRisk);
riskRouter.post('/portfolio', scorePortfolio);
riskRouter.get('/portfolio/summary', portfolioSummary);

export default riskRouter;
