/**
 * types/index.ts — TypeScript interfaces matching the Pydantic API contract.
 *
 * These types are derived EXACTLY from creditflow/api/schemas.py.
 * DO NOT change field names — they must match the backend response shapes.
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

export type RiskCategory = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

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
