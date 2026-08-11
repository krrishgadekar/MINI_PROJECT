import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';

jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
  }),
}));

const app = createApp();
let mongoServer: MongoMemoryServer;
let accessToken: string;
let debtorId: string;
let creditorId: string;
let debtId: string;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Create two merchants to use in tests
  const debtor = await Merchant.create({
    name: 'Debtor',
    email: 'debtor@test.com',
    passwordHash: 'hash',
  });
  const creditor = await Merchant.create({
    name: 'Creditor',
    email: 'creditor@test.com',
    passwordHash: 'hash',
  });

  debtorId = (debtor._id as mongoose.Types.ObjectId).toString();
  creditorId = (creditor._id as mongoose.Types.ObjectId).toString();

  // Create a JWT manually for testing
  const res = await request(app).post('/api/auth/register').send({
    name: 'Admin',
    email: 'admin@test.com',
    password: 'password123',
  });
  accessToken = res.body.accessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Debts API', () => {
  it('creates a new debt', async () => {
    const res = await request(app)
      .post('/api/debts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        debtorId,
        creditorId,
        amount: 5000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.debt.amount).toBe(5000);
    expect(res.body.debt.originalAmount).toBe(5000);
    debtId = res.body.debt._id;
  });

  it('fetches all debts', async () => {
    const res = await request(app)
      .get('/api/debts')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.debts[0].amount).toBe(5000);
  });

  it('updates debt amount', async () => {
    const res = await request(app)
      .patch(`/api/debts/${debtId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 4000 });

    expect(res.status).toBe(200);
    expect(res.body.debt.amount).toBe(4000);
  });

  it('settles a debt via DELETE', async () => {
    const res = await request(app)
      .delete(`/api/debts/${debtId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    
    // Verify it was marked settled and amount zeroed
    const fetch = await request(app)
      .get(`/api/debts?status=settled`)
      .set('Authorization', `Bearer ${accessToken}`);
    
    expect(fetch.body.debts[0].status).toBe('settled');
    expect(fetch.body.debts[0].amount).toBe(0);
  });
});
