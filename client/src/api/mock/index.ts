/**
 * api/mock/index.ts — Registry for all domain mock implementations.
 *
 * Teammates add/modify api/mock/<domain>.mock.ts and register them here in one line each.
 */

import { groupsMock } from './groups.mock';
import { debtsMock } from './debts.mock';
import { graphMock } from './graph.mock';
import { settlementMock } from './settlement.mock';
import { riskMock } from './risk.mock';
import { notificationsMock } from './notifications.mock';
import { auditMock } from './audit.mock';
import type { Api, LoginRequest, RegisterRequest, MeResponse, AuthResponse } from '../contract';

export { groupsMock } from './groups.mock';
export { debtsMock } from './debts.mock';
export { graphMock } from './graph.mock';
export { settlementMock } from './settlement.mock';
export { riskMock } from './risk.mock';
export { notificationsMock } from './notifications.mock';
export { auditMock } from './audit.mock';

const mockAuth = {
  login: async (data: LoginRequest): Promise<AuthResponse> => ({
    success: true,
    accessToken: 'mock_jwt_token_123',
    refreshToken: 'mock_refresh_token_123',
    merchant: {
      id: 'Wholesale_A',
      name: 'Wholesale Vendor A',
      email: data.email,
    },
  }),
  register: async (data: RegisterRequest): Promise<AuthResponse> => ({
    success: true,
    accessToken: 'mock_jwt_token_123',
    refreshToken: 'mock_refresh_token_123',
    merchant: {
      id: 'New_Merchant',
      name: data.name,
      email: data.email,
    },
  }),
  me: async (): Promise<MeResponse> => ({
    success: true,
    merchant: {
      id: 'Wholesale_A',
      name: 'Wholesale Vendor A',
      email: 'parth@creditflow.io',
    },
  }),
};

export const mockApi: Api = {
  auth: mockAuth,
  groups: groupsMock,
  debts: debtsMock,
  graph: graphMock,
  settlement: settlementMock,
  risk: riskMock,
  notifications: notificationsMock,
  audit: auditMock,
};
