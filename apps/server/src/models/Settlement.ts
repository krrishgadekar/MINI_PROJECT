import { Schema, model, Document, Types } from 'mongoose';

export interface ITransactionItem {
  payer: string;
  payee: string;
  amount: number;
}

export type SettlementStatus = 'pending' | 'confirmed';

export interface ISettlement extends Document {
  batchId: string;
  transactions: ITransactionItem[];
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

const SettlementSchema = new Schema<ISettlement>(
  {
    batchId: { type: String, required: true, unique: true },
    transactions: { type: [TransactionItemSchema], default: [] },
    algorithmUsed: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed'],
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

export const Settlement = model<ISettlement>('Settlement', SettlementSchema);
