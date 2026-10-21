/**
 * seedService.ts — Core seed logic for Crawford Market & Supplier Circle demo data (BE-37)
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

// Models
import { Merchant } from '../models/Merchant';
import { Debt } from '../models/Debt';
import { RiskAssessment } from '../models/RiskAssessment';
import { Settlement } from '../models/Settlement';
import { Group, Membership } from '../models/Group';
import { Payment } from '../models/Payment';
import { PaymentEvent } from '../models/PaymentEvent';
import { AuditLog } from '../models/AuditLog';
import { IdempotencyRecord } from '../models/Idempotency';
import { Notification } from '../models/Notification';

export const DEFAULT_PASSWORD = 'CreditFlow@123';

export interface SeedResult {
  merchantsCount: number;
  groupsCount: number;
  debtsCount: number;
  pendingDebtsCount: number;
  paymentEventsCount: number;
  notificationsCount: number;
  crawfordGroupId: string;
  supplierGroupId: string;
  merchants: Array<{ name: string; email: string; role: string }>;
}

export async function seedDatabase(options: { disconnectOnFinish?: boolean; silent?: boolean } = {}): Promise<SeedResult> {
  const log = (msg: string) => {
    if (!options.silent) console.log(msg);
  };

  // ── Load seed data ────────────────────────────────────────────────────────
  const possiblePaths = [
    path.resolve(__dirname, '../../../../seed_data.json'),
    path.resolve(__dirname, '../../../seed_data.json'),
    path.resolve(__dirname, '../../seed_data.json'),
    path.resolve(__dirname, '../seed_data.json'),
    path.resolve(process.cwd(), 'seed_data.json'),
    path.resolve(process.cwd(), '../../seed_data.json'),
    path.resolve('/app/seed_data.json'),
  ];
  const seedDataPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!seedDataPath) {
    throw new Error('seed_data.json could not be located in candidate paths.');
  }
  const seedData = JSON.parse(fs.readFileSync(seedDataPath, 'utf-8'));

  log('🌱 Clearing existing data across all collections...');
  await Promise.all([
    Merchant.deleteMany({}),
    Debt.deleteMany({}),
    RiskAssessment.deleteMany({}),
    Settlement.deleteMany({}),
    Group.deleteMany({}),
    Membership.deleteMany({}),
    Payment.deleteMany({}),
    PaymentEvent.deleteMany({}),
    AuditLog.deleteMany({}),
    IdempotencyRecord.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  log('   Cleaned collections.');

  // ── 1. Create merchants ───────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const merchantDocs = await Merchant.insertMany(
    (seedData.merchants as string[]).map((name: string) => ({
      name,
      email: `${name.toLowerCase().replace(/_/g, '.')}@demo.com`,
      passwordHash,
      riskProfile: {
        riskScore: name === 'Supplier_C' ? 0.88 : name === 'Vendor_D' ? 0.45 : 0.05,
        riskCategory: name === 'Supplier_C' ? 'CRITICAL' : name === 'Vendor_D' ? 'MEDIUM' : 'LOW',
        lastUpdated: new Date(),
      },
    })),
  );

  const nameToId = new Map<string, mongoose.Types.ObjectId>();
  const nameToDoc = new Map<string, any>();
  merchantDocs.forEach((m) => {
    nameToId.set(m.name, m._id as mongoose.Types.ObjectId);
    nameToDoc.set(m.name, m);
  });

  const wholesaleA = nameToDoc.get('Wholesale_A')!;
  const retailerB = nameToDoc.get('Retailer_B')!;
  const supplierC = nameToDoc.get('Supplier_C')!;
  const vendorD = nameToDoc.get('Vendor_D')!;
  const logisticsE = nameToDoc.get('Logistics_E')!;
  const farmerF = nameToDoc.get('Farmer_F')!;
  const stallG = nameToDoc.get('Stall_G')!;
  const buyerH = nameToDoc.get('Buyer_H')!;

  // ── 2. Create Crawford Market group (all 8 merchants) ─────────────────────
  const crawfordGroup = await Group.create({
    name: 'Crawford Market',
    type: 'market',
    ownerId: wholesaleA._id,
    inviteCode: 'CRAWFORD',
  });

  await Membership.insertMany(
    merchantDocs.map((m) => ({
      groupId: crawfordGroup._id,
      merchantId: m._id,
      role: m.name === 'Wholesale_A' ? 'owner' : m.name === 'Retailer_B' ? 'admin' : 'member',
      joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    })),
  );
  log(`✅ Created group "${crawfordGroup.name}" with 8 members.`);

  // ── 3. Create Supplier Circle group (Wholesale_A, Supplier_C, Logistics_E) ─
  const supplierCircleGroup = await Group.create({
    name: 'Supplier Circle',
    type: 'supply_chain',
    ownerId: wholesaleA._id,
    inviteCode: 'SUPPLIER',
  });

  await Membership.insertMany([
    {
      groupId: supplierCircleGroup._id,
      merchantId: wholesaleA._id,
      role: 'owner',
      joinedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    },
    {
      groupId: supplierCircleGroup._id,
      merchantId: supplierC._id,
      role: 'admin',
      joinedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
    },
    {
      groupId: supplierCircleGroup._id,
      merchantId: logisticsE._id,
      role: 'member',
      joinedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    },
  ]);
  log(`✅ Created group "${supplierCircleGroup.name}" with 3 members.`);

  // ── 4. Create Active & Overdue Debts for Crawford Market ───────────────────
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // Deliberate 3-cycle:
  //   Retailer_B owes Wholesale_A: 50,000
  //   Wholesale_A owes Vendor_D:   20,000
  //   Vendor_D owes Retailer_B:    25,000
  //   Netting clears min(50000, 20000, 25000) = 20,000!
  const crawfordActiveDebtsConfig = [
    // 3-Cycle edges
    { debtor: 'Retailer_B', creditor: 'Wholesale_A', amount: 50000, dueDelta: -5, note: 'Quarterly fruit inventory invoice #INV-401' },
    { debtor: 'Vendor_D', creditor: 'Retailer_B', amount: 25000, dueDelta: +2, note: 'Vegetable crate delivery invoice #INV-402' },
    { debtor: 'Wholesale_A', creditor: 'Vendor_D', amount: 20000, dueDelta: -8, note: 'Cold storage rental advance #INV-403' },
    // Other Crawford Market edges
    { debtor: 'Supplier_C', creditor: 'Wholesale_A', amount: 10000, dueDelta: +2, note: 'Spice lot batch #440' },
    { debtor: 'Logistics_E', creditor: 'Supplier_C', amount: 15000, dueDelta: -3, note: 'Diesel surcharge & transit invoice' },
    { debtor: 'Supplier_C', creditor: 'Logistics_E', amount: 15000, dueDelta: +14, note: 'Packaging crate deposit return' },
    { debtor: 'Stall_G', creditor: 'Farmer_F', amount: 5000, dueDelta: +7, note: 'Direct farm produce dispatch' },
    { debtor: 'Buyer_H', creditor: 'Stall_G', amount: 4000, dueDelta: +10, note: 'Weekly retail supply' },
    { debtor: 'Farmer_F', creditor: 'Buyer_H', amount: 4500, dueDelta: +21, note: 'Organic seed stock preorder' },
  ];

  const crawfordActiveDebts = await Debt.insertMany(
    crawfordActiveDebtsConfig.map((cfg) => {
      const debtorId = nameToId.get(cfg.debtor)!;
      const creditorId = nameToId.get(cfg.creditor)!;
      const dueDate = new Date(now.getTime() + cfg.dueDelta * dayMs);

      return {
        groupId: crawfordGroup._id,
        debtorId,
        creditorId,
        amount: cfg.amount,
        originalAmount: cfg.amount,
        dueDate,
        note: cfg.note,
        status: 'active' as const,
        confirmedBy: creditorId,
        createdBy: debtorId,
        version: 0,
        createdAt: new Date(now.getTime() - 15 * dayMs),
      };
    }),
  );

  // ── 5. Create Pending Debt Requests Awaiting Approval (BE-37) ──────────────
  const crawfordPendingDebts = await Debt.insertMany([
    {
      groupId: crawfordGroup._id,
      debtorId: stallG._id,
      creditorId: farmerF._id,
      amount: 7500,
      originalAmount: 7500,
      dueDate: new Date(now.getTime() + 15 * dayMs),
      note: 'Harvest season bulk onion crates - awaiting confirmation',
      status: 'pending' as const,
      confirmedBy: null,
      createdBy: farmerF._id, // Farmer_F requested, awaiting Stall_G counterparty confirmation
      version: 0,
      createdAt: new Date(now.getTime() - 1 * dayMs),
    },
    {
      groupId: crawfordGroup._id,
      debtorId: vendorD._id,
      creditorId: retailerB._id,
      amount: 12000,
      originalAmount: 12000,
      dueDate: new Date(now.getTime() + 30 * dayMs),
      note: 'Special festival consignment advance - awaiting approval',
      status: 'pending' as const,
      confirmedBy: null,
      createdBy: retailerB._id, // Retailer_B created, awaiting Vendor_D confirmation
      version: 0,
      createdAt: new Date(now.getTime() - 2 * dayMs),
    },
  ]);
  log(`✅ Created ${crawfordActiveDebts.length} active and ${crawfordPendingDebts.length} pending debts in Crawford Market.`);

  // ── 6. Create Debts for Supplier Circle (Active + Pending) ──────────────────
  const supplierCircleDebts = await Debt.insertMany([
    {
      groupId: supplierCircleGroup._id,
      debtorId: supplierC._id,
      creditorId: wholesaleA._id,
      amount: 12000,
      originalAmount: 12000,
      dueDate: new Date(now.getTime() + 2 * dayMs), // Due in 2 days
      note: 'Supplier Circle wholesale spices advance',
      status: 'active' as const,
      confirmedBy: wholesaleA._id,
      createdBy: supplierC._id,
      version: 0,
      createdAt: new Date(now.getTime() - 10 * dayMs),
    },
    {
      groupId: supplierCircleGroup._id,
      debtorId: logisticsE._id,
      creditorId: supplierC._id,
      amount: 8000,
      originalAmount: 8000,
      dueDate: new Date(now.getTime() - 4 * dayMs), // Overdue by 4 days
      note: 'Supplier Circle freight fees',
      status: 'active' as const,
      confirmedBy: supplierC._id,
      createdBy: logisticsE._id,
      version: 0,
      createdAt: new Date(now.getTime() - 8 * dayMs),
    },
    {
      groupId: supplierCircleGroup._id,
      debtorId: wholesaleA._id,
      creditorId: logisticsE._id,
      amount: 6000,
      originalAmount: 6000,
      dueDate: new Date(now.getTime() + 15 * dayMs), // Future
      note: 'Supplier Circle loading equipment maintenance',
      status: 'active' as const,
      confirmedBy: logisticsE._id,
      createdBy: wholesaleA._id,
      version: 0,
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      groupId: supplierCircleGroup._id,
      debtorId: logisticsE._id,
      creditorId: supplierC._id,
      amount: 4500,
      originalAmount: 4500,
      dueDate: new Date(now.getTime() + 20 * dayMs),
      note: 'Pallet return freight charge - pending approval',
      status: 'pending' as const,
      confirmedBy: null,
      createdBy: supplierC._id,
      version: 0,
      createdAt: new Date(now.getTime() - 1 * dayMs),
    },
  ]);
  log(`✅ Created ${supplierCircleDebts.length} debts for Supplier Circle.`);

  // ── 7. Create PaymentEvents history for Risk Scoring (BE-37) ───────────────
  const supplierCDebt = crawfordActiveDebts.find((d) => d.debtorId.toString() === supplierC._id.toString()) || crawfordActiveDebts[3];
  const vendorDDebt = crawfordActiveDebts.find((d) => d.debtorId.toString() === vendorD._id.toString()) || crawfordActiveDebts[1];
  const wholesaleADebt = crawfordActiveDebts.find((d) => d.debtorId.toString() === wholesaleA._id.toString()) || crawfordActiveDebts[2];
  const logisticsEDebt = crawfordActiveDebts.find((d) => d.debtorId.toString() === logisticsE._id.toString()) || crawfordActiveDebts[4];

  const paymentEventsToInsert: any[] = [];

  // 7a. Wholesale_A: 12 months on-time (baseline anchor)
  for (let m = 12; m >= 1; m--) {
    const due = new Date(now.getFullYear(), now.getMonth() - m, 5);
    paymentEventsToInsert.push({
      groupId: crawfordGroup._id,
      merchantId: wholesaleA._id,
      debtId: wholesaleADebt._id,
      dueDate: due,
      paidDate: due,
      wasLate: false,
      delayDays: 0,
      amount: 10000,
      createdAt: due,
    });
  }

  // 7b. Logistics_E: 4 months on-time
  for (let m = 4; m >= 1; m--) {
    const due = new Date(now.getFullYear(), now.getMonth() - m, 12);
    paymentEventsToInsert.push({
      groupId: crawfordGroup._id,
      merchantId: logisticsE._id,
      debtId: logisticsEDebt._id,
      dueDate: due,
      paidDate: due,
      wasLate: false,
      delayDays: 0,
      amount: 8000,
      createdAt: due,
    });
  }

  // 7c. Vendor_D: 6 months (3 late [14d, 18d, 12d], 3 on-time) -> MEDIUM risk
  const vendorDHistories = [
    { monthsAgo: 6, wasLate: true, delayDays: 14, amount: 6000 },
    { monthsAgo: 5, wasLate: true, delayDays: 18, amount: 7500 },
    { monthsAgo: 4, wasLate: false, delayDays: 0, amount: 5000 },
    { monthsAgo: 3, wasLate: false, delayDays: 0, amount: 8000 },
    { monthsAgo: 2, wasLate: true, delayDays: 12, amount: 6500 },
    { monthsAgo: 1, wasLate: false, delayDays: 0, amount: 7000 },
  ];
  for (const item of vendorDHistories) {
    const due = new Date(now.getFullYear(), now.getMonth() - item.monthsAgo, 15);
    const paid = new Date(due.getTime() + item.delayDays * dayMs);
    paymentEventsToInsert.push({
      groupId: crawfordGroup._id,
      merchantId: vendorD._id,
      debtId: vendorDDebt._id,
      dueDate: due,
      paidDate: paid,
      wasLate: item.wasLate,
      delayDays: item.delayDays,
      amount: item.amount,
      createdAt: paid,
    });
  }

  // 7d. Supplier_C: 8 months (ALL late, severe delays, 3 defaults > 60d) -> CRITICAL risk (z > 3, p < 0.05)
  const supplierCHistories = [
    { monthsAgo: 8, wasLate: true, delayDays: 75, amount: 15000 }, // Default (> 60d)
    { monthsAgo: 7, wasLate: true, delayDays: 45, amount: 14000 },
    { monthsAgo: 6, wasLate: true, delayDays: 80, amount: 18000 }, // Default (> 60d)
    { monthsAgo: 5, wasLate: true, delayDays: 35, amount: 11000 },
    { monthsAgo: 4, wasLate: true, delayDays: 65, amount: 16000 }, // Default (> 60d)
    { monthsAgo: 3, wasLate: true, delayDays: 50, amount: 15000 },
    { monthsAgo: 2, wasLate: true, delayDays: 20, amount: 10000 },
    { monthsAgo: 1, wasLate: true, delayDays: 30, amount: 12000 },
  ];
  for (const item of supplierCHistories) {
    const due = new Date(now.getFullYear(), now.getMonth() - item.monthsAgo, 10);
    const paid = new Date(due.getTime() + item.delayDays * dayMs);
    paymentEventsToInsert.push({
      groupId: crawfordGroup._id,
      merchantId: supplierC._id,
      debtId: supplierCDebt._id,
      dueDate: due,
      paidDate: paid,
      wasLate: item.wasLate,
      delayDays: item.delayDays,
      amount: item.amount,
      createdAt: paid,
    });
  }

  const createdEvents = await PaymentEvent.insertMany(paymentEventsToInsert);
  log(`✅ Created ${createdEvents.length} PaymentEvent records (Supplier_C high-risk profile established).`);

  // ── 8. Seed Initial RiskAssessment Records ─────────────────────────────────
  await RiskAssessment.insertMany([
    {
      merchantId: supplierC._id,
      groupId: crawfordGroup._id.toString(),
      lambdaRate: 1.0,
      lambda: 1.0,
      riskScore: 0.88,
      riskCategory: 'CRITICAL',
      riskLabel: 'CRITICAL',
      zScore: 3.72,
      pValue: 0.0001,
      correlation: 0.45,
      coldStart: false,
      monthsObserved: 8,
      latePaymentEvents: 8,
      defaultEvents: 3,
      computedAt: now,
    },
    {
      merchantId: vendorD._id,
      groupId: crawfordGroup._id.toString(),
      lambdaRate: 0.5,
      lambda: 0.5,
      riskScore: 0.45,
      riskCategory: 'MEDIUM',
      riskLabel: 'MEDIUM',
      zScore: 0.85,
      pValue: 0.197,
      correlation: 0.2,
      coldStart: false,
      monthsObserved: 6,
      latePaymentEvents: 3,
      defaultEvents: 0,
      computedAt: now,
    },
    {
      merchantId: wholesaleA._id,
      groupId: crawfordGroup._id.toString(),
      lambdaRate: 0.0,
      lambda: 0.0,
      riskScore: 0.05,
      riskCategory: 'LOW',
      riskLabel: 'LOW',
      zScore: -1.65,
      pValue: 0.95,
      correlation: 0.0,
      coldStart: false,
      monthsObserved: 12,
      latePaymentEvents: 0,
      defaultEvents: 0,
      computedAt: now,
    },
  ]);
  log('✅ Seeded initial RiskAssessment records for Crawford Market.');

  // ── 9. Seed Notification Samples (BE-37) ───────────────────────────────────
  const notificationsToInsert = [
    // Debt Request Notification for Stall_G
    {
      groupId: crawfordGroup._id,
      merchantId: stallG._id,
      type: 'debt:requested',
      message: 'Farmer_F has requested confirmation for a new debt of ₹7,500 for "Harvest season bulk onion crates".',
      refType: 'Debt',
      refId: crawfordPendingDebts[0]._id,
      readAt: null,
      createdAt: new Date(now.getTime() - 1 * dayMs),
    },
    // Debt Request Notification for Vendor_D
    {
      groupId: crawfordGroup._id,
      merchantId: vendorD._id,
      type: 'debt:requested',
      message: 'Retailer_B requested approval for a new debt of ₹12,000 for "Special festival consignment advance".',
      refType: 'Debt',
      refId: crawfordPendingDebts[1]._id,
      readAt: null,
      createdAt: new Date(now.getTime() - 2 * dayMs),
    },
    // Overdue Debt Notification for Retailer_B
    {
      groupId: crawfordGroup._id,
      merchantId: retailerB._id,
      type: 'debt:overdue',
      message: 'Urgent: Payment obligation of ₹50,000 to Wholesale_A is 5 days overdue.',
      refType: 'Debt',
      refId: crawfordActiveDebts[0]._id,
      readAt: null,
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    // Overdue Debt Notification for Wholesale_A
    {
      groupId: crawfordGroup._id,
      merchantId: wholesaleA._id,
      type: 'debt:overdue',
      message: 'Notice: Payment obligation of ₹20,000 to Vendor_D is 8 days overdue.',
      refType: 'Debt',
      refId: crawfordActiveDebts[2]._id,
      readAt: null,
      createdAt: new Date(now.getTime() - 8 * dayMs),
    },
    // Due Soon Notification for Vendor_D
    {
      groupId: crawfordGroup._id,
      merchantId: vendorD._id,
      type: 'debt:due_soon',
      message: 'Upcoming: Debt obligation of ₹25,000 to Retailer_B is due in 2 days.',
      refType: 'Debt',
      refId: crawfordActiveDebts[1]._id,
      readAt: null,
      createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
    },
    // Risk Flag Notification for Group Owner (Wholesale_A)
    {
      groupId: crawfordGroup._id,
      merchantId: wholesaleA._id,
      type: 'risk:flagged',
      message: 'Risk Alert: Supplier_C delinquency rate has breached statistical significance (z=3.72, p<0.001, CRITICAL risk category).',
      refType: 'Merchant',
      refId: supplierC._id,
      readAt: null,
      createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    },
    // Netting Opportunity Notification for Wholesale_A
    {
      groupId: crawfordGroup._id,
      merchantId: wholesaleA._id,
      type: 'settlement:ready',
      message: 'Netting opportunity detected: 3-cycle Retailer_B → Wholesale_A → Vendor_D → Retailer_B can clear ₹20,000 with 0 cash outflow.',
      refType: 'Group',
      refId: crawfordGroup._id,
      readAt: new Date(now.getTime() - 18 * 60 * 60 * 1000),
      createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    },
  ];

  const createdNotifications = await Notification.insertMany(notificationsToInsert);
  log(`✅ Created ${createdNotifications.length} sample Notification records.`);

  // ── 10. Seed Initial AuditLog Entries ─────────────────────────────────────
  const allCrawfordDebts = [...crawfordActiveDebts, ...crawfordPendingDebts];
  const auditLogsToInsert = [
    ...allCrawfordDebts.map((d) => ({
      groupId: crawfordGroup._id,
      actorId: d.createdBy || wholesaleA._id,
      action: 'DEBT_CREATED',
      entityType: 'Debt',
      entityId: d._id,
      meta: { amount: d.amount, dueDate: d.dueDate, status: d.status },
      createdAt: d.createdAt,
    })),
    ...supplierCircleDebts.map((d) => ({
      groupId: supplierCircleGroup._id,
      actorId: d.createdBy || wholesaleA._id,
      action: 'DEBT_CREATED',
      entityType: 'Debt',
      entityId: d._id,
      meta: { amount: d.amount, dueDate: d.dueDate, status: d.status },
      createdAt: d.createdAt,
    })),
  ];

  await AuditLog.insertMany(auditLogsToInsert);
  log(`✅ Created ${auditLogsToInsert.length} initial AuditLog entries.`);

  // ── 11. Print Demo Credentials and Summary ────────────────────────────────
  if (!options.silent) {
    console.log('\n================================================================================');
    console.log('🎉 CREDITFLOW DEMO SEED COMPLETED SUCCESSFULLY');
    console.log('================================================================================');
    console.log(`Default password for all accounts: ${DEFAULT_PASSWORD}`);
    console.log('--------------------------------------------------------------------------------');
    console.log('GROUP 1: Crawford Market (Invite code: CRAWFORD)');
    console.log('  Role: Owner/Admin  → Wholesale_A  (wholesale.a@demo.com)');
    console.log('  Role: Admin        → Retailer_B   (retailer.b@demo.com)');
    console.log('  Role: High Risk    → Supplier_C   (supplier.c@demo.com) — CRITICAL (p < 0.05)');
    console.log('  Role: Member       → Vendor_D     (vendor.d@demo.com)     — Medium Risk');
    console.log('  Role: Member       → Logistics_E  (logistics.e@demo.com)');
    console.log('  Role: Member       → Farmer_F     (farmer.f@demo.com)');
    console.log('  Role: Member       → Stall_G      (stall.g@demo.com)');
    console.log('  Role: Member       → Buyer_H      (buyer.h@demo.com)');
    console.log('--------------------------------------------------------------------------------');
    console.log('GROUP 2: Supplier Circle (Invite code: SUPPLIER)');
    console.log('  Members: Wholesale_A (owner), Supplier_C (admin), Logistics_E (member)');
    console.log('--------------------------------------------------------------------------------');
    console.log('KEY DEMO SCENARIOS PREPARED:');
    console.log('  1. 3-Cycle Netting: Retailer_B (50k) → Wholesale_A (20k) → Vendor_D (25k) → Retailer_B');
    console.log('     Click "Settle" → Netting clears ₹20,000 from the network with 0 cash transferred!');
    console.log('  2. Hypothesis Z-Test Risk: Supplier_C has 8 late events (p < 0.001, CRITICAL risk).');
    console.log('  3. Pending Approvals: Farmer_F requested ₹7,500 from Stall_G; Vendor_D has ₹12,000 request.');
    console.log('  4. Overdue Debts: Retailer_B (-5d), Wholesale_A (-8d), Logistics_E (-3d).');
    console.log('================================================================================\n');
  }

  if (options.disconnectOnFinish) {
    await mongoose.disconnect();
  }

  return {
    merchantsCount: merchantDocs.length,
    groupsCount: 2,
    debtsCount: allCrawfordDebts.length + supplierCircleDebts.length,
    pendingDebtsCount: crawfordPendingDebts.length + 1,
    paymentEventsCount: createdEvents.length,
    notificationsCount: createdNotifications.length,
    crawfordGroupId: crawfordGroup._id.toString(),
    supplierGroupId: supplierCircleGroup._id.toString(),
    merchants: merchantDocs.map((m) => ({
      name: m.name,
      email: m.email,
      role: m.name === 'Wholesale_A' ? 'owner' : m.name === 'Retailer_B' ? 'admin' : 'member',
    })),
  };
}
