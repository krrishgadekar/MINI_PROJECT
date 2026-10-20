/**
 * api/mock/debts.mock.ts — Mock Implementation for Debts Domain (Slice A)
 *
 * Seeded from seedData.ts debts.
 */

import { seedData } from '../../data/seedData';
import type {
  DebtsResponse,
  DebtDetailResponse,
  DebtResponse,
  DeleteDebtResponse,
  SimpleMessageResponse,
  CreateDebtRequest,
  UpdateDebtRequest,
  DisputeDebtRequest,
  RecordPaymentRequest,
  RecordPaymentResponse,
  ListDebtsParams,
} from '../contract';
import type { Debt, Payment, AuditEntry } from '../../types';

// Concurrency 409 simulation toggle
let simulate409 = false;

export const setSimulate409 = (value: boolean): void => {
  simulate409 = value;
};

export const getSimulate409 = (): boolean => simulate409;

let mockDebts: Debt[] = seedData.debts.map((d, index) => {
  const isOverdue = index === 1;
  const isPending = index === 2;
  return {
    _id: `debt-${index + 1}`,
    groupId: 'grp-1',
    debtorId: d.debtor,
    creditorId: d.creditor,
    amount: d.amount,
    originalAmount: d.amount,
    status: isPending ? 'pending' : 'active',
    dueDate: new Date(Date.now() + (isOverdue ? -3 : index + 5) * 86400000).toISOString(),
    note: `Trade credit invoice #${400 + index} for bulk goods`,
    version: 1,
    createdAt: new Date(Date.now() - (index + 2) * 86400000).toISOString(),
  };
});

