import mongoose, { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { NotificationPreference } from '../models/NotificationPreference';
import { deliveryService } from '../services/deliveryService';

export interface NotificationRef {
  refType?: string;
  refId?: string;
}

const TYPE_MAPPING: Record<string, string> = {
  'debt:requested': 'debtRequested',
  'debt:confirmed': 'debtConfirmed',
  'debt:rejected': 'debtRejected',
  'debt:disputed': 'debtDisputed',
  'payment:recorded': 'paymentRecorded',
  'settlement:ready': 'settlementReady',
  'settlement:confirmed': 'settlementConfirmed',
  'cycle:netted': 'cycleNetted',
  'settlement:cycle_netted': 'cycleNetted',
  'risk:flagged': 'riskFlagged',
  'debt:overdue': 'debtOverdue',
  'debt:due_soon': 'debtDueSoon',
  'digest:overdue': 'digest',
};

export const isQuietHoursActive = (startHour: number, endHour: number, now = new Date()): boolean => {
  const currentHour = now.getHours();
  if (startHour === endHour) return false;
  if (startHour > endHour) {
    return currentHour >= startHour || currentHour < endHour;
  } else {
    return currentHour >= startHour && currentHour < endHour;
  }
};

/**
 * notify — Utility to persist notification(s) and deliver them in real-time
 * via Socket.io directly to recipient merchant rooms, adhering to merchant
 * notification preferences and quiet hours.
 */
export const notify = async (
  groupId: string,
  merchantIds: string | string[],
  type: string,
  message: string,
  ref?: NotificationRef,
): Promise<any[]> => {
  const recipients = Array.isArray(merchantIds) ? merchantIds : [merchantIds];
  const created: any[] = [];

  for (const merchantId of recipients) {
    if (!merchantId) continue;

    try {
      if (mongoose.connection && mongoose.connection.readyState !== 1) {
        await deliveryService.dispatch({
          id: new Types.ObjectId().toString(),
          groupId,
          merchantId,
          type,
          message,
          refType: ref?.refType,
          refId: ref?.refId,
          createdAt: new Date(),
        });
        continue;
      }

      // Check merchant preferences if available
      let pref: any = null;
      if (Types.ObjectId.isValid(merchantId)) {
        pref = await NotificationPreference.findOne({ merchantId: new Types.ObjectId(merchantId) }).lean();
      }

      // 1. Filter by notification type preferences
      const prefKey = TYPE_MAPPING[type];
      if (pref && prefKey && pref.types && pref.types[prefKey] === false) {
        continue; // Merchant has muted this notification type
      }

      // 2. Check quiet hours (critical risk alerts bypass quiet hours)
      const isCritical = type === 'risk:flagged';
      const isQuiet =
        !isCritical &&
        pref?.quietHours?.enabled &&
        isQuietHoursActive(pref.quietHours.startHour, pref.quietHours.endHour);

      const docData: any = {
        merchantId: new Types.ObjectId(merchantId),
        type,
        message,
        readAt: null,
      };

      if (groupId && Types.ObjectId.isValid(groupId)) {
        docData.groupId = new Types.ObjectId(groupId);
      }

      if (ref?.refType) {
        docData.refType = ref.refType;
      }

      if (ref?.refId && Types.ObjectId.isValid(ref.refId)) {
        docData.refId = new Types.ObjectId(ref.refId);
      }

      const notifDoc = await Notification.create(docData);
      created.push(notifDoc);

      // 3. Multi-channel dispatch (In-App, Email stub, Webhook) respecting quiet hours
      await deliveryService.dispatch(
        {
          id: notifDoc.id,
          groupId,
          merchantId,
          type,
          message,
          refType: ref?.refType,
          refId: ref?.refId,
          createdAt: notifDoc.createdAt,
        },
        {
          channels: isQuiet ? { inApp: false, email: false, webhook: false } : pref?.channels,
          webhookUrl: pref?.webhookUrl,
          email: pref?.email,
        }
      );
    } catch (err) {
      console.error(`Failed to dispatch notification to merchant ${merchantId}:`, err);
    }
  }

  return created;
};
