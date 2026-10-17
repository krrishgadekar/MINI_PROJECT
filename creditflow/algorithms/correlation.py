"""
correlation.py — Pearson Correlation Analysis for Credit Risk

Concept Traceability:
  - Foundations of Mathematics & Statistical Methods (SMCS):
    Pearson product-moment correlation coefficient (r) measures linear correlation
    between two financial risk indicators.
        r = sum((x_i - x_mean) * (y_i - y_mean)) / (sqrt(sum((x_i - x_mean)^2)) * sqrt(sum((y_i - y_mean)^2)))

  - Hypotheses Investigated:
    1. Delay vs. Debt Exposure: Does higher average payment delay correlate with larger debt amounts?
    2. Activity vs. Delinquency: Does trade frequency correlate with late-payment rates?
"""

from __future__ import annotations
from typing import Dict, List, Optional, Tuple
import math
from scipy import stats


def compute_pearson_correlation(
    x: List[float],
    y: List[float],
) -> Dict:
    """
    Compute Pearson correlation coefficient r and 2-tailed p-value.

    Guards against zero variance, small sample size (n < 2), or mismatched lengths.
    """
    n = len(x)
    if n != len(y):
        raise ValueError(f"Series length mismatch: x has {n}, y has {len(y)}")

    if n < 2:
        return {
            "r": 0.0,
            "p_value": 1.0,
            "significant": False,
            "sample_size": n,
            "interpretation": "Insufficient sample size (n < 2) to compute correlation.",
        }

    # Check for zero variance
    var_x = sum((val - (sum(x) / n)) ** 2 for val in x)
    var_y = sum((val - (sum(y) / n)) ** 2 for val in y)

    if var_x < 1e-12 or var_y < 1e-12:
        return {
            "r": 0.0,
            "p_value": 1.0,
            "significant": False,
            "sample_size": n,
            "interpretation": "Zero variance detected in one or both series; correlation undefined (returned 0.0).",
        }

    res = stats.pearsonr(x, y)
    r_val = float(res.statistic)
    p_val = float(res.pvalue)

    # Sanitize NaN/inf
    if math.isnan(r_val):
        r_val = 0.0
    if math.isnan(p_val):
        p_val = 1.0

    significant = p_val < 0.05
    if abs(r_val) >= 0.7:
        strength = "strong"
    elif abs(r_val) >= 0.3:
        strength = "moderate"
    else:
        strength = "weak"

    direction = "positive" if r_val > 0 else "negative"
    interp = f"{strength.capitalize()} {direction} linear relationship (p={p_val:.4f})."

    return {
        "r": round(r_val, 4),
        "p_value": round(p_val, 4),
        "significant": significant,
        "sample_size": n,
        "interpretation": interp,
    }


def analyze_merchant_correlations(
    records: List[Dict],
) -> Dict:
    """
    Compute domain correlations across a list of merchant risk records.
    Each record contains:
      {
        "merchant_id": str,
        "avg_delay": float,
        "avg_amount": float,
        "frequency": float,
        "late_rate": float
      }
    """
    if not records:
        empty = {
            "r": 0.0,
            "p_value": 1.0,
            "significant": False,
            "sample_size": 0,
            "interpretation": "No data provided.",
        }
        return {
            "delay_vs_amount": empty,
            "frequency_vs_late_rate": empty,
            "sample_size": 0,
        }

    delays = [float(r.get("avg_delay", 0.0)) for r in records]
    amounts = [float(r.get("avg_amount", 0.0)) for r in records]
    freqs = [float(r.get("frequency", 0.0)) for r in records]
    late_rates = [float(r.get("late_rate", 0.0)) for r in records]

    delay_vs_amount = compute_pearson_correlation(delays, amounts)
    freq_vs_late = compute_pearson_correlation(freqs, late_rates)

    return {
        "delay_vs_amount": delay_vs_amount,
        "frequency_vs_late_rate": freq_vs_late,
        "sample_size": len(records),
    }
