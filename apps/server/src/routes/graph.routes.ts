import { Router } from 'express';
import { getGraph, getGraphScc } from '../controllers/graph.controller';
import { protect } from '../middleware/auth.middleware';
import { requireGroup } from '../middleware/group.middleware';

export const graphRouter = Router();

graphRouter.use(protect);
graphRouter.use(requireGroup);

graphRouter.get('/', getGraph);
graphRouter.post('/scc', getGraphScc);
