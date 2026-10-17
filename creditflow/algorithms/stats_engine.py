"""
stats_engine.py — Statistical calculations for CreditFlow (AL-07, AL-08, AL-09)

Functions:
  - one_proportion_ztest(late, total, p0) -> (z, p) using scipy.stats.norm
  - pearson(x, y) -> (r, p) via scipy.stats.pearsonr with guards (len < 3, zero variance)
  - composite_risk(lambda_, p_value, avg_delay) -> float
      = 0.4*norm(lambda_) + 0.4*(1 - p_value) + 0.2*norm(avg_delay)
      where:
        norm(lambda_) = 1.0 - exp(-max(0.0, lambda_))
        norm(avg_delay) = min(1.0, max(0.0, avg_delay) / 30.0)
  - risk_label(score) -> str
      mapped to LOW (< 0.33), MEDIUM (0.33 <= s < 0.66), HIGH (0.66 <= s <= 0.85), CRITICAL (> 0.85)
"""

from __future__ import annotations
from typing import Sequence, Tuple, Optional
import math
from scipy import stats


def one_proportion_ztest(late: int, total: int, p0: float = 0.05) -> Tuple[float, float]:
    """
    Perform a one-proportion z-test comparing observed sample proportion to baseline.

    H0: p = p0
    H1: p > p0 (right-tailed test)

    z = (p_hat - p0) / sqrt(p0 * (1 - p0) / n)
    p = 1 - norm.cdf(z)
    """
    if total <= 0:
        return 0.0, 1.0

    p_hat = late / total
    se = math.sqrt((p0 * (1.0 - p0)) / total)
    if se < 1e-12:
        return 0.0, 1.0

    z = (p_hat - p0) / se
    p_val = float(1.0 - stats.norm.cdf(z))
    p_val = max(0.0, min(1.0, p_val))
    return float(z), float(p_val)


def pearson(x: Sequence[float], y: Sequence[float]) -> Tuple[float, float]:
    """
    Compute Pearson correlation coefficient r and 2-tailed p-value.

    Guards:
      - len < 3 -> returns (0.0, 1.0)
      - mismatched length -> returns (0.0, 1.0)
      - zero variance in x or y -> returns (0.0, 1.0)
    """
    n = len(x)
    if n != len(y) or n < 3:
        return 0.0, 1.0

    mean_x = sum(x) / n
    mean_y = sum(y) / n
    var_x = sum((val - mean_x) ** 2 for val in x)
    var_y = sum((val - mean_y) ** 2 for val in y)

    if var_x < 1e-12 or var_y < 1e-12:
        return 0.0, 1.0

    res = stats.pearsonr(x, y)
    r_val = float(res.statistic)
    p_val = float(res.pvalue)

    if math.isnan(r_val) or math.isinf(r_val):
        r_val = 0.0
    if math.isnan(p_val) or math.isinf(p_val):
        p_val = 1.0

    return r_val, p_val


def composite_risk(lambda_: float, p_value: float, avg_delay: float = 0.0) -> float:
    """
    Compute composite risk score:
        score = 0.4 * norm(lambda_) + 0.4 * (1 - p_value) + 0.2 * norm(avg_delay)

    Normalisation:
        norm(lambda_) = 1.0 - exp(-max(0.0, lambda_))  (Poisson probability in [0, 1])
        norm(avg_delay) = min(1.0, max(0.0, avg_delay) / 30.0)  (bounded to 30 days)
        p_value clamped in [0, 1]
    """
    norm_lambda = 1.0 - math.exp(-max(0.0, lambda_))
    norm_pval = 1.0 - max(0.0, min(1.0, p_value))
    norm_delay = min(1.0, max(0.0, avg_delay) / 30.0)

    score = 0.4 * norm_lambda + 0.4 * norm_pval + 0.2 * norm_delay
    return round(float(score), 4)


def risk_label(score: Optional[float]) -> str:
    """
    Map composite risk score to risk category:
      - LOW: score < 0.33
      - MEDIUM: 0.33 <= score < 0.66
      - HIGH: 0.66 <= score <= 0.85
      - CRITICAL: score > 0.85
      - UNKNOWN: score is None or invalid
    """
    if score is None or math.isnan(score):
        return "UNKNOWN"
    if score < 0.33:
        return "LOW"
    elif score < 0.66:
        return "MEDIUM"
    elif score <= 0.85:
        return "HIGH"
    else:
        return "CRITICAL"
