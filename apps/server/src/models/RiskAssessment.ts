import { Schema, model, Document, Types } from 'mongoose';

export interface IRiskAssessment extends Document {
  merchantId: Types.ObjectId;
  lambdaRate: number;
  riskScore: number;
  riskCategory: string;
  coldStart: boolean;
  monthsObserved: number;
  latePaymentEvents: number;
  defaultEvents: number;
  createdAt: Date;
  updatedAt: Date;
}

const RiskAssessmentSchema = new Schema<IRiskAssessment>(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
    lambdaRate: { type: Number, required: true },
    riskScore: { type: Number, required: true, min: 0, max: 1 },
    riskCategory: { type: String, required: true },
    coldStart: { type: Boolean, required: true, default: false },
    monthsObserved: { type: Number, required: true, default: 0 },
    latePaymentEvents: { type: Number, required: true, default: 0 },
    defaultEvents: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
  },
);

// Index: quickly fetch latest assessment for a merchant
RiskAssessmentSchema.index({ merchantId: 1, createdAt: -1 });

export const RiskAssessment = model<IRiskAssessment>('RiskAssessment', RiskAssessmentSchema);
