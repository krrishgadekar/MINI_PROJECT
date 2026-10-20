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
  getRiskTrend,
} from '../controllers/risk.controller';
import { protect } from '../middleware/auth.middleware';
import { requireGroup } from '../middleware/group.middleware';

export const riskRouter = Router();

riskRouter.use(protect);

// v2 Endpoints — group-scoped
riskRouter.get('/group', requireGroup, getGroupRisk);
riskRouter.get('/merchant/:id', requireGroup, getMerchantRisk);
riskRouter.post('/recompute', requireGroup, recomputeGroupRisk);
riskRouter.post('/contagion', requireGroup, simulateContagion);

// Trend endpoint — last 12 monthly risk scores per merchant
riskRouter.get('/trend/:merchantId', getRiskTrend);

// Legacy Endpoints (no group required)
riskRouter.post('/score/:merchantId', scoreMerchant);
riskRouter.get('/score/:merchantId', getLatestRisk);
riskRouter.post('/portfolio', scorePortfolio);
riskRouter.get('/portfolio/summary', portfolioSummary);

export default riskRouter;
