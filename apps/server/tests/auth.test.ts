import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { createMemoryServer } from './setup';

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

describe('Auth — Refresh Token Rotation & Reuse Detection (BE-32)', () => {
  let userToken: string;
  let refresh1: string;

  beforeAll(async () => {
    const regRes = await request(app).post('/api/auth/register').send({
      name: 'Rotation Tester',
      email: 'rotation@creditflow.com',
      password: 'password123',
    });
    userToken = regRes.body.accessToken;
    refresh1 = regRes.body.refreshToken;
  });

  it('rotates refresh token on /api/auth/refresh', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refresh1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(refresh1);
  });

  it('detects reuse of old refresh token and revokes entire family', async () => {
    // 1. Login to get fresh family
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'rotation@creditflow.com',
      password: 'password123',
    });
    const r1 = loginRes.body.refreshToken;

    // 2. Legitimate rotation to r2
    const rotate1 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: r1 });
    expect(rotate1.status).toBe(200);
    const r2 = rotate1.body.refreshToken;

    // 3. Legitimate rotation to r3
    const rotate2 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: r2 });
    expect(rotate2.status).toBe(200);
    const r3 = rotate2.body.refreshToken;

    // 4. Attacker attempts to reuse old r1
    const reuseAttempt = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: r1 });

    expect(reuseAttempt.status).toBe(403);
    expect(reuseAttempt.body.code).toBe('TOKEN_REUSE_DETECTED');

    // 5. Because family was revoked, legitimate r3 must now also be rejected
    const legitimateAfterCompromise = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: r3 });

    expect(legitimateAfterCompromise.status).toBe(403);
    expect(legitimateAfterCompromise.body.code).toBe('TOKEN_REUSE_DETECTED');
  });
});

describe('Auth — Password Change (BE-32)', () => {
  let token: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'test@creditflow.com',
      password: 'password123',
    });
    token = res.body.accessToken;
  });

  it('rejects incorrect old password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        oldPassword: 'wrongoldpassword',
        newPassword: 'newsecurepassword123',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('successfully changes password with correct old password', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        oldPassword: 'password123',
        newPassword: 'newsecurepassword123',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify login with new password succeeds
    const loginNew = await request(app).post('/api/auth/login').send({
      email: 'test@creditflow.com',
      password: 'newsecurepassword123',
    });
    expect(loginNew.status).toBe(200);

    // Verify login with old password fails
    const loginOld = await request(app).post('/api/auth/login').send({
      email: 'test@creditflow.com',
      password: 'password123',
    });
    expect(loginOld.status).toBe(401);
  });
});

describe('Auth — Session Management (BE-32)', () => {
  let userA_token: string;
  let userB_token: string;

  beforeAll(async () => {
    // User A
    const resA = await request(app).post('/api/auth/login').send({
      email: 'test@creditflow.com',
      password: 'newsecurepassword123',
    });
    userA_token = resA.body.accessToken;

    // User B
    const resB = await request(app).post('/api/auth/register').send({
      name: 'User B',
      email: 'userb@creditflow.com',
      password: 'password123',
    });
    userB_token = resB.body.accessToken;
  });

  it('lists active sessions with deviceInfo and lastUsed', async () => {
    const res = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${userA_token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThan(0);
    expect(res.body.sessions[0]).toHaveProperty('id');
    expect(res.body.sessions[0]).toHaveProperty('deviceInfo');
    expect(res.body.sessions[0]).toHaveProperty('lastUsed');
  });

  it('revokes a session by ID', async () => {
    const listRes = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${userA_token}`);

    const sessionId = listRes.body.sessions[0].id;

    const delRes = await request(app)
      .delete(`/api/auth/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${userA_token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });

  it('isolates sessions: User B cannot revoke User A session', async () => {
    // Re-login User A
    const loginA = await request(app).post('/api/auth/login').send({
      email: 'test@creditflow.com',
      password: 'newsecurepassword123',
    });
    const listRes = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${loginA.body.accessToken}`);

    const sessionA_Id = listRes.body.sessions[0].id;

    // User B attempts to delete User A's session
    const delRes = await request(app)
      .delete(`/api/auth/sessions/${sessionA_Id}`)
      .set('Authorization', `Bearer ${userB_token}`);

    expect(delRes.status).toBe(404);
  });
});

