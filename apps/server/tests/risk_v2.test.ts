import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { createMemoryServer } from './setup';
import { Merchant } from '../src/models/Merchant';
import { Debt } from '../src/models/Debt';
import { PaymentEvent } from '../src/models/PaymentEvent';
import { Notification } from '../src/models/Notification';
import { RiskAssessment } from '../src/models/RiskAssessment';
import { runDueDateJob } from '../src/services/dueDateJob';
import * as pythonBridge from '../src/services/pythonBridge';

// Mock Python bridge calls to ensure deterministic and fast unit testing
jest.mock('../src/services/pythonBridge', () => {
  const original = jest.requireActual('../src/services/pythonBridge');
  return {
    ...original,
    callRiskScore: jest.fn().mockResolvedValue({
      merchant_id: 'Test Merchant',
      months_observed: 4,
      late_payment_events: 1,
      default_events: 0,
      lambda_rate: 0.25,
      risk_score: 0.22,
      risk_category: 'MEDIUM',
      model: 'poisson_v1',
      cold_start: false,
    }),
    callZTest: jest.fn().mockResolvedValue({
      merchant_id: 'Test Merchant',
      observed_p: 0.25,
      baseline_p: 0.1,
      z_score: 1.82,
      p_value: 0.034,
      p_value_two_tailed: 0.068,
      is_significant: true,
      sample_size: 10,
      interpretation: 'Statistically significant elevation in delay frequency at alpha=0.05',
      composite_risk_score: 0.45,
    }),
    callCorrelation: jest.fn().mockResolvedValue({
      delay_vs_amount: { r: 0.42, p_value: 0.02, significant: true, sample_size: 8, interpretation: 'Moderate' },
      frequency_vs_late_rate: { r: 0.35, p_value: 0.04, significant: true, sample_size: 8, interpretation: 'Moderate' },
      sample_size: 8,
    }),
    callContagion: jest.fn().mockResolvedValue({
      failed_merchant: 'Wholesale_A',
      direct_losses: { Retailer_B: 12000 },
      second_order_losses: { Vendor_D: 4000 },
      per_merchant_loss: { Retailer_B: 12000, Vendor_D: 4000 },
      total_network_loss: 16000,
      affected_merchants: ['Retailer_B', 'Vendor_D'],
      cascade_rounds: [
        { round: 1, type: 'Direct Exposure', losses: { Retailer_B: 12000 }, round_loss: 12000 },
        { round: 2, type: 'Second Order Cascade', losses: { Vendor_D: 4000 }, round_loss: 4000 },
      ],
      network_vulnerability_score: 0.65,
    }),
  };
});

import { Group, Membership } from '../src/models/Group';

