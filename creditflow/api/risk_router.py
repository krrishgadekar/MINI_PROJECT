"""
risk_router.py — Risk API endpoints

Routes:
  POST /risk/score       — Score a single merchant's default risk (Poisson model)
  POST /risk/portfolio   — Score a full portfolio of merchants
  GET  /risk/portfolio/summary — Get portfolio-level risk summary
"""

from fastapi import APIRouter
from creditflow.api.schemas import (
    MerchantHistoryRequest,
    RiskScoreResponse,
    PortfolioRiskRequest,
    PortfolioRiskResponse,
)
from creditflow.algorithms.risk_engine import MerchantRiskProfile, RiskEngine

router = APIRouter(prefix="/risk", tags=["Risk"])

# In-memory risk engine (stateful; populated via POST /risk/portfolio)
_engine: RiskEngine = RiskEngine()


def _score_merchant(req: MerchantHistoryRequest) -> RiskScoreResponse:
    profile = MerchantRiskProfile(req.merchant_id)
    profile.bulk_record([{"late": m.late, "default": m.default} for m in req.history])
    data = profile.to_dict()
    return RiskScoreResponse(**data)


@router.post("/score", response_model=RiskScoreResponse, summary="Score a single merchant's risk")
def score_merchant(req: MerchantHistoryRequest) -> RiskScoreResponse:
    """
    Compute the Poisson-based default risk score for a single merchant.

    Model: P(default next month) = 1 - e^(-λ)
    where λ = (adverse payment events) / (months observed).

    Cold-start merchants (< 3 months history) receive a prior rate of 5%.

    Risk categories:
      LOW      : score < 0.10
      MEDIUM   : 0.10 ≤ score < 0.30
      HIGH     : 0.30 ≤ score < 0.60
      CRITICAL : score ≥ 0.60
    """
    return _score_merchant(req)


@router.post(
    "/portfolio",
    response_model=PortfolioRiskResponse,
    summary="Score a full merchant portfolio",
)
def score_portfolio(req: PortfolioRiskRequest) -> PortfolioRiskResponse:
    """
    Score all merchants in a portfolio and return:
    - Individual risk scores (sorted by risk, highest first)
    - Portfolio average risk
    - Total merchant count

    Also updates the in-memory risk engine for the /risk/portfolio/summary endpoint.
    """
    global _engine
    _engine = RiskEngine()
    profiles = []
    for merchant_req in req.merchants:
        profile = _engine.add_merchant(merchant_req.merchant_id)
        profile.bulk_record([{"late": m.late, "default": m.default} for m in merchant_req.history])
        profiles.append(RiskScoreResponse(**profile.to_dict()))

    # sort by risk_score descending
    profiles.sort(key=lambda p: p.risk_score, reverse=True)

    return PortfolioRiskResponse(
        merchants=len(profiles),
        portfolio_average_risk=_engine.portfolio_average_risk(),
        profiles=profiles,
    )


@router.get(
    "/portfolio/summary",
    response_model=PortfolioRiskResponse,
    summary="Get the last loaded portfolio risk summary",
)
def portfolio_summary() -> PortfolioRiskResponse:
    """
    Return the risk summary of the last portfolio loaded via POST /risk/portfolio.
    """
    data = _engine.to_dict()
    return PortfolioRiskResponse(
        merchants=data["merchants"],
        portfolio_average_risk=data["portfolio_average_risk"],
        profiles=[RiskScoreResponse(**p) for p in data["profiles"]],
    )
