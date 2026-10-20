import 'dotenv/config';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';
import { Debt } from '../src/models/Debt';
import { Notification } from '../src/models/Notification';
import { NotificationPreference } from '../src/models/NotificationPreference';
import { notify, isQuietHoursActive } from '../src/utils/notify';
import { runDigestJob } from '../src/services/digestJob';
import { deliveryService, EmailStubDeliveryChannel, WebhookDeliveryChannel } from '../src/services/deliveryService';
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
let merchantId: string;
let merchant2Id: string;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  const authRes = await request(app).post('/api/auth/register').send({
    name: 'NotifMerchant',
    email: 'notif@test.com',
    password: 'password123',
  });
  accessToken = authRes.body.accessToken;
  merchantId = authRes.body.merchant.id;

  const m2 = await Merchant.create({
    name: 'OtherMerchant',
    email: 'other@test.com',
    passwordHash: 'hash',
  });
  merchant2Id = (m2._id as Types.ObjectId).toString();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await Notification.deleteMany({});
  await NotificationPreference.deleteMany({});
  await Debt.deleteMany({});
});

describe('Notification Preferences & Delivery API (BE-39)', () => {
  it('GET /api/notifications/preferences - returns default preferences when none exist', async () => {
    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.preferences).toBeDefined();
    expect(res.body.preferences.channels.inApp).toBe(true);
    expect(res.body.preferences.channels.email).toBe(true);
    expect(res.body.preferences.channels.webhook).toBe(false);
    expect(res.body.preferences.types.debtRequested).toBe(true);
    expect(res.body.preferences.types.digest).toBe(true);
  });

  it('PATCH /api/notifications/preferences - updates channel and quiet hours preferences', async () => {
    const updatePayload = {
      channels: { inApp: true, email: false, webhook: true },
      webhookUrl: 'https://example.com/webhook',
      quietHours: { enabled: true, startHour: 23, endHour: 6 },
      types: { debtRequested: false, riskFlagged: true },
    };

    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.preferences.channels.email).toBe(false);
    expect(res.body.preferences.channels.webhook).toBe(true);
    expect(res.body.preferences.webhookUrl).toBe('https://example.com/webhook');
    expect(res.body.preferences.quietHours.enabled).toBe(true);
    expect(res.body.preferences.quietHours.startHour).toBe(23);
    expect(res.body.preferences.types.debtRequested).toBe(false);
  });

  it('notify() respects muted notification types in preferences', async () => {
    // Disable debtRequested type
    await NotificationPreference.create({
      merchantId: new Types.ObjectId(merchantId),
      types: {
        debtRequested: false,
        debtConfirmed: true,
      },
    });

    // Send debt:requested notification -> should be suppressed
    const notifs1 = await notify(
      new Types.ObjectId().toString(),
      merchantId,
      'debt:requested',
      'Test debt request'
    );
    expect(notifs1).toHaveLength(0);

    const count1 = await Notification.countDocuments({ merchantId });
    expect(count1).toBe(0);

    // Send debt:confirmed notification -> should be created
    const notifs2 = await notify(
      new Types.ObjectId().toString(),
      merchantId,
      'debt:confirmed',
      'Test debt confirmed'
    );
    expect(notifs2).toHaveLength(1);

    const count2 = await Notification.countDocuments({ merchantId });
    expect(count2).toBe(1);
  });

  it('isQuietHoursActive helper calculates spans correctly across midnight', () => {
    // 22:00 to 07:00
    const d1 = new Date();
    d1.setHours(23, 0, 0, 0);
    expect(isQuietHoursActive(22, 7, d1)).toBe(true);

    const d2 = new Date();
    d2.setHours(3, 0, 0, 0);
    expect(isQuietHoursActive(22, 7, d2)).toBe(true);

    const d3 = new Date();
    d3.setHours(14, 0, 0, 0);
    expect(isQuietHoursActive(22, 7, d3)).toBe(false);

    // Day span: 09:00 to 17:00
    const d4 = new Date();
    d4.setHours(12, 0, 0, 0);
    expect(isQuietHoursActive(9, 17, d4)).toBe(true);

    const d5 = new Date();
    d5.setHours(20, 0, 0, 0);
    expect(isQuietHoursActive(9, 17, d5)).toBe(false);
  });

  it('deliveryService dispatches to emailStub and webhook channels', async () => {
    const emailStub = deliveryService.getChannel('emailStub') as EmailStubDeliveryChannel;
    const webhookStub = deliveryService.getChannel('webhook') as WebhookDeliveryChannel;

    const payload = {
      merchantId,
      type: 'payment:recorded',
      message: '₹5,000 payment received',
    };

    const results = await deliveryService.dispatch(payload, {
      channels: { inApp: true, email: true, webhook: true },
      email: 'merchant@test.com',
      webhookUrl: 'https://webhook.site/test',
    });

    expect(results.inApp.success).toBe(true);
    expect(results.email.success).toBe(true);
    expect(emailStub.lastDeliveredEmail?.to).toBe('merchant@test.com');
    expect(results.webhook.success).toBe(true);
    expect(webhookStub.lastDeliveredPayload?.data.message).toBe('₹5,000 payment received');
  });
});

