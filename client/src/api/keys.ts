/**
 * api/keys.ts — Centralized React Query Keys
 *
 * Use these query keys across all React Query hooks for cache consistency
 * and standardized invalidations upon socket events or mutations.
 */

export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  groups: {
    all: ['groups'] as const,
    list: () => [...queryKeys.groups.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.groups.all, 'detail', id] as const,
  },
  debts: {
    all: ['debts'] as const,
    list: (params?: Record<string, any>) => [...queryKeys.debts.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.debts.all, 'detail', id] as const,
  },
  settlement: {
    all: ['settlement'] as const,
    history: (params?: Record<string, any>) => [...queryKeys.settlement.all, 'history', params] as const,
    mine: (batchId: string) => [...queryKeys.settlement.all, 'mine', batchId] as const,
  },
  graph: {
    all: ['graph'] as const,
    data: (params?: Record<string, any>) => [...queryKeys.graph.all, 'data', params] as const,
    closure: () => [...queryKeys.graph.all, 'closure'] as const,
    reachable: (merchantId: string) => [...queryKeys.graph.all, 'reachable', merchantId] as const,
    scc: () => [...queryKeys.graph.all, 'scc'] as const,
  },
  risk: {
    all: ['risk'] as const,
    group: () => [...queryKeys.risk.all, 'group'] as const,
    merchant: (id: string) => [...queryKeys.risk.all, 'merchant', id] as const,
    score: (merchantId: string) => [...queryKeys.risk.all, 'score', merchantId] as const,
    portfolio: () => [...queryKeys.risk.all, 'portfolio'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (params?: Record<string, any>) => [...queryKeys.notifications.all, 'list', params] as const,
  },
  audit: {
    all: ['audit'] as const,
    list: (params?: Record<string, any>) => [...queryKeys.audit.all, 'list', params] as const,
  },
};
