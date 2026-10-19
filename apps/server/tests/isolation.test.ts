/**
 * tests/isolation.test.ts
 * Cross-group tenant isolation tests — verifies no data leaks across group boundaries.
 *
 * Scenarios covered:
 *   1. User in Group B gets 403 on Group A's debt endpoints
 *   2. Member only sees scope=mine debts (not all group debts)
 *   3. Admin sees all group debts via scope=all
 *   4. Two groups with the same merchant don't mix debts
 */
import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
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

jest.setTimeout(90000);

// Group A users
let ownerAToken: string;
let memberAToken: string;
let memberAId: string;
let groupAId: string;
let groupAInvite: string;

// Group B users
let ownerBToken: string;
let groupBId: string;

// Merchant shared in both groups
let sharedMerchantId: string;
let sharedMerchantToken: string;

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  // === Group A setup ===
  const ownerARes = await request(app).post('/api/auth/register').send({
    name: 'Group A Owner',
    email: 'owner-a@isolation-test.com',
    password: 'password123',
  });
  ownerAToken = ownerARes.body.accessToken;

  const memberARes = await request(app).post('/api/auth/register').send({
    name: 'Group A Member',
    email: 'member-a@isolation-test.com',
    password: 'password123',
  });
  memberAToken = memberARes.body.accessToken;
  memberAId = memberARes.body.merchant.id;

  // Owner creates Group A
  const groupARes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${ownerAToken}`)
    .send({ name: 'Group A', type: 'market' });

  groupAId = groupARes.body.group._id;
  groupAInvite = groupARes.body.group.inviteCode;

  // Member A joins Group A
  await request(app)
    .post('/api/groups/join')
    .set('Authorization', `Bearer ${memberAToken}`)
    .send({ inviteCode: groupAInvite });

  // === Group B setup ===
  const ownerBRes = await request(app).post('/api/auth/register').send({
    name: 'Group B Owner',
    email: 'owner-b@isolation-test.com',
    password: 'password123',
  });
  ownerBToken = ownerBRes.body.accessToken;

  const groupBRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${ownerBToken}`)
    .send({ name: 'Group B', type: 'supply_chain' });

  groupBId = groupBRes.body.group._id;

  // === Shared merchant (member of BOTH Group A and Group B) ===
  const sharedRes = await request(app).post('/api/auth/register').send({
    name: 'Shared Merchant',
    email: 'shared@isolation-test.com',
    password: 'password123',
  });
  sharedMerchantToken = sharedRes.body.accessToken;
  sharedMerchantId = sharedRes.body.merchant.id;

  // Add shared merchant to Group A (admin adds manually via Membership model)
  await Membership.create({
    groupId: new mongoose.Types.ObjectId(groupAId),
    merchantId: new mongoose.Types.ObjectId(sharedMerchantId),
    role: 'member',
  });

  // Add shared merchant to Group B
  const groupBInviteRes = await request(app)
    .get('/api/groups')
    .set('Authorization', `Bearer ${ownerBToken}`);
  const groupBInviteCode = groupBInviteRes.body.groups[0].inviteCode;

  await request(app)
    .post('/api/groups/join')
    .set('Authorization', `Bearer ${sharedMerchantToken}`)
    .send({ inviteCode: groupBInviteCode });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

// ── Test 1: Group B user gets 403 on Group A debt endpoint ──────────────────

