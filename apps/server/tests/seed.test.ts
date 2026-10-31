import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMemoryServer } from './setup';
import { seedDatabase, DEFAULT_PASSWORD } from '../scripts/seed';
import { Merchant } from '../src/models/Merchant';
import { Group, Membership } from '../src/models/Group';
import { Debt } from '../src/models/Debt';
import { PaymentEvent } from '../src/models/PaymentEvent';
import { RiskAssessment } from '../src/models/RiskAssessment';
import { Notification } from '../src/models/Notification';
import bcrypt from 'bcryptjs';

describe('BE-37: Seed Database & Demo Integrity Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await createMemoryServer();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('runs seedDatabase and verifies all demo acceptance criteria', async () => {
    const seedResult = await seedDatabase({ silent: true, disconnectOnFinish: false });

    // 1. Merchant Accounts & Default Password
    expect(seedResult.merchantsCount).toBe(8);
    const merchants = await Merchant.find().lean();
    expect(merchants).toHaveLength(8);
    const wholesaleA = merchants.find((m) => m.name === 'Wholesale_A');
    expect(wholesaleA).toBeDefined();
    const isPasswordValid = await bcrypt.compare(DEFAULT_PASSWORD, wholesaleA!.passwordHash);
    expect(isPasswordValid).toBe(true);

    // 2. Groups & Memberships
    const groups = await Group.find().lean();
    expect(groups).toHaveLength(2);
    const crawfordGroup = groups.find((g) => g.name === 'Crawford Market');
    const supplierGroup = groups.find((g) => g.name === 'Supplier Circle');
    expect(crawfordGroup).toBeDefined();
    expect(supplierGroup).toBeDefined();

    const crawfordMembers = await Membership.find({ groupId: crawfordGroup!._id }).lean();
    expect(crawfordMembers).toHaveLength(8);

    const supplierMembers = await Membership.find({ groupId: supplierGroup!._id }).lean();
    expect(supplierMembers).toHaveLength(3);

    // Wholesale_A is member of BOTH groups (cross-tenant user)
    const wholesaleAMemberships = await Membership.find({ merchantId: wholesaleA!._id }).lean();
    expect(wholesaleAMemberships).toHaveLength(2);

    // 3. Deliberate 3-Cycle Netting in Crawford Market
    // Retailer_B → Wholesale_A (50k) → Vendor_D (20k) → Retailer_B (25k)
    const retailerB = merchants.find((m) => m.name === 'Retailer_B')!;
    const vendorD = merchants.find((m) => m.name === 'Vendor_D')!;

    const cycleEdge1 = await Debt.findOne({
      groupId: crawfordGroup!._id,
      debtorId: retailerB._id,
      creditorId: wholesaleA!._id,
      status: 'active',
    }).lean();
    expect(cycleEdge1).toBeDefined();
    expect(cycleEdge1!.amount).toBe(50000);

    const cycleEdge2 = await Debt.findOne({
      groupId: crawfordGroup!._id,
      debtorId: wholesaleA!._id,
      creditorId: vendorD._id,
      status: 'active',
    }).lean();
    expect(cycleEdge2).toBeDefined();
    expect(cycleEdge2!.amount).toBe(20000);

    const cycleEdge3 = await Debt.findOne({
      groupId: crawfordGroup!._id,
      debtorId: vendorD._id,
      creditorId: retailerB._id,
      status: 'active',
    }).lean();
    expect(cycleEdge3).toBeDefined();
    expect(cycleEdge3!.amount).toBe(25000);

    // Min capacity of this 3-cycle is 20,000
    const minCycleCapacity = Math.min(cycleEdge1!.amount, cycleEdge2!.amount, cycleEdge3!.amount);
    expect(minCycleCapacity).toBe(20000);

    // 4. Overdue Debts exist
    const now = new Date();
    const overdueDebts = await Debt.find({
      groupId: crawfordGroup!._id,
      status: 'active',
      dueDate: { $lt: now },
    }).lean();
    expect(overdueDebts.length).toBeGreaterThanOrEqual(3);

    // 5. Pending Requests Awaiting Approval
    const pendingDebts = await Debt.find({
      groupId: crawfordGroup!._id,
      status: 'pending',
    }).lean();
    expect(pendingDebts.length).toBeGreaterThanOrEqual(2);
    expect(pendingDebts[0].confirmedBy).toBeNull();

    // 6. Deliberately High-Risk Merchant: Supplier_C
    const supplierC = merchants.find((m) => m.name === 'Supplier_C')!;
    expect(supplierC).toBeDefined();
    expect(supplierC.riskProfile?.riskCategory).toBe('CRITICAL');

    const supplierCEvents = await PaymentEvent.find({
      groupId: crawfordGroup!._id,
      merchantId: supplierC._id,
    }).lean();
    expect(supplierCEvents.length).toBeGreaterThanOrEqual(6);
    // All events are late with severe delays
    expect(supplierCEvents.every((e) => e.wasLate)).toBe(true);

    const supplierCAssessment = await RiskAssessment.findOne({
      groupId: crawfordGroup!._id.toString(),
      merchantId: supplierC._id,
    }).lean();
    expect(supplierCAssessment).toBeDefined();
    expect(supplierCAssessment!.riskCategory).toBe('CRITICAL');
    expect(supplierCAssessment!.pValue).toBeLessThan(0.05);
    expect(supplierCAssessment!.zScore).toBeGreaterThan(3);

    // 7. Notification Samples
    const notifications = await Notification.find().lean();
    expect(notifications.length).toBeGreaterThanOrEqual(5);
    const debtReqNotice = notifications.find((n) => n.type === 'debt:requested');
    const overdueNotice = notifications.find((n) => n.type === 'debt:overdue');
    const riskNotice = notifications.find((n) => n.type === 'risk:flagged');
    expect(debtReqNotice).toBeDefined();
    expect(overdueNotice).toBeDefined();
    expect(riskNotice).toBeDefined();

    // 8. Cross-Group Tenancy Isolation
    const crawfordDebts = await Debt.find({ groupId: crawfordGroup!._id }).lean();
    const supplierCircleDebts = await Debt.find({ groupId: supplierGroup!._id }).lean();
    expect(crawfordDebts.length).toBeGreaterThan(0);
    expect(supplierCircleDebts.length).toBeGreaterThan(0);

    // Verify disjoint group IDs on debts
    const crawfordDebtIds = new Set(crawfordDebts.map((d) => d._id.toString()));
    for (const d of supplierCircleDebts) {
      expect(crawfordDebtIds.has(d._id.toString())).toBe(false);
      expect(d.groupId.toString()).toBe(supplierGroup!._id.toString());
    }

    // 9. Day 3 Tax Integration Criteria
    // Crawford Market (domain 'gst') has 3 taxed debts:
    const crawfordTaxed = await Debt.find({
      groupId: crawfordGroup!._id,
      taxType: { $exists: true, $ne: null },
    }).lean();
    expect(crawfordTaxed).toHaveLength(3);

    const gstIntra18 = crawfordTaxed.find((d) => d.taxType === 'gst.intra' && d.taxRate === 18);
    const gstInter5 = crawfordTaxed.find((d) => d.taxType === 'gst.inter' && d.taxRate === 5);
    const gstIntra0 = crawfordTaxed.find((d) => d.taxType === 'gst.intra' && d.taxRate === 0);

    expect(gstIntra18).toBeDefined();
    expect(gstIntra18!.baseAmount).toBe(10000);
    expect(gstIntra18!.taxAmount).toBe(1800);
    expect(gstIntra18!.amount).toBe(11800);

    expect(gstInter5).toBeDefined();
    expect(gstInter5!.baseAmount).toBe(20000);
    expect(gstInter5!.taxAmount).toBe(1000);
    expect(gstInter5!.amount).toBe(21000);

    expect(gstIntra0).toBeDefined();
    expect(gstIntra0!.baseAmount).toBe(15000);
    expect(gstIntra0!.taxAmount).toBe(0);
    expect(gstIntra0!.amount).toBe(15000);

    // Supplier Circle (domain 'customs') has 1 customs.import debt:
    const customsDebts = await Debt.find({
      groupId: supplierGroup!._id,
      taxType: 'customs.import',
    }).lean();
    expect(customsDebts).toHaveLength(1);
    const customsDebt = customsDebts[0];
    expect(customsDebt.baseAmount).toBe(500000);
    expect(customsDebt.taxAmount).toBe(138675);
    expect(customsDebt.amount).toBe(638675);
    expect(customsDebt.taxBreakup).toHaveLength(3);
  });
});
