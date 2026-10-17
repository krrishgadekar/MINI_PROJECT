"""
schemas.py — Pydantic request/response models for the CreditFlow API.

These schemas form the API contract agreed upon with:
  - Chetan (his Node/Express backend sits in front of these endpoints)
  - Parth  (his React frontend consumes these response shapes)

Changing any field name or type here is a BREAKING CHANGE for the team.
"""

from __future__ import annotations
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Shared / primitive types
# ---------------------------------------------------------------------------

class DebtEdge(BaseModel):
    """A single directed debt: debtor owes creditor the given amount."""
    debtor: str   = Field(..., description="Merchant ID of the debtor")
    creditor: str = Field(..., description="Merchant ID of the creditor")
    amount: float = Field(..., gt=0, description="Debt amount (must be positive)")


# ---------------------------------------------------------------------------
# Graph API schemas
# ---------------------------------------------------------------------------

class GraphBuildRequest(BaseModel):
    """POST /graph/build — Build (or replace) the merchant debt graph."""
    merchants: List[str] = Field(..., min_length=1, description="List of merchant IDs")
    debts: List[DebtEdge] = Field(default=[], description="List of debt edges")

    @field_validator("merchants")
    @classmethod
    def merchants_unique(cls, v: List[str]) -> List[str]:
        if len(v) != len(set(v)):
            raise ValueError("Merchant IDs must be unique.")
        return v


class GraphResponse(BaseModel):
    """Response for graph build and graph query endpoints."""
    merchants: List[str]
    edges: List[Dict]
    adjacency_matrix: Dict[str, Dict[str, Optional[float]]]


class TransitiveClosureResponse(BaseModel):
    """Response for POST /graph/transitive-closure."""
    closure: Dict[str, Dict[str, bool]]
    cyclic_risk_pairs: List[List[str]]


class ReachableResponse(BaseModel):
    """Response for GET /graph/{merchant_id}/reachable."""
    source: str
    reachable: List[str]


# ---------------------------------------------------------------------------
# Settlement API schemas
# ---------------------------------------------------------------------------

class SettlementRequest(BaseModel):
    """POST /settlement — Compute greedy minimum settlement for a debt graph."""
    merchants: List[str] = Field(..., min_length=1)
    debts: List[DebtEdge] = Field(default=[])


class TransactionItem(BaseModel):
    payer:  str
    payee:  str
    amount: float


class SettlementResponse(BaseModel):
    net_balances: Dict[str, float]
    transactions: List[TransactionItem]
    transaction_count: int
    total_amount_settled: float
    algorithm: str


class CycleCheckResponse(BaseModel):
    """Response for POST /settlement/cycles."""
    has_cycle: bool
    cycles: List[List[str]]


class CycleNettingRequest(BaseModel):
    """POST /settlement/net-cycle — Net a specific cycle."""
    merchants: List[str]
    debts: List[DebtEdge]
    cycle: List[str] = Field(..., min_length=2, description="Ordered cycle to net")


class CycleNettingResponse(BaseModel):
    cycle: List[str]
    net_flows: Dict[str, float]
    amount_netted: float


# ---------------------------------------------------------------------------
# Risk API schemas
# ---------------------------------------------------------------------------

class MonthRecord(BaseModel):
    late:    bool = False
    default: bool = False


class MerchantHistoryRequest(BaseModel):
    """POST /risk/score — Score a single merchant's default risk."""
    merchant_id: str
    history: List[MonthRecord] = Field(
        default=[],
        description="Monthly payment history, oldest first",
    )


class RiskScoreResponse(BaseModel):
    merchant_id: str
    months_observed: int
    late_payment_events: int
    default_events: int
    lambda_rate: float
    risk_score: float
    risk_category: str
    model: str
    cold_start: bool
    # Additive fields (v2 contract)
    z_score: Optional[float] = None
    p_value: Optional[float] = None
    risk_label: Optional[str] = None
    composite_score: Optional[float] = None


class PortfolioRiskRequest(BaseModel):
    """POST /risk/portfolio — Score a full portfolio of merchants."""
    merchants: List[MerchantHistoryRequest]


