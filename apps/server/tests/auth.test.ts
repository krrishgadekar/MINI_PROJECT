import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';

const app = createApp();
let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Auth — POST /api/auth/register', () => {
  it('registers a new merchant and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test Merchant',
      email: 'test@creditflow.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.merchant.email).toBe('test@creditflow.com');
    expect(res.body.merchant.passwordHash).toBeUndefined(); // never leak hash
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Duplicate',
      email: 'test@creditflow.com',  // already registered above
      password: 'password123',
    });
    expect(res.status).toBe(409);
  });

  it('rejects invalid email format with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Bad User',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(res.status).toBe(400);
  });
});

describe('Auth — POST /api/auth/login', () => {
  it('logs in with correct credentials and returns tokens', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'test@creditflow.com',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'test@creditflow.com',
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@creditflow.com',
      password: 'password123',
    });
    expect(res.status).toBe(401);
  });
});

describe('Auth — GET /api/auth/me', () => {
  let accessToken: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'test@creditflow.com',
      password: 'password123',
    });
    accessToken = res.body.accessToken as string;
  });

  it('returns merchant info with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.merchant.email).toBe('test@creditflow.com');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });
});
