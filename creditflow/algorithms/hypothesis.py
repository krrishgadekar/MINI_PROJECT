"""
hypothesis.py — Statistical Hypothesis Testing (One-Proportion Z-Test)

Concept Traceability:
  - Foundations of Mathematics & Statistical Methods (SMCS):
    Evaluates whether a merchant's observed rate of late payments / defaults
    is statistically significantly higher than the network-wide baseline.

  - Test Formulation:
      H₀ : p = p₀   (merchant's default rate is equal to baseline p₀)
      H₁ : p > p₀   (merchant's default rate is significantly elevated)

      Test Statistic:
          z = (p_hat - p₀) / sqrt( (p₀ * (1 - p₀)) / n )
      p-value = 1 - Φ(z)   (right-tailed test using standard normal CDF)

  - Composite Risk Formulation (Blueprint §11.4):
      composite_score = 0.4 * norm(λ) + 0.4 * (1 - p_value) + 0.2 * norm(delay)
      where norm(λ) = 1 - e^(-λ), norm(delay) = min(1.0, delay / 30.0)
"""

from __future__ import annotations
from typing import Dict, Optional
import math
from scipy import stats


def one_proportion_z_test(
    successes: int,
    trials: int,
    baseline_p: float = 0.05,
    alpha: float = 0.05,
) -> Dict:
    """
    Perform a one-proportion z-test comparing observed sample proportion to baseline.

    Parameters:
    -----------
    successes : int
        Number of adverse payment events (late / default).
    trials : int
        Total number of observed payment cycles (months).
    baseline_p : float
        Network baseline probability of adverse events (default 0.05).
    alpha : float
        Significance threshold (default 0.05 for 95% confidence).

    Returns:
    --------
    dict containing:
      - observed_p: float
      - baseline_p: float
      - z_score: float
      - p_value: float (right-tailed)
      - p_value_two_tailed: float
      - is_significant: bool (p_value < alpha)
      - sample_size: int
    """
    if trials <= 0:
        return {
            "observed_p": 0.0,
            "baseline_p": baseline_p,
            "z_score": 0.0,
            "p_value": 1.0,
            "p_value_two_tailed": 1.0,
            "is_significant": False,
            "sample_size": 0,
            "interpretation": "No observation trials provided.",
        }

    p_hat = successes / trials

    # Standard error under null hypothesis
    se = math.sqrt((baseline_p * (1.0 - baseline_p)) / trials)

    if se < 1e-12:
        z = 0.0
    else:
        z = (p_hat - baseline_p) / se

    # Right-tailed p-value for default risk (is merchant riskier than baseline?)
    p_val_right = float(1.0 - stats.norm.cdf(z))
    p_val_two_tailed = float(2.0 * (1.0 - stats.norm.cdf(abs(z))))

    # Bounds check
    p_val_right = max(0.0, min(1.0, p_val_right))
    p_val_two_tailed = max(0.0, min(1.0, p_val_two_tailed))

    is_sig = (p_val_right < alpha) and (z > 0)

    interp = (
        f"Observed rate {p_hat:.1%} is statistically significantly higher than "
        f"baseline {baseline_p:.1%} (z={z:.2f}, p={p_val_right:.4f})."
        if is_sig
        else f"Observed rate {p_hat:.1%} does not significantly exceed baseline {baseline_p:.1%}."
    )

    return {
        "observed_p": round(p_hat, 4),
        "baseline_p": round(baseline_p, 4),
        "z_score": round(z, 4),
        "p_value": round(p_val_right, 4),
        "p_value_two_tailed": round(p_val_two_tailed, 4),
        "is_significant": is_sig,
        "sample_size": trials,
        "interpretation": interp,
    }


def compute_composite_risk(
    lambda_rate: float,
    p_value: float,
    avg_delay_days: float = 0.0,
) -> float:
    """
    Compute composite risk score:
        score = 0.4 * norm(λ) + 0.4 * (1 - p_value) + 0.2 * norm(delay)

    Where:
      norm(λ) = 1 - e^(-λ)   (Poisson risk probability, in [0, 1])
      norm(delay) = min(1.0, max(0.0, avg_delay_days) / 30.0)
    """
    norm_lambda = 1.0 - math.exp(-max(0.0, lambda_rate))
    norm_pval = 1.0 - max(0.0, min(1.0, p_value))
    norm_delay = min(1.0, max(0.0, avg_delay_days) / 30.0)

    score = 0.4 * norm_lambda + 0.4 * norm_pval + 0.2 * norm_delay
    return round(score, 4)
