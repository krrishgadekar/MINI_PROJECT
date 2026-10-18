import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { queryKeys } from '../api/keys';
import { useToast } from '../components/ui/Toast';

/**
 * useSocket — Connects to the backend Socket.io server with JWT authentication.
 *
 * Capabilities:
 *  - Subscribes to 'batch:update' and sends 'presence:ack' to drive AIMD rate adaptation.
 *  - Dispatches targeted React Query cache invalidations across debts, settlement, risk, and notifications.
 *  - Displays realtime toast notifications for urgent events (e.g. risk:flagged, notification:new).
 *  - Seamlessly cleans up on component unmount and auto-reconnects on network recovery.
 */
export const useSocket = (): void => {
  const queryClient = useQueryClient();
  const { info, warning } = useToast();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      'mock_token_parth';

    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

    const socket = io(serverUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('⚡ Realtime Socket connected successfully:', socket.id);
    });

    // Handle AIMD throttled batches from the server
    socket.on('batch:update', (data: { batchId: number; events: Array<{ event: string; payload: any }> }) => {
      // 1. Send immediate ACK for AIMD window growth
      if (typeof data?.batchId === 'number') {
        socket.emit('presence:ack', { batchId: data.batchId });
      }

      // 2. Process events in the batch
      const events = data?.events || [];
      for (const item of events) {
        processEvent(item.event, item.payload);
      }
    });

    // Handle single direct events
    socket.on('notification:new', (payload: any) => {
      processEvent('notification:new', payload);
    });

    socket.on('risk:flagged', (payload: any) => {
      processEvent('risk:flagged', payload);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
    });

    const processEvent = (event: string, payload: any) => {
      if (!event) return;

      if (event.startsWith('debt:')) {
        queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.graph.all });
      } else if (event.startsWith('settlement:') || event === 'cycle:netted') {
        queryClient.invalidateQueries({ queryKey: queryKeys.settlement.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.graph.all });
      } else if (event.startsWith('risk:')) {
        queryClient.invalidateQueries({ queryKey: queryKeys.risk.all });
        if (event === 'risk:flagged') {
          warning(
            `⚠️ Risk Alert: ${payload?.merchantName || 'Merchant'} elevated to ${payload?.riskLabel || 'HIGH'} risk!`,
            6000,
          );
        }
      } else if (event === 'notification:new') {
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        const msg = payload?.notification?.message || payload?.message;
        if (msg) {
          info(`🔔 ${msg}`, 5000);
        }
      }
    };

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient, info, warning]);
};
