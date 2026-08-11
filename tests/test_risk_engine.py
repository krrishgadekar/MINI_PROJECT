"""
test_risk_engine.py — Unit tests for the Poisson Risk Engine

Tests cover:
  1. Cold-start prior rate (< 3 months of history)
  2. Lambda rate computation from history
  3. Risk score formula: P = 1 - e^(-λ)
  4. Risk category thresholds
  5. Bulk history ingestion
  6. Portfolio-level aggregation
  7. Edge cases (zero late payments, all late payments)

All expected values are hand-computed using:
    λ = late_events / months
    risk = 1 - exp(-λ)
"""

import math
import pytest
from creditflow.algorithms.risk_engine import MerchantRiskProfile, RiskEngine


# ---------------------------------------------------------------------------
# 1. Cold-start prior
# ---------------------------------------------------------------------------

class TestColdStart:

    def test_no_history_uses_prior(self):
        p = MerchantRiskProfile("M1")
        assert p.lambda_rate == MerchantRiskProfile.COLD_START_RATE

    def test_insufficient_history_uses_prior(self):
        """2 months is below MIN_MONTHS=3, so prior is used."""
        p = MerchantRiskProfile("M1")
        p.record_month(had_late_payment=True)
        p.record_month(had_late_payment=False)
        assert p.months_observed == 2
        assert p.lambda_rate == MerchantRiskProfile.COLD_START_RATE

    def test_cold_start_flag(self):
        p = MerchantRiskProfile("M1")
        assert p.to_dict()["cold_start"] is True

    def test_sufficient_history_no_cold_start(self):
        p = MerchantRiskProfile("M1")
        for _ in range(3):
            p.record_month(had_late_payment=False)
        assert p.to_dict()["cold_start"] is False


# ---------------------------------------------------------------------------
# 2. Lambda rate computation
# ---------------------------------------------------------------------------

class TestLambdaRate:

    def test_zero_late_payments(self):
        """6 months, 0 late → λ = 0/6 = 0.0"""
        p = MerchantRiskProfile("M1")
        for _ in range(6):
            p.record_month(had_late_payment=False)
        assert p.lambda_rate == pytest.approx(0.0, abs=1e-6)

    def test_all_late_payments(self):
        """6 months, 6 late → λ = 6/6 = 1.0"""
        p = MerchantRiskProfile("M1")
        for _ in range(6):
            p.record_month(had_late_payment=True)
        assert p.lambda_rate == pytest.approx(1.0, abs=1e-6)

    def test_partial_late_payments(self):
        """12 months, 3 late → λ = 3/12 = 0.25"""
        p = MerchantRiskProfile("M1")
        for i in range(12):
            p.record_month(had_late_payment=(i % 4 == 0))  # every 4th month
        assert p.lambda_rate == pytest.approx(0.25, abs=1e-4)


# ---------------------------------------------------------------------------
# 3. Risk score formula
# ---------------------------------------------------------------------------

class TestRiskScore:

    def test_zero_rate_gives_zero_risk(self):
        """λ=0 → risk = 1 - e^0 = 0"""
        p = MerchantRiskProfile("M1")
        for _ in range(6):
            p.record_month(had_late_payment=False)
        assert p.risk_score == pytest.approx(0.0, abs=1e-6)

    def test_lambda_1_gives_known_risk(self):
        """λ=1.0 → risk = 1 - e^(-1) ≈ 0.6321"""
        p = MerchantRiskProfile("M1")
        for _ in range(6):
            p.record_month(had_late_payment=True)
        expected = 1.0 - math.exp(-1.0)
        assert p.risk_score == pytest.approx(expected, abs=1e-4)

    def test_lambda_0_25_gives_known_risk(self):
        """λ=0.25 → risk = 1 - e^(-0.25) ≈ 0.2212"""
        p = MerchantRiskProfile("M1")
        p.bulk_record([{"late": True, "default": False}] * 3 +
                      [{"late": False, "default": False}] * 9)
        expected = 1.0 - math.exp(-0.25)
        assert p.risk_score == pytest.approx(expected, abs=1e-4)

    def test_risk_score_in_unit_interval(self):
        """Risk must always be in [0, 1]."""
        for late_count in range(0, 13):
            p = MerchantRiskProfile(f"M{late_count}")
            p.bulk_record(
                [{"late": True}] * late_count + [{"late": False}] * (12 - late_count)
            )
            assert 0.0 <= p.risk_score <= 1.0


