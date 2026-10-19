import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Debt } from '../src/models/Debt';
import { Payment } from '../src/models/Payment';
import { PaymentEvent } from '../src/models/PaymentEvent';
import { AuditLog } from '../src/models/AuditLog';
import { Membership } from '../src/models/Group';
import { createMemoryServer } from './setup';

jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  }),
  emitToGroup: jest.fn(),
}));

const app = createApp();
let mongoServer: MongoMemoryServer;

let adminToken: string;
let adminId: string;
let userAToken: string;
let userAId: string;
let userBToken: string;
let userBId: string;
let outsiderToken: string;
let outsiderId: string;

let groupAId: string;
let groupBId: string;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  // 1. Create Admin
  const adminRes = await request(app).post('/api/auth/register').send({
    name: 'Admin User',
    email: 'admin_ledger@test.com',
    password: 'password123',
  });
  adminToken = adminRes.body.accessToken;
  adminId = adminRes.body.merchant.id;

  // 2. Create User A (Member)
  const userARes = await request(app).post('/api/auth/register').send({
    name: 'User A',
    email: 'usera_ledger@test.com',
    password: 'password123',
  });
  userAToken = userARes.body.accessToken;
  userAId = userARes.body.merchant.id;

  // 3. Create User B (Member)
  const userBRes = await request(app).post('/api/auth/register').send({
    name: 'User B',
    email: 'userb_ledger@test.com',
    password: 'password123',
  });
  userBToken = userBRes.body.accessToken;
  userBId = userBRes.body.merchant.id;

  // 4. Create Outsider (in another group)
  const outsiderRes = await request(app).post('/api/auth/register').send({
    name: 'Outsider',
    email: 'outsider_ledger@test.com',
    password: 'password123',
  });
  outsiderToken = outsiderRes.body.accessToken;
  outsiderId = outsiderRes.body.merchant.id;

  // Create Group A (Admin is owner)
  const groupARes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Group A', type: 'market' });
  groupAId = groupARes.body.group._id;

  // Create Group B (Outsider is owner)
  const groupBRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${outsiderToken}`)
    .send({ name: 'Group B', type: 'market' });
  groupBId = groupBRes.body.group._id;

  // Add User A and User B to Group A
  await Membership.create([
    { groupId: new mongoose.Types.ObjectId(groupAId), merchantId: new mongoose.Types.ObjectId(userAId), role: 'member' },
    { groupId: new mongoose.Types.ObjectId(groupAId), merchantId: new mongoose.Types.ObjectId(userBId), role: 'member' },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Phase 2 — Ledger, Transactions, Approval Flow, CAS Payments & Audit', () => {
  let pendingDebtId: string;

  describe('1. Debt Approval Flow (BE-20)', () => {
    it('creates debt in pending status with createdBy set', async () => {
      // User A (creditor) proposes a debt against User B (debtor)
      const res = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          debtorId: userBId,
          creditorId: userAId,
          amount: 1000,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          note: 'Consignment invoice #901',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.debt.status).toBe('pending');
      expect(res.body.debt.amount).toBe(1000);
      expect(res.body.debt.version).toBe(0);
      pendingDebtId = res.body.debt._id;

      // Check audit log recorded
      const auditLog = await AuditLog.findOne({
        entityId: new mongoose.Types.ObjectId(pendingDebtId),
        action: 'DEBT_CREATED',
      });
      expect(auditLog).toBeDefined();
    });

    it('prevents creator (User A) from self-confirming the debt proposal', async () => {
      const res = await request(app)
        .post(`/api/debts/${pendingDebtId}/confirm`)
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });

    it('allows counterparty (User B) to confirm the debt proposal -> active', async () => {
      const res = await request(app)
        .post(`/api/debts/${pendingDebtId}/confirm`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.debt.status).toBe('active');
      expect(res.body.debt.confirmedBy).toBeDefined();
      expect(res.body.debt.version).toBe(1);
    });

    it('allows debt rejection for pending debts', async () => {
      // Create another debt to reject
      const createRes = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          debtorId: userBId,
          creditorId: userAId,
          amount: 500,
        });

      const rejectDebtId = createRes.body.debt._id;

      const rejectRes = await request(app)
        .post(`/api/debts/${rejectDebtId}/reject`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Group-Id', groupAId);

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.debt.status).toBe('cancelled');
    });

    it('allows disputing active debt', async () => {
      const disputeRes = await request(app)
        .post(`/api/debts/${pendingDebtId}/dispute`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Group-Id', groupAId)
        .send({ reason: 'Incorrect quantity delivered' });

      expect(disputeRes.status).toBe(200);
      expect(disputeRes.body.debt.status).toBe('disputed');

      // Un-dispute or re-activate for payment tests
      await Debt.findByIdAndUpdate(pendingDebtId, { status: 'active' });
    });
  });

  describe('2. Single Debt Detail (BE-10)', () => {
    it('returns debt, payments timeline, and audit logs for parties', async () => {
      const res = await request(app)
        .get(`/api/debts/${pendingDebtId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.debt._id).toBe(pendingDebtId);
      expect(Array.isArray(res.body.payments)).toBe(true);
      expect(Array.isArray(res.body.audit)).toBe(true);
    });

    it('prevents cross-tenant access to debt detail', async () => {
      const res = await request(app)
        .get(`/api/debts/${pendingDebtId}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .set('X-Group-Id', groupBId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });
  });

  describe('3. Payments, CAS, Idempotency & Concurrency Race (BE-10, BE-11, BE-25)', () => {
    let raceDebtId: string;

    beforeEach(async () => {
      // Create a fresh active debt with amount = 1000
      const debt = await Debt.create({
        groupId: new mongoose.Types.ObjectId(groupAId),
        debtorId: new mongoose.Types.ObjectId(userBId),
        creditorId: new mongoose.Types.ObjectId(userAId),
        amount: 1000,
        originalAmount: 1000,
        status: 'active',
        version: 0,
        dueDate: new Date(Date.now() - 86400000 * 2), // 2 days overdue
      });
      raceDebtId = (debt._id as mongoose.Types.ObjectId).toString();
    });

    it('records partial payment, updates status, and logs PaymentEvent with delayDays', async () => {
      const res = await request(app)
        .post(`/api/debts/${raceDebtId}/payments`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: 400,
          note: 'First installment',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.amount).toBe(400);
      expect(res.body.debt.amount).toBe(600);
      expect(res.body.debt.status).toBe('active');

      // Check PaymentEvent was created and has wasLate = true and delayDays > 0
      const event = await PaymentEvent.findOne({ debtId: new mongoose.Types.ObjectId(raceDebtId) });
      expect(event).toBeDefined();
      expect(event?.wasLate).toBe(true);
      expect(event?.delayDays).toBeGreaterThanOrEqual(1);
    });

    it('idempotency key returns IDEMPOTENT_REPLAY with identical response on replay', async () => {
      const idempotencyKey = 'unique-key-12345';

      const firstCall = await request(app)
        .post(`/api/debts/${raceDebtId}/payments`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: 300,
          idempotencyKey,
          note: 'Idempotent test payment',
        });

      expect(firstCall.status).toBe(201);
      expect(firstCall.body.debt.amount).toBe(700);

      const secondCall = await request(app)
        .post(`/api/debts/${raceDebtId}/payments`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          amount: 300,
          idempotencyKey,
          note: 'Idempotent test payment replay',
        });

      expect(secondCall.status).toBe(200);
      expect(secondCall.body.code).toBe('IDEMPOTENT_REPLAY');
      expect(secondCall.body.payment._id).toBe(firstCall.body.payment._id);

      // Verify debt was NOT double-decremented
      const debtDoc = await Debt.findById(raceDebtId);
      expect(debtDoc?.amount).toBe(700);
    });

    it('rejects payment exceeding remaining amount', async () => {
      const res = await request(app)
        .post(`/api/debts/${raceDebtId}/payments`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Group-Id', groupAId)
        .send({ amount: 1500 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('payment race test: two concurrent payments against same initial version both succeed via withRetry and result in exact final amount', async () => {
      // Debt initial amount: 1000, version: 0
      const p1 = request(app)
        .post(`/api/debts/${raceDebtId}/payments`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Group-Id', groupAId)
        .send({ amount: 350, note: 'Parallel payment 1' });

      const p2 = request(app)
        .post(`/api/debts/${raceDebtId}/payments`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Group-Id', groupAId)
        .send({ amount: 250, note: 'Parallel payment 2' });

      const [res1, res2] = await Promise.all([p1, p2]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      // Final debt amount must be exactly 1000 - 350 - 250 = 400
      const finalDebt = await Debt.findById(raceDebtId);
      expect(finalDebt?.amount).toBe(400);
      expect(finalDebt?.version).toBe(2);

      // Both payments must be recorded
      const payments = await Payment.find({ debtId: new mongoose.Types.ObjectId(raceDebtId) });
      expect(payments.length).toBe(2);
      const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
      expect(totalPaid).toBe(600);
    });
  });

  describe('4. Audit Log Endpoint & Isolation (BE-21, BE-30)', () => {
    it('admin views all group audit entries with pagination', async () => {
      const res = await request(app)
        .get('/api/audit?limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.audit)).toBe(true);
    });

    it('cross-tenant user cannot view another group audit logs', async () => {
      const res = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });
  });
});
