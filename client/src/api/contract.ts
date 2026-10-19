/**
 * api/contract.ts — Unified Typed API Contract Interface (Slice A, B, and C).
 *
 * Blueprint interface for:
 *   - Real backend API client (Axios adapter)
 *   - Mock adapter (api/mock.ts for offline development & tests)
 *
 * Covers ALL v2 routes from all 3 slices:
 *   - Slice A: Groups & Tenancy, Debts & Invoicing, Payments, Audit Log
 *   - Slice B: Graph (Warshall, Reachable, SCC) & Settlement (Greedy, Cycles, Exact, Optimize)
 *   - Slice C: Risk (Group, Merchant, Contagion, Z-Test, Correlation), Notifications & Realtime
 */

import type {
  Debt,
  DebtEdge,
  DebtStatus,
  Group,
  GroupType,
  Membership,
  Role,
  Payment,
  PaymentKind,
  AuditEntry,
  DebtDetailResponse,
  GraphResponse,
  TransitiveClosureResponse,
  ReachableResponse,
  SettlementResponse,
  TransactionItem,
  CycleCheckResponse,
  CycleNettingResponse,
  RiskScoreResponse,
  PortfolioRiskResponse,
  RiskAssessmentV2,
  ContagionResult,
  Notification,
  MonthRecord,
} from '../types';

export type {
  Debt,
  DebtEdge,
  DebtStatus,
  Group,
  GroupType,
  Membership,
  Role,
  Payment,
  PaymentKind,
  AuditEntry,
  DebtDetailResponse,
  GraphResponse,
  TransitiveClosureResponse,
  ReachableResponse,
  SettlementResponse,
  TransactionItem,
  CycleCheckResponse,
  CycleNettingResponse,
  RiskScoreResponse,
  PortfolioRiskResponse,
  RiskAssessmentV2,
  ContagionResult,
  Notification,
  MonthRecord,
};


// ============================================================================
// Request & Response Shapes
// ============================================================================


// ── Generic / Auth ──────────────────────────────────────────────────────────

export interface SimpleMessageResponse {
  success: boolean;
  message: string;
}

