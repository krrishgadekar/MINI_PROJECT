"""
test_correlation_hypothesis.py — Unit tests for Pearson correlation and one-proportion z-test
"""

import pytest
from creditflow.algorithms.correlation import (
    compute_pearson_correlation,
    analyze_merchant_correlations,
)
from creditflow.algorithms.hypothesis import (
    one_proportion_z_test,
    compute_composite_risk,
)


def test_pearson_perfect_positive():
    x = [1.0, 2.0, 3.0, 4.0, 5.0]
    y = [2.0, 4.0, 6.0, 8.0, 10.0]
    res = compute_pearson_correlation(x, y)
    assert res["r"] == 1.0
    assert res["p_value"] < 0.001
    assert res["significant"] is True
    assert res["sample_size"] == 5


def test_pearson_perfect_negative():
    x = [1.0, 2.0, 3.0, 4.0, 5.0]
    y = [10.0, 8.0, 6.0, 4.0, 2.0]
    res = compute_pearson_correlation(x, y)
    assert res["r"] == -1.0
    assert res["p_value"] < 0.001
    assert res["significant"] is True


def test_pearson_zero_variance_guards():
    """All values in x are constant -> variance is 0, correlation undefined, returns 0 without crashing."""
    x = [5.0, 5.0, 5.0, 5.0]
    y = [1.0, 2.0, 3.0, 4.0]
    res = compute_pearson_correlation(x, y)
    assert res["r"] == 0.0
    assert res["significant"] is False


def test_pearson_small_sample():
    """n < 2 returns safe fallback."""
    res = compute_pearson_correlation([1.0], [2.0])
    assert res["r"] == 0.0
    assert res["significant"] is False


def test_analyze_merchant_correlations():
    records = [
        {"merchant_id": "M1", "avg_delay": 5.0, "avg_amount": 100.0, "frequency": 10.0, "late_rate": 0.1},
        {"merchant_id": "M2", "avg_delay": 15.0, "avg_amount": 300.0, "frequency": 5.0, "late_rate": 0.3},
        {"merchant_id": "M3", "avg_delay": 25.0, "avg_amount": 500.0, "frequency": 2.0, "late_rate": 0.5},
    ]
    res = analyze_merchant_correlations(records)
    assert res["sample_size"] == 3
    assert res["delay_vs_amount"]["r"] > 0.95
    assert res["frequency_vs_late_rate"]["r"] < -0.95


def test_one_proportion_z_test_significant():
    """
    Hand-calculated test case:
    Sample: n = 100 trials, 15 late payments (observed p = 0.15).
    Baseline: p0 = 0.05.
    SE = sqrt(0.05 * 0.95 / 100) = sqrt(0.000475) ~= 0.021794
    z = (0.15 - 0.05) / 0.021794 ~= 4.588
    Right-tailed p-value is extremely small (< 0.0001), well below alpha=0.05.
    """
    res = one_proportion_z_test(successes=15, trials=100, baseline_p=0.05)
    assert res["observed_p"] == 0.15
    assert res["baseline_p"] == 0.05
    assert abs(res["z_score"] - 4.588) < 0.01
    assert res["p_value"] < 0.001
    assert res["is_significant"] is True


def test_one_proportion_z_test_insignificant():
    """
    Observed 5 late events in 100 trials (observed p = 0.05, exactly baseline).
    z should be 0.0, p-value should be 0.5 (one-tailed).
    """
    res = one_proportion_z_test(successes=5, trials=100, baseline_p=0.05)
    assert res["observed_p"] == 0.05
    assert res["z_score"] == 0.0
    assert res["p_value"] == 0.5
    assert res["is_significant"] is False


def test_composite_risk_score():
    """
    composite = 0.4 * norm(lambda) + 0.4 * (1 - p_val) + 0.2 * norm(delay)
    For lambda=0.2, p_val=0.01, delay=15 days:
      norm(lambda) = 1 - exp(-0.2) ~= 0.18127
      norm(p_val)  = 1 - 0.01 = 0.99
      norm(delay)  = 15 / 30 = 0.50
      score = 0.4 * 0.18127 + 0.4 * 0.99 + 0.2 * 0.50
            = 0.0725 + 0.3960 + 0.1000 = 0.5685
    """
    score = compute_composite_risk(lambda_rate=0.2, p_value=0.01, avg_delay_days=15.0)
    assert abs(score - 0.5685) < 0.001