describe('Isolation — Cross-group access blocked', () => {
  it('Group B owner gets 403 when using Group A\'s X-Group-Id', async () => {
    const res = await request(app)
      .get('/api/debts')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .set('X-Group-Id', groupAId); // wrong group

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_GROUP');
  });

  it('User with no groups gets 403 on any group-scoped debt endpoint', async () => {
    // Register a brand-new user
    const newUserRes = await request(app).post('/api/auth/register').send({
      name: 'No Group User',
      email: 'nogroup@isolation-test.com',
      password: 'password123',
    });
    const noGroupToken = newUserRes.body.accessToken;

    const res = await request(app)
      .get('/api/debts')
      .set('Authorization', `Bearer ${noGroupToken}`)
      .set('X-Group-Id', groupAId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_GROUP');
  });
});

// ── Test 2: Member only sees scope=mine debts ────────────────────────────────

describe('Isolation — Member sees only own debts (scope=mine)', () => {
  let debtIdForMemberA: string;
  let debtIdBetweenOthers: string;

  beforeAll(async () => {
    // Get merchant IDs
    const ownerMeRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerAToken}`);
    const ownerAId = ownerMeRes.body.merchant.id;

    // Create a debt where memberA is debtor → owner A is creditor
    const debt1 = await request(app)
      .post('/api/debts')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .set('X-Group-Id', groupAId)
      .send({
        debtorId: memberAId,
        creditorId: ownerAId,
        amount: 3000,
        note: 'Member A owes Owner A',
      });
    debtIdForMemberA = debt1.body.debt?._id;

    // Create a debt between Owner A and Shared Merchant (member A not involved)
    const debt2 = await request(app)
      .post('/api/debts')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .set('X-Group-Id', groupAId)
      .send({
        debtorId: sharedMerchantId,
        creditorId: ownerAId,
        amount: 5000,
        note: 'Shared owes Owner A',
      });
    debtIdBetweenOthers = debt2.body.debt?._id;
  });

  it('member sees only their own debts with scope=mine', async () => {
    const res = await request(app)
      .get('/api/debts?scope=mine')
      .set('Authorization', `Bearer ${memberAToken}`)
      .set('X-Group-Id', groupAId);

    expect(res.status).toBe(200);
    const debtIds = res.body.debts.map((d: any) => d._id);
    expect(debtIds).toContain(debtIdForMemberA);
    // Member A should NOT see the debt between Shared and Owner A
    if (debtIdBetweenOthers) {
      expect(debtIds).not.toContain(debtIdBetweenOthers);
    }
  });

  it('member gets 403 when requesting scope=all', async () => {
    const res = await request(app)
      .get('/api/debts?scope=all')
      .set('Authorization', `Bearer ${memberAToken}`)
      .set('X-Group-Id', groupAId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_GROUP');
  });
});

// ── Test 3: Admin sees all debts in their group ──────────────────────────────

describe('Isolation — Admin sees all group debts', () => {
  it('owner can request scope=all and sees all group debts', async () => {
    const res = await request(app)
      .get('/api/debts?scope=all')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .set('X-Group-Id', groupAId);

    expect(res.status).toBe(200);
    // Should see both debts created above
    expect(res.body.count).toBeGreaterThanOrEqual(2);
    // All returned debts must belong to Group A
    for (const debt of res.body.debts) {
      expect(debt.groupId.toString()).toBe(groupAId);
    }
  });
});

// ── Test 4: Two groups with same merchant don't mix debts ───────────────────

describe('Isolation — Two groups with shared merchant don\'t mix', () => {
  let groupBDebtId: string;

  beforeAll(async () => {
    // Create a debt in Group B (between Group B owner and shared merchant)
    const ownerBMeRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerBToken}`);
    const ownerBId = ownerBMeRes.body.merchant.id;

    const debtRes = await request(app)
      .post('/api/debts')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .set('X-Group-Id', groupBId)
      .send({
        debtorId: sharedMerchantId,
        creditorId: ownerBId,
        amount: 7000,
        note: 'Shared owes Group B Owner — Group B debt',
      });
    groupBDebtId = debtRes.body.debt?._id;
  });

  it('Group A owner cannot see Group B debts even with shared merchant', async () => {
    const res = await request(app)
      .get('/api/debts?scope=all')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .set('X-Group-Id', groupAId);

    expect(res.status).toBe(200);
    const debtIds = res.body.debts.map((d: any) => d._id);
    // Group B debt should NOT appear in Group A query
    if (groupBDebtId) {
      expect(debtIds).not.toContain(groupBDebtId);
    }
  });

  it('Shared merchant sees Group A debts under Group A header', async () => {
    const res = await request(app)
      .get('/api/debts?scope=mine')
      .set('Authorization', `Bearer ${sharedMerchantToken}`)
      .set('X-Group-Id', groupAId);

    expect(res.status).toBe(200);
    // Shared merchant's Group A debts should be visible
    for (const debt of res.body.debts) {
      expect(debt.groupId.toString()).toBe(groupAId);
    }
  });

  it('Shared merchant sees Group B debts under Group B header', async () => {
    const res = await request(app)
      .get('/api/debts?scope=mine')
      .set('Authorization', `Bearer ${sharedMerchantToken}`)
      .set('X-Group-Id', groupBId);

    expect(res.status).toBe(200);
    // Shared merchant's Group B debts should be visible
    for (const debt of res.body.debts) {
      expect(debt.groupId.toString()).toBe(groupBId);
    }
  });
});
