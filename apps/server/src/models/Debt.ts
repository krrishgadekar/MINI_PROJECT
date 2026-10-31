import { Schema, model, Document, Types } from 'mongoose';

export type DebtStatus = 'active' | 'settled' | 'netted' | 'pending' | 'disputed' | 'cancelled';

export interface ITaxBreakupItem {
  label: string;
  rate?: number;
  amount: number;
}

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
  // Tax fields (§2.1)
  baseAmount?: number;
  taxType?: string;
  taxEffect?: 'add' | 'deduct';
  taxAmount: number;
  taxRate?: number;
  taxBreakup: ITaxBreakupItem[];
  taxInputs?: Record<string, any>;
  taxRuleVersion?: string;
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
    // Tax fields (§2.1)
    baseAmount: { type: Number },
    taxType: { type: String },
    taxEffect: { type: String, enum: ['add', 'deduct'] },
    taxAmount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number },
    taxBreakup: {
      type: [
        {
          label: { type: String, required: true },
          rate: { type: Number },
          amount: { type: Number, required: true },
        },
      ],
      default: [],
    },
    taxInputs: { type: Schema.Types.Mixed },
    taxRuleVersion: { type: String },
  },
  {
    timestamps: true,
    // Do NOT use versionKey here — we manage `version` explicitly as a plain field
    versionKey: false,
  },
);

/**
 * Migration helper: treats missing baseAmount as amount when reading (§2.1)
 */
export function ensureBaseAmount<T extends { amount: number; baseAmount?: number }>(
  debt: T,
): T & { baseAmount: number } {
  if (debt && (debt.baseAmount === undefined || debt.baseAmount === null)) {
    debt.baseAmount = debt.amount;
  }
  return debt as T & { baseAmount: number };
}

DebtSchema.post('init', function (doc) {
  if (doc.baseAmount === undefined || doc.baseAmount === null) {
    doc.baseAmount = doc.amount;
  }
});

DebtSchema.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret.baseAmount === undefined || ret.baseAmount === null) {
      ret.baseAmount = ret.amount;
    }
    return ret;
  },
});

DebtSchema.set('toObject', {
  transform: (_doc, ret) => {
    if (ret.baseAmount === undefined || ret.baseAmount === null) {
      ret.baseAmount = ret.amount;
    }
    return ret;
  },
});

// Compound index for fast lookup of all debts between two merchants
DebtSchema.index({ debtorId: 1, creditorId: 1 });
// Index for fetching all active debts quickly (used in settlement flow)
DebtSchema.index({ status: 1 });
// Compound index for group-scoped queries (IMPLEMENTATION_PLAN §2.3)
DebtSchema.index({ groupId: 1, status: 1 });
// Compound index for tax summary lookups (§2.2)
DebtSchema.index({ groupId: 1, taxType: 1, status: 1 });
// Index for due-date reminder job
DebtSchema.index({ dueDate: 1, status: 1 });

export const Debt = model<IDebt>('Debt', DebtSchema);
