/**
 * hooks/useDebts.ts — React Query hooks for Debts domain.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { queryKeys } from '../api/keys';
import type { ListDebtsParams, CreateDebtRequest, RecordPaymentRequest } from '../api/contract';

export function useDebts(params?: ListDebtsParams) {
  return useQuery({
    queryKey: queryKeys.debts.list(params),
    queryFn: () => api.debts.list(params),
  });
}

export function useDebt(id: string) {
  return useQuery({
    queryKey: queryKeys.debts.detail(id),
    queryFn: () => api.debts.get(id),
    enabled: !!id,
  });
}

export function useCreateDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDebtRequest) => api.debts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    },
  });
}

export function useConfirmDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.debts.confirm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    },
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ debtId, data }: { debtId: string; data: RecordPaymentRequest }) =>
      api.debts.recordPayment(debtId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    },
  });
}
