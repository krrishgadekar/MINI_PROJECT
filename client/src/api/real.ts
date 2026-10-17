/**
 * api/real.ts — Real Axios Backend Adapter implementing Api interface.
 *
 * Calls Chetan's Express backend on port 4000.
 */

import apiClient from './client';
import type {
  Api,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  MeResponse,
  GroupsResponse,
  GroupDetailResponse,
  GroupResponse,
  MembershipResponse,
  InviteResponse,
  CreateGroupRequest,
  JoinGroupRequest,
  InviteGroupRequest,
  ListDebtsParams,
  DebtsResponse,
  DebtDetailResponse,
  CreateDebtRequest,
  DebtResponse,
  UpdateDebtRequest,
  DeleteDebtResponse,
  SimpleMessageResponse,
  DisputeDebtRequest,
  RecordPaymentRequest,
  RecordPaymentResponse,
  ListAuditParams,
  AuditLogResponse,
  GetGraphParams,
  GraphResponse,
  GraphBuildRequest,
  TransitiveClosureResponse,
  ReachableResponse,
  SccRequest,
  SccResponse,
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
  ScoreMerchantRiskRequest,
  MerchantRiskResponse,
  PortfolioRiskRequest,
  PortfolioRiskResponse,
  GroupRiskResponse,
  MerchantRiskV2Response,
  RecomputeRiskResponse,
  ContagionSimulationRequest,
  ContagionSimulationResponse,
  ZTestCalculateRequest,
  ZTestCalculateResponse,
  CorrelationCalculateRequest,
  CorrelationCalculateResponse,
  ListNotificationsParams,
  NotificationsResponse,
  NotificationResponse,
  MarkAllReadResponse,
} from './contract';