class PortfolioRiskResponse(BaseModel):
    merchants: int
    portfolio_average_risk: float
    profiles: List[RiskScoreResponse]


# ---------------------------------------------------------------------------
# v2 Additions: SCC, Exact Settlement, Contagion, Hypothesis & Correlation
# ---------------------------------------------------------------------------

class SccResponse(BaseModel):
    """Response for POST /graph/scc."""
    components: List[List[str]]
    component_count: int
    cyclic_components: Optional[List[List[str]]] = None
    cyclic_component_count: Optional[int] = None


class ExactSettlementResponse(BaseModel):
    """Response for POST /settlement/exact."""
    net_balances: Dict[str, float]
    transactions: List[TransactionItem]
    transaction_count: int
    total_amount_settled: float
    greedy_transaction_count: int
    optimality_gap: int
    algorithm: str
    capped: bool
    message: Optional[str] = None


class CycleNettingItem(BaseModel):
    cycle: List[str]
    amount_netted: float


class NetAllCyclesResponse(BaseModel):
    """Response for POST /settlement/net-all."""
    cycles_netted: List[CycleNettingItem]
    total_amount_netted: float
    remaining_debts: List[DebtEdge]
    initial_edge_count: int
    remaining_edge_count: int
    eliminated_edge_count: int


class SettlementOptimizeResponse(BaseModel):
    """Response for POST /settlement/optimize."""
    before_edges: List[DebtEdge]
    after_netting_edges: List[DebtEdge]
    cycles_netted: List[CycleNettingItem]
    total_netted_amount: float
    transactions: List[TransactionItem]
    transaction_count: int
    total_amount_settled: float
    savings: float
    before_total_debt: float
    after_total_debt: float
    exact_transaction_count: Optional[int] = None
    optimality_gap: Optional[int] = None


class ContagionRequest(BaseModel):
    """POST /risk/contagion — Simulate systemic default contagion."""
    merchants: List[str] = Field(..., min_length=1)
    debts: List[DebtEdge] = Field(default=[])
    failed_merchant: str
    loss_given_default: float = Field(default=1.0, ge=0.0, le=1.0)
    max_rounds: int = Field(default=5, ge=1, le=20)


class CascadeRoundItem(BaseModel):
    round: int
    type: str
    losses: Dict[str, float]
    round_loss: float


class ContagionResponse(BaseModel):
    failed_merchant: str
    direct_losses: Dict[str, float]
    second_order_losses: Dict[str, float]
    per_merchant_loss: Dict[str, float]
    total_network_loss: float
    affected_merchants: List[str]
    cascade_rounds: List[CascadeRoundItem]
    network_vulnerability_score: float


class MerchantCorrelationRecord(BaseModel):
    merchant_id: str
    avg_delay: float = 0.0
    avg_amount: float = 0.0
    frequency: float = 0.0
    late_rate: float = 0.0


class CorrelationMetric(BaseModel):
    r: float
    p_value: float
    significant: bool
    sample_size: int
    interpretation: str


class CorrelationRequest(BaseModel):
    """POST /risk/correlation."""
    records: Optional[List[MerchantCorrelationRecord]] = None
    series_a: Optional[List[float]] = None
    series_b: Optional[List[float]] = None


class CorrelationResponse(BaseModel):
    delay_vs_amount: Optional[CorrelationMetric] = None
    frequency_vs_late_rate: Optional[CorrelationMetric] = None
    custom_pair: Optional[CorrelationMetric] = None
    sample_size: int


class ZTestRequest(BaseModel):
    """POST /risk/ztest."""
    merchant_id: str
    successes: int = Field(..., ge=0, description="Number of late/default events")
    trials: int = Field(..., ge=1, description="Number of observed months")
    baseline_p: float = Field(default=0.05, gt=0.0, lt=1.0)
    alpha: float = Field(default=0.05, gt=0.0, lt=1.0)
    avg_delay_days: float = Field(default=0.0, ge=0.0)


class ZTestResponse(BaseModel):
    merchant_id: str
    observed_p: float
    baseline_p: float
    z_score: float
    p_value: float
    p_value_two_tailed: float
    is_significant: bool
    sample_size: int
    interpretation: str
    composite_risk_score: float
