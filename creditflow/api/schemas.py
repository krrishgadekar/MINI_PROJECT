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


class PortfolioRiskRequest(BaseModel):
    """POST /risk/portfolio — Score a full portfolio of merchants."""
    merchants: List[MerchantHistoryRequest]


class PortfolioRiskResponse(BaseModel):
    merchants: int
    portfolio_average_risk: float
    profiles: List[RiskScoreResponse]
