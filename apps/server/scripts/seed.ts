/**
 * seed.ts — Seeds MongoDB with Crawford Market & Supplier Circle datasets
 *
 * Usage: npm run seed
 *
 * Creates:
 *  1. 8 merchant accounts with default password CreditFlow@123
 *  2. Crawford Market group with all 8 merchants
 *  3. Supplier Circle group with Wholesale_A, Supplier_C, Logistics_E
 *  4. Debts stamped with groupId and varied dueDates (overdue, due in 2 days, future)
 *  5. PaymentEvents history for Vendor_D and Supplier_C consistent with seed_data.json
 *  6. Initial AuditLog entries
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

// Models
import { Merchant } from '../src/models/Merchant';
import { Debt } from '../src/models/Debt';
import { RiskAssessment } from '../src/models/RiskAssessment';
import { Settlement } from '../src/models/Settlement';
import { Group, Membership } from '../src/models/Group';
import { Payment } from '../src/models/Payment';
import { PaymentEvent } from '../src/models/PaymentEvent';
import { AuditLog } from '../src/models/AuditLog';
import { IdempotencyRecord } from '../src/models/Idempotency';
import { Notification } from '../src/models/Notification';

// Load seed data from repo root
const seedDataPath = path.resolve(__dirname, '../../../seed_data.json');
const seedData = JSON.parse(fs.readFileSync(seedDataPath, 'utf-8'));

const DEFAULT_PASSWORD = 'CreditFlow@123';

async function seed(): Promise<void> {
  const MONGO_URI = process.env.MONGO_URI as string;

  console.log('🌱 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected.');

  // ── Clear existing data ──────────────────────────────────────────────────
  console.log('🗑  Clearing existing data across all collections...');
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
  console.log('   Done.');

  // ── Create merchants ─────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const merchantDocs = await Merchant.insertMany(
    (seedData.merchants as string[]).map((name: string) => ({
      name,
      email: `${name.toLowerCase().replace(/_/g, '.')}@demo.com`,
      passwordHash,
      riskProfile: {
        riskScore: 0,
        riskCategory: 'UNKNOWN',
        lastUpdated: new Date(),
      },
    })),
  );

  console.log(`✅ Created ${merchantDocs.length} merchants:`);
  merchantDocs.forEach((m) =>
    console.log(`   ${m.name}  →  ${m.email}  (password: ${DEFAULT_PASSWORD})`),
  );

  const nameToId = new Map<string, mongoose.Types.ObjectId>();
  const nameToDoc = new Map<string, any>();
  merchantDocs.forEach((m) => {
    nameToId.set(m.name, m._id as mongoose.Types.ObjectId);
    nameToDoc.set(m.name, m);
  });

  const wholesaleA = nameToDoc.get('Wholesale_A');
  const supplierC = nameToDoc.get('Supplier_C');
  const logisticsE = nameToDoc.get('Logistics_E');
  const vendorD = nameToDoc.get('Vendor_D');

  if (!wholesaleA) throw new Error('Wholesale_A not found in seed merchants');

  // ── 1. Create Crawford Market group (all 8 merchants) ─────────────────────
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
  console.log(`✅ Created group "${crawfordGroup.name}" (ID: ${crawfordGroup._id}) with ${merchantDocs.length} members.`);

  // ── 2. Create Supplier Circle group (Wholesale_A, Supplier_C, Logistics_E) ─
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
  console.log(`✅ Created group "${supplierCircleGroup.name}" (ID: ${supplierCircleGroup._id}) with 3 members.`);

  // ── 3. Create Debts for Crawford Market with varied due dates ───────────────
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // Staggered due dates: some overdue, some due in 2 days, some future
  const crawfordDebtConfigs = [
    // 0: Retailer_B -> Wholesale_A : 50,000 (Overdue: -5 days)
    { debtor: 'Retailer_B', creditor: 'Wholesale_A', amount: 50000, dueDelta: -5, note: 'Quarterly fruit inventory invoice' },
    // 1: Vendor_D -> Retailer_B : 25,000 (Due in 2 days: +2 days)
    { debtor: 'Vendor_D', creditor: 'Retailer_B', amount: 25000, dueDelta: +2, note: 'Vegetable crate delivery' },
    // 2: Wholesale_A -> Vendor_D : 20,000 (Overdue: -8 days)
    { debtor: 'Wholesale_A', creditor: 'Vendor_D', amount: 20000, dueDelta: -8, note: 'Cold storage rental advance' },
    // 3: Supplier_C -> Wholesale_A : 10,000 (Due in 2 days: +2 days)
    { debtor: 'Supplier_C', creditor: 'Wholesale_A', amount: 10000, dueDelta: +2, note: 'Spice lot batch #440' },
    // 4: Logistics_E -> Supplier_C : 15,000 (Overdue: -3 days)
    { debtor: 'Logistics_E', creditor: 'Supplier_C', amount: 15000, dueDelta: -3, note: 'Diesel surcharge & transit' },
    // 5: Supplier_C -> Logistics_E : 15,000 (Future: +14 days)
    { debtor: 'Supplier_C', creditor: 'Logistics_E', amount: 15000, dueDelta: +14, note: 'Packaging crate deposit return' },
    // 6: Stall_G -> Farmer_F : 5,000 (Future: +7 days)
    { debtor: 'Stall_G', creditor: 'Farmer_F', amount: 5000, dueDelta: +7, note: 'Direct farm produce dispatch' },
    // 7: Buyer_H -> Stall_G : 4,000 (Future: +10 days)
    { debtor: 'Buyer_H', creditor: 'Stall_G', amount: 4000, dueDelta: +10, note: 'Weekly retail supply' },
    // 8: Farmer_F -> Buyer_H : 4,500 (Future: +21 days)
    { debtor: 'Farmer_F', creditor: 'Buyer_H', amount: 4500, dueDelta: +21, note: 'Organic seed stock preorder' },
  ];

  const crawfordDebts = await Debt.insertMany(
    crawfordDebtConfigs.map((cfg) => {
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
  console.log(`✅ Created ${crawfordDebts.length} debts for Crawford Market.`);

  // ── 4. Create Debts for Supplier Circle ─────────────────────────────────────
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
  ]);
  console.log(`✅ Created ${supplierCircleDebts.length} debts for Supplier Circle.`);

  // ── 5. Create PaymentEvents history matching seed_data.json risk_histories ─
  // Vendor_D history: 6 months (late, late, ontime, ontime, late, ontime)
  const vendorDDebt = crawfordDebts.find(
    (d) => d.debtorId.toString() === vendorD._id.toString(),
  ) || crawfordDebts[1];

  const vendorDHistories = [
    { monthsAgo: 6, wasLate: true, delayDays: 14, amount: 6000 },
    { monthsAgo: 5, wasLate: true, delayDays: 18, amount: 7500 },
    { monthsAgo: 4, wasLate: false, delayDays: 0, amount: 5000 },
    { monthsAgo: 3, wasLate: false, delayDays: 0, amount: 8000 },
    { monthsAgo: 2, wasLate: true, delayDays: 12, amount: 6500 },
    { monthsAgo: 1, wasLate: false, delayDays: 0, amount: 7000 },
  ];

  const paymentEventsToInsert = [];

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

  // Supplier_C history: 3 months (default [delay > 60], late, late)
  const supplierCDebt = crawfordDebts.find(
    (d) => d.debtorId.toString() === supplierC._id.toString(),
  ) || crawfordDebts[3];

  const supplierCHistories = [
    { monthsAgo: 3, wasLate: true, delayDays: 75, amount: 15000 }, // > 60 triggers default: true
    { monthsAgo: 2, wasLate: true, delayDays: 20, amount: 10000 },
    { monthsAgo: 1, wasLate: true, delayDays: 15, amount: 12000 },
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

  // Wholesale_A: 12 months on-time
  const wholesaleADebt = crawfordDebts.find(
    (d) => d.debtorId.toString() === wholesaleA._id.toString(),
  ) || crawfordDebts[2];

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

  const createdEvents = await PaymentEvent.insertMany(paymentEventsToInsert);
  console.log(`✅ Created ${createdEvents.length} PaymentEvent records for risk histories.`);

  // ── 6. Create Initial AuditLog entries ────────────────────────────────────
  const auditLogsToInsert = [
    ...crawfordDebts.map((d) => ({
      groupId: crawfordGroup._id,
      actorId: d.createdBy || wholesaleA._id,
      action: 'DEBT_CREATED',
      entityType: 'Debt',
      entityId: d._id,
      meta: { amount: d.amount, dueDate: d.dueDate },
      createdAt: d.createdAt,
    })),
    ...supplierCircleDebts.map((d) => ({
      groupId: supplierCircleGroup._id,
      actorId: d.createdBy || wholesaleA._id,
      action: 'DEBT_CREATED',
      entityType: 'Debt',
      entityId: d._id,
      meta: { amount: d.amount, dueDate: d.dueDate },
      createdAt: d.createdAt,
    })),
  ];

  await AuditLog.insertMany(auditLogsToInsert);
  console.log(`✅ Created ${auditLogsToInsert.length} initial AuditLog entries.`);

  await mongoose.disconnect();
  console.log('\n🌱 Seed complete! Database is ready.');
  console.log('   Default password for all accounts: CreditFlow@123');
  console.log('   Crawford Market invite code: CRAWFORD');
  console.log('   Supplier Circle invite code: SUPPLIER');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});

