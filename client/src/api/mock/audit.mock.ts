/**
 * api/mock/audit.mock.ts — Mock Implementation for Audit Domain (Slice A)
 */

import type { ListAuditParams, AuditLogResponse } from '../contract';
import type { AuditEntry } from '../../types';

const defaultAuditEntries: AuditEntry[] = [
  {
    _id: 'aud-1',
    groupId: 'grp-1',
    actorId: 'Wholesale_A',
    action: 'PAYMENT_RECORDED',
    entityType: 'Debt',
    entityId: 'debt-1',
    meta: { amount: 25000, remaining: 25000, status: 'active' },
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    _id: 'aud-2',
    groupId: 'grp-1',
    actorId: 'Vendor_D',
    action: 'DEBT_CONFIRMED',
    entityType: 'Debt',
    entityId: 'debt-2',
    meta: { status: 'active' },
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    _id: 'aud-3',
    groupId: 'grp-1',
    actorId: 'Retailer_B',
    action: 'DEBT_CREATED',
    entityType: 'Debt',
    entityId: 'debt-3',
    meta: { amount: 18000, status: 'pending' },
    createdAt: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    _id: 'aud-4',
    groupId: 'grp-1',
    actorId: 'Supplier_C',
    action: 'DEBT_DISPUTED',
    entityType: 'Debt',
    entityId: 'debt-1',
    meta: { reason: 'Pending quality inspection' },
    createdAt: new Date(Date.now() - 28800000).toISOString(),
  },
  {
    _id: 'aud-5',
    groupId: 'grp-1',
    actorId: 'Wholesale_A',
    action: 'PAYMENT_RECORDED',
    entityType: 'Debt',
    entityId: 'debt-2',
    meta: { amount: 10000, remaining: 0, status: 'settled' },
    createdAt: new Date(Date.now() - 43200000).toISOString(),
  },
];

export const auditMock = {
  list: async (params?: ListAuditParams): Promise<AuditLogResponse> => {
    let list = [...defaultAuditEntries];

    if (params?.entityId) {
      list = list.filter((a) => a.entityId === params.entityId);
    }

    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;
    const paginated = list.slice(skip, skip + limit);

    return {
      success: true,
      count: paginated.length,
      audit: paginated,
    };
  },
};
