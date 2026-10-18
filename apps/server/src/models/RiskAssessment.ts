import { Schema, model, Document, Types } from 'mongoose';

export interface IRiskAssessment extends Document {
  merchantId: Types.ObjectId;
  groupId?: string;
  lambdaRate: number;
  lambda?: number;
  zScore?: number;
  pValue?: number;
  correlation?: number;
  riskScore: number;
  riskCategory: string;
  riskLabel?: string;
  coldStart: boolean;
  monthsObserved: number;
  latePaymentEvents: number;
  defaultEvents: number;
  computedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RiskAssessmentSchema = new Schema<IRiskAssessment>(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
    groupId: { type: String, index: true },
    lambdaRate: { type: Number, required: true },
    lambda: { type: Number },
    zScore: { type: Number },
    pValue: { type: Number },
    correlation: { type: Number },
    riskScore: { type: Number, required: true, min: 0, max: 1 },
    riskCategory: { type: String, required: true },
    riskLabel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'] },
    coldStart: { type: Boolean, required: true, default: false },
    monthsObserved: { type: Number, required: true, default: 0 },
    latePaymentEvents: { type: Number, required: true, default: 0 },
    defaultEvents: { type: Number, required: true, default: 0 },
    computedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

// Index: quickly fetch latest assessment for a merchant
RiskAssessmentSchema.index({ merchantId: 1, createdAt: -1 });

export const RiskAssessment = model<IRiskAssessment>('RiskAssessment', RiskAssessmentSchema);
