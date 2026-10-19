import { Schema, model, Document, Types } from 'mongoose';

export type DebtStatus = 'active' | 'settled' | 'netted' | 'pending' | 'disputed' | 'cancelled';

export interface IDebt extends Document {
  groupId: Types.ObjectId;  // required for new docs (group-scoped tenancy)
  debtorId: Types.ObjectId;
  creditorId: Types.ObjectId;
  amount: number;
  originalAmount: number;
  dueDate?: Date;
  note?: string;
  status: DebtStatus;
  confirmedBy?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  version: number;          // explicit numeric version field (optimistic locking)
  createdAt: Date;
  updatedAt: Date;
}

const DebtSchema = new Schema<IDebt>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: false, index: true },
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
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'Merchant', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Merchant', default: null },
    version: { type: Number, default: 0 },   // explicit CAS version (not Mongoose __v)
  },
  {
    timestamps: true,
    // Do NOT use versionKey here — we manage `version` explicitly as a plain field
    versionKey: false,
  },
);

// Compound index for fast lookup of all debts between two merchants
DebtSchema.index({ debtorId: 1, creditorId: 1 });
// Index for fetching all active debts quickly (used in settlement flow)
DebtSchema.index({ status: 1 });
// Compound index for group-scoped queries (IMPLEMENTATION_PLAN §2.3)
DebtSchema.index({ groupId: 1, status: 1 });
// Index for due-date reminder job
DebtSchema.index({ dueDate: 1, status: 1 });

export const Debt = model<IDebt>('Debt', DebtSchema);
