"""
risk_router.py — Risk API endpoints

Routes:
  POST /risk/score       — Score a single merchant's default risk (Poisson model)
  POST /risk/portfolio   — Score a full portfolio of merchants
  GET  /risk/portfolio/summary — Get portfolio-level risk summary
"""

from fastapi import APIRouter, HTTPException
from creditflow.api.schemas import (
    MerchantHistoryRequest,
    RiskScoreResponse,
    PortfolioRiskRequest,
    PortfolioRiskResponse,
    ContagionRequest,
    ContagionResponse,
    CascadeRoundItem,
    CorrelationRequest,
    CorrelationResponse,
    CorrelationMetric,
    ZTestRequest,
    ZTestResponse,
)
from creditflow.graph import MerchantGraph
from creditflow.algorithms.risk_engine import MerchantRiskProfile, RiskEngine
from creditflow.algorithms.contagion import simulate_default_contagion
from creditflow.algorithms.correlation import (
    compute_pearson_correlation,
    analyze_merchant_correlations,
)
from creditflow.algorithms.hypothesis import (
    one_proportion_z_test,
    compute_composite_risk,
)

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


def _build_graph_from_contagion_request(req: ContagionRequest) -> MerchantGraph:
    g = MerchantGraph()
    for m in req.merchants:
        g.add_merchant(m)
    for debt in req.debts:
        try:
            g.add_debt(debt.debtor, debt.creditor, debt.amount)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
    return g


@router.post(
    "/contagion",
    response_model=ContagionResponse,
    summary="Simulate default contagion across network",
)
def simulate_contagion(req: ContagionRequest) -> ContagionResponse:
    """
    Simulate financial default contagion initiated by a specified merchant.
    Calculates 1st order direct losses and 2nd+ order cascade exposures.
    """
    g = _build_graph_from_contagion_request(req)
    try:
        res = simulate_default_contagion(
            graph=g,
            failed_merchant=req.failed_merchant,
            loss_given_default=req.loss_given_default,
            max_rounds=req.max_rounds,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ContagionResponse(
        failed_merchant=res["failed_merchant"],
        direct_losses=res["direct_losses"],
        second_order_losses=res["second_order_losses"],
        per_merchant_loss=res["per_merchant_loss"],
        total_network_loss=res["total_network_loss"],
        affected_merchants=res["affected_merchants"],
        cascade_rounds=[CascadeRoundItem(**r) for r in res["cascade_rounds"]],
        network_vulnerability_score=res["network_vulnerability_score"],
    )


@router.post(
    "/correlation",
    response_model=CorrelationResponse,
    summary="Compute Pearson correlation coefficient and p-value",
)
def compute_correlation_endpoint(req: CorrelationRequest) -> CorrelationResponse:
    """
    Compute Pearson correlation between credit risk indicators:
      - avg_delay vs avg_amount
      - trade frequency vs late_rate
      - or a custom pair of numeric series
    """
    if req.records is not None:
        dict_records = [r.model_dump() for r in req.records]
        res = analyze_merchant_correlations(dict_records)
        return CorrelationResponse(
            delay_vs_amount=CorrelationMetric(**res["delay_vs_amount"]),
            frequency_vs_late_rate=CorrelationMetric(**res["frequency_vs_late_rate"]),
            sample_size=res["sample_size"],
        )
    elif req.series_a is not None and req.series_b is not None:
        try:
            pair_res = compute_pearson_correlation(req.series_a, req.series_b)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        return CorrelationResponse(
            custom_pair=CorrelationMetric(**pair_res),
            sample_size=pair_res["sample_size"],
        )
    else:
        raise HTTPException(
            status_code=422,
            detail="Must provide either 'records' or ('series_a' and 'series_b').",
        )


@router.post(
    "/ztest",
    response_model=ZTestResponse,
    summary="Perform one-proportion z-test on merchant late payments",
)
def perform_z_test_endpoint(req: ZTestRequest) -> ZTestResponse:
    """
    Test whether a merchant's rate of adverse payment events is statistically
    significantly higher than the network baseline rate.
    Also produces a composite risk score blending Poisson lambda, p-value, and delay.
    """
    res = one_proportion_z_test(
        successes=req.successes,
        trials=req.trials,
        baseline_p=req.baseline_p,
        alpha=req.alpha,
    )
    emp_lambda = req.successes / req.trials
    comp_risk = compute_composite_risk(
        lambda_rate=emp_lambda,
        p_value=res["p_value"],
        avg_delay_days=req.avg_delay_days,
    )
    return ZTestResponse(
        merchant_id=req.merchant_id,
        observed_p=res["observed_p"],
        baseline_p=res["baseline_p"],
        z_score=res["z_score"],
        p_value=res["p_value"],
        p_value_two_tailed=res["p_value_two_tailed"],
        is_significant=res["is_significant"],
        sample_size=res["sample_size"],
        interpretation=res["interpretation"],
        composite_risk_score=comp_risk,
    )
