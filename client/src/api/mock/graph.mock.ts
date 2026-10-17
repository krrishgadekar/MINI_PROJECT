/**
 * api/mock/graph.mock.ts — Mock Implementation for Graph Domain (Slice B)
 *
 * Seeded from seedData.ts graph.
 */

import { seedData } from '../../data/seedData';
import type {
  GraphResponse,
  TransitiveClosureResponse,
  ReachableResponse,
  SccRequest,
  SccResponse,
  GetGraphParams,
  GraphBuildRequest,
} from '../contract';

export const graphMock = {
  get: async (_params?: GetGraphParams): Promise<GraphResponse> => {
    const matrix: Record<string, Record<string, number | null>> = {};
    seedData.merchants.forEach((m1) => {
      matrix[m1] = {};
      seedData.merchants.forEach((m2) => {
        matrix[m1][m2] = null;
      });
    });

    seedData.debts.forEach((d) => {
      if (matrix[d.debtor]) {
        matrix[d.debtor][d.creditor] = d.amount;
      }
    });

    return {
      merchants: [...seedData.merchants],
      edges: [...seedData.debts],
      adjacency_matrix: matrix,
    };
  },

  build: async (data: GraphBuildRequest): Promise<GraphResponse> => {
    return {
      merchants: data.merchants,
      edges: data.debts,
      adjacency_matrix: {},
    };
  },

  transitiveClosure: async (): Promise<TransitiveClosureResponse> => {
    const closure: Record<string, Record<string, boolean>> = {};
    seedData.merchants.forEach((m1) => {
      closure[m1] = {};
      seedData.merchants.forEach((m2) => {
        closure[m1][m2] = m1 === m2;
      });
    });

    seedData.debts.forEach((d) => {
      closure[d.debtor][d.creditor] = true;
    });

    return {
      closure,
      cyclic_risk_pairs: [
        ['Wholesale_A', 'Retailer_B'],
        ['Retailer_B', 'Vendor_D'],
        ['Vendor_D', 'Wholesale_A'],
      ],
    };
  },

  reachable: async (merchantId: string): Promise<ReachableResponse> => {
    const reachable = seedData.debts
      .filter((d) => d.debtor === merchantId)
      .map((d) => d.creditor);

    return {
      source: merchantId,
      reachable: Array.from(new Set(reachable)),
    };
  },

  scc: async (_data?: SccRequest): Promise<SccResponse> => {
    return {
      success: true,
      components: [
        ['Wholesale_A', 'Retailer_B', 'Vendor_D'],
        ['Supplier_C', 'Logistics_E'],
        ['Farmer_F', 'Stall_G', 'Buyer_H'],
      ],
      componentCount: 3,
      cyclicComponents: [
        ['Wholesale_A', 'Retailer_B', 'Vendor_D'],
        ['Supplier_C', 'Logistics_E'],
        ['Farmer_F', 'Stall_G', 'Buyer_H'],
      ],
      cyclicComponentCount: 3,
    };
  },
};