let mockPayments: Payment[] = [
  {
    _id: 'pay-mock-1',
    groupId: 'grp-1',
    debtId: 'debt-1',
    amount: 15000,
    kind: 'partial',
    recordedBy: seedData.debts[0].debtor,
    note: 'Initial installment via RTGS',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

let mockAudits: AuditEntry[] = [
  {
    _id: 'aud-mock-1',
    groupId: 'grp-1',
    actorId: seedData.debts[0].creditor,
    action: 'DEBT_CREATED',
    entityType: 'Debt',
    entityId: 'debt-1',
    meta: { amount: seedData.debts[0].amount, status: 'pending' },
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    _id: 'aud-mock-2',
    groupId: 'grp-1',
    actorId: seedData.debts[0].debtor,
    action: 'DEBT_CONFIRMED',
    entityType: 'Debt',
    entityId: 'debt-1',
    meta: { status: 'active' },
    createdAt: new Date(Date.now() - 160000000).toISOString(),
  },
  {
    _id: 'aud-mock-3',
    groupId: 'grp-1',
    actorId: seedData.debts[0].debtor,
    action: 'PAYMENT_RECORDED',
    entityType: 'Debt',
    entityId: 'debt-1',
    meta: { amount: 15000 },
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const debtsMock = {
  list: async (params?: ListDebtsParams): Promise<DebtsResponse> => {
    let list = [...mockDebts];

    if (params?.debtorId) list = list.filter((d) => d.debtorId === params.debtorId);
    if (params?.creditorId) list = list.filter((d) => d.creditorId === params.creditorId);

    if (params?.status) {
      if (params.status === 'overdue') {
        const now = Date.now();
        list = list.filter(
          (d) =>
            d.dueDate &&
            new Date(d.dueDate).getTime() < now &&
            (d.status === 'active' || d.status === 'pending'),
        );
      } else {
        list = list.filter((d) => d.status === params.status);
      }
    }

    if (params?.q) {
      const q = params.q.toLowerCase();
      list = list.filter(
        (d) =>
          d.note?.toLowerCase().includes(q) ||
          d.debtorId?.toLowerCase().includes(q) ||
          d.creditorId?.toLowerCase().includes(q),
      );
    }

    if (params?.sort) {
      if (params.sort === 'amount:desc') list.sort((a, b) => b.amount - a.amount);
      else if (params.sort === 'amount:asc') list.sort((a, b) => a.amount - b.amount);
      else if (params.sort === 'dueDate:asc')
        list.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
      else if (params.sort === 'dueDate:desc')
        list.sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
    }

    const total = list.length;
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;
    const paginated = list.slice(skip, skip + limit);

    return {
      success: true,
      count: paginated.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      debts: paginated,
    };
  },

  get: async (id: string): Promise<DebtDetailResponse> => {
    const debt = mockDebts.find((d) => d._id === id) || mockDebts[0];
    const payments = mockPayments.filter((p) => p.debtId === debt._id);
    const audit = mockAudits.filter((a) => a.entityId === debt._id);

    return {
      success: true,
      debt,
      payments,
      audit,
    };
  },

  create: async (data: CreateDebtRequest): Promise<DebtResponse> => {
    const newDebt: Debt = {
      _id: `debt-${Date.now()}`,
      groupId: 'grp-1',
      debtorId: data.debtorId,
      creditorId: data.creditorId,
      amount: data.amount,
      originalAmount: data.amount,
      status: 'pending',
      dueDate: data.dueDate || new Date(Date.now() + 86400000 * 7).toISOString(),
      note: data.note,
      version: 0,
      createdAt: new Date().toISOString(),
    };
    mockDebts.unshift(newDebt);

    mockAudits.unshift({
      _id: `aud-${Date.now()}`,
      groupId: 'grp-1',
      actorId: data.creditorId,
      action: 'DEBT_CREATED',
      entityType: 'Debt',
      entityId: newDebt._id,
      meta: { amount: data.amount, status: 'pending' },
      createdAt: new Date().toISOString(),
    });

    return { success: true, debt: newDebt };
  },

  update: async (id: string, data: UpdateDebtRequest): Promise<DebtResponse> => {
    if (simulate409) {
      const err: any = new Error('Concurrent modification detected');
      err.response = {
        status: 409,
        data: { success: false, code: 'CONCURRENT_MODIFICATION', message: 'Version conflict' },
      };
      err.status = 409;
      throw err;
    }

    const debt = mockDebts.find((d) => d._id === id);
    if (debt) {
      debt.amount = data.amount;
      debt.version += 1;
    }
    return { success: true, debt: debt || mockDebts[0] };
  },

  delete: async (id: string): Promise<DeleteDebtResponse> => {
    const debt = mockDebts.find((d) => d._id === id);
    if (debt) {
      debt.status = 'settled';
      debt.amount = 0;
      debt.version += 1;
    }
    return { success: true, message: 'Debt settled and removed', debtId: id };
  },

  confirm: async (id: string): Promise<DebtResponse> => {
    const debt = mockDebts.find((d) => d._id === id);
    if (debt) {
      debt.status = 'active';
      debt.confirmedBy = 'Counterparty';
      debt.version += 1;

      mockAudits.unshift({
        _id: `aud-${Date.now()}`,
        groupId: 'grp-1',
        actorId: 'Counterparty',
        action: 'DEBT_CONFIRMED',
        entityType: 'Debt',
        entityId: debt._id,
        meta: { status: 'active' },
        createdAt: new Date().toISOString(),
      });
    }
    return { success: true, debt: debt || mockDebts[0] };
  },

  reject: async (id: string): Promise<SimpleMessageResponse> => {
    const debt = mockDebts.find((d) => d._id === id);
    if (debt) {
      debt.status = 'cancelled' as any;
      debt.version += 1;
    }
    return { success: true, message: 'Debt rejected' };
  },

  dispute: async (id: string, data: DisputeDebtRequest): Promise<DebtResponse> => {
    const debt = mockDebts.find((d) => d._id === id);
    if (debt) {
      debt.status = 'disputed';
      debt.note = `Dispute: ${data.reason}`;
      debt.version += 1;

      mockAudits.unshift({
        _id: `aud-${Date.now()}`,
        groupId: 'grp-1',
        actorId: 'Current_User',
        action: 'DEBT_DISPUTED',
        entityType: 'Debt',
        entityId: debt._id,
        meta: { reason: data.reason },
        createdAt: new Date().toISOString(),
      });
    }
    return { success: true, debt: debt || mockDebts[0] };
  },

  recordPayment: async (
    debtId: string,
    data: RecordPaymentRequest
  ): Promise<RecordPaymentResponse> => {
    if (simulate409) {
      const err: any = new Error('Concurrent modification detected');
      err.response = {
        status: 409,
        data: { success: false, code: 'CONCURRENT_MODIFICATION', message: 'Version conflict' },
      };
      err.status = 409;
      throw err;
    }

    const debt = mockDebts.find((d) => d._id === debtId) || mockDebts[0];
    debt.amount = Math.max(0, debt.amount - data.amount);
    if (debt.amount === 0) debt.status = 'settled';
    debt.version += 1;

    const payment: Payment = {
      _id: `pay-${Date.now()}`,
      groupId: debt.groupId || 'grp-1',
      debtId: debt._id,
      amount: data.amount,
      kind: data.kind || (debt.amount === 0 ? 'settlement' : 'partial'),
      recordedBy: 'Current_User',
      note: data.note,
      createdAt: new Date().toISOString(),
    };
    mockPayments.unshift(payment);

    mockAudits.unshift({
      _id: `aud-${Date.now()}`,
      groupId: 'grp-1',
      actorId: 'Current_User',
      action: 'PAYMENT_RECORDED',
      entityType: 'Debt',
      entityId: debt._id,
      meta: { amount: data.amount, remaining: debt.amount, status: debt.status },
      createdAt: new Date().toISOString(),
    });

    return { success: true, payment, debt };
  },

  exportCsv: async (): Promise<Blob> => {
    const csv = 'id,debtorName,creditorName,amount,status\n1,Vendor A,Vendor B,1000,active\n';
    return new Blob([csv], { type: 'text/csv' });
  },

  importCsv: async (_data: any, dryRun?: boolean) => {
    return {
      success: true,
      dryRun: Boolean(dryRun),
      totalRows: 2,
      validCount: 2,
      errorCount: 0,
      importedCount: dryRun ? 0 : 2,
      preview: mockDebts.slice(0, 2),
      debts: dryRun ? [] : mockDebts.slice(0, 2),
    };
  },
};