# ---------------------------------------------------------------------------
# 4. Risk categories
# ---------------------------------------------------------------------------

class TestRiskCategory:

    def test_low_risk(self):
        """0 adverse events in 12 months → risk≈0 → LOW"""
        p = MerchantRiskProfile("M1")
        p.bulk_record([{"late": False}] * 12)
        assert p.risk_category == "LOW"

    def test_medium_risk(self):
        """λ ≈ 0.15 → risk ≈ 0.14 → MEDIUM"""
        p = MerchantRiskProfile("M1")
        # 2 late out of 12 → λ=0.167 → risk≈0.153
        p.bulk_record([{"late": True}] * 2 + [{"late": False}] * 10)
        assert p.risk_category == "MEDIUM"

    def test_high_risk(self):
        """λ ≈ 0.5 → risk ≈ 0.39 → HIGH"""
        p = MerchantRiskProfile("M1")
        # 6 late out of 12 → λ=0.5 → risk=1-e^-0.5≈0.393
        p.bulk_record([{"late": True}] * 6 + [{"late": False}] * 6)
        assert p.risk_category == "HIGH"

    def test_critical_risk(self):
        """λ=1.0 → risk≈0.63 → CRITICAL"""
        p = MerchantRiskProfile("M1")
        p.bulk_record([{"late": True}] * 12)
        assert p.risk_category == "CRITICAL"


# ---------------------------------------------------------------------------
# 5. Default vs late payment distinction
# ---------------------------------------------------------------------------

class TestDefaultVsLate:

    def test_default_counts_as_adverse_event(self):
        p = MerchantRiskProfile("M1")
        p.record_month(had_late_payment=False, had_default=True)
        for _ in range(5):
            p.record_month(had_late_payment=False)
        # 1 default in 6 months → lambda = 1/6
        assert p.lambda_rate == pytest.approx(1/6, abs=1e-4)

    def test_default_count_tracked_separately(self):
        p = MerchantRiskProfile("M1")
        p.record_month(had_late_payment=True, had_default=False)
        p.record_month(had_late_payment=False, had_default=True)
        for _ in range(4):
            p.record_month(had_late_payment=False)
        data = p.to_dict()
        assert data["default_events"] == 1
        assert data["late_payment_events"] == 2


# ---------------------------------------------------------------------------
# 6. Portfolio / RiskEngine
# ---------------------------------------------------------------------------

class TestRiskEngine:

    @pytest.fixture
    def engine_with_data(self) -> RiskEngine:
        engine = RiskEngine()
        # Low risk merchant
        m1 = engine.add_merchant("LowRisk")
        m1.bulk_record([{"late": False}] * 12)
        # High risk merchant
        m2 = engine.add_merchant("HighRisk")
        m2.bulk_record([{"late": True}] * 12)
        return engine

    def test_score_all_returns_all_merchants(self, engine_with_data):
        scores = engine_with_data.score_all()
        assert len(scores) == 2

    def test_score_all_sorted_desc(self, engine_with_data):
        scores = engine_with_data.score_all()
        assert scores[0]["risk_score"] >= scores[1]["risk_score"]

    def test_high_risk_merchants_filter(self, engine_with_data):
        high_risk = engine_with_data.high_risk_merchants(threshold=0.30)
        assert "HighRisk" in high_risk
        assert "LowRisk" not in high_risk

    def test_portfolio_average_risk(self, engine_with_data):
        avg = engine_with_data.portfolio_average_risk()
        # Average of 0.0 and ~0.632
        expected = (0.0 + (1 - math.exp(-1.0))) / 2
        assert avg == pytest.approx(expected, abs=1e-3)

    def test_add_existing_merchant_noop(self):
        engine = RiskEngine()
        engine.add_merchant("X")
        engine.add_merchant("X")
        assert len(engine.score_all()) == 1

    def test_empty_engine_portfolio_average(self):
        engine = RiskEngine()
        assert engine.portfolio_average_risk() == 0.0
