/**
 * api/index.ts — Unified API Gateway & Mock Adapter (FE-02).
 *
 * Exports `api` implementing the single typed `Api` interface from `client/src/api/contract.ts`.
 *
 * Configurable per-domain delegation via `VITE_MOCK_DOMAINS` env variable:
 *   - default (not set or 'all') => ALL domains use in-memory mock modules.
 *   - comma list (e.g. 'risk,notifications') => specified domains use mock, others use real axios adapter.
 *   - 'none' => all domains use real backend.
 */

import type { Api } from './contract';
import { mockApi } from './mock';
import { realApi } from './real';

export * from './contract';
export * from './keys';

const rawMockDomains: string =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MOCK_DOMAINS !== undefined)
    ? import.meta.env.VITE_MOCK_DOMAINS
    : '';

const isAllMock = rawMockDomains === 'all' || rawMockDomains === '*';
const isNoneMock = rawMockDomains === 'none' || rawMockDomains === '' || !rawMockDomains;

const mockDomainList = isAllMock || isNoneMock
  ? []
  : rawMockDomains.split(',').map((d: string) => d.trim().toLowerCase()).filter(Boolean);

/**
 * Checks whether a specific domain is configured to use mock data.
 */
export const isMockDomain = (domain: string): boolean => {
  if (isNoneMock) return false;
  if (isAllMock) return true;
  return mockDomainList.includes(domain.toLowerCase());
};

// Unified delegated API instance
export const api: Api = {
  auth: isMockDomain('auth') ? mockApi.auth : realApi.auth,
  groups: isMockDomain('groups') ? mockApi.groups : realApi.groups,
  debts: isMockDomain('debts') ? mockApi.debts : realApi.debts,
  audit: isMockDomain('audit') ? mockApi.audit : realApi.audit,
  graph: isMockDomain('graph') ? mockApi.graph : realApi.graph,
  settlement: isMockDomain('settlement') ? mockApi.settlement : realApi.settlement,
  risk: isMockDomain('risk') ? mockApi.risk : realApi.risk,
  notifications: isMockDomain('notifications') ? mockApi.notifications : realApi.notifications,
};

export default api;