describe('Risk V2, Notifications & Cron Tests (Slice C)', () => {
  let mongoServer: MongoMemoryServer;
  let app: any;
  let token: string;
  let merchantAId: string;
  let merchantBId: string;
  let groupId: string;

  beforeAll(async () => {
    mongoServer = await createMemoryServer();
    await mongoose.connect(mongoServer.getUri());
    app = createApp();

    // Register test merchant
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Merchant Alpha',
        email: 'alpha@test.com',
        password: 'Password123',
      });
    token = regRes.body.accessToken;
    merchantAId = regRes.body.merchant.id;

    // Create group for Merchant Alpha
    const groupRes = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alpha Market Circle', type: 'market' });
    groupId = groupRes.body.group._id;

    // Create second merchant
    const merchantB = await Merchant.create({
      name: 'Merchant Beta',
      email: 'beta@test.com',
      passwordHash: 'dummyhash',
      riskProfile: { riskScore: 0.15, riskCategory: 'LOW' },
    });
    merchantBId = merchantB.id;

    await Membership.create({
      groupId: new mongoose.Types.ObjectId(groupId),
      merchantId: merchantB._id,
      role: 'member',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('Risk V2 Endpoints', () => {
    test('POST /api/risk/recompute calculates risk from PaymentEvents and updates profile', async () => {
      // Seed payment events for merchant A
      await PaymentEvent.create([
        {
          groupId: new mongoose.Types.ObjectId(groupId),
          merchantId: new mongoose.Types.ObjectId(merchantAId),
          debtId: new mongoose.Types.ObjectId(),
          dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          paidDate: new Date(),
          wasLate: true,
          delayDays: 14,
        },
        {
          groupId: new mongoose.Types.ObjectId(groupId),
          merchantId: new mongoose.Types.ObjectId(merchantAId),
          debtId: new mongoose.Types.ObjectId(),
          dueDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          paidDate: new Date(),
          wasLate: false,
          delayDays: 0,
        },
      ]);

      const res = await request(app)
        .post('/api/risk/recompute')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Group-Id', groupId)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.recomputedCount).toBeGreaterThanOrEqual(2);

      // Verify assessment record exists
      const assessment = await RiskAssessment.findOne({ merchantId: merchantAId });
      expect(assessment).toBeDefined();
      expect(assessment?.zScore).toBeDefined();
    });

    test('GET /api/risk/group returns portfolio profiles and statistics', async () => {
      const res = await request(app)
        .get('/api/risk/group')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Group-Id', groupId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.profiles)).toBe(true);
      expect(typeof res.body.portfolioAverageRisk).toBe('number');
    });

    test('GET /api/risk/merchant/:id returns single merchant risk with monthly history', async () => {
      const res = await request(app)
        .get(`/api/risk/merchant/${merchantAId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Group-Id', groupId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.name).toBe('Merchant Alpha');
      expect(res.body.stats.totalPaymentEvents).toBe(2);
      expect(res.body.stats.latePayments).toBe(1);
      expect(Array.isArray(res.body.monthlyHistory)).toBe(true);
    });

    test('POST /api/risk/contagion simulates cascade default', async () => {
      // Create a test debt
      await Debt.create({
        debtorId: new mongoose.Types.ObjectId(merchantAId),
        creditorId: new mongoose.Types.ObjectId(merchantBId),
        groupId: new mongoose.Types.ObjectId(groupId),
        amount: 15000,
        originalAmount: 15000,
        status: 'active',
      });

      const res = await request(app)
        .post('/api/risk/contagion')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Group-Id', groupId)
        .send({
          failedMerchant: 'Merchant Alpha',
          lossGivenDefault: 1.0,
          maxRounds: 4,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.simulation.failed_merchant).toBe('Wholesale_A');
      expect(res.body.simulation.total_network_loss).toBe(16000);
      expect(res.body.simulation.affected_merchants).toContain('Retailer_B');
    });
  });

  describe('Notifications API', () => {
    let createdNotifId: string;

    test('GET /api/notifications returns list with unreadCount', async () => {
      // Seed a notification
      const notif = await Notification.create({
        merchantId: new mongoose.Types.ObjectId(merchantAId),
        type: 'risk:flagged',
        message: 'Risk score elevated to HIGH',
        readAt: null,
      });
      createdNotifId = notif.id;

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(1);
      expect(res.body.notifications.some((n: any) => n.id === createdNotifId)).toBe(true);
    });

    test('PATCH /api/notifications/:id/read marks notification as read', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${createdNotifId}/read`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.notification.readAt).toBeDefined();

      const updated = await Notification.findById(createdNotifId);
      expect(updated?.readAt).not.toBeNull();
    });

    test('POST /api/notifications/read-all marks all notifications read', async () => {
      // Create another unread notification
      await Notification.create({
        merchantId: new mongoose.Types.ObjectId(merchantAId),
        type: 'debt:requested',
        message: 'New debt requested',
        readAt: null,
      });

      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.modifiedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Due Date Job Cron Service', () => {
    test('runDueDateJob generates overdue and due-soon notifications with deduplication', async () => {
      const now = new Date();
      // Debt due in 2 days
      const dueSoonDebt = await Debt.create({
        debtorId: new mongoose.Types.ObjectId(merchantAId),
        creditorId: new mongoose.Types.ObjectId(merchantBId),
        amount: 7500,
        originalAmount: 7500,
        dueDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        status: 'active',
      });

      // Overdue debt
      const overdueDebt = await Debt.create({
        debtorId: new mongoose.Types.ObjectId(merchantAId),
        creditorId: new mongoose.Types.ObjectId(merchantBId),
        amount: 12000,
        originalAmount: 12000,
        dueDate: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
        status: 'active',
      });

      // First run: should generate notifications
      const run1 = await runDueDateJob();
      expect(run1.dueSoonCount).toBeGreaterThanOrEqual(1);
      expect(run1.overdueCount).toBeGreaterThanOrEqual(1);
      expect(run1.notificationsCreated).toBeGreaterThanOrEqual(2);

      // Verify notification in DB
      const notif = await Notification.findOne({
        refType: 'debt',
        refId: overdueDebt._id,
        type: 'debt:overdue',
      });
      expect(notif).toBeDefined();

      // Second run on the same day: should deduplicate and NOT generate duplicates!
      const run2 = await runDueDateJob();
      expect(run2.notificationsCreated).toBe(0);
    });
  });
});
