import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';
import { Debt } from '../src/models/Debt';
import axios from 'axios';

jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
  }),
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const app = createApp();
let mongoServer: MongoMemoryServer;
let accessToken: string;
let debtorId: string;
let creditorId: string;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const debtor = await Merchant.create({
    name: 'Debtor_A',
    email: 'debtor.a@test.com',
    passwordHash: 'hash',
  });
  const creditor = await Merchant.create({
    name: 'Creditor_B',
    email: 'creditor.b@test.com',
    passwordHash: 'hash',
  });

  debtorId = (debtor._id as mongoose.Types.ObjectId).toString();
  creditorId = (creditor._id as mongoose.Types.ObjectId).toString();

  await Debt.create({
    debtorId,
    creditorId,
    amount: 10000,
    originalAmount: 10000,
  });

  const res = await request(app).post('/api/auth/register').send({
    name: 'Admin',
    email: 'admin2@test.com',
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

describe('Settlement API', () => {
  it('computes settlement by calling Python engine', async () => {
    // Mock the Python engine response
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        net_balances: { 'Creditor_B': 10000, 'Debtor_A': -10000 },
        transactions: [{ payer: 'Debtor_A', payee: 'Creditor_B', amount: 10000 }],
        transaction_count: 1,
        total_amount_settled: 10000,
        algorithm: 'Greedy Min-Transactions'
      }
    });

    const res = await request(app)
      .post('/api/settlement')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.batchId).toBeDefined();
    expect(res.body.settlement.transactions[0].amount).toBe(10000);
  });
});
