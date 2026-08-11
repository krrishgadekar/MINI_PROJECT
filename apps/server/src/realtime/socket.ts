import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

let io: SocketIOServer;

export const initSocket = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:4000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    /**
     * Client joins a merchant-specific room for targeted events.
     * Parth's React UI calls: socket.emit('join:merchant', merchantId)
     */
    socket.on('join:merchant', (merchantId: string) => {
      socket.join(merchantId);
      console.log(`   ↳ Socket ${socket.id} joined room: ${merchantId}`);
    });

    socket.on('leave:merchant', (merchantId: string) => {
      socket.leave(merchantId);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Returns the initialized Socket.io server instance.
 * Called from controllers to emit events.
 */
export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.io has not been initialized. Call initSocket() first.');
  }
  return io;
};
