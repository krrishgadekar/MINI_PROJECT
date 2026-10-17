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
import type { Debt, Payment } from '../../types';

let mockDebts: Debt[] = seedData.debts.map((d, index) => ({
  _id: `debt-${index + 1}`,
  groupId: 'grp-1',
  debtorId: d.debtor,
  creditorId: d.creditor,
  amount: d.amount,
  originalAmount: d.amount,
  status: 'active',
  dueDate: new Date(Date.now() + (index + 5) * 86400000).toISOString(),
  note: 'Trade credit for commodity goods',
  version: 1,
  createdAt: new Date().toISOString(),
}));

let mockPayments: Payment[] = [];

export const debtsMock = {
  list: async (params?: ListDebtsParams): Promise<DebtsResponse> => {
    let list = [...mockDebts];
    if (params?.debtorId) list = list.filter((d) => d.debtorId === params.debtorId);
    if (params?.creditorId) list = list.filter((d) => d.creditorId === params.creditorId);
    if (params?.status) list = list.filter((d) => d.status === params.status);
    return { success: true, count: list.length, debts: list };
  },

  get: async (id: string): Promise<DebtDetailResponse> => {
    const debt = mockDebts.find((d) => d._id === id) || mockDebts[0];
    const payments = mockPayments.filter((p) => p.debtId === debt._id);
    return {
      success: true,
      debt,
      payments,
      audit: [
        {
          _id: `aud-${Date.now()}`,
          groupId: debt.groupId || 'grp-1',
          actorId: debt.creditorId,
          action: 'DEBT_RECORDED',
          entityType: 'Debt',
          entityId: debt._id,
          createdAt: debt.createdAt,
        },
      ],
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
      dueDate: data.dueDate || new Date().toISOString(),
      note: data.note,
      version: 0,
      createdAt: new Date().toISOString(),
    };
    mockDebts.unshift(newDebt);
    return { success: true, debt: newDebt };
  },

  update: async (id: string, data: UpdateDebtRequest): Promise<DebtResponse> => {
    const debt = mockDebts.find((d) => d._id === id);
    if (debt) {
      debt.amount = data.amount;
      debt.version += 1;
    }
    return { success: true, debt: debt || mockDebts[0] };
  },

  delete: async (id: string): Promise<DeleteDebtResponse> => {
    mockDebts = mockDebts.filter((d) => d._id !== id);
    return { success: true, message: 'Debt settled and removed', debtId: id };
  },

  confirm: async (id: string): Promise<DebtResponse> => {
    const debt = mockDebts.find((d) => d._id === id);
    if (debt) {
      debt.status = 'active';
      debt.confirmedBy = 'Counterparty';
      debt.version += 1;
    }
    return { success: true, debt: debt || mockDebts[0] };
  },

  reject: async (id: string): Promise<SimpleMessageResponse> => {
    mockDebts = mockDebts.filter((d) => d._id !== id);
    return { success: true, message: 'Debt rejected' };
  },

  dispute: async (id: string, data: DisputeDebtRequest): Promise<DebtResponse> => {
    const debt = mockDebts.find((d) => d._id === id);
    if (debt) {
      debt.status = 'disputed';
      debt.note = `Dispute: ${data.reason}`;
      debt.version += 1;
    }
    return { success: true, debt: debt || mockDebts[0] };
  },

  recordPayment: async (
    debtId: string,
    data: RecordPaymentRequest
  ): Promise<RecordPaymentResponse> => {
    const debt = mockDebts.find((d) => d._id === debtId) || mockDebts[0];
    debt.amount = Math.max(0, debt.amount - data.amount);
    if (debt.amount === 0) debt.status = 'settled';
    debt.version += 1;

    const payment: Payment = {
      _id: `pay-${Date.now()}`,
      groupId: debt.groupId || 'grp-1',
      debtId: debt._id,
      amount: data.amount,
      kind: data.kind,
      recordedBy: 'Current_User',
      note: data.note,
      createdAt: new Date().toISOString(),
    };
    mockPayments.push(payment);

    return { success: true, payment, debt };
  },
};
