import { Schema, model, Document } from 'mongoose';

export interface IRiskProfile {
  riskScore: number;
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN';
  lastUpdated: Date;
}

export interface IMerchant extends Document {
  name: string;
  email: string;
  passwordHash: string;
  riskProfile: IRiskProfile;
  createdAt: Date;
  updatedAt: Date;
}

const RiskProfileSchema = new Schema<IRiskProfile>(
  {
    riskScore: { type: Number, default: 0 },
    riskCategory: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false },
);

const MerchantSchema = new Schema<IMerchant>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    riskProfile: { type: RiskProfileSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: 'version',   // optimistic locking via __v / version field
  },
);

export const Merchant = model<IMerchant>('Merchant', MerchantSchema);
