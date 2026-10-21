import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { connectDB } from './config/db';
import { initSocket } from './realtime/socket';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

const start = async (): Promise<void> => {
  // 1. Connect to MongoDB
  await connectDB();

  // 1b. Auto-seed if database is empty and AUTO_SEED is enabled
  if (process.env.AUTO_SEED === 'true') {
    const { Merchant } = await import('./models/Merchant');
    const merchantCount = await Merchant.countDocuments();
    if (merchantCount === 0) {
      console.log('🌱 Database is empty and AUTO_SEED=true: running demo seed...');
      const { seedDatabase } = await import('./services/seedService');
      await seedDatabase({ silent: false, disconnectOnFinish: false });
    }
  }

  // 2. Create Express app
  const app = createApp();

  // 3. Wrap in HTTP server (needed for Socket.io to attach)
  const httpServer = http.createServer(app);

  // 4. Attach Socket.io
  initSocket(httpServer);

  // 5. Start background cron jobs
  const { startDueDateScheduler } = await import('./services/dueDateJob');
  startDueDateScheduler();

  // 6. Start daily notification digest cron (respects CRON_ENABLED env var)
  const { initDigestCron } = await import('./services/digestJob');
  initDigestCron();

  // 7. Start listening
  httpServer.listen(PORT, () => {
    console.log(`🚀 CreditFlow backend running at http://localhost:${PORT}`);
    console.log(`🐍 Python engine expected at ${process.env.PYTHON_ENGINE_URL}`);
  });
};

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
