/**
 * hooks/useTax.ts — React Query Hooks for Tax Domain (§3).
 *
 * Implements:
 *   - useTaxDomains(): fetch supported tax domains
 *   - useTaxRules(domain): fetch rule definitions & inputs for active domain
 *   - useTaxPreview(typeKey, base, inputs): 300ms debounced preview query
 *   - useSetGroupDomain(): admin mutation to lock in group tax domain
 *   - useTaxSummary(): aggregated tax totals & breakdown by type
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { queryKeys } from '../api/keys';
import type { TaxDomain, TaxSummary } from '../types';

export function useTaxDomains() {
  return useQuery({
    queryKey: queryKeys.tax.domains(),
    queryFn: () => api.tax.getDomains(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTaxRules(domain?: TaxDomain) {
  return useQuery({
    queryKey: queryKeys.tax.rules(domain),
    queryFn: () => api.tax.getRules(domain),
    enabled: !!domain && domain !== 'none',
    staleTime: 5 * 60 * 1000,
  });
}

export function useTaxPreview(
  typeKey?: string,
  base?: number,
  inputs?: Record<string, any>
) {
  const [debouncedParams, setDebouncedParams] = useState({
    typeKey: typeKey || '',
    base: base || 0,
    inputs: inputs || {},
  });

  const inputsKey = JSON.stringify(inputs || {});

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedParams({
        typeKey: typeKey || '',
        base: base || 0,
        inputs: inputs || {},
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [typeKey, base, inputsKey]);

  const isEnabled =
    Boolean(debouncedParams.typeKey) &&
    typeof debouncedParams.base === 'number' &&
    debouncedParams.base > 0;

  return useQuery({
    queryKey: queryKeys.tax.preview(
      debouncedParams.typeKey,
      debouncedParams.base,
      debouncedParams.inputs
    ),
    queryFn: () =>
      api.tax.preview({
        taxType: debouncedParams.typeKey,
        baseAmount: debouncedParams.base,
        taxInputs: debouncedParams.inputs,
      }),
    enabled: isEnabled,
    staleTime: 30 * 1000,
  });
}

export function useSetGroupDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, domain }: { groupId: string; domain: TaxDomain }) =>
      api.tax.setGroupDomain(groupId, domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    },
  });
}

export function useTaxSummary() {
  return useQuery<TaxSummary>({
    queryKey: queryKeys.tax.summary(),
    queryFn: () =>
      api.tax.summary
        ? api.tax.summary()
        : Promise.resolve({
            domain: 'none' as TaxDomain,
            totals: [],
            grandBase: 0,
            grandTax: 0,
            grandPayable: 0,
          }),
    staleTime: 30 * 1000,
  });
}
