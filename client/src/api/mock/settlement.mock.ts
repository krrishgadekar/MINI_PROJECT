/**
 * api/mock/settlement.mock.ts — Mock Implementation for Settlement Domain (Slice B)
 */

import { seedData } from '../../data/seedData';
import type {
  SettlementComputeRequest,
  SettlementComputeResponse,
  CycleCheckRequest,
  CycleCheckResponse,
  CycleNettingRequest,
  CycleNettingResponse,
  NetAllCyclesRequest,
  NetAllCyclesResponse,
  ExactSettlementRequest,
  ExactSettlementResponse,
  SettlementOptimizeRequest,
  SettlementOptimizeResponse,
  ConfirmBatchResponse,
  SettlementHistoryParams,
  SettlementHistoryResponse,
  MySettlementResponse,
} from '../contract';

export const settlementMock = {
  compute: async (
    _data?: SettlementComputeRequest
  ): Promise<SettlementComputeResponse> => {
    return {
      success: true,
      batchId: `batch-${Date.now()}`,
      settlement: {
        net_balances: {
          Wholesale_A: 40000,
          Retailer_B: -25000,
          Vendor_D: -5000,
          Supplier_C: -10000,
        },
        transactions: [
          { payer: 'Retailer_B', payee: 'Wholesale_A', amount: 25000 },
          { payer: 'Supplier_C', payee: 'Wholesale_A', amount: 10000 },
          { payer: 'Vendor_D', payee: 'Wholesale_A', amount: 5000 },
        ],
        transaction_count: 3,
        total_amount_settled: 40000,
        algorithm: 'Greedy Minimum Cash Flow',
      },
    };
  },

  cycles: async (_data?: CycleCheckRequest): Promise<CycleCheckResponse> => {
    return {
      has_cycle: true,
      cycles: [
        ['Retailer_B', 'Wholesale_A', 'Vendor_D', 'Retailer_B'],
        ['Supplier_C', 'Logistics_E', 'Supplier_C'],
      ],
    };
  },

  netCycle: async (data: CycleNettingRequest): Promise<CycleNettingResponse> => {
    return {
      cycle: data.cycle,
      net_flows: { 'Retailer_B->Wholesale_A': 30000 },
      amount_netted: 20000,
    };
  },

  netAll: async (_data?: NetAllCyclesRequest): Promise<NetAllCyclesResponse> => {
    return {
      success: true,
      cyclesNetted: [
        { cycle: ['Retailer_B', 'Wholesale_A', 'Vendor_D'], amountNetted: 20000 },
        { cycle: ['Supplier_C', 'Logistics_E'], amountNetted: 15000 },
      ],
      totalAmountNetted: 35000,
      remainingDebts: seedData.debts.slice(0, 5),
      initialEdgeCount: 9,
      remainingEdgeCount: 5,
      eliminatedEdgeCount: 4,
    };
  },

  exact: async (_data?: ExactSettlementRequest): Promise<ExactSettlementResponse> => {
    return {
      success: true,
      netBalances: { Wholesale_A: 40000, Retailer_B: -25000, Supplier_C: -15000 },
      transactions: [
        { payer: 'Retailer_B', payee: 'Wholesale_A', amount: 25000 },
        { payer: 'Supplier_C', payee: 'Wholesale_A', amount: 15000 },
      ],
      transactionCount: 2,
      totalAmountSettled: 40000,
      greedyTransactionCount: 3,
      optimalityGap: 1,
      algorithm: 'Exact Backtracking (Optimal)',
      capped: false,
    };
  },

  optimize: async (
    _data?: SettlementOptimizeRequest
  ): Promise<SettlementOptimizeResponse> => {
    return {
      success: true,
      beforeEdges: seedData.debts,
      afterNettingEdges: seedData.debts.slice(0, 5),
      cyclesNetted: [
        { cycle: ['Retailer_B', 'Wholesale_A', 'Vendor_D'], amountNetted: 20000 },
      ],
      totalNettedAmount: 20000,
      transactions: [
        { payer: 'Retailer_B', payee: 'Wholesale_A', amount: 25000 },
        { payer: 'Vendor_D', payee: 'Wholesale_A', amount: 5000 },
      ],
      transactionCount: 2,
      totalAmountSettled: 30000,
      savings: 20000,
      beforeTotalDebt: 149000,
      afterTotalDebt: 129000,
      exactTransactionCount: 2,
      optimalityGap: 0,
    };
  },

  confirm: async (batchId: string): Promise<ConfirmBatchResponse> => {
    return {
      success: true,
      batchId,
      message: 'Settlement batch executed successfully',
    };
  },

  history: async (
    _params?: SettlementHistoryParams
  ): Promise<SettlementHistoryResponse> => {
    return {
      success: true,
      batches: [
        {
          batchId: 'batch-001',
          status: 'confirmed',
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          totalAmountSettled: 65000,
          transactionCount: 4,
          transactions: [
            { payer: 'Retailer_B', payee: 'Wholesale_A', amount: 35000 },
            { payer: 'Supplier_C', payee: 'Logistics_E', amount: 30000 },
          ],
        },
      ],
    };
  },

  mine: async (batchId: string): Promise<MySettlementResponse> => {
    return {
      success: true,
      batchId,
      myTransactions: [{ payer: 'Wholesale_A', payee: 'Vendor_D', amount: 20000 }],
      netBalance: 20000,
    };
  },
};
