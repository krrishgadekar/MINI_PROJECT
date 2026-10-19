import { Schema, model, Document, Types } from 'mongoose';

export interface IIdempotencyRecord extends Document {
  debtId: Types.ObjectId;
  key: string;
  response: Record<string, unknown>;
  createdAt: Date;
}

const IdempotencyRecordSchema = new Schema<IIdempotencyRecord>(
  {
    debtId: { type: Schema.Types.ObjectId, ref: 'Debt', required: true },
    key: { type: String, required: true },
    response: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 86400 * 7 }, // TTL 7 days
  },
  {
    versionKey: false,
  },
);

IdempotencyRecordSchema.index({ debtId: 1, key: 1 }, { unique: true });

export const IdempotencyRecord = model<IIdempotencyRecord>(
  'IdempotencyRecord',
  IdempotencyRecordSchema,
);