export interface AuthMerchant {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  merchant: AuthMerchant;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface MeResponse {
  success: boolean;
  merchant: AuthMerchant;
}

// ── Slice A: Groups & Memberships ───────────────────────────────────────────

export interface GroupsResponse {
  success: boolean;
  groups: Group[];
}

export interface GroupResponse {
  success: boolean;
  group: Group;
}

export interface GroupDetailResponse {
  success: boolean;
  group: Group;
  members: Membership[];
}

export interface CreateGroupRequest {
  name: string;
  type?: GroupType;
}

export interface JoinGroupRequest {
  inviteCode: string;
}

export interface MembershipResponse {
  success: boolean;
  membership: Membership;
}

export interface InviteGroupRequest {
  email: string;
  role?: Role;
}

export interface InviteResponse {
  success: boolean;
  inviteCode: string;
}

// ── Slice A: Debts & Invoicing ──────────────────────────────────────────────

export interface ListDebtsParams {
  debtorId?: string;
  creditorId?: string;
  status?: DebtStatus | string;
  scope?: 'mine' | 'all';
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface DebtsResponse {
  success: boolean;
  count: number;
  total?: number;
  page?: number;
  totalPages?: number;
  debts: Debt[];
}

export interface DebtResponse {
  success: boolean;
  debt: Debt;
}

export interface CreateDebtRequest {
  debtorId: string;
  creditorId: string;
  amount: number;
  dueDate?: string;
  note?: string;
}

export interface UpdateDebtRequest {
  amount: number;
  expectedVersion?: number;
}

export interface DeleteDebtResponse {
  success: boolean;
  message: string;
  debtId: string;
}

export interface DisputeDebtRequest {
  reason: string;
}

// ── Slice A: Payments Ledger ────────────────────────────────────────────────

export interface RecordPaymentRequest {
  amount: number;
  expectedVersion?: number;
  kind?: PaymentKind;
  note?: string;
  idempotencyKey?: string;
}

export interface RecordPaymentResponse {
  success: boolean;
  payment: Payment;
  debt: Debt;
}

// ── Slice A: Audit Log ──────────────────────────────────────────────────────

export interface ListAuditParams {
  entityId?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogResponse {
  success: boolean;
  count: number;
  audit: AuditEntry[];
}

// ── Slice B: Graph ──────────────────────────────────────────────────────────

export interface GetGraphParams {
  mode?: 'full' | 'ego';
  merchantId?: string;
}

export interface GraphBuildRequest {
  merchants: string[];
  debts: DebtEdge[];
}

export interface SccRequest {
  merchants?: string[];
  debts?: DebtEdge[];
}

export interface SccResponse {
  success: boolean;
  components: string[][];
  componentCount: number;
  cyclicComponents?: string[][];
  cyclicComponentCount?: number;
}

// ── Slice B: Settlement ─────────────────────────────────────────────────────

export interface SettlementComputeRequest {
  merchants?: string[];
  debts?: DebtEdge[];
}

export interface SettlementComputeResponse {
  success: boolean;
  batchId: string;
  settlement: SettlementResponse;
  settlementId?: string;
}

export interface CycleCheckRequest {
  merchants?: string[];
  debts?: DebtEdge[];
}

export interface CycleNettingRequest {
  merchants: string[];
  debts: DebtEdge[];
  cycle: string[];
}

export interface CycleNettingItem {
  cycle: string[];
  amountNetted: number;
}

export interface NetAllCyclesRequest {
  merchants?: string[];
  debts?: DebtEdge[];
}

export interface NetAllCyclesResponse {
  success: boolean;
  cyclesNetted: CycleNettingItem[];
  totalAmountNetted: number;
  remainingDebts: DebtEdge[];
  initialEdgeCount: number;
  remainingEdgeCount: number;
  eliminatedEdgeCount: number;
}

export interface ExactSettlementRequest {
  merchants?: string[];
  debts?: DebtEdge[];
}

export interface ExactSettlementResponse {
  success: boolean;
  netBalances: Record<string, number>;
  transactions: TransactionItem[];
  transactionCount: number;
  totalAmountSettled: number;
  greedyTransactionCount: number;
  optimalityGap: number;
  algorithm: string;
  capped: boolean;
  message?: string;
}

export interface SettlementOptimizeRequest {
  merchants?: string[];
  debts?: DebtEdge[];
}

export interface SettlementOptimizeResponse {
  success: boolean;
  beforeEdges: DebtEdge[];
  afterNettingEdges: DebtEdge[];
  cyclesNetted: CycleNettingItem[];
  totalNettedAmount: number;
  transactions: TransactionItem[];
  transactionCount: number;
  totalAmountSettled: number;
  savings: number;
  beforeTotalDebt: number;
  afterTotalDebt: number;
  exactTransactionCount?: number;
  optimalityGap?: number;
}

export interface ConfirmBatchResponse {
  success: boolean;
  batchId: string;
  message?: string;
}

export interface SettlementHistoryParams {
  page?: number;
  limit?: number;
}

export interface SettlementBatchRecord {
  batchId: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
  totalAmountSettled: number;
  transactionCount: number;
  transactions: TransactionItem[];
}

export interface SettlementHistoryResponse {
  success: boolean;
  batches: SettlementBatchRecord[];
}

export interface MySettlementResponse {
  success: boolean;
  batchId: string;
  myTransactions: TransactionItem[];
  netBalance: number;
}

// ── Slice C: Risk & Contagion ───────────────────────────────────────────────

export interface ScoreMerchantRiskRequest {
  history: MonthRecord[];
}

export interface MerchantRiskResponse {
  success: boolean;
  assessment: RiskScoreResponse;
}

export interface PortfolioRiskRequest {
  merchants: Array<{ merchant_id: string; history: MonthRecord[] }>;
}

export interface GroupRiskData {
  averageRiskScore: number;
  totalMerchants: number;
  highRiskCount: number;
  assessments: RiskAssessmentV2[];
}

export interface GroupRiskResponse {
  success: boolean;
  groupRisk: GroupRiskData;
}

export interface MerchantRiskV2Response {
  success: boolean;
  assessment: RiskAssessmentV2;
}

export interface RecomputeRiskResponse {
  success: boolean;
  recomputedCount: number;
  groupRisk: GroupRiskData;
}

export interface ContagionSimulationRequest {
  merchantId: string;
  lossGivenDefault?: number;
  maxRounds?: number;
  merchants?: string[];
  debts?: DebtEdge[];
}

export interface ContagionSimulationResponse {
  success: boolean;
  contagion: ContagionResult;
}

export interface ZTestCalculateRequest {
  merchantId: string;
  successes: number;
  trials: number;
  baselineP?: number;
  alpha?: number;
  avgDelayDays?: number;
}

export interface ZTestCalculateResponse {
  success: boolean;
  result: {
    merchantId: string;
    observedP: number;
    baselineP: number;
    zScore: number;
    pValue: number;
    pValueTwoTailed: number;
    isSignificant: boolean;
    sampleSize: number;
    interpretation: string;
    compositeRiskScore: number;
  };
}

export interface CorrelationCalculateRequest {
  records?: Array<{
    merchant_id: string;
    avg_delay: number;
    avg_amount: number;
    frequency: number;
    late_rate: number;
  }>;
  seriesA?: number[];
  seriesB?: number[];
}

export interface CorrelationCalculateResponse {
  success: boolean;
  result: {
    delayVsAmount?: {
      r: number;
      pValue: number;
      significant: boolean;
      sampleSize: number;
      interpretation: string;
    };
    frequencyVsLateRate?: {
      r: number;
      pValue: number;
      significant: boolean;
      sampleSize: number;
      interpretation: string;
    };
    customPair?: {
      r: number;
      pValue: number;
      significant: boolean;
      sampleSize: number;
      interpretation: string;
    };
    sampleSize: number;
  };
}

// ── Slice C: Notifications ──────────────────────────────────────────────────

export interface ListNotificationsParams {
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface NotificationsResponse {
  success: boolean;
  count: number;
  unreadCount: number;
  notifications: Notification[];
}

export interface NotificationResponse {
  success: boolean;
  notification: Notification;
}

export interface MarkAllReadResponse {
  success: boolean;
  markedCount: number;
}

// ============================================================================
// Single Typed Api Blueprint Interface
// ============================================================================

export interface Api {
  // Authentication & Identity
  auth: {
    login(data: LoginRequest): Promise<AuthResponse>;
    register(data: RegisterRequest): Promise<AuthResponse>;
    me(): Promise<MeResponse>;
  };

