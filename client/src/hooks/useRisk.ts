/**
 * hooks/useRisk.ts — React Query hooks for Risk domain (Slice C).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { queryKeys } from '../api/keys';
import type { ContagionSimulationRequest } from '../api/contract';

export function useGroupRisk() {
  return useQuery({
    queryKey: queryKeys.risk.group(),
    queryFn: () => api.risk.group(),
  });
}

export function useMerchantRisk(id: string) {
  return useQuery({
    queryKey: queryKeys.risk.merchant(id),
    queryFn: () => api.risk.merchant(id),
    enabled: !!id,
  });
}

export function usePortfolioRisk() {
  return useQuery({
    queryKey: queryKeys.risk.portfolio(),
    queryFn: () => api.risk.portfolio(),
  });
}

export function useRecomputeRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.risk.recompute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.risk.all });
    },
  });
}

export function useSimulateContagion() {
  return useMutation({
    mutationFn: (data: ContagionSimulationRequest) => api.risk.contagion(data),
  });
}

export function useRiskTrend(merchantId: string) {
  return useQuery({
    queryKey: queryKeys.risk.trend(merchantId),
    queryFn: () => api.risk.trend(merchantId),
    enabled: !!merchantId,
  });
}
