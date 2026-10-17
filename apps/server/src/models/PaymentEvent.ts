import { Schema, model, Document, Types } from 'mongoose';

export interface IPaymentEvent extends Document {
  groupId: Types.ObjectId;
  merchantId: Types.ObjectId;
  debtId: Types.ObjectId;
  dueDate: Date;
  paidDate: Date;
  wasLate: boolean;
  delayDays: number;
  amount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentEventSchema = new Schema<IPaymentEvent>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: false },
    merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
    debtId: { type: Schema.Types.ObjectId, ref: 'Debt', required: true },
    dueDate: { type: Date, required: true },
    paidDate: { type: Date, required: true },
    wasLate: { type: Boolean, required: true, default: false },
    delayDays: { type: Number, required: true, default: 0 },
    amount: { type: Number, required: false },
  },
  {
    timestamps: true,
  },
);

// Compound index: fast retrieval of merchant payment history sorted by due date
PaymentEventSchema.index({ merchantId: 1, dueDate: -1 });

export const PaymentEvent = model<IPaymentEvent>('PaymentEvent', PaymentEventSchema);
