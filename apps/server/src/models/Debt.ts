import { Schema, model, Document, Types } from 'mongoose';

export type DebtStatus = 'active' | 'settled' | 'netted' | 'pending' | 'disputed' | 'cancelled';

export interface IDebt extends Document {
  groupId?: string;
  debtorId: Types.ObjectId;
  creditorId: Types.ObjectId;
  amount: number;
  originalAmount: number;
  dueDate?: Date;
  note?: string;
  status: DebtStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DebtSchema = new Schema<IDebt>(
  {
    groupId: { type: String, index: true },
    debtorId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
    creditorId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
    amount: { type: Number, required: true, min: 0 },
    originalAmount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date },
    note: { type: String },
    status: {
      type: String,
      enum: ['active', 'settled', 'netted', 'pending', 'disputed', 'cancelled'],
      default: 'active',
    },
  },
  {
    timestamps: true,
    versionKey: 'version',   // optimistic locking
  },
);

// Compound index for fast lookup of all debts between two merchants
DebtSchema.index({ debtorId: 1, creditorId: 1 });
// Index for fetching all active debts quickly (used in settlement flow)
DebtSchema.index({ status: 1 });

export const Debt = model<IDebt>('Debt', DebtSchema);
