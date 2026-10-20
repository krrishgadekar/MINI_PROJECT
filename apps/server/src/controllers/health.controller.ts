import { Request, Response } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { ENGINE_URL } from '../services/bridge/http';

export const mongoStateChecker = {
  getReadyState: () => mongoose.connection.readyState,
  getHost: () => mongoose.connection.host,
  getName: () => mongoose.connection.name,
};

export const getDeepHealth = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  // 1. Check MongoDB state
  const readyState = mongoStateChecker.getReadyState();
  const readyStateMap: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  const mongoStatus = readyStateMap[readyState] || 'unknown';
  const mongoConnected = readyState === 1;

  // 2. Check Python engine reachability
  let pythonReachable = false;
  let pythonLatencyMs: number | null = null;
  let pythonError: string | null = null;

  try {
    const pyStart = Date.now();
    await axios.get(`${ENGINE_URL}/health`, { timeout: 3000 });
    pythonLatencyMs = Date.now() - pyStart;
    pythonReachable = true;
  } catch (err: any) {
    pythonError = err.message || 'Python engine unreachable';
  }

  // 3. Compute overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (!mongoConnected) {
    overallStatus = 'unhealthy';
  } else if (!pythonReachable) {
    overallStatus = 'degraded';
  }

  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

  res.status(httpStatus).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    checkDurationMs: Date.now() - startTime,
    services: {
      mongo: {
        status: mongoStatus,
        readyState,
        connected: mongoConnected,
        host: mongoose.connection.host || undefined,
        database: mongoose.connection.name || undefined,
      },
      pythonEngine: {
        status: pythonReachable ? 'reachable' : 'unreachable',
        reachable: pythonReachable,
        url: ENGINE_URL,
        latencyMs: pythonLatencyMs,
        error: pythonError || undefined,
      },
    },
  });
};
