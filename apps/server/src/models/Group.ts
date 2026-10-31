import { Schema, model, Document, Types } from 'mongoose';

// Keep in sync with client/src/types/index.ts — GroupType
// (not imported from client to keep server package self-contained)
export type GroupTypeEnum = 'market' | 'supply_chain' | 'friends' | 'other';
export type MemberRole = 'owner' | 'admin' | 'member';
export type TaxDomain = 'none' | 'income' | 'gst' | 'customs' | 'property' | 'vehicle';

export interface IGroup extends Document {
  name: string;
  type: GroupTypeEnum;
  domain: TaxDomain;
  ownerId: Types.ObjectId;
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMembership extends Document {
  groupId: Types.ObjectId;
  merchantId: Types.ObjectId;
  role: MemberRole;
  joinedAt: Date;
}

// ── Group Schema ────────────────────────────────────────────────────────────
const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['market', 'supply_chain', 'friends', 'other'],
      default: 'other',
    },
    domain: {
      type: String,
      enum: ['none', 'income', 'gst', 'customs', 'property', 'vehicle'],
      default: 'none',
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
    inviteCode: { type: String, required: true, unique: true, uppercase: true },
  },
  { timestamps: true },
);

GroupSchema.index({ ownerId: 1 });

// ── Membership Schema ───────────────────────────────────────────────────────
const MembershipSchema = new Schema<IMembership>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    merchantId: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Unique compound index — one membership per (group, merchant)
MembershipSchema.index({ groupId: 1, merchantId: 1 }, { unique: true });
// Fast lookup: all groups for a merchant
MembershipSchema.index({ merchantId: 1 });

export const Group = model<IGroup>('Group', GroupSchema);
export const Membership = model<IMembership>('Membership', MembershipSchema);
