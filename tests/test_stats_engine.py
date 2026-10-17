"""
tests/test_stats_engine.py — Unit tests for stats_engine (AL-07, AL-08, AL-09)
"""

import math
import pytest
from creditflow.algorithms.stats_engine import (
    one_proportion_ztest,
    pearson,
    composite_risk,
    risk_label,
)


def test_one_proportion_ztest_hand_computed():
    """
    Hand-computed example for one_proportion_ztest:
    -----------------------------------------------
    late = 10, total = 100, p0 = 0.05
    p_hat = 10 / 100 = 0.10
    se = sqrt(p0 * (1 - p0) / n)
       = sqrt(0.05 * 0.95 / 100)
       = sqrt(0.0475 / 100)
       = sqrt(0.000475)
       ≈ 0.02179449471770337
    z = (p_hat - p0) / se
      = (0.10 - 0.05) / 0.02179449471770337
      = 0.05 / 0.02179449471770337
      ≈ 2.294157338705618
    p = 1 - Phi(z)
      = 1 - Phi(2.294157)
      ≈ 0.01088998
    """
    z, p = one_proportion_ztest(late=10, total=100, p0=0.05)
    expected_se = math.sqrt(0.05 * 0.95 / 100)
    expected_z = (0.10 - 0.05) / expected_se
    assert pytest.approx(z, rel=1e-4) == expected_z
    assert pytest.approx(p, rel=1e-3) == 0.01089
    assert p < 0.05  # Statistically significant elevation


def test_one_proportion_ztest_synthetic_high_late_merchant():
    """
    Synthetic high-late merchant: 15 late payments out of 40 months (37.5%).
    Baseline p0 = 0.05.
    Must yield p < 0.05.
    """
    z, p = one_proportion_ztest(late=15, total=40, p0=0.05)
    assert z > 0
    assert p < 0.05


def test_pearson_hand_computed():
    """
    Hand-computed example for pearson:
    ----------------------------------
    x = [1.0, 2.0, 3.0, 4.0, 5.0]  -> mean_x = 3.0
    y = [2.0, 4.0, 6.0, 8.0, 10.0] -> mean_y = 6.0
    dx = [-2, -1, 0, 1, 2]
    dy = [-4, -2, 0, 2, 4]
    sum(dx * dy) = 8 + 2 + 0 + 2 + 8 = 20.0
    sum(dx^2) = 4 + 1 + 0 + 1 + 4 = 10.0
    sum(dy^2) = 16 + 4 + 0 + 4 + 16 = 40.0
    r = sum(dx * dy) / sqrt(sum(dx^2) * sum(dy^2))
      = 20.0 / sqrt(10.0 * 40.0)
      = 20.0 / sqrt(400.0)
      = 20.0 / 20.0 = 1.0
    p = 0.0
    """
    x = [1.0, 2.0, 3.0, 4.0, 5.0]
    y = [2.0, 4.0, 6.0, 8.0, 10.0]
    r, p = pearson(x, y)
    assert pytest.approx(r, abs=1e-5) == 1.0
    assert pytest.approx(p, abs=1e-5) == 0.0


def test_pearson_independent_series():
    """
    Independent / uncorrelated series:
    Symmetric quadratic relationship (y = x^2) with zero linear covariance:
    x = [-2, -1, 0, 1, 2]
    y = [4, 1, 0, 1, 4]
    sum(dx * dy) = (-2)*4 + (-1)*1 + 0*0 + 1*1 + 2*4 = 0.0.
    Must yield |r| < 0.1 (exact r = 0.0).
    """
    x = [-2.0, -1.0, 0.0, 1.0, 2.0]
    y = [4.0, 1.0, 0.0, 1.0, 4.0]
    r, p = pearson(x, y)
    assert abs(r) < 0.1
    assert pytest.approx(r, abs=1e-5) == 0.0



def test_pearson_guards():
    """Test guards: length < 3 or zero variance."""
    # len < 3
    r, p = pearson([1.0, 2.0], [2.0, 4.0])
    assert r == 0.0 and p == 1.0

    # zero variance in x
    r, p = pearson([3.0, 3.0, 3.0], [1.0, 2.0, 3.0])
    assert r == 0.0 and p == 1.0

    # zero variance in y
    r, p = pearson([1.0, 2.0, 3.0], [5.0, 5.0, 5.0])
    assert r == 0.0 and p == 1.0


def test_composite_risk_hand_computed():
    """
    Hand-computed example for composite_risk:
    ----------------------------------------
    lambda_ = 0.5
    p_value = 0.01
    avg_delay = 15.0

    norm(lambda) = 1 - exp(-0.5) ≈ 1 - 0.60653066 = 0.39346934
    1 - p = 1 - 0.01 = 0.99
    norm(delay) = min(1.0, 15.0 / 30.0) = 0.5

    composite_score = 0.4 * norm(lambda) + 0.4 * (1 - p) + 0.2 * norm(delay)
                    = 0.4 * 0.39346934 + 0.4 * 0.99 + 0.2 * 0.5
                    = 0.15738774 + 0.396 + 0.1
                    = 0.65338774
                    ≈ 0.6534
    """
    score = composite_risk(lambda_=0.5, p_value=0.01, avg_delay=15.0)
    assert pytest.approx(score, abs=1e-4) == 0.6534


def test_risk_label_thresholds():
    """
    Test label thresholds:
      - LOW for < 0.33
      - MEDIUM for 0.33 <= score < 0.66
      - HIGH for 0.66 <= score <= 0.85
      - CRITICAL for > 0.85
    """
    assert risk_label(0.15) == "LOW"
    assert risk_label(0.329) == "LOW"
    assert risk_label(0.33) == "MEDIUM"
    assert risk_label(0.50) == "MEDIUM"
    assert risk_label(0.659) == "MEDIUM"
    assert risk_label(0.66) == "HIGH"
    assert risk_label(0.85) == "HIGH"
    assert risk_label(0.851) == "CRITICAL"
    assert risk_label(0.95) == "CRITICAL"
    assert risk_label(None) == "UNKNOWN"
