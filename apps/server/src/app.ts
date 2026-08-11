import express, { Application } from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.routes';
import { merchantsRouter } from './routes/merchants.routes';
import { debtsRouter } from './routes/debts.routes';
import { settlementRouter } from './routes/settlement.routes';
import { riskRouter } from './routes/risk.routes';
import { errorHandler } from './middleware/errorHandler';

export const createApp = (): Application => {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:4000'],
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

  // ── API Routes ──────────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/merchants', merchantsRouter);
  app.use('/api/debts', debtsRouter);
  app.use('/api/settlement', settlementRouter);
  app.use('/api/risk', riskRouter);

  // ── Global error handler (must be last) ────────────────────────────────────
  app.use(errorHandler);

  return app;
};
