import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';
import { createMemoryServer } from './setup';

const app = createApp();
let mongoServer: MongoMemoryServer;
let accessToken: string;
let merchantId: string;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  // Register an authenticated merchant
  const res = await request(app).post('/api/auth/register').send({
    name: 'Wholesale_A',
    email: 'wholesale.a@demo.com',
    password: 'password123',
  });

  accessToken = res.body.accessToken;
  merchantId = res.body.merchant.id;

  // Create another merchant in DB
  await Merchant.create({
    name: 'Retailer_B',
    email: 'retailer.b@demo.com',
    passwordHash: 'hashedpassword',
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});



describe('Merchants API', () => {
  it('GET /api/merchants - returns all merchants without passwordHash', async () => {
    const res = await request(app)
      .get('/api/merchants')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
    expect(res.body.merchants).toHaveLength(2);
    expect(res.body.merchants[0].passwordHash).toBeUndefined();
    expect(res.body.merchants[1].passwordHash).toBeUndefined();
  });

  it('GET /api/merchants - rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/merchants');
    expect(res.status).toBe(401);
  });

  it('GET /api/merchants/:id - returns single merchant by ID', async () => {
    const res = await request(app)
      .get(`/api/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.merchant.name).toBe('Wholesale_A');
    expect(res.body.merchant.passwordHash).toBeUndefined();
  });

  it('GET /api/merchants/:id - returns 404 for non-existent merchant ID', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/merchants/${nonExistentId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Merchant not found.');
  });
});
