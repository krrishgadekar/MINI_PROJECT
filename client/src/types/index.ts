/**
 * types/index.ts — TypeScript interfaces matching the Pydantic API contract
 * and Slice A tenancy / transaction ledger schema.
 *
 * These types are derived EXACTLY from creditflow/api/schemas.py and
 * IMPLEMENTATION_PLAN.md §2.3 and §7.
 * DO NOT change existing field names — they must match the backend response shapes.
 */

// ---------------------------------------------------------------------------
// Shared / Primitive Types
// ---------------------------------------------------------------------------

export interface DebtEdge {
  debtor: string;
  creditor: string;
  amount: number;
}

export interface MonthRecord {
  late: boolean;
  default: boolean;
}

export interface MerchantHistory {
  merchant_id: string;
  history: MonthRecord[];
}

export interface SeedData {
  scenario_name: string;
  description: string;
  merchants: string[];
  debts: DebtEdge[];
  risk_histories: MerchantHistory[];
}

// ---------------------------------------------------------------------------
// Graph API Response Types
// ---------------------------------------------------------------------------

export interface GraphResponse {
  merchants: string[];
  edges: DebtEdge[];
  adjacency_matrix: Record<string, Record<string, number | null>>;
}

export interface TransitiveClosureResponse {
  closure: Record<string, Record<string, boolean>>;
  cyclic_risk_pairs: [string, string][];
}

export interface ReachableResponse {
  source: string;
  reachable: string[];
}

// ---------------------------------------------------------------------------
// Settlement API Response Types
// ---------------------------------------------------------------------------

export interface TransactionItem {
  payer: string;
  payee: string;
  amount: number;
}

export interface SettlementResponse {
  net_balances: Record<string, number>;
  transactions: TransactionItem[];
  transaction_count: number;
  total_amount_settled: number;
  algorithm: string;
}

export interface CycleCheckResponse {
  has_cycle: boolean;
  cycles: string[][];
}

export interface CycleNettingResponse {
  cycle: string[];
  net_flows: Record<string, number>;
  amount_netted: number;
}

// ---------------------------------------------------------------------------
// Risk API Response Types
// ---------------------------------------------------------------------------

export type RiskCategory = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "VERY_HIGH" | "UNKNOWN";

export interface RiskScoreResponse {
  merchant_id: string;
  months_observed: number;
  late_payment_events: number;
  default_events: number;
  lambda_rate: number;
  risk_score: number;
  risk_category: RiskCategory;
  model: string;
  cold_start: boolean;
  z_score?: number | null;
  p_value?: number | null;
  risk_label?: string | null;
  composite_score?: number | null;
}

export interface PortfolioRiskResponse {
  merchants: number;
  portfolio_average_risk: number;
  profiles: RiskScoreResponse[];
}

// ---------------------------------------------------------------------------
// Graph Visualization Types (for force-directed graph)
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  name: string;
  riskCategory?: RiskCategory;
  riskScore?: number;
  totalExposure?: number;
  val?: number; // node size for react-force-graph
  color?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  amount: number;
  color?: string;
  highlighted?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ---------------------------------------------------------------------------
// Slice A Tenancy, Groups, Debts v2, Payments & Audit (IMPLEMENTATION_PLAN.md §2.3 & §7)
// ---------------------------------------------------------------------------

export type Role = 'owner' | 'admin' | 'member';

export type GroupType = 'market' | 'supply_chain' | 'friends' | 'other';

