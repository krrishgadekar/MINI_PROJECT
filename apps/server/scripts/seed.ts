/**
 * seed.ts — Seeds MongoDB with the Crawford Market dataset from seed_data.json
 *
 * Usage: npm run seed
 *
 * What it does:
 *  1. Connects to MongoDB
 *  2. Clears existing Merchants, Debts, RiskAssessments
 *  3. Creates 8 merchant accounts with auto-generated emails and default password
 *  4. Creates 9 debt edges between them
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
  console.log('🗑  Clearing existing data...');
  await Promise.all([
    Merchant.deleteMany({}),
    Debt.deleteMany({}),
    RiskAssessment.deleteMany({}),
    Settlement.deleteMany({}),
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

  // Build a name → ObjectId map for wiring up debts
  const nameToId = new Map<string, mongoose.Types.ObjectId>();
  merchantDocs.forEach((m) => nameToId.set(m.name, m._id as mongoose.Types.ObjectId));

  // ── Create debts ─────────────────────────────────────────────────────────
  const debtDocs = await Debt.insertMany(
    (seedData.debts as Array<{ debtor: string; creditor: string; amount: number }>).map((d) => ({
      debtorId: nameToId.get(d.debtor),
      creditorId: nameToId.get(d.creditor),
      amount: d.amount,
      originalAmount: d.amount,
      status: 'active',
    })),
  );

  console.log(`\n✅ Created ${debtDocs.length} debt edges.`);

  await mongoose.disconnect();
  console.log('\n🌱 Seed complete! Database is ready.');
  console.log('   Start the server with: npm run dev');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
