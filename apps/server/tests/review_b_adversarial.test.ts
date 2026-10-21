import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';
import { Debt } from '../src/models/Debt';
import { Group, Membership } from '../src/models/Group';
import { Settlement } from '../src/models/Settlement';
import axios from 'axios';
import { createMemoryServer } from './setup';

jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  }),
  emitToGroup: jest.fn(),
  emitToMerchant: jest.fn(),
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const app = createApp();
let mongoServer: MongoMemoryServer;

let adminToken: string;
let memberToken: string;
let otherAdminToken: string;

let adminMerchantId: string;
let memberMerchantId: string;
let merchantCId: string;
let otherAdminMerchantId: string;

let groupAId: string;
let groupBId: string;
let emptyGroupId: string;
let singleMerchantGroupId: string;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  // 1. Register Admin in Group A
  const adminRes = await request(app).post('/api/auth/register').send({
    name: 'Admin_Alice',
    email: 'admin.alice@review-b.test',
    password: 'password123',
  });
  adminToken = adminRes.body.accessToken;
  adminMerchantId = adminRes.body.merchant.id;

  // 2. Register Member in Group A
  const memberRes = await request(app).post('/api/auth/register').send({
    name: 'Member_Bob',
    email: 'member.bob@review-b.test',
    password: 'password123',
  });
  memberToken = memberRes.body.accessToken;
  memberMerchantId = memberRes.body.merchant.id;

  // 3. Register Merchant C in Group A
  const merchantC = await Merchant.create({
    name: 'Merchant_Charlie',
    email: 'charlie@review-b.test',
    passwordHash: 'hash',
  });
  merchantCId = (merchantC._id as mongoose.Types.ObjectId).toString();

  // 4. Register Admin of Group B
  const otherRes = await request(app).post('/api/auth/register').send({
    name: 'Admin_Dave',
    email: 'admin.dave@review-b.test',
    password: 'password123',
  });
  otherAdminToken = otherRes.body.accessToken;
  otherAdminMerchantId = otherRes.body.merchant.id;

  // 5. Create Group A (Admin_Alice = owner)
  const groupARes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Group A', type: 'market' });
  groupAId = groupARes.body.group._id;

  // Add Member_Bob and Merchant_Charlie to Group A
  await Membership.create([
    { groupId: new mongoose.Types.ObjectId(groupAId), merchantId: new mongoose.Types.ObjectId(memberMerchantId), role: 'member' },
    { groupId: new mongoose.Types.ObjectId(groupAId), merchantId: new mongoose.Types.ObjectId(merchantCId), role: 'member' },
  ]);

  // 6. Create Group B (Admin_Dave = owner)
  const groupBRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${otherAdminToken}`)
    .send({ name: 'Group B', type: 'supply_chain' });
  groupBId = groupBRes.body.group._id;

  // 7. Create Empty Group (Admin_Alice = owner, no debts)
  const emptyRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Empty Group', type: 'friends' });
  emptyGroupId = emptyRes.body.group._id;
  // Remove owner membership to make it truly empty
  await Membership.deleteMany({ groupId: new mongoose.Types.ObjectId(emptyGroupId) });

  // 8. Create Single Merchant Group
  const singleRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Single Merchant Group', type: 'friends' });
  singleMerchantGroupId = singleRes.body.group._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Phase 5A Slice B Adversarial Review Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Self-loop attempt ──────────────────────────────────────────────────
  it('rejects self-loop debt creation when debtor equals creditor', async () => {
    const res = await request(app)
      .post('/api/debts')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId)
      .send({
        debtorId: adminMerchantId,
        creditorId: adminMerchantId,
        amount: 500,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.message).toMatch(/cannot owe themselves|self-loop/i);
  });

  it('rejects self-loop in settlement cycle netting with duplicate nodes', async () => {
    const res = await request(app)
      .post('/api/settlement/net-cycle')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId)
      .send({
        cycle: ['Admin_Alice', 'Admin_Alice'],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.message).toMatch(/distinct merchants|self-loops/i);
  });

  // ── 2. Admin of another group (cross-group isolation) ──────────────────────
  it('forbids admin of Group B from accessing Group A graph', async () => {
    const res = await request(app)
      .get('/api/graph')
      .set('Authorization', `Bearer ${otherAdminToken}`)
      .set('X-Group-Id', groupAId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_GROUP');
    expect(res.body.message).toMatch(/not a member of this group/i);
  });

  it('forbids admin of Group B from computing settlement for Group A', async () => {
    const res = await request(app)
      .post('/api/settlement')
      .set('Authorization', `Bearer ${otherAdminToken}`)
      .set('X-Group-Id', groupAId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_GROUP');
  });

  // ── 3. Member requesting mode=full (forced to ego) ─────────────────────────
  it('forces member requesting mode=full to ego mode with filtered edges', async () => {
    // Clean debts in Group A
    await Debt.deleteMany({ groupId: new mongoose.Types.ObjectId(groupAId) });

    // Create 2 debts:
    // Debt 1: Member_Bob owes Admin_Alice 100 (involves member)
    // Debt 2: Admin_Alice owes Merchant_Charlie 200 (does NOT involve Member_Bob)
    await Debt.create([
      {
        debtorId: new mongoose.Types.ObjectId(memberMerchantId),
        creditorId: new mongoose.Types.ObjectId(adminMerchantId),
        groupId: new mongoose.Types.ObjectId(groupAId),
        amount: 100,
        originalAmount: 100,
        status: 'active',
      },
      {
        debtorId: new mongoose.Types.ObjectId(adminMerchantId),
        creditorId: new mongoose.Types.ObjectId(merchantCId),
        groupId: new mongoose.Types.ObjectId(groupAId),
        amount: 200,
        originalAmount: 200,
        status: 'active',
      },
    ]);

    // Member Bob requests mode=full
    const memberRes = await request(app)
      .get('/api/graph?mode=full')
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Group-Id', groupAId);

    expect(memberRes.status).toBe(200);
    expect(memberRes.body.success).toBe(true);
    // MUST be forced to ego!
    expect(memberRes.body.mode).toBe('ego');
    // Bob should only see Debt 1, NOT Debt 2
    expect(memberRes.body.edges).toHaveLength(1);
    expect(memberRes.body.edges[0].debtor).toBe('Member_Bob');
    expect(memberRes.body.edges[0].creditor).toBe('Admin_Alice');

    // Admin Alice requests mode=full
    const adminRes = await request(app)
      .get('/api/graph?mode=full')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.mode).toBe('full');
    expect(adminRes.body.edges).toHaveLength(2);
  });

  // ── 4. Disputed/pending debts excluded from graphs ────────────────────────
  it('excludes pending, disputed, and settled debts from GET /api/graph', async () => {
    await Debt.deleteMany({ groupId: new mongoose.Types.ObjectId(groupAId) });

    await Debt.create([
      {
        debtorId: new mongoose.Types.ObjectId(memberMerchantId),
        creditorId: new mongoose.Types.ObjectId(adminMerchantId),
        groupId: new mongoose.Types.ObjectId(groupAId),
        amount: 150,
        originalAmount: 150,
        status: 'active',
      },
      {
        debtorId: new mongoose.Types.ObjectId(memberMerchantId),
        creditorId: new mongoose.Types.ObjectId(merchantCId),
        groupId: new mongoose.Types.ObjectId(groupAId),
        amount: 300,
        originalAmount: 300,
        status: 'pending',
      },
      {
        debtorId: new mongoose.Types.ObjectId(adminMerchantId),
        creditorId: new mongoose.Types.ObjectId(merchantCId),
        groupId: new mongoose.Types.ObjectId(groupAId),
        amount: 450,
        originalAmount: 450,
        status: 'disputed',
      },
      {
        debtorId: new mongoose.Types.ObjectId(adminMerchantId),
        creditorId: new mongoose.Types.ObjectId(memberMerchantId),
        groupId: new mongoose.Types.ObjectId(groupAId),
        amount: 600,
        originalAmount: 600,
        status: 'settled',
      },
    ]);

    const res = await request(app)
      .get('/api/graph?mode=full')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId);

    expect(res.status).toBe(200);
    // Only the 1 active debt must be returned
    expect(res.body.edges).toHaveLength(1);
    expect(res.body.edges[0].amount).toBe(150);
  });

  // ── 5. Duplicate debts for one pair ───────────────────────────────────────
  it('accumulates duplicate debts for one pair in graph and settles both', async () => {
    await Debt.deleteMany({ groupId: new mongoose.Types.ObjectId(groupAId) });

    // Two active debts between Member_Bob and Admin_Alice
    const [d1, d2] = await Debt.create([
      {
        debtorId: new mongoose.Types.ObjectId(memberMerchantId),
        creditorId: new mongoose.Types.ObjectId(adminMerchantId),
        groupId: new mongoose.Types.ObjectId(groupAId),
        amount: 400,
        originalAmount: 400,
        status: 'active',
      },
      {
        debtorId: new mongoose.Types.ObjectId(memberMerchantId),
        creditorId: new mongoose.Types.ObjectId(adminMerchantId),
        groupId: new mongoose.Types.ObjectId(groupAId),
        amount: 600,
        originalAmount: 600,
        status: 'active',
      },
    ]);

    const graphRes = await request(app)
      .get('/api/graph?mode=full')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId);

    expect(graphRes.status).toBe(200);
    expect(graphRes.body.edges).toHaveLength(2);
    // Adjacency matrix should aggregate them: 400 + 600 = 1000
    expect(graphRes.body.adjacency_matrix['Member_Bob']['Admin_Alice']).toBe(1000);

    // Compute settlement
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        net_balances: { Admin_Alice: 1000, Member_Bob: -1000 },
        transactions: [{ payer: 'Member_Bob', payee: 'Admin_Alice', amount: 1000 }],
        transaction_count: 1,
        total_amount_settled: 1000,
        algorithm: 'Greedy Min-Transactions',
      },
    });

    const computeRes = await request(app)
      .post('/api/settlement')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId);

    expect(computeRes.status).toBe(201);
    const batchId = computeRes.body.batchId;

    // Confirm settlement
    const confirmRes = await request(app)
      .post(`/api/settlement/confirm/${batchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId);

    expect(confirmRes.status).toBe(200);

    // Verify BOTH duplicate debts are marked settled
    const updatedD1 = await Debt.findById(d1._id);
    const updatedD2 = await Debt.findById(d2._id);
    expect(updatedD1?.status).toBe('settled');
    expect(updatedD1?.amount).toBe(0);
    expect(updatedD2?.status).toBe('settled');
    expect(updatedD2?.amount).toBe(0);
  });

  // ── 6. Debt changed mid-confirm (optimistic locking) ───────────────────────
  it('detects debt changed mid-confirm and fails settlement with 409 STALE_SETTLEMENT', async () => {
    await Debt.deleteMany({ groupId: new mongoose.Types.ObjectId(groupAId) });

    const debt = await Debt.create({
      debtorId: new mongoose.Types.ObjectId(memberMerchantId),
      creditorId: new mongoose.Types.ObjectId(adminMerchantId),
      groupId: new mongoose.Types.ObjectId(groupAId),
      amount: 1000,
      originalAmount: 1000,
      status: 'active',
      version: 0,
    });

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        net_balances: { Admin_Alice: 1000, Member_Bob: -1000 },
        transactions: [{ payer: 'Member_Bob', payee: 'Admin_Alice', amount: 1000 }],
        transaction_count: 1,
        total_amount_settled: 1000,
        algorithm: 'Greedy Min-Transactions',
      },
    });

    const computeRes = await request(app)
      .post('/api/settlement')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId);

    const batchId = computeRes.body.batchId;

    // Simulate debt modified mid-confirm (version bumped to 1 by another operation)
    await Debt.updateOne({ _id: debt._id }, { $inc: { version: 1 }, $set: { amount: 900 } });

    // Now try to confirm the batch
    const confirmRes = await request(app)
      .post(`/api/settlement/confirm/${batchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId);

    expect(confirmRes.status).toBe(409);
    expect(confirmRes.body.success).toBe(false);
    expect(confirmRes.body.code).toBe('STALE_SETTLEMENT');

    // Verify batch is marked failed
    const failedBatch = await Settlement.findOne({ batchId });
    expect(failedBatch?.status).toBe('failed');
  });

  // ── 7. Floating point amounts (0.1 + 0.2) in netting ────────────────────────
  it('handles floating point debt netting cleanly without precision artifacts', async () => {
    await Debt.deleteMany({ groupId: new mongoose.Types.ObjectId(groupAId) });

    const debt = await Debt.create({
      debtorId: new mongoose.Types.ObjectId(memberMerchantId),
      creditorId: new mongoose.Types.ObjectId(adminMerchantId),
      groupId: new mongoose.Types.ObjectId(groupAId),
      amount: 0.3,
      originalAmount: 0.3,
      status: 'active',
    });

    // Mock python cycle netting returning amount_netted = 0.3 (from 0.1 + 0.2)
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        cycle: ['Member_Bob', 'Admin_Alice'],
        net_flows: {},
        amount_netted: 0.3,
      },
    });

    const netRes = await request(app)
      .post('/api/settlement/net-cycle')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', groupAId)
      .send({ cycle: ['Member_Bob', 'Admin_Alice'] });

    expect(netRes.status).toBe(200);
    expect(netRes.body.amount_netted).toBe(0.3);

    const updated = await Debt.findById(debt._id);
    expect(updated?.amount).toBe(0);
    expect(updated?.status).toBe('netted');
  });

  // ── 8. Empty group handling ───────────────────────────────────────────────
  it('handles empty group gracefully in graph and settlement', async () => {
    // Empty group has no merchants or debts
    const graphRes = await request(app)
      .get('/api/graph')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', emptyGroupId);

    // Admin Alice is not in empty group -> 403
    expect(graphRes.status).toBe(403);
    expect(graphRes.body.code).toBe('FORBIDDEN_GROUP');

    // Add Admin Alice as member of empty group to test empty data responses
    await Membership.create({
      groupId: new mongoose.Types.ObjectId(emptyGroupId),
      merchantId: new mongoose.Types.ObjectId(adminMerchantId),
      role: 'owner',
    });

    const graphRes2 = await request(app)
      .get('/api/graph')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', emptyGroupId);

    expect(graphRes2.status).toBe(200);
    expect(graphRes2.body.edges).toEqual([]);

    const settleRes = await request(app)
      .post('/api/settlement')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', emptyGroupId);

    expect(settleRes.status).toBe(400);
    expect(settleRes.body.message).toMatch(/no active debts/i);
  });

  // ── 9. Single merchant group ──────────────────────────────────────────────
  it('handles single merchant group without debts correctly', async () => {
    const graphRes = await request(app)
      .get('/api/graph')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', singleMerchantGroupId);

    expect(graphRes.status).toBe(200);
    expect(graphRes.body.merchants).toEqual(['Admin_Alice']);
    expect(graphRes.body.edges).toEqual([]);

    const settleRes = await request(app)
      .post('/api/settlement')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Group-Id', singleMerchantGroupId);

    expect(settleRes.status).toBe(400);
    expect(settleRes.body.message).toMatch(/no active debts/i);
  });
});
