import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { connectDB } from './config/db';
import { initSocket } from './realtime/socket';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

const start = async (): Promise<void> => {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Create Express app
  const app = createApp();

  // 3. Wrap in HTTP server (needed for Socket.io to attach)
  const httpServer = http.createServer(app);

  // 4. Attach Socket.io
  initSocket(httpServer);

  // 5. Start listening
  httpServer.listen(PORT, () => {
    console.log(`🚀 CreditFlow backend running at http://localhost:${PORT}`);
    console.log(`🐍 Python engine expected at ${process.env.PYTHON_ENGINE_URL}`);
  });
};

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