export const realApi: Api = {
  auth: {
    login: async (data: LoginRequest): Promise<AuthResponse> => {
      const res = await apiClient.post('/auth/login', data);
      return res.data;
    },
    register: async (data: RegisterRequest): Promise<AuthResponse> => {
      const res = await apiClient.post('/auth/register', data);
      return res.data;
    },
    me: async (): Promise<MeResponse> => {
      const res = await apiClient.get('/auth/me');
      return res.data;
    },
  },

  groups: {
    list: async (): Promise<GroupsResponse> => {
      const res = await apiClient.get('/groups');
      return res.data;
    },
    get: async (id: string): Promise<GroupDetailResponse> => {
      const res = await apiClient.get(`/groups/${id}`);
      return res.data;
    },
    create: async (data: CreateGroupRequest): Promise<GroupResponse> => {
      const res = await apiClient.post('/groups', data);
      return res.data;
    },
    join: async (id: string, data: JoinGroupRequest): Promise<MembershipResponse> => {
      const res = await apiClient.post(`/groups/${id}/join`, data);
      return res.data;
    },
    invite: async (id: string, data: InviteGroupRequest): Promise<InviteResponse> => {
      const res = await apiClient.post(`/groups/${id}/invite`, data);
      return res.data;
    },
  },

  debts: {
    list: async (params?: ListDebtsParams): Promise<DebtsResponse> => {
      const res = await apiClient.get('/debts', { params });
      return res.data;
    },
    get: async (id: string): Promise<DebtDetailResponse> => {
      const res = await apiClient.get(`/debts/${id}`);
      return res.data;
    },
    create: async (data: CreateDebtRequest): Promise<DebtResponse> => {
      const res = await apiClient.post('/debts', data);
      return res.data;
    },
    update: async (id: string, data: UpdateDebtRequest): Promise<DebtResponse> => {
      const res = await apiClient.patch(`/debts/${id}`, data);
      return res.data;
    },
    delete: async (id: string): Promise<DeleteDebtResponse> => {
      const res = await apiClient.delete(`/debts/${id}`);
      return res.data;
    },
    confirm: async (id: string): Promise<DebtResponse> => {
      const res = await apiClient.post(`/debts/${id}/confirm`);
      return res.data;
    },
    reject: async (id: string): Promise<SimpleMessageResponse> => {
      const res = await apiClient.post(`/debts/${id}/reject`);
      return res.data;
    },
    dispute: async (id: string, data: DisputeDebtRequest): Promise<DebtResponse> => {
      const res = await apiClient.post(`/debts/${id}/dispute`, data);
      return res.data;
    },
    recordPayment: async (
      debtId: string,
      data: RecordPaymentRequest
    ): Promise<RecordPaymentResponse> => {
      const res = await apiClient.post(`/debts/${debtId}/payments`, data);
      return res.data;
    },
  },

  audit: {
    list: async (params?: ListAuditParams): Promise<AuditLogResponse> => {
      const res = await apiClient.get('/audit', { params });
      return res.data;
    },
  },

  graph: {
    get: async (params?: GetGraphParams): Promise<GraphResponse> => {
      const res = await apiClient.get('/graph', { params });
      return res.data;
    },
    build: async (data: GraphBuildRequest): Promise<GraphResponse> => {
      const res = await apiClient.post('/graph/build', data);
      return res.data;
    },
    transitiveClosure: async (): Promise<TransitiveClosureResponse> => {
      const res = await apiClient.post('/graph/transitive-closure');
      return res.data;
    },
    reachable: async (merchantId: string): Promise<ReachableResponse> => {
      const res = await apiClient.get(`/graph/${merchantId}/reachable`);
      return res.data;
    },
    scc: async (data?: SccRequest): Promise<SccResponse> => {
      const res = await apiClient.post('/graph/scc', data);
      return res.data;
    },
  },

  settlement: {
    compute: async (data?: SettlementComputeRequest): Promise<SettlementComputeResponse> => {
      const res = await apiClient.post('/settlement', data);
      return res.data;
    },
    cycles: async (data?: CycleCheckRequest): Promise<CycleCheckResponse> => {
      const res = await apiClient.post('/settlement/cycles', data);
      return res.data;
    },
    netCycle: async (data: CycleNettingRequest): Promise<CycleNettingResponse> => {
      const res = await apiClient.post('/settlement/net-cycle', data);
      return res.data;
    },
    netAll: async (data?: NetAllCyclesRequest): Promise<NetAllCyclesResponse> => {
      const res = await apiClient.post('/settlement/net-all', data);
      return res.data;
    },
    exact: async (data?: ExactSettlementRequest): Promise<ExactSettlementResponse> => {
      const res = await apiClient.post('/settlement/exact', data);
      return res.data;
    },
    optimize: async (data?: SettlementOptimizeRequest): Promise<SettlementOptimizeResponse> => {
      const res = await apiClient.post('/settlement/optimize', data);
      return res.data;
    },
    confirm: async (batchId: string): Promise<ConfirmBatchResponse> => {
      const res = await apiClient.post(`/settlement/confirm/${batchId}`);
      return res.data;
    },
    history: async (params?: SettlementHistoryParams): Promise<SettlementHistoryResponse> => {
      const res = await apiClient.get('/settlement/history', { params });
      return res.data;
    },
    mine: async (batchId: string): Promise<MySettlementResponse> => {
      const res = await apiClient.get(`/settlement/mine/${batchId}`);
      return res.data;
    },
  },

  risk: {
    score: async (
      merchantId: string,
      data?: ScoreMerchantRiskRequest
    ): Promise<MerchantRiskResponse> => {
      const res = await apiClient.post(`/risk/score/${merchantId}`, data);
      return res.data;
    },
    getScore: async (merchantId: string): Promise<MerchantRiskResponse> => {
      const res = await apiClient.get(`/risk/score/${merchantId}`);
      return res.data;
    },
    portfolio: async (data?: PortfolioRiskRequest): Promise<{ success: boolean; portfolio: PortfolioRiskResponse }> => {
      const res = await apiClient.post('/risk/portfolio', data);
      return res.data;
    },
    group: async (): Promise<GroupRiskResponse> => {
      const res = await apiClient.get('/risk/group');
      return res.data;
    },
    merchant: async (id: string): Promise<MerchantRiskV2Response> => {
      const res = await apiClient.get(`/risk/merchant/${id}`);
      return res.data;
    },
    recompute: async (): Promise<RecomputeRiskResponse> => {
      const res = await apiClient.post('/risk/recompute');
      return res.data;
    },
    contagion: async (
      data: ContagionSimulationRequest
    ): Promise<ContagionSimulationResponse> => {
      const res = await apiClient.post('/risk/contagion', data);
      return res.data;
    },
    ztest: async (data: ZTestCalculateRequest): Promise<ZTestCalculateResponse> => {
      const res = await apiClient.post('/risk/ztest', data);
      return res.data;
    },
    correlation: async (
      data: CorrelationCalculateRequest
    ): Promise<CorrelationCalculateResponse> => {
      const res = await apiClient.post('/risk/correlation', data);
      return res.data;
    },
  },

  notifications: {
    list: async (params?: ListNotificationsParams): Promise<NotificationsResponse> => {
      const res = await apiClient.get('/notifications', { params });
      return res.data;
    },
    markRead: async (id: string): Promise<NotificationResponse> => {
      const res = await apiClient.patch(`/notifications/${id}/read`);
      return res.data;
    },
    markAllRead: async (): Promise<MarkAllReadResponse> => {
      const res = await apiClient.post('/notifications/read-all');
      return res.data;
    },
  },
};
