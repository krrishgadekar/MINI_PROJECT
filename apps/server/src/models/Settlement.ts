import { Schema, model, Document, Types } from 'mongoose';

export interface ITransactionItem {
  payer: string;
  payee: string;
  amount: number;
}

export interface IDebtSnapshot {
  debtId: Types.ObjectId;
  version: number;
  amount: number;
}

// Extended to include executing and failed states per API_DOCS §7.3
export type SettlementStatus = 'pending' | 'executing' | 'confirmed' | 'failed';

export interface ISettlement extends Document {
  batchId: string;
  groupId?: Types.ObjectId;    // tenant group scope
  transactions: ITransactionItem[];
  debtSnapshot: IDebtSnapshot[];   // snapshot of debt versions at compute time
  algorithmUsed: string;
  status: SettlementStatus;
  totalAmountSettled: number;
  transactionCount: number;
  initiatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionItemSchema = new Schema<ITransactionItem>(
  {
    payer: { type: String, required: true },
    payee: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const DebtSnapshotSchema = new Schema<IDebtSnapshot>(
  {
    debtId: { type: Schema.Types.ObjectId, ref: 'Debt', required: true },
    version: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false },
);

const SettlementSchema = new Schema<ISettlement>(
  {
    batchId: { type: String, required: true, unique: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', index: true },
    transactions: { type: [TransactionItemSchema], default: [] },
    debtSnapshot: { type: [DebtSnapshotSchema], default: [] },
    algorithmUsed: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'executing', 'confirmed', 'failed'],
      default: 'pending',
    },
    totalAmountSettled: { type: Number, required: true, default: 0 },
    transactionCount: { type: Number, required: true, default: 0 },
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
  },
  {
    timestamps: true,
  },
);

// Index for fast group-scoped settlement lookup
SettlementSchema.index({ groupId: 1, createdAt: -1 });

export const Settlement = model<ISettlement>('Settlement', SettlementSchema);
