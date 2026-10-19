import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';
import { Membership } from '../src/models/Group';
import { createMemoryServer } from './setup';

jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  }),
  emitToGroup: jest.fn(),
  emitToMerchant: jest.fn(),
}));

const app = createApp();
let mongoServer: MongoMemoryServer;
let accessToken: string;
let debtorId: string;
let creditorId: string;
let debtId: string;
let groupId: string;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  // Register the test user (will be group owner)
  const adminRes = await request(app).post('/api/auth/register').send({
    name: 'Admin',
    email: 'admin@test.com',
    password: 'password123',
  });
  accessToken = adminRes.body.accessToken;
  const adminId = adminRes.body.merchant.id;

  // Create two additional merchants to use as debtor/creditor
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

  // Create a group — admin becomes owner
  const groupRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Test Group', type: 'market' });

  groupId = groupRes.body.group._id;

  // Add debtor and creditor as members of the group
  await Membership.create([
    { groupId: new mongoose.Types.ObjectId(groupId), merchantId: debtor._id, role: 'member' },
    { groupId: new mongoose.Types.ObjectId(groupId), merchantId: creditor._id, role: 'member' },
  ]);
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
      .set('X-Group-Id', groupId)
      .send({
        debtorId,
        creditorId,
        amount: 5000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.debt.amount).toBe(5000);
    expect(res.body.debt.originalAmount).toBe(5000);
    expect(res.body.debt.groupId).toBeDefined();
    expect(res.body.debt.version).toBe(0);
    debtId = res.body.debt._id;
  });

  it('fetches all debts (scope=all for owner)', async () => {
    const res = await request(app)
      .get('/api/debts?scope=all')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.debts[0].amount).toBe(5000);
  });

  it('returns 403 without X-Group-Id', async () => {
    const res = await request(app)
      .get('/api/debts')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_GROUP');
  });

  it('updates debt amount', async () => {
    const res = await request(app)
      .patch(`/api/debts/${debtId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId)
      .send({ amount: 4000 });

    expect(res.status).toBe(200);
    expect(res.body.debt.amount).toBe(4000);
    expect(res.body.debt.version).toBe(1); // version incremented
  });

  it('settles a debt via DELETE', async () => {
    const res = await request(app)
      .delete(`/api/debts/${debtId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(200);

    // Verify it was marked settled and amount zeroed
    const fetch = await request(app)
      .get('/api/debts?scope=all&status=settled')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId);

    expect(fetch.body.debts[0].status).toBe('settled');
    expect(fetch.body.debts[0].amount).toBe(0);
  });
});
