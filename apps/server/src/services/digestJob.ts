import cron, { ScheduledTask } from 'node-cron';
import { Debt } from '../models/Debt';
import { notify } from '../utils/notify';

export interface DigestJobSummary {
  merchantsNotified: number;
  totalOverdueDebts: number;
  totalOverdueAmount: number;
}

/**
 * runDigestJob — Daily notification digest summarising overdue items per merchant.
 * Groups all overdue active debts by debtor and dispatches a single aggregated
 * digest notification per debtor with total debt count and volume.
 */
export const runDigestJob = async (): Promise<DigestJobSummary> => {
  const now = new Date();

  // Find all active debts past due date
  const overdueDebts = await Debt.find({
    status: 'active',
    dueDate: { $exists: true, $lt: now },
  });

  const debtorMap = new Map<string, { count: number; totalAmount: number; groupId: string }>();

  for (const debt of overdueDebts) {
    const debtorId = debt.debtorId?.toString();
    const groupId = debt.groupId?.toString() || '';
    if (!debtorId) continue;

    if (!debtorMap.has(debtorId)) {
      debtorMap.set(debtorId, { count: 0, totalAmount: 0, groupId });
    }

    const item = debtorMap.get(debtorId)!;
    item.count += 1;
    item.totalAmount += debt.amount || 0;
  }

  let merchantsNotified = 0;
  let totalOverdueDebts = 0;
  let totalOverdueAmount = 0;

  for (const [debtorId, stats] of debtorMap.entries()) {
    try {
      await notify(
        stats.groupId,
        debtorId,
        'digest:overdue',
        `Daily Digest: You have ${stats.count} overdue payment obligation(s) totalling ₹${stats.totalAmount.toLocaleString()}.`,
        { refType: 'debt' }
      );
      merchantsNotified++;
      totalOverdueDebts += stats.count;
      totalOverdueAmount += stats.totalAmount;
    } catch (err: any) {
      console.error(`Failed to send digest to debtor ${debtorId}:`, err.message);
    }
  }

  return {
    merchantsNotified,
    totalOverdueDebts,
    totalOverdueAmount,
  };
};

let digestCronTask: ScheduledTask | null = null;

/**
 * Initializes the daily digest cron job if CRON_ENABLED is set to 'true'.
 * Default: runs daily at 09:00 AM ('0 9 * * *').
 */
export const initDigestCron = (): ScheduledTask | null => {
  if (process.env.CRON_ENABLED !== 'true') {
    return null;
  }

  // Schedule daily at 9:00 AM
  digestCronTask = cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Running daily overdue notification digest cron job...');
    try {
      const summary = await runDigestJob();
      console.log('   ↳ Daily digest completed:', summary);
    } catch (err) {
      console.error('   ↳ Error in daily digest cron job:', err);
    }
  });

  console.log('⏰ Daily notification digest cron job initialized (09:00 AM daily).');
  return digestCronTask;
};

export const stopDigestCron = (): void => {
  if (digestCronTask) {
    digestCronTask.stop();
    digestCronTask = null;
  }
};
