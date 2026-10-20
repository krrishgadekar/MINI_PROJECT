import { Schema, model, Document, Types } from 'mongoose';

export interface ISession extends Document {
  merchantId: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  deviceInfo: string;
  ipAddress?: string;
  isRevoked: boolean;
  lastUsed: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    deviceInfo: { type: String, default: 'Unknown Device' },
    ipAddress: { type: String, default: '' },
    isRevoked: { type: Boolean, default: false, index: true },
    lastUsed: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
  },
);

export const Session = model<ISession>('Session', SessionSchema);
