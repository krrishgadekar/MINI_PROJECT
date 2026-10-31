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
import { taxMock } from './tax.mock';
import type { Api, LoginRequest, RegisterRequest, MeResponse, AuthResponse } from '../contract';

export { groupsMock } from './groups.mock';
export { debtsMock } from './debts.mock';
export { graphMock } from './graph.mock';
export { settlementMock } from './settlement.mock';
export { riskMock } from './risk.mock';
export { notificationsMock } from './notifications.mock';
export { auditMock } from './audit.mock';
export { taxMock } from './tax.mock';
export { getTaxSummaryMock } from './taxSummary.mock';

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
      phone: '+91 98765 43210',
      businessName: 'SPIT Mumbai Wholesale',
    },
  }),
  updateMe: async (data: any) => ({
    success: true,
    merchant: {
      id: 'Wholesale_A',
      name: data.name || 'Wholesale Vendor A',
      email: 'parth@creditflow.io',
      phone: data.phone || '+91 98765 43210',
      businessName: data.businessName || 'SPIT Mumbai Wholesale',
    },
  }),
  changePassword: async () => ({
    success: true,
    message: 'Password changed successfully.',
  }),
  getSessions: async () => ({
    success: true,
    count: 1,
    sessions: [
      {
        id: 'mock_session_1',
        deviceInfo: 'Chrome 128 / Windows 11',
        ipAddress: '127.0.0.1',
        lastUsed: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
  }),
  revokeSession: async () => ({
    success: true,
    message: 'Session revoked successfully.',
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
  tax: taxMock,
};
