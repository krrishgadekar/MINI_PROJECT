import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';
import { Debt } from '../src/models/Debt';
import { Membership } from '../src/models/Group';
import axios from 'axios';
import { createMemoryServer } from './setup';

jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  }),
  emitToGroup: jest.fn(),
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const app = createApp();
let mongoServer: MongoMemoryServer;
let accessToken: string;
let debtorId: string;
let creditorId: string;
let groupId: string;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
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

  const res = await request(app).post('/api/auth/register').send({
    name: 'Admin',
    email: 'admin2@test.com',
    password: 'password123',
  });
  accessToken = res.body.accessToken;

  const groupRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Settlement Group', type: 'market' });
  groupId = groupRes.body.group._id;

  await Membership.create([
    { groupId: new mongoose.Types.ObjectId(groupId), merchantId: debtor._id, role: 'member' },
    { groupId: new mongoose.Types.ObjectId(groupId), merchantId: creditor._id, role: 'member' },
  ]);

  await Debt.create({
    debtorId,
    creditorId,
    groupId: new mongoose.Types.ObjectId(groupId),
    amount: 10000,
    originalAmount: 10000,
  });
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
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.batchId).toBeDefined();
    expect(res.body.settlement.transactions[0].amount).toBe(10000);
  });

  it('detects cycles by calling Python engine', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        has_cycle: true,
        cycles: [['Debtor_A', 'Creditor_B', 'Debtor_A']],
      },
    });

    const res = await request(app)
      .post('/api/settlement/cycles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.has_cycle).toBe(true);
    expect(res.body.cycles).toHaveLength(1);
  });

  it('nets a cycle by calling Python engine and updates MongoDB', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        cycle: ['Debtor_A', 'Creditor_B'],
        net_flows: { 'Debtor_A->Creditor_B': 5000 },
        amount_netted: 5000,
      },
    });

    const res = await request(app)
      .post('/api/settlement/net-cycle')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId)
      .send({ cycle: ['Debtor_A', 'Creditor_B'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.amount_netted).toBe(5000);

    // Verify debt updated
    const updatedDebt = await Debt.findOne({ debtorId, creditorId });
    expect(updatedDebt?.amount).toBe(5000);
  });
});

