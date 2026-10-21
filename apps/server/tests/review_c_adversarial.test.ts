import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';
import { Debt } from '../src/models/Debt';
import { Group, Membership } from '../src/models/Group';
import { PaymentEvent } from '../src/models/PaymentEvent';
import { RiskAssessment } from '../src/models/RiskAssessment';
import { Notification } from '../src/models/Notification';
import { runDueDateJob } from '../src/services/dueDateJob';
import * as pythonBridge from '../src/services/pythonBridge';
import { createMemoryServer } from './setup';

// Mock Socket.io
jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  }),
  emitToGroup: jest.fn(),
  emitToMerchant: jest.fn(),
}));

// Mock Python Bridge with call inspection
jest.mock('../src/services/pythonBridge', () => {
  const original = jest.requireActual('../src/services/pythonBridge');
  return {
    ...original,
    callRiskScore: jest.fn().mockImplementation(async (merchantName: string, history: any[]) => ({
      merchant_id: merchantName,
      months_observed: Math.max(history.length, 1),
      late_payment_events: history.filter((h: any) => h.late).length,
      default_events: 0,
      lambda_rate: 0.2,
      risk_score: 0.25,
      risk_category: 'LOW',
      model: 'poisson_v1',
      cold_start: history.length < 3,
    })),
    callZTest: jest.fn().mockImplementation(async (merchantName: string, successes: number, trials: number, baselineP: number) => ({
      merchant_id: merchantName,
      observed_p: trials > 0 ? successes / trials : 0,
      baseline_p: baselineP,
      z_score: 1.25,
      p_value: 0.10,
      p_value_two_tailed: 0.20,
      is_significant: false,
      sample_size: trials,
      interpretation: 'Normal delay frequency',
      composite_risk_score: 0.28,
    })),
    callCorrelation: jest.fn().mockResolvedValue({
      delay_vs_amount: { r: 0.35, p_value: 0.05, significant: true, sample_size: 5, interpretation: 'Moderate' },
      frequency_vs_late_rate: { r: 0.40, p_value: 0.04, significant: true, sample_size: 5, interpretation: 'Moderate' },
      sample_size: 5,
    }),
    callContagion: jest.fn().mockImplementation(async (merchants: string[], debts: any[], failedMerchant: string, lgd: number, maxRounds: number) => ({
      failed_merchant: failedMerchant,
      direct_losses: { Member_A2: 5000 * lgd },
      second_order_losses: {},
      per_merchant_loss: { Member_A2: 5000 * lgd },
      total_network_loss: 5000 * lgd,
      affected_merchants: ['Member_A2'],
      cascade_rounds: [
        { round: 1, type: 'Direct Exposure', losses: { Member_A2: 5000 * lgd }, round_loss: 5000 * lgd },
      ],
      network_vulnerability_score: 0.45,
    })),
  };
});

const app = createApp();
let mongoServer: MongoMemoryServer;

let adminAToken: string;
let memberA2Token: string;
let adminBToken: string;

let merchantAId: string;
let merchantA2Id: string;
let merchantBId: string;

