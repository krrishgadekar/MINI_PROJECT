import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import axios from 'axios';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { createMemoryServer } from './setup';
import { mongoStateChecker } from '../src/controllers/health.controller';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const app = createApp();
let mongoServer: MongoMemoryServer;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Deep Health Check — GET /health/deep (BE-36)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports healthy when Mongo is connected and Python engine responds 200', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { status: 'healthy' },
    });

    const res = await request(app).get('/health/deep');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services.mongo.connected).toBe(true);
    expect(res.body.services.mongo.readyState).toBe(1);
    expect(res.body.services.pythonEngine.reachable).toBe(true);
    expect(typeof res.body.services.pythonEngine.latencyMs).toBe('number');
  });

  it('reports degraded when Mongo is connected but Python engine is unreachable', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).get('/health/deep');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.mongo.connected).toBe(true);
    expect(res.body.services.pythonEngine.reachable).toBe(false);
    expect(res.body.services.pythonEngine.error).toContain('Connection refused');
  });

  it('reports unhealthy with 503 when Mongo connection is lost', async () => {
    const readyStateSpy = jest.spyOn(mongoStateChecker, 'getReadyState').mockReturnValue(0);

    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { status: 'healthy' },
    });

    const res = await request(app).get('/health/deep');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.services.mongo.connected).toBe(false);

    readyStateSpy.mockRestore();
  });

  it('works identically on /api/health/deep alias', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { status: 'healthy' },
    });

    const res = await request(app).get('/api/health/deep');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services.mongo.connected).toBe(true);
    expect(res.body.services.pythonEngine.reachable).toBe(true);
  });
});
