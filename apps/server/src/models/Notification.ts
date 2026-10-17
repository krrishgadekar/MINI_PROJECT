import { Schema, model, Document, Types } from 'mongoose';

export interface INotification extends Document {
  groupId?: Types.ObjectId;
  merchantId: Types.ObjectId;
  type: string;
  message: string;
  refType?: string;
  refId?: Types.ObjectId;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: false },
    merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    refType: { type: String, required: false },
    refId: { type: Schema.Types.ObjectId, required: false },
    readAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// Compound index: fetch unread/read notifications for merchant in reverse chronological order
NotificationSchema.index({ merchantId: 1, readAt: 1, createdAt: -1 });

export const Notification = model<INotification>('Notification', NotificationSchema);
