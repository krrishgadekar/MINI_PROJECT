import mongoose from 'mongoose';
import { AuditLog, IAuditLog } from '../models/AuditLog';

export interface AuditReq {
  groupId?: string | mongoose.Types.ObjectId;
  merchant?: {
    _id: any;
  } | any;
  headers?: any;
}

export async function audit(
  req: AuditReq,
  action: string,
  entityType: string,
  entityId: string | mongoose.Types.ObjectId,
  meta?: Record<string, unknown>,
): Promise<IAuditLog | null> {
  try {
    const rawGroupId = req.groupId || (req.headers && req.headers['x-group-id']);
    const rawActorId = req.merchant?._id;

    if (!rawGroupId || !rawActorId) {
      return null;
    }

    const groupId = new mongoose.Types.ObjectId(rawGroupId.toString());
    const actorId = new mongoose.Types.ObjectId(rawActorId.toString());

    const log = await AuditLog.create({
      groupId,
      actorId,
      action,
      entityType,
      entityId,
      meta,
    });

    return log;
  } catch (err) {
    console.error('Failed to write audit log:', err);
    return null;
  }
}
