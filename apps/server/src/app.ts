import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth.routes';
import { merchantsRouter } from './routes/merchants.routes';
import { debtsRouter } from './routes/debts.routes';
import { settlementRouter } from './routes/settlement.routes';
import { riskRouter } from './routes/risk.routes';
import notificationRouter from './routes/notification.routes';
import { groupsRouter } from './routes/groups.routes';
import { auditRouter } from './routes/audit.routes';
import { graphRouter } from './routes/graph.routes';
import { errorHandler } from './middleware/errorHandler';
import { getClientOrigins } from './config/cors';
import { getDeepHealth } from './controllers/health.controller';

export const createApp = (): Application => {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────
  app.use(helmet());
  
  // Rate limiting for auth routes to prevent brute force
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
  });
  app.use('/api/auth', authLimiter);

  app.use(cors({
    origin: getClientOrigins(),
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Health check ────────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      service: 'CreditFlow — Node.js/Express Main Backend',
      status: 'running',
      version: '1.0.0',
      port: process.env.PORT ?? 4000,
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'healthy' });
  });

  app.get('/health/deep', getDeepHealth);
  app.get('/api/health/deep', getDeepHealth);

  // ── API Routes ──────────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/merchants', merchantsRouter);
  app.use('/api/debts', debtsRouter);
  app.use('/api/settlement', settlementRouter);
  app.use('/api/risk', riskRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/graph', graphRouter);

  // ── Global error handler (must be last) ────────────────────────────────────
  app.use(errorHandler);

  return app;
};
