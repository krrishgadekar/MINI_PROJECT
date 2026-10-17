/**
 * api/mock/audit.mock.ts — Mock Implementation for Audit Domain (Slice A)
 */

import type { ListAuditParams, AuditLogResponse } from '../contract';

export const auditMock = {
  list: async (_params?: ListAuditParams): Promise<AuditLogResponse> => {
    return {
      success: true,
      count: 3,
      audit: [
        {
          _id: 'aud-1',
          groupId: 'grp-1',
          actorId: 'Wholesale_A',
          action: 'PAYMENT_RECORDED',
          entityType: 'Debt',
          entityId: 'debt-1',
          meta: { amount: 25000, remaining: 25000 },
          createdAt: new Date(Date.now() - 3600000).toISOString(),
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
          actorId: 'Supplier_C',
          action: 'RISK_RECOMPUTED',
          entityType: 'RiskAssessment',
          entityId: 'Supplier_C',
          meta: { score: 0.527, category: 'HIGH' },
          createdAt: new Date(Date.now() - 14400000).toISOString(),
        },
      ],
    };
  },
};
