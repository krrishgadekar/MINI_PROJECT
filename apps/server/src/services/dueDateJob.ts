import cron, { ScheduledTask } from 'node-cron';
import { Debt } from '../models/Debt';
import { Notification } from '../models/Notification';
import { notify } from '../utils/notify';

export interface DueDateJobSummary {
  dueSoonCount: number;
  overdueCount: number;
  notificationsCreated: number;
}

/**
 * Checks for debts due within 3 days and overdue debts,
 * creating reminder notifications deduplicated per calendar day.
 */
export const runDueDateJob = async (): Promise<DueDateJobSummary> => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Find all active debts that have a dueDate
  const activeDebts = await Debt.find({
    status: 'active',
    dueDate: { $exists: true, $ne: null },
  }).populate('debtorId creditorId');

  let dueSoonCount = 0;
  let overdueCount = 0;
  let notificationsCreated = 0;

  for (const debt of activeDebts) {
    if (!debt.dueDate) continue;
    const dueDate = new Date(debt.dueDate);
    const debtorId = (debt.debtorId as any)?._id?.toString() || (debt.debtorId as any)?.toString();
    const creditorId = (debt.creditorId as any)?._id?.toString() || (debt.creditorId as any)?.toString();
    const groupId = (debt as any).groupId?.toString() || '';

    if (!debtorId) continue;

    // Case 1: Overdue
    if (dueDate < now) {
      overdueCount++;

      // Check deduplication for today
      const alreadySent = await Notification.findOne({
        refType: 'debt',
        refId: debt._id,
        type: 'debt:overdue',
        createdAt: { $gte: startOfToday },
      });

      if (!alreadySent) {
        const recipients = creditorId ? [debtorId, creditorId] : [debtorId];
        const res = await notify(
          groupId,
          recipients,
          'debt:overdue',
          `Payment of ₹${debt.amount.toLocaleString()} is overdue since ${dueDate.toLocaleDateString()}.`,
          { refType: 'debt', refId: debt._id.toString() },
        );
        notificationsCreated += res.length;
      }
    }
    // Case 2: Due in 3 days
    else if (dueDate <= threeDaysFromNow) {
      dueSoonCount++;

      const alreadySent = await Notification.findOne({
        merchantId: debtorId,
        refType: 'debt',
        refId: debt._id,
        type: 'debt:due_soon',
        createdAt: { $gte: startOfToday },
      });

      if (!alreadySent) {
        const res = await notify(
          groupId,
          debtorId,
          'debt:due_soon',
          `Reminder: Payment of ₹${debt.amount.toLocaleString()} is due on ${dueDate.toLocaleDateString()}.`,
          { refType: 'debt', refId: debt._id.toString() },
        );
        notificationsCreated += res.length;
      }
    }
  }

  return {
    dueSoonCount,
    overdueCount,
    notificationsCreated,
  };
};

let scheduledTask: ScheduledTask | null = null;

export const startDueDateScheduler = (): void => {
  if (process.env.CRON_ENABLED === 'false') {
    console.log('⏰ Due-date cron scheduler disabled by CRON_ENABLED=false');
    return;
  }

  // Run hourly: at minute 0 of every hour
  scheduledTask = cron.schedule('0 * * * *', async () => {
    try {
      console.log('⏰ Running due-date reminder job...');
      const summary = await runDueDateJob();
      console.log(`⏰ Due-date job finished: ${summary.notificationsCreated} notifications dispatched.`);
    } catch (err) {
      console.error('Error executing due-date reminder cron job:', err);
    }
  });

  console.log('⏰ Due-date reminder cron scheduler started (runs hourly)');
};

export const stopDueDateScheduler = (): void => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
};
