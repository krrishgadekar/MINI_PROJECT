import { Schema, model, Document } from 'mongoose';

// BE-07: Extend riskCategory to include CRITICAL. VERY_HIGH is kept for legacy acceptance.
export type RiskCategoryEnum = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'VERY_HIGH' | 'UNKNOWN';

export interface IRiskProfile {
  riskScore: number;
  riskCategory: RiskCategoryEnum;
  lastUpdated: Date;
}

export interface IMerchant extends Document {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  businessName?: string;
  riskProfile: IRiskProfile;
  createdAt: Date;
  updatedAt: Date;
}

const RiskProfileSchema = new Schema<IRiskProfile>(
  {
    riskScore: { type: Number, default: 0 },
    riskCategory: {
      type: String,
      // BE-07: PRIMARY enum is LOW|MEDIUM|HIGH|CRITICAL|UNKNOWN; VERY_HIGH accepted as legacy
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'VERY_HIGH', 'UNKNOWN'],
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
    phone: { type: String, trim: true },
    businessName: { type: String, trim: true },
    riskProfile: { type: RiskProfileSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: 'version',   // optimistic locking via __v / version field
  },
);

export const Merchant = model<IMerchant>('Merchant', MerchantSchema);