describe('Overdue Notification Digest Job (BE-39 & Digest Cron)', () => {
  it('summarises overdue debts per merchant and dispatches digest notification', async () => {
    const dummyGroupId = new Types.ObjectId();
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5); // 5 days ago
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 5); // 5 days ahead

    // Create 2 overdue debts for merchantId
    await Debt.create([
      {
        groupId: dummyGroupId,
        debtorId: new Types.ObjectId(merchantId),
        creditorId: new Types.ObjectId(merchant2Id),
        amount: 15000,
        originalAmount: 15000,
        status: 'active',
        dueDate: pastDate,
      },
      {
        groupId: dummyGroupId,
        debtorId: new Types.ObjectId(merchantId),
        creditorId: new Types.ObjectId(merchant2Id),
        amount: 25000,
        originalAmount: 25000,
        status: 'active',
        dueDate: pastDate,
      },
      // 1 non-overdue active debt (future)
      {
        groupId: dummyGroupId,
        debtorId: new Types.ObjectId(merchantId),
        creditorId: new Types.ObjectId(merchant2Id),
        amount: 50000,
        originalAmount: 50000,
        status: 'active',
        dueDate: futureDate,
      },
      // 1 overdue but settled debt
      {
        groupId: dummyGroupId,
        debtorId: new Types.ObjectId(merchantId),
        creditorId: new Types.ObjectId(merchant2Id),
        amount: 10000,
        originalAmount: 10000,
        status: 'settled',
        dueDate: pastDate,
      },
      // 1 overdue debt for merchant2Id
      {
        groupId: dummyGroupId,
        debtorId: new Types.ObjectId(merchant2Id),
        creditorId: new Types.ObjectId(merchantId),
        amount: 8000,
        originalAmount: 8000,
        status: 'active',
        dueDate: pastDate,
      },
    ]);

    const summary = await runDigestJob();

    expect(summary.merchantsNotified).toBe(2);
    expect(summary.totalOverdueDebts).toBe(3); // 2 for merchant1 + 1 for merchant2
    expect(summary.totalOverdueAmount).toBe(48000); // 40000 + 8000

    // Verify notifications were created in DB
    const m1Notifs = await Notification.find({
      merchantId: new Types.ObjectId(merchantId),
      type: 'digest:overdue',
    });
    expect(m1Notifs).toHaveLength(1);
    expect(m1Notifs[0].message).toContain('2 overdue payment obligation(s)');
    expect(m1Notifs[0].message).toContain('40,000');

    const m2Notifs = await Notification.find({
      merchantId: new Types.ObjectId(merchant2Id),
      type: 'digest:overdue',
    });
    expect(m2Notifs).toHaveLength(1);
    expect(m2Notifs[0].message).toContain('1 overdue payment obligation(s)');
    expect(m2Notifs[0].message).toContain('8,000');
  });

  it('handles empty overdue debts gracefully without sending notifications', async () => {
    const summary = await runDigestJob();
    expect(summary.merchantsNotified).toBe(0);
    expect(summary.totalOverdueDebts).toBe(0);
    expect(summary.totalOverdueAmount).toBe(0);

    const count = await Notification.countDocuments({ type: 'digest:overdue' });
    expect(count).toBe(0);
  });
});
