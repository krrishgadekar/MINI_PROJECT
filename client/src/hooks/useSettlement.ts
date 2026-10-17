/**
 * hooks/useSettlement.ts — React Query hooks for Settlement domain.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { queryKeys } from '../api/keys';
import type { SettlementHistoryParams, SettlementComputeRequest, SettlementOptimizeRequest } from '../api/contract';

export function useSettlementHistory(params?: SettlementHistoryParams) {
  return useQuery({
    queryKey: queryKeys.settlement.history(params),
    queryFn: () => api.settlement.history(params),
  });
}

export function useMySettlement(batchId: string) {
  return useQuery({
    queryKey: queryKeys.settlement.mine(batchId),
    queryFn: () => api.settlement.mine(batchId),
    enabled: !!batchId,
  });
}

export function useComputeSettlement() {
  return useMutation({
    mutationFn: (data?: SettlementComputeRequest) => api.settlement.compute(data),
  });
}

export function useOptimizeSettlement() {
  return useMutation({
    mutationFn: (data?: SettlementOptimizeRequest) => api.settlement.optimize(data),
  });
}

export function useConfirmSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => api.settlement.confirm(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settlement.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    },
  });
}
