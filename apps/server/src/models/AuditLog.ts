import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  groupId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: string;
  entityType: string;
  entityId: Types.ObjectId | string;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.Mixed, required: true, index: true },
    meta: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  },
);

AuditLogSchema.index({ groupId: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ groupId: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
