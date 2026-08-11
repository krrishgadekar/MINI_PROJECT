"""
risk_engine.py — Poisson-Distribution Credit Risk Scoring

Concept Traceability:
  - Statistical Methods / Foundation of Mathematics:
      Risk score is built on a Poisson distribution over default/late-payment events.

      Modeling assumption:
        Events (defaults/late payments) are INDEPENDENT and occur at a constant
        rate λ = (number of past late/default events) / (number of months observed).

      The Poisson PMF gives the probability of k events in the next month:
          P(X = k) = (λ^k * e^(-λ)) / k!

      We derive the risk score as the probability of AT LEAST ONE default event
      in the upcoming month:
          P(X ≥ 1) = 1 - P(X = 0) = 1 - e^(-λ)

      Where this breaks down (explicitly stated for the guide):
        - Real defaults are NOT independent — economic downturns cause correlated failures.
        - λ may not be stationary over time (merchant business is seasonal).
        - Requires sufficient historical data; cold-start merchants get a prior default rate.

  - OOP / Imperative Programming: MerchantRiskProfile is a clean class with
    testable methods, not a bag of functions.
"""

from __future__ import annotations
from typing import Dict, List, Optional
import math


# ---------------------------------------------------------------------------
# Merchant Risk Profile
# ---------------------------------------------------------------------------

class MerchantRiskProfile:
    """
    Holds the payment history for a single merchant and computes their
    Poisson-based default risk score.
    """

    # Prior rate used for cold-start merchants with no history (< MIN_MONTHS data)
    COLD_START_RATE: float = 0.05   # 5 % baseline industry default rate
    MIN_MONTHS: int = 3             # minimum months before we trust the empirical rate

    def __init__(self, merchant_id: str) -> None:
        self.merchant_id = merchant_id
        self._months_observed: int = 0
        self._late_payment_events: int = 0   # number of months with a late/default event
        self._default_events: int = 0        # full defaults (missed entirely)

    @property
    def months_observed(self) -> int:
        return self._months_observed

    # ------------------------------------------------------------------
    # Data ingestion
    # ------------------------------------------------------------------

    def record_month(self, had_late_payment: bool, had_default: bool = False) -> None:
        """
        Record one month of payment history.

        Parameters
        ----------
        had_late_payment : bool
            True if the merchant made a late (but eventually paid) payment this month.
        had_default : bool
            True if the merchant fully defaulted (did not pay) this month.
        """
        self._months_observed += 1
        if had_late_payment or had_default:
            self._late_payment_events += 1
        if had_default:
            self._default_events += 1

    def bulk_record(self, history: List[Dict]) -> None:
        """
        Record multiple months at once.

        Parameters
        ----------
        history : List[Dict]
            Each dict: {"late": bool, "default": bool}
        """
        for month in history:
            self.record_month(
                had_late_payment=month.get("late", False),
                had_default=month.get("default", False),
            )

    # ------------------------------------------------------------------
    # Rate estimation
    # ------------------------------------------------------------------

    @property
    def lambda_rate(self) -> float:
        """
        Estimate λ — the expected number of adverse payment events per month.

        Returns the cold-start prior if insufficient history is available.
        """
        if self._months_observed < self.MIN_MONTHS:
            return self.COLD_START_RATE
        return self._late_payment_events / self._months_observed

    # ------------------------------------------------------------------
    # Risk score
    # ------------------------------------------------------------------

    @property
    def risk_score(self) -> float:
        """
        P(at least one adverse event in the next month) under a Poisson model.

            risk = 1 - e^(-λ)   where λ = self.lambda_rate

        Returns a value in [0, 1].
        """
        return round(1.0 - math.exp(-self.lambda_rate), 4)

    @property
    def risk_category(self) -> str:
        """
        Categorise the risk score into a human-readable label.

        Thresholds (can be tuned based on domain knowledge):
          LOW    : risk < 0.10  (< 10 % chance of adverse event next month)
          MEDIUM : 0.10 ≤ risk < 0.30
          HIGH   : 0.30 ≤ risk < 0.60
          CRITICAL: risk ≥ 0.60
        """
        s = self.risk_score
        if s < 0.10:
            return "LOW"
        elif s < 0.30:
            return "MEDIUM"
        elif s < 0.60:
            return "HIGH"
        else:
            return "CRITICAL"

    def to_dict(self) -> Dict:
        return {
            "merchant_id": self.merchant_id,
            "months_observed": self._months_observed,
            "late_payment_events": self._late_payment_events,
            "default_events": self._default_events,
            "lambda_rate": round(self.lambda_rate, 4),
            "risk_score": self.risk_score,
            "risk_category": self.risk_category,
            "model": "Poisson(λ), P(X≥1) = 1 - e^(-λ)",
            "cold_start": self._months_observed < self.MIN_MONTHS,
        }

    def __repr__(self) -> str:
        return (
            f"MerchantRiskProfile(id={self.merchant_id!r}, "
            f"λ={self.lambda_rate:.4f}, risk={self.risk_score:.4f}, "
            f"category={self.risk_category!r})"
        )


# ---------------------------------------------------------------------------
# Multi-merchant risk engine
# ---------------------------------------------------------------------------

class RiskEngine:
    """
    Manages risk profiles for all merchants in the network.
    Provides portfolio-level risk analysis.
    """

    def __init__(self) -> None:
        self._profiles: Dict[str, MerchantRiskProfile] = {}

    def add_merchant(self, merchant_id: str) -> MerchantRiskProfile:
        """Register a new merchant and return their risk profile."""
        if merchant_id not in self._profiles:
            self._profiles[merchant_id] = MerchantRiskProfile(merchant_id)
        return self._profiles[merchant_id]

    def get_profile(self, merchant_id: str) -> Optional[MerchantRiskProfile]:
        return self._profiles.get(merchant_id)

    def score_all(self) -> List[Dict]:
        """Return risk scores for all merchants, sorted by risk_score descending."""
        return sorted(
            [p.to_dict() for p in self._profiles.values()],
            key=lambda x: x["risk_score"],
            reverse=True,
        )

    def high_risk_merchants(self, threshold: float = 0.30) -> List[str]:
        """Return merchant IDs with risk_score >= threshold."""
        return [
            mid for mid, p in self._profiles.items()
            if p.risk_score >= threshold
        ]

    def portfolio_average_risk(self) -> float:
        """Mean risk score across all registered merchants."""
        if not self._profiles:
            return 0.0
        scores = [p.risk_score for p in self._profiles.values()]
        return round(sum(scores) / len(scores), 4)

    def to_dict(self) -> Dict:
        return {
            "merchants": len(self._profiles),
            "portfolio_average_risk": self.portfolio_average_risk(),
            "profiles": self.score_all(),
        }
