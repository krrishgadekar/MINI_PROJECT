import { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { emitToMerchant } from '../realtime/socket';

export interface NotificationRef {
  refType?: string;
  refId?: string;
}

/**
 * notify — Utility to persist notification(s) and deliver them in real-time
 * via Socket.io directly to recipient merchant rooms.
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

      // Deliver realtime event to merchant room
      emitToMerchant(merchantId, 'notification:new', {
        id: notifDoc.id,
        groupId,
        merchantId,
        type,
        message,
        refType: ref?.refType,
        refId: ref?.refId,
        readAt: null,
        createdAt: notifDoc.createdAt,
      });
    } catch (err) {
      console.error(`Failed to dispatch notification to merchant ${merchantId}:`, err);
    }
  }

  return created;
};
