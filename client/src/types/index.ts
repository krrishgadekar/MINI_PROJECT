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

export type DebtStatus = 'pending' | 'active' | 'settled' | 'disputed' | 'netted';

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
