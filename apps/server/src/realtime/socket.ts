import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Membership } from '../models/Group';
import { getClientOrigins } from '../config/cors';
import { getOrCreateThrottler, removeThrottler } from './throttler';

let io: SocketIOServer;

export const initSocket = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: getClientOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  } as any);

  // Authentication middleware
  io.use((socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/, '') ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication error: Missing token'));
      }

      const secret = process.env.JWT_ACCESS_SECRET || 'test_jwt_access_secret';
      const decoded = jwt.verify(token as string, secret) as { id: string; [key: string]: any };

      socket.data.userId = decoded.id;
      next();
    } catch {
      next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const merchantId = socket.data.userId;
    console.log(`🔌 Authenticated socket connected: ${socket.id} (Merchant: ${merchantId})`);

    // Auto-join merchant-specific room
    socket.join(`merchant:${merchantId}`);

    // Auto-join group room if specified in handshake
    const groupId = socket.handshake.auth?.groupId || socket.handshake.query?.groupId;
    if (groupId) {
      socket.join(`group:${groupId}`);
      socket.data.groupId = groupId;
      console.log(`   ↳ Socket ${socket.id} auto-joined group:${groupId}`);
    }

    // Auto-join all groups merchant is an active member of
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      Membership.find({ merchantId, status: 'active' })
        .select('groupId')
        .then((memberships) => {
          memberships.forEach((m) => socket.join(`group:${m.groupId.toString()}`));
        })
        .catch(() => {});
    }

    // Allow dynamic group room switching
    socket.on('group:join', (data: { groupId?: string }) => {
      if (data?.groupId) {
        socket.join(`group:${data.groupId}`);
      }
    });

    socket.on('group:leave', (data: { groupId?: string }) => {
      if (data?.groupId) {
        socket.leave(`group:${data.groupId}`);
      }
    });

    // Initialize AIMD throttler for this socket
    const throttler = getOrCreateThrottler(socket);

    // Handle AIMD batch acknowledgements
    socket.on('presence:ack', (data: { batchId?: number }) => {
      if (data && typeof data.batchId === 'number') {
        throttler.handleAck(data.batchId);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      removeThrottler(socket.id);
    });
  });

  return io;
};

/**
 * Returns the initialized Socket.io server instance.
 */
export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.io has not been initialized. Call initSocket() first.');
  }
  return io;
};

/**
 * Emit an event to all sockets in a group room using the AIMD throttler.
 */
export const emitToGroup = (groupId: string, event: string, payload: any): void => {
  if (!io) return;
  const roomName = `group:${groupId}`;
  const room = io.sockets.adapter.rooms.get(roomName);

  if (room && room.size > 0) {
    for (const socketId of room) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const throttler = getOrCreateThrottler(socket);
        throttler.enqueue(event, payload);
      }
    }
  } else {
    // Fallback broadcast to room for standard socket consumers
    io.to(roomName).emit(event, payload);
  }
};

/**
 * Emit a targeted event directly to a specific merchant's private room.
 */
export const emitToMerchant = (merchantId: string, event: string, payload: any): void => {
  if (!io) return;
  const roomName = `merchant:${merchantId}`;
  io.to(roomName).emit(event, payload);
};