let groupAId: string;
let groupBId: string;
let emptyGroupId: string;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  // 1. Register Admin A (Group A Owner/Admin)
  const regA = await request(app).post('/api/auth/register').send({
    name: 'Admin_Alice',
    email: 'admin.alice@review-c.test',
    password: 'password123',
  });
  adminAToken = regA.body.accessToken;
  merchantAId = regA.body.merchant.id;

  // 2. Register Member A2 (Group A Member)
  const regA2 = await request(app).post('/api/auth/register').send({
    name: 'Member_A2',
    email: 'member.a2@review-c.test',
    password: 'password123',
  });
  memberA2Token = regA2.body.accessToken;
  merchantA2Id = regA2.body.merchant.id;

  // 3. Register Admin B (Group B Owner/Admin)
  const regB = await request(app).post('/api/auth/register').send({
    name: 'Admin_Bob',
    email: 'admin.bob@review-c.test',
    password: 'password123',
  });
  adminBToken = regB.body.accessToken;
  merchantBId = regB.body.merchant.id;

  // 4. Create Group A by Admin A
  const grpARes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminAToken}`)
    .send({ name: 'Alpha Trade Group' });
  groupAId = grpARes.body.group._id || grpARes.body.group.id;
  const inviteCodeA = grpARes.body.group.inviteCode;

  // 5. Member A2 joins Group A
  await request(app)
    .post('/api/groups/join')
    .set('Authorization', `Bearer ${memberA2Token}`)
    .send({ inviteCode: inviteCodeA });

  // 6. Create Group B by Admin B
  const grpBRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminBToken}`)
    .send({ name: 'Beta Supply Group' });
  groupBId = grpBRes.body.group._id || grpBRes.body.group.id;

  // 7. Create Empty Group by Admin A
  const grpEmptyRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminAToken}`)
    .send({ name: 'Empty Portfolio Group' });
  emptyGroupId = grpEmptyRes.body.group._id || grpEmptyRes.body.group.id;

  // 8. Create Active Debts
  // Group A debt: Alice owes Member A2 ₹10,000
  await Debt.create({
    groupId: new mongoose.Types.ObjectId(groupAId),
    debtorId: new mongoose.Types.ObjectId(merchantAId),
    creditorId: new mongoose.Types.ObjectId(merchantA2Id),
    amount: 10000,
    originalAmount: 10000,
    status: 'active',
  });

  // Group B debt: Bob owes a foreign merchant ₹50,000
  const foreignMerchant = await Merchant.create({
    name: 'Foreign_Supplier',
    email: 'foreign.supplier@review-c.test',
    passwordHash: 'dummy',
  });
  await Debt.create({
    groupId: new mongoose.Types.ObjectId(groupBId),
    debtorId: new mongoose.Types.ObjectId(merchantBId),
    creditorId: foreignMerchant._id,
    amount: 50000,
    originalAmount: 50000,
    status: 'active',
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Phase 5A Adversarial Review C: Risk, Realtime & Notifications / UI', () => {

  // ── 1. Contagion Simulation Cross-Tenant Isolation ───────────────────────────
  describe('Vector 1: Contagion Simulation Cross-Tenant Data Leakage', () => {
    it('strictly isolates simulation graph to Group A, excluding Group B debts and merchants', async () => {
      const contagionSpy = jest.spyOn(pythonBridge, 'callContagion');

      const res = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          failedMerchant: 'Admin_Alice',
          lossGivenDefault: 1.0,
          maxRounds: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.simulation).toBeDefined();
      expect(res.body.contagion).toBeDefined();

      // Inspect spy arguments passed to pythonBridge.callContagion
      expect(contagionSpy).toHaveBeenCalled();
      const lastCall = contagionSpy.mock.calls[contagionSpy.mock.calls.length - 1];
      const merchantsArg = lastCall[0];
      const debtsArg = lastCall[1];

      // Assert Group B merchants and foreign merchants are NOT present
      expect(merchantsArg).toContain('Admin_Alice');
      expect(merchantsArg).toContain('Member_A2');
      expect(merchantsArg).not.toContain('Admin_Bob');
      expect(merchantsArg).not.toContain('Foreign_Supplier');

      // Assert Group B debts (₹50,000) are NOT present in the graph
      const amounts = debtsArg.map((d: any) => d.amount);
      expect(amounts).toContain(10000);
      expect(amounts).not.toContain(50000);
    });
  });

  // ── 2. Contagion Payload Compatibility & Parameter Fallback ──────────────────
  describe('Vector 2: Contagion Payload Compatibility (merchantId vs failedMerchant)', () => {
    it('accepts frontend payload using merchantId instead of failedMerchant and returns both aliases', async () => {
      const res = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          merchantId: merchantAId,
          lossGivenDefault: 0.8,
          maxRounds: 3,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.simulation).toBeDefined();
      expect(res.body.contagion).toBeDefined();
      expect(res.body.contagion.failed_merchant).toBe('Admin_Alice');
    });

    it('rejects request when neither failedMerchant nor merchantId is supplied', async () => {
      const res = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          lossGivenDefault: 0.5,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    });
  });

  // ── 3. Contagion Failed Merchant Verification ────────────────────────────────
  describe('Vector 3: Contagion Target Merchant Verification', () => {
    it('rejects simulation if failed merchant is not a member of the active group', async () => {
      const res = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          failedMerchant: 'Admin_Bob', // Admin_Bob is only in Group B
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.message).toMatch(/not an active member/i);
    });
  });

  // ── 4. Contagion Input Bounds Validation ─────────────────────────────────────
  describe('Vector 4: Contagion Input Bounds Validation', () => {
    it('rejects lossGivenDefault outside [0.0, 1.0]', async () => {
      const resNegative = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          failedMerchant: 'Admin_Alice',
          lossGivenDefault: -0.2,
        });
      expect(resNegative.status).toBe(400);
      expect(resNegative.body.code).toBe('VALIDATION');

      const resExcess = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          failedMerchant: 'Admin_Alice',
          lossGivenDefault: 1.5,
        });
      expect(resExcess.status).toBe(400);
      expect(resExcess.body.code).toBe('VALIDATION');
    });

    it('rejects maxRounds outside [1, 20]', async () => {
      const resZero = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          failedMerchant: 'Admin_Alice',
          maxRounds: 0,
        });
      expect(resZero.status).toBe(400);

      const resExcess = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId)
        .send({
          failedMerchant: 'Admin_Alice',
          maxRounds: 99,
        });
      expect(resExcess.status).toBe(400);
    });
  });

  // ── 5. Group Risk Recompute Tenant Isolation ─────────────────────────────────
  describe('Vector 5: Group Risk Recomputation Tenant Isolation', () => {
    beforeAll(async () => {
      // Seed PaymentEvents in Group A: 10 events, 2 late (20% late rate)
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        await PaymentEvent.create({
          groupId: new mongoose.Types.ObjectId(groupAId),
          merchantId: new mongoose.Types.ObjectId(merchantAId),
          debtId: new mongoose.Types.ObjectId(),
          dueDate: new Date(now.getTime() - i * 30 * 24 * 60 * 60 * 1000),
          paidDate: new Date(now.getTime() - i * 30 * 24 * 60 * 60 * 1000),
          wasLate: i < 2, // 2 late
          delayDays: i < 2 ? 15 : 0,
        });
      }

      // Seed PaymentEvents in Group B: 20 events, 18 late (90% late rate)
      for (let i = 0; i < 20; i++) {
        await PaymentEvent.create({
          groupId: new mongoose.Types.ObjectId(groupBId),
          merchantId: new mongoose.Types.ObjectId(merchantBId),
          debtId: new mongoose.Types.ObjectId(),
          dueDate: new Date(now.getTime() - i * 30 * 24 * 60 * 60 * 1000),
          paidDate: new Date(now.getTime() - i * 30 * 24 * 60 * 60 * 1000),
          wasLate: i < 18, // 18 late
          delayDays: i < 18 ? 45 : 0,
        });
      }
    });

    it('computes baseline late rate strictly from Group A events without cross-tenant infection', async () => {
      const res = await request(app)
        .post('/api/risk/recompute')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Group A has 10 events with 2 late: 2/10 = 0.20
      expect(res.body.baselineLateRate).toBeCloseTo(0.20, 2);
      // Recomputed count should equal 2 (Alice and Member A2)
      expect(res.body.recomputedCount).toBe(2);
    });
  });

  // ── 6. Role Gating on Group Risk Recompute ───────────────────────────────────
  describe('Vector 6: Role Gating on Group Risk Recompute', () => {
    it('rejects regular group member from triggering group risk recomputation', async () => {
      const res = await request(app)
        .post('/api/risk/recompute')
        .set('Authorization', `Bearer ${memberA2Token}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
      expect(res.body.message).toMatch(/only group admins and owners/i);
    });

    it('allows group admin or owner to recompute risk', async () => {
      const res = await request(app)
        .post('/api/risk/recompute')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── 7. Cross-Tenant IDOR on Merchant Risk Profile ────────────────────────────
  describe('Vector 7: Cross-Tenant IDOR on Merchant Risk Profile', () => {
    it('rejects tenant querying risk profile of a merchant who does not belong to their active group', async () => {
      // Admin B tries to query Merchant A's profile using Group B context
      const res = await request(app)
        .get(`/api/risk/merchant/${merchantAId}`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .set('X-Group-Id', groupBId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
      expect(res.body.message).toMatch(/not an active member/i);
    });

    it('allows member in Group A to query their co-member risk profile', async () => {
      const res = await request(app)
        .get(`/api/risk/merchant/${merchantAId}`)
        .set('Authorization', `Bearer ${memberA2Token}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.merchantId).toBe(merchantAId);
    });
  });

  // ── 8. Group Risk Assessment Deduplication ───────────────────────────────────
  describe('Vector 8: Group Risk Assessment Deduplication on Repeated Recomputes', () => {
    it('deduplicates historical assessments per merchant and reports unique merchant count', async () => {
      // Trigger recomputation two more times to create multiple historical records
      await request(app)
        .post('/api/risk/recompute')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);

      await request(app)
        .post('/api/risk/recompute')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);

      const res = await request(app)
        .get('/api/risk/group')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', groupAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Group A has 2 members: Alice and Member A2. Deduplication should yield exactly 2.
      expect(res.body.merchants).toBe(2);
      expect(res.body.profiles.length).toBe(2);

      const profileMerchantIds = res.body.profiles.map((p: any) => p.merchantId);
      const uniqueIds = new Set(profileMerchantIds);
      expect(uniqueIds.size).toBe(profileMerchantIds.length);
    });
  });

  // ── 9. Notification Read IDOR Rejection ──────────────────────────────────────
  describe('Vector 9: Notification Read IDOR Vulnerability', () => {
    let notificationAId: string;

    beforeAll(async () => {
      const notif = await Notification.create({
        merchantId: new mongoose.Types.ObjectId(merchantAId),
        groupId: new mongoose.Types.ObjectId(groupAId),
        type: 'risk:flagged',
        message: 'Confidential Risk Alert for Alice',
        refType: 'risk',
        refId: new mongoose.Types.ObjectId(merchantAId),
      });
      notificationAId = notif._id.toString();
    });

    it('rejects unauthorized merchant from marking another merchant private notification as read', async () => {
      // Attacker Admin B attempts to mark Alice's notification as read
      const res = await request(app)
        .patch(`/api/notifications/${notificationAId}/read`)
        .set('Authorization', `Bearer ${adminBToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not found/i);

      // Verify DB record was not modified
      const unreadDoc = await Notification.findById(notificationAId);
      expect(unreadDoc?.readAt).toBeNull();
    });

    it('allows notification owner to mark their own notification as read', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${notificationAId}/read`)
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.notification.readAt).toBeDefined();

      const readDoc = await Notification.findById(notificationAId);
      expect(readDoc?.readAt).not.toBeNull();
    });
  });

  // ── 10. Due-Date Cron False Alarm Mitigation ─────────────────────────────────
  describe('Vector 10: Due-Date Cron Ignores Unconfirmed Pending Debts', () => {
    let pendingDebtId: string;
    let activeOverdueDebtId: string;

    beforeAll(async () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      // 1. Pending (unconfirmed) overdue debt
      const pending = await Debt.create({
        groupId: new mongoose.Types.ObjectId(groupAId),
        debtorId: new mongoose.Types.ObjectId(merchantAId),
        creditorId: new mongoose.Types.ObjectId(merchantA2Id),
        amount: 8888,
        originalAmount: 8888,
        status: 'pending',
        dueDate: pastDate,
      });
      pendingDebtId = pending._id.toString();

      // 2. Confirmed active overdue debt
      const active = await Debt.create({
        groupId: new mongoose.Types.ObjectId(groupAId),
        debtorId: new mongoose.Types.ObjectId(merchantAId),
        creditorId: new mongoose.Types.ObjectId(merchantA2Id),
        amount: 9999,
        originalAmount: 9999,
        status: 'active',
        dueDate: pastDate,
      });
      activeOverdueDebtId = active._id.toString();
    });

    it('executes runDueDateJob and only generates overdue notifications for active debts', async () => {
      const summary = await runDueDateJob();
      expect(summary.overdueCount).toBeGreaterThanOrEqual(1);

      // Verify notifications generated: activeOverdueDebt should have notification, pending should NOT
      const pendingNotif = await Notification.findOne({
        refType: 'debt',
        refId: new mongoose.Types.ObjectId(pendingDebtId),
        type: 'debt:overdue',
      });
      expect(pendingNotif).toBeNull();

      const activeNotif = await Notification.findOne({
        refType: 'debt',
        refId: new mongoose.Types.ObjectId(activeOverdueDebtId),
        type: 'debt:overdue',
      });
      expect(activeNotif).not.toBeNull();
      expect(activeNotif?.message).toContain('₹9,999');
    });
  });

  // ── 11. Cross-Tenant Risk Trend Protection ───────────────────────────────────
  describe('Vector 11: Cross-Tenant Risk Trend Protection', () => {
    it('rejects caller inspecting risk trend of a merchant with whom they share no active group', async () => {
      // Admin B tries to inspect Merchant A's risk trend (no common groups)
      const res = await request(app)
        .get(`/api/risk/trend/${merchantAId}`)
        .set('Authorization', `Bearer ${adminBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });

    it('allows merchant to view their own 12-month risk trend', async () => {
      const res = await request(app)
        .get(`/api/risk/trend/${merchantAId}`)
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.merchantId).toBe(merchantAId);
      expect(res.body.trend.length).toBe(12);
    });

    it('allows co-member in shared group to inspect peer risk trend', async () => {
      const res = await request(app)
        .get(`/api/risk/trend/${merchantAId}`)
        .set('Authorization', `Bearer ${memberA2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.merchantId).toBe(merchantAId);
    });
  });

  // ── 12. Empty Group Risk Safety ──────────────────────────────────────────────
  describe('Vector 12: Empty Group Risk Safety Handling', () => {
    it('returns clean zeroed statistics without crashing when group has 0 debts or assessments', async () => {
      const res = await request(app)
        .get('/api/risk/group')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', emptyGroupId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.merchants).toBe(0);
      expect(res.body.portfolioAverageRisk).toBe(0);
      expect(res.body.profiles).toEqual([]);
    });

    it('handles empty group recomputation gracefully', async () => {
      const res = await request(app)
        .post('/api/risk/recompute')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Group-Id', emptyGroupId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.recomputedCount).toBe(1);
    });
  });

  // ── 13. Missing Group Context Handling ───────────────────────────────────────
  describe('Vector 13: Missing Group Context Rejection', () => {
    it('rejects group risk endpoints if X-Group-Id is missing or empty', async () => {
      const resGroup = await request(app)
        .get('/api/risk/group')
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(resGroup.status).toBe(403);

      const resContagion = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ failedMerchant: 'Admin_Alice' });
      expect(resContagion.status).toBe(403);
    });
  });

  // ── 14. Realtime Socket Membership Guard Invariant ───────────────────────────
  describe('Vector 14: Socket Realtime Membership Guard Invariant', () => {
    it('verifies that Membership.exists rejects foreign merchant from group room', async () => {
      // Merchant B is NOT in Group A
      const isMember = await Membership.exists({
        groupId: new mongoose.Types.ObjectId(groupAId),
        merchantId: new mongoose.Types.ObjectId(merchantBId),
      });
      expect(isMember).toBeFalsy();

      // Merchant A IS in Group A
      const isAliceMember = await Membership.exists({
        groupId: new mongoose.Types.ObjectId(groupAId),
        merchantId: new mongoose.Types.ObjectId(merchantAId),
      });
      expect(isAliceMember).toBeTruthy();
    });
  });
});
