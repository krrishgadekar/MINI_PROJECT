import { Schema, model, Document, Types } from 'mongoose';

export type PaymentKind = 'partial' | 'settlement' | 'netting';

export interface IPayment extends Document {
  groupId: Types.ObjectId;
  debtId: Types.ObjectId;
  amount: number;
  kind: PaymentKind;
  recordedBy: Types.ObjectId;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    debtId: { type: Schema.Types.ObjectId, ref: 'Debt', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    kind: {
      type: String,
      enum: ['partial', 'settlement', 'netting'],
      required: true,
      default: 'partial',
    },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
    note: { type: String },
  },
  {
    timestamps: true,
  },
);

// Compound index as required: {debtId:1, createdAt:-1}
PaymentSchema.index({ debtId: 1, createdAt: -1 });
PaymentSchema.index({ groupId: 1, createdAt: -1 });

export const Payment = model<IPayment>('Payment', PaymentSchema);
