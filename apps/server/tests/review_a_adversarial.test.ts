import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { createMemoryServer } from './setup';
import { Debt } from '../src/models/Debt';
import { IdempotencyRecord } from '../src/models/Idempotency';
import { Payment } from '../src/models/Payment';

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

jest.setTimeout(60000);

let ownerAId: string;
let ownerAToken: string;
let adminAId: string;
let adminAToken: string;
let memberAId: string;
let memberAToken: string;
let memberA2Id: string;
let memberA2Token: string;

let ownerBId: string;
let ownerBToken: string;

let groupAId: string;
let groupAInviteCode: string;
let groupBId: string;

let debtAId: string;
let debtBId: string;

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  // 1. Setup Group A Merchants
  const ownerARes = await request(app).post('/api/auth/register').send({
    name: 'Owner_A',
    email: 'owner_a@review-a.test',
    password: 'password123',
  });
  ownerAId = ownerARes.body.merchant.id;
  ownerAToken = ownerARes.body.accessToken;

  const adminARes = await request(app).post('/api/auth/register').send({
    name: 'Admin_A',
    email: 'admin_a@review-a.test',
    password: 'password123',
  });
  adminAId = adminARes.body.merchant.id;
  adminAToken = adminARes.body.accessToken;

  const memberARes = await request(app).post('/api/auth/register').send({
    name: 'Member_A',
    email: 'member_a@review-a.test',
    password: 'password123',
  });
  memberAId = memberARes.body.merchant.id;
  memberAToken = memberARes.body.accessToken;

  const memberA2Res = await request(app).post('/api/auth/register').send({
    name: 'Member_A2',
    email: 'member_a2@review-a.test',
    password: 'password123',
  });
  memberA2Id = memberA2Res.body.merchant.id;
  memberA2Token = memberA2Res.body.accessToken;

  // Create Group A
  const groupARes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${ownerAToken}`)
    .send({ name: 'Group Alpha', type: 'market' });
  groupAId = groupARes.body.group._id;
  groupAInviteCode = groupARes.body.group.inviteCode;

  // Join adminA and memberA to Group A
  await request(app)
    .post('/api/groups/join')
    .set('Authorization', `Bearer ${adminAToken}`)
    .send({ inviteCode: groupAInviteCode });

  await request(app)
    .post('/api/groups/join')
    .set('Authorization', `Bearer ${memberAToken}`)
    .send({ inviteCode: groupAInviteCode });

  await request(app)
    .post('/api/groups/join')
    .set('Authorization', `Bearer ${memberA2Token}`)
    .send({ inviteCode: groupAInviteCode });

  // Promote adminA to admin by ownerA
  await request(app)
    .patch(`/api/groups/${groupAId}/members/${adminAId}`)
    .set('Authorization', `Bearer ${ownerAToken}`)
    .set('X-Group-Id', groupAId)
    .send({ role: 'admin' });

  // 2. Setup Group B Merchant and Group B
  const ownerBRes = await request(app).post('/api/auth/register').send({
    name: 'Owner_B',
    email: 'owner_b@review-a.test',
    password: 'password123',
  });
  ownerBId = ownerBRes.body.merchant.id;
  ownerBToken = ownerBRes.body.accessToken;

  const groupBRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${ownerBToken}`)
    .send({ name: 'Group Beta', type: 'supply_chain' });
  groupBId = groupBRes.body.group._id;

  // 3. Create a Debt in Group A (Debtor: memberA, Creditor: ownerA, Amount: 1000)
  const debtARes = await request(app)
    .post('/api/debts')
    .set('Authorization', `Bearer ${memberAToken}`)
    .set('X-Group-Id', groupAId)
    .send({
      debtorId: memberAId,
      creditorId: ownerAId,
      amount: 1000,
      note: 'Invoice A1',
    });
  debtAId = debtARes.body.debt._id;

  // Confirm debt A to make it active
  await request(app)
    .post(`/api/debts/${debtAId}/confirm`)
    .set('Authorization', `Bearer ${ownerAToken}`)
    .set('X-Group-Id', groupAId);

  // 4. Create a Debt in Group B (Creditor: ownerB, Debtor: ownerB, Amount: 500)
  // For test, create another member in Group B
  const memberBRes = await request(app).post('/api/auth/register').send({
    name: 'Member_B',
    email: 'member_b@review-a.test',
    password: 'password123',
  });
  const memberBToken = memberBRes.body.accessToken;
  const memberBId = memberBRes.body.merchant.id;

  await request(app)
    .post('/api/groups/join')
    .set('Authorization', `Bearer ${memberBToken}`)
    .send({ inviteCode: groupBRes.body.group.inviteCode });

  const debtBRes = await request(app)
    .post('/api/debts')
    .set('Authorization', `Bearer ${ownerBToken}`)
    .set('X-Group-Id', groupBId)
    .send({
      debtorId: memberBId,
      creditorId: ownerBId,
      amount: 500,
      note: 'Invoice B1',
    });
  debtBId = debtBRes.body.debt._id;

  await request(app)
    .post(`/api/debts/${debtBId}/confirm`)
    .set('Authorization', `Bearer ${memberBToken}`)
    .set('X-Group-Id', groupBId);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Phase 5A: Tenancy & Ledger Adversarial Security Review', () => {
  describe('1. IDOR & Tenant Isolation', () => {
    it('blocks reading a debt from another group using own valid group header', async () => {
      // Member of Group A tries to read Debt B using Group A header
      const res = await request(app)
        .get(`/api/debts/${debtBId}`)
        .set('Authorization', `Bearer ${memberAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });

    it('blocks updating a debt belonging to another group', async () => {
      const res = await request(app)
        .patch(`/api/debts/${debtBId}`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({ amount: 9999 });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });

    it('blocks settling a debt belonging to another group', async () => {
      const res = await request(app)
        .delete(`/api/debts/${debtBId}`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });
  });

  describe('2. Forged X-Group-Id Header', () => {
    it('rejects access when user passes an X-Group-Id for a group they are not a member of', async () => {
      // memberA is not in Group B
      const res = await request(app)
        .get('/api/debts')
        .set('Authorization', `Bearer ${memberAToken}`)
        .set('X-Group-Id', groupBId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });
  });

  describe('3. Removed Member Session Invalidation', () => {
    it('revokes group access immediately after member is removed from the group', async () => {
      // Register a temporary member
      const tempRes = await request(app).post('/api/auth/register').send({
        name: 'Temp_User',
        email: 'temp_user@review-a.test',
        password: 'password123',
      });
      const tempToken = tempRes.body.accessToken;
      const tempId = tempRes.body.merchant.id;

      // Join Group A
      await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({ inviteCode: groupAInviteCode });

      // Verify access works
      const verifyRes = await request(app)
        .get('/api/debts')
        .set('Authorization', `Bearer ${tempToken}`)
        .set('X-Group-Id', groupAId);
      expect(verifyRes.status).toBe(200);

      // Admin removes temp user from Group A
      const removeRes = await request(app)
        .delete(`/api/groups/${groupAId}/members/${tempId}`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);
      expect(removeRes.status).toBe(200);

      // Now temp user attempts to access Group A with their old token
      const postRemoveRes = await request(app)
        .get('/api/debts')
        .set('Authorization', `Bearer ${tempToken}`)
        .set('X-Group-Id', groupAId);

      expect(postRemoveRes.status).toBe(403);
      expect(postRemoveRes.body.code).toBe('FORBIDDEN_GROUP');
    });
  });

  describe('4. Role Escalation & Last-Owner Protections', () => {
    it('prevents an admin from changing member roles (only owner can modify roles)', async () => {
      const res = await request(app)
        .patch(`/api/groups/${groupAId}/members/${memberAId}`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });

    it('prevents a regular member from escalating their own role', async () => {
      const res = await request(app)
        .patch(`/api/groups/${groupAId}/members/${memberAId}`)
        .set('Authorization', `Bearer ${memberAToken}`)
        .set('X-Group-Id', groupAId)
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });

    it('prevents demoting or changing the role of the group owner', async () => {
      const res = await request(app)
        .patch(`/api/groups/${groupAId}/members/${ownerAId}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({ role: 'member' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot change the role of the group owner');
    });

    it('prevents an admin from removing the group owner', async () => {
      const res = await request(app)
        .delete(`/api/groups/${groupAId}/members/${ownerAId}`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot remove the group owner');
    });

    it('prevents the group owner from removing themselves (last-owner exit)', async () => {
      const res = await request(app)
        .delete(`/api/groups/${groupAId}/members/${ownerAId}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Transfer ownership first');
    });

    it('prevents an admin from removing another admin', async () => {
      // Create another admin in Group A
      await request(app)
        .patch(`/api/groups/${groupAId}/members/${memberA2Id}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({ role: 'admin' });

      // Admin A tries to remove Admin A2
      const res = await request(app)
        .delete(`/api/groups/${groupAId}/members/${memberA2Id}`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Only the group owner can remove an admin');
    });
  });

  describe('5. Unauthorized Debt Modifications', () => {
    it('prevents a third-party non-admin member from updating a debt', async () => {
      // memberA2 is a member in groupA, but not party to debtA (memberA -> ownerA)
      // Demote memberA2 back to member first
      await request(app)
        .patch(`/api/groups/${groupAId}/members/${memberA2Id}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({ role: 'member' });

      const res = await request(app)
        .patch(`/api/debts/${debtAId}`)
        .set('Authorization', `Bearer ${memberA2Token}`)
        .set('X-Group-Id', groupAId)
        .send({ amount: 50 });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });

    it('prevents a third-party non-admin member from force-settling a debt', async () => {
      const res = await request(app)
        .delete(`/api/debts/${debtAId}`)
        .set('Authorization', `Bearer ${memberA2Token}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });
  });

  describe('6. Idempotency Key Cross-Debt Replay Defense', () => {
    it('records a payment with an idempotency key successfully', async () => {
      const key = `idemp-key-${Date.now()}`;
      const res = await request(app)
        .post(`/api/debts/${debtAId}/payments`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: 100,
          kind: 'partial',
          idempotencyKey: key,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.amount).toBe(100);

      // Replaying on the SAME debt returns 200 IDEMPOTENT_REPLAY
      const replayRes = await request(app)
        .post(`/api/debts/${debtAId}/payments`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: 100,
          kind: 'partial',
          idempotencyKey: key,
        });

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.code).toBe('IDEMPOTENT_REPLAY');
      expect(replayRes.body.idempotentReplay).toBe(true);
    });

    it('rejects reusing the same idempotency key across a DIFFERENT debt', async () => {
      const crossKey = `idemp-cross-${Date.now()}`;

      // Use on debt A
      await request(app)
        .post(`/api/debts/${debtAId}/payments`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: 50,
          kind: 'partial',
          idempotencyKey: crossKey,
        });

      // Try to reuse on debt B
      const reuseRes = await request(app)
        .post(`/api/debts/${debtBId}/payments`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .set('X-Group-Id', groupBId)
        .send({
          amount: 50,
          kind: 'partial',
          idempotencyKey: crossKey,
        });

      expect(reuseRes.status).toBe(409);
      expect(reuseRes.body.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('7. Payment Validation & Overflow Attacks', () => {
    it('rejects recording a payment amount greater than the remaining debt', async () => {
      const res = await request(app)
        .post(`/api/debts/${debtAId}/payments`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: 99999, // remaining is < 1000
          kind: 'partial',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('exceeds remaining debt amount');
    });

    it('rejects zero or negative payment amounts', async () => {
      const zeroRes = await request(app)
        .post(`/api/debts/${debtAId}/payments`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: 0,
          kind: 'partial',
        });
      expect(zeroRes.status).toBe(400);

      const negRes = await request(app)
        .post(`/api/debts/${debtAId}/payments`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: -50,
          kind: 'partial',
        });
      expect(negRes.status).toBe(400);
    });

    it('rejects NaN payment amounts', async () => {
      const nanRes = await request(app)
        .post(`/api/debts/${debtAId}/payments`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: 'not-a-number',
          kind: 'partial',
        });
      expect(nanRes.status).toBe(400);
    });
  });

  describe('8. CSV Import/Export Sanitization & Limits', () => {
    it('sanitizes formula injection (=cmd) in imported CSV note field', async () => {
      const csv = `debtor,creditor,amount,note\n${memberAId},${ownerAId},150,"=cmd|'/C calc'!A0"`;

      const res = await request(app)
        .post('/api/debts/import')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({ csvText: csv });

      expect(res.status).toBe(201);
      expect(res.body.importedCount).toBe(1);

      const createdDebt = res.body.debts[0];
      // Note must be escaped with a leading single quote
      expect(createdDebt.note.startsWith("'=cmd")).toBe(true);
    });

    it('escapes formula injection characters in CSV export', async () => {
      const res = await request(app)
        .get('/api/debts/export.csv')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      // Verify exported CSV content sanitizes formula fields
      expect(res.text).toContain("'=cmd");
    });

    it('rejects CSV uploads exceeding maximum row limit (>1000 rows)', async () => {
      const header = 'debtor,creditor,amount,note\n';
      const row = `${memberAId},${ownerAId},10,bulk\n`;
      const bigCsv = header + row.repeat(1005);

      const res = await request(app)
        .post('/api/debts/import')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({ csvText: bigCsv });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TOO_MANY_ROWS');
    });

    it('rejects oversized CSV content (>2MB)', async () => {
      // 2.1 MB string
      const bigPayload = 'a'.repeat(2.1 * 1024 * 1024);

      const res = await request(app)
        .post('/api/debts/import')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({ csvText: bigPayload });

      expect([400, 413]).toContain(res.status);
    });
  });

  describe('9. Invite Code Brute Force Protection', () => {
    it('applies rate limiting on group join route', async () => {
      // The joinLimiter allows 20 requests per 15 minutes window
      // Send 22 requests rapidly
      let hitRateLimit = false;
      for (let i = 0; i < 22; i++) {
        const res = await request(app)
          .post('/api/groups/join')
          .set('Authorization', `Bearer ${memberAToken}`)
          .send({ inviteCode: 'WRONGCODE' });

        if (res.status === 429) {
          hitRateLimit = true;
          break;
        }
      }

      expect(hitRateLimit).toBe(true);
    });
  });
});
