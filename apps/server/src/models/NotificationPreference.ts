import { Schema, model, Document, Types } from 'mongoose';

export interface INotificationPreference extends Document {
  merchantId: Types.ObjectId;
  channels: {
    inApp: boolean;
    email: boolean;
    webhook: boolean;
  };
  webhookUrl?: string;
  email?: string;
  quietHours: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number;   // 0-23
  };
  types: {
    debtRequested: boolean;
    debtConfirmed: boolean;
    debtRejected: boolean;
    debtDisputed: boolean;
    paymentRecorded: boolean;
    settlementReady: boolean;
    settlementConfirmed: boolean;
    cycleNetted: boolean;
    riskFlagged: boolean;
    debtOverdue: boolean;
    debtDueSoon: boolean;
    digest: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const NotificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, unique: true },
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      webhook: { type: Boolean, default: false },
    },
    webhookUrl: { type: String, default: '' },
    email: { type: String, default: '' },
    quietHours: {
      enabled: { type: Boolean, default: false },
      startHour: { type: Number, default: 22, min: 0, max: 23 },
      endHour: { type: Number, default: 8, min: 0, max: 23 },
    },
    types: {
      debtRequested: { type: Boolean, default: true },
      debtConfirmed: { type: Boolean, default: true },
      debtRejected: { type: Boolean, default: true },
      debtDisputed: { type: Boolean, default: true },
      paymentRecorded: { type: Boolean, default: true },
      settlementReady: { type: Boolean, default: true },
      settlementConfirmed: { type: Boolean, default: true },
      cycleNetted: { type: Boolean, default: true },
      riskFlagged: { type: Boolean, default: true },
      debtOverdue: { type: Boolean, default: true },
      debtDueSoon: { type: Boolean, default: true },
      digest: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

export const NotificationPreference = model<INotificationPreference>(
  'NotificationPreference',
  NotificationPreferenceSchema
);