export interface Group {
  _id: string;
  name: string;
  type: GroupType;
  ownerId: string;
  inviteCode: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Membership {
  _id: string;
  groupId: string;
  merchantId: string;
  role: Role;
  joinedAt?: string;
}

export type DebtStatus = 'pending' | 'active' | 'settled' | 'disputed' | 'netted' | 'cancelled';

export interface Debt {
  _id: string;
  groupId?: string;
  debtorId: string | any;
  creditorId: string | any;
  amount: number;
  originalAmount: number;
  status: DebtStatus;
  dueDate?: string;
  note?: string;
  confirmedBy?: string;
  createdBy?: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export type PaymentKind = 'partial' | 'settlement' | 'netting';

export interface Payment {
  _id: string;
  groupId: string;
  debtId: string;
  amount: number;
  kind: PaymentKind;
  recordedBy: string;
  note?: string;
  createdAt?: string;
}

export interface PaymentEvent {
  _id?: string;
  groupId: string;
  merchantId: string;
  debtId: string;
  dueDate: string;
  paidDate: string;
  wasLate: boolean;
  delayDays: number;
}

export interface AuditEntry {
  _id: string;
  groupId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  meta?: Record<string, any>;
  createdAt?: string;
}

export interface DebtDetailResponse {
  success: boolean;
  debt: Debt;
  payments: Payment[];
  audit: AuditEntry[];
}

export type ApiErrorCode =
  | 'FORBIDDEN_GROUP'
  | 'CONCURRENT_MODIFICATION'
  | 'STALE_SETTLEMENT'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'IDEMPOTENT_REPLAY';

export interface ApiError {
  success: false;
  code?: ApiErrorCode | string;
  message: string;
  stack?: string;
}

export interface NotificationItem {
  _id: string;
  groupId: string;
  merchantId: string;
  type: string;
  message: string;
  refType?: string;
  refId?: string;
  readAt?: string | null;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Slice C Risk v2, Contagion, Notifications & Real-Time Socket Map
// ---------------------------------------------------------------------------

export type RiskLabel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export interface RiskAssessmentV2 {
  merchantId: string;
  lambda: number;
  zScore?: number | null;
  pValue?: number | null;
  correlation?: number | null;
  riskScore: number;
  riskLabel: RiskLabel;
  computedAt: string;
}

export interface ContagionResult {
  source: string;
  totalLoss: number;
  perMerchantLoss: Record<string, number>;
  levels: string[][];
  directLosses?: Record<string, number>;
  secondOrderLosses?: Record<string, number>;
  affectedMerchants?: string[];
  networkVulnerabilityScore?: number;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  refType?: string;
  refId?: string;
  readAt?: string | null;
  createdAt: string;
  groupId?: string;
  merchantId?: string;
}

// Socket Event Payload Types
export interface DebtCreatedPayload {
  debt: Debt;
}

export interface DebtUpdatedPayload {
  debt: Debt;
}

export interface DebtSettledPayload {
  debtId: string;
}

export interface DebtDisputedPayload {
  debtId: string;
  reason?: string;
}

export interface DebtConfirmedPayload {
  debt: Debt;
}

export interface DebtRejectedPayload {
  debtId: string;
}

export interface DebtPaymentPayload {
  debt: Debt;
  payment: Payment;
}

export interface SettlementBatchCreatedPayload {
  batchId: string;
  settlement: SettlementResponse;
}

export interface SettlementBatchConfirmedPayload {
  batchId: string;
}

export interface SettlementCycleNettedPayload {
  cycle: string[];
  amountNetted: number;
}

export interface RiskFlaggedPayload {
  merchantId: string;
  riskScore: number;
  riskLabel: RiskLabel;
  reason?: string;
  timestamp?: string;
}

export interface CycleNettedPayload {
  cycle: string[];
  amountNetted: number;
  remainingDebts?: DebtEdge[];
}

export interface BatchUpdateItem {
  type: string;
  payload: any;
  timestamp: number;
}

export interface BatchUpdatePayload {
  events: BatchUpdateItem[];
  batchSeq?: number;
}

export interface PresencePingPayload {
  timestamp: number;
  serverTime?: string;
}

export interface PresenceAckPayload {
  timestamp: number;
  clientTime?: string;
}

export interface NotificationNewPayload {
  notification: Notification;
}

export interface SocketEventMap {
  'debt:created': DebtCreatedPayload;
  'debt:updated': DebtUpdatedPayload;
  'debt:settled': DebtSettledPayload;
  'debt:disputed': DebtDisputedPayload;
  'debt:confirmed': DebtConfirmedPayload;
  'debt:rejected': DebtRejectedPayload;
  'debt:payment': DebtPaymentPayload;
  'settlement:batch_created': SettlementBatchCreatedPayload;
  'settlement:batch_confirmed': SettlementBatchConfirmedPayload;
  'settlement:cycle_netted': SettlementCycleNettedPayload;
  'risk:flagged': RiskFlaggedPayload;
  'cycle:netted': CycleNettedPayload;
  'batch:update': BatchUpdatePayload;
  'presence:ping': PresencePingPayload;
  'presence:ack': PresenceAckPayload;
  'notification:new': NotificationNewPayload;
}

