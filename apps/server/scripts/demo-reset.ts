/**
 * demo-reset.ts — Re-seeds MongoDB with clean demo datasets (Rule 8 compliant).
 *
 * Usage:
 *   npm run demo:reset
 *   npm run demo:reset -- -y  (non-interactive bypass)
 */

import 'dotenv/config';
import readline from 'readline';
import mongoose from 'mongoose';
import { seedDatabase, SeedResult } from '../src/services/seedService';

async function confirmAndReset(): Promise<void> {
  const isForce =
    process.argv.includes('-y') ||
    process.argv.includes('--yes') ||
    process.argv.includes('--force') ||
    process.env.FORCE_RESET === 'true' ||
    !process.stdin.isTTY;

  if (!isForce) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        '\n⚠️  [Rule 8 Confirmation Required]\nAre you sure you want to reset the demo database?\nThis will re-seed Crawford Market & Supplier Circle demo data and reset all debts/settlements.\nProceed with reset? (y/N): ',
        (ans) => {
          rl.close();
          resolve(ans.trim().toLowerCase());
        },
      );
    });

    if (answer !== 'y' && answer !== 'yes') {
      console.log('\n❌ Demo database reset cancelled by user.\n');
      process.exit(0);
    }
  }

  console.log('\n🔄 Connecting to MongoDB and re-seeding demo database...');
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/creditflow';
  let isMemory = false;
  
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2500 });
  } catch (err: any) {
    console.warn(`⚠️  Could not connect to MongoDB at ${MONGO_URI}. Booting in-memory MongoDB for verification...`);
    const { createMemoryServer } = await import('../tests/setup');
    const mongoServer = await createMemoryServer();
    await mongoose.connect(mongoServer.getUri());
    isMemory = true;
  }

  const result: SeedResult = await seedDatabase({ disconnectOnFinish: true, silent: false });
  console.log('\n✨ Demo database successfully reset!');
  console.log(`   - Target:    ${isMemory ? 'In-Memory Mongo (Standalone Test)' : MONGO_URI}`);
  console.log(`   - Merchants: ${result.merchantsCount}`);
  console.log(`   - Groups:    ${result.groupsCount}`);
  console.log(`   - Debts:     ${result.debtsCount} active + ${result.pendingDebtsCount} pending`);
  console.log(`   - Groups:    Crawford Market (${result.crawfordGroupId}), Supplier Circle (${result.supplierGroupId})\n`);
}

confirmAndReset().catch((err) => {
  console.error('❌ Failed to reset demo database:', err);
  process.exit(1);
});