  // Slice A: Groups & Tenancy
  groups: {
    list(): Promise<GroupsResponse>;
    get(id: string): Promise<GroupDetailResponse>;
    create(data: CreateGroupRequest): Promise<GroupResponse>;
    join(idOrCode: string, data?: JoinGroupRequest): Promise<MembershipResponse>;
    invite(id: string, data: InviteGroupRequest): Promise<InviteResponse>;
    getMembers(groupId: string): Promise<{ success: boolean; members: any[] }>;
    updateRole(groupId: string, merchantId: string, role: Role): Promise<{ success: boolean; membership: any }>;
    removeMember(groupId: string, merchantId: string): Promise<{ success: boolean; message: string }>;
    rotateInviteCode(groupId: string): Promise<InviteResponse>;
  };

  // Slice A: Debts & Invoicing
  debts: {
    list(params?: ListDebtsParams): Promise<DebtsResponse>;
    get(id: string): Promise<DebtDetailResponse>;
    create(data: CreateDebtRequest): Promise<DebtResponse>;
    update(id: string, data: UpdateDebtRequest): Promise<DebtResponse>;
    delete(id: string): Promise<DeleteDebtResponse>;
    confirm(id: string): Promise<DebtResponse>;
    reject(id: string): Promise<SimpleMessageResponse>;
    dispute(id: string, data: DisputeDebtRequest): Promise<DebtResponse>;
    recordPayment(debtId: string, data: RecordPaymentRequest): Promise<RecordPaymentResponse>;
  };

  // Slice A: Audit Log
  audit: {
    list(params?: ListAuditParams): Promise<AuditLogResponse>;
  };

  // Slice B: Graph & Connectivity
  graph: {
    get(params?: GetGraphParams): Promise<GraphResponse>;
    build(data: GraphBuildRequest): Promise<GraphResponse>;
    transitiveClosure(): Promise<TransitiveClosureResponse>;
    reachable(merchantId: string): Promise<ReachableResponse>;
    scc(data?: SccRequest): Promise<SccResponse>;
  };

  // Slice B: Settlement
  settlement: {
    compute(data?: SettlementComputeRequest): Promise<SettlementComputeResponse>;
    cycles(data?: CycleCheckRequest): Promise<CycleCheckResponse>;
    netCycle(data: CycleNettingRequest): Promise<CycleNettingResponse>;
    netAll(data?: NetAllCyclesRequest): Promise<NetAllCyclesResponse>;
    exact(data?: ExactSettlementRequest): Promise<ExactSettlementResponse>;
    optimize(data?: SettlementOptimizeRequest): Promise<SettlementOptimizeResponse>;
    confirm(batchId: string): Promise<ConfirmBatchResponse>;
    history(params?: SettlementHistoryParams): Promise<SettlementHistoryResponse>;
    mine(batchId: string): Promise<MySettlementResponse>;
  };

  // Slice C: Risk & Contagion
  risk: {
    score(merchantId: string, data?: ScoreMerchantRiskRequest): Promise<MerchantRiskResponse>;
    getScore(merchantId: string): Promise<MerchantRiskResponse>;
    portfolio(data?: PortfolioRiskRequest): Promise<{ success: boolean; portfolio: PortfolioRiskResponse }>;
    group(): Promise<GroupRiskResponse>;
    merchant(id: string): Promise<MerchantRiskV2Response>;
    recompute(): Promise<RecomputeRiskResponse>;
    contagion(data: ContagionSimulationRequest): Promise<ContagionSimulationResponse>;
    ztest(data: ZTestCalculateRequest): Promise<ZTestCalculateResponse>;
    correlation(data: CorrelationCalculateRequest): Promise<CorrelationCalculateResponse>;
  };

  // Slice C: Notifications
  notifications: {
    list(params?: ListNotificationsParams): Promise<NotificationsResponse>;
    markRead(id: string): Promise<NotificationResponse>;
    markAllRead(): Promise<MarkAllReadResponse>;
  };
}
