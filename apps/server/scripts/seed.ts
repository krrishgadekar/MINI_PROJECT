/**
 * seed.ts — CLI script runner for seedDatabase (BE-37)
 *
 * Usage: npm run seed
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { seedDatabase, DEFAULT_PASSWORD, SeedResult } from '../src/services/seedService';

export { seedDatabase, DEFAULT_PASSWORD, SeedResult };

if (require.main === module) {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/creditflow';
  mongoose
    .connect(MONGO_URI)
    .then(() => seedDatabase({ disconnectOnFinish: true }))
    .catch((err) => {
      console.error('❌ Seed execution failed:', err);
      mongoose.disconnect().finally(() => process.exit(1));
    });
}
