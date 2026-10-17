"""
test_contagion.py — Unit tests for default-contagion simulator
"""

import pytest
from creditflow.graph import MerchantGraph
from creditflow.algorithms.contagion import simulate_default_contagion


def test_direct_contagion():
    """
    X owes Y 100 and owes Z 50.
    If X defaults:
      Y suffers direct loss of 100.
      Z suffers direct loss of 50.
      Total network loss = 150.
    """
    g = MerchantGraph()
    for m in ["X", "Y", "Z"]:
        g.add_merchant(m)
    g.add_debt("X", "Y", 100.0)
    g.add_debt("X", "Z", 50.0)

    res = simulate_default_contagion(g, failed_merchant="X")
    assert res["failed_merchant"] == "X"
    assert res["direct_losses"]["Y"] == 100.0
    assert res["direct_losses"]["Z"] == 50.0
    assert res["total_network_loss"] == 150.0
    assert set(res["affected_merchants"]) == {"Y", "Z"}
    assert res["network_vulnerability_score"] == 1.0


def test_two_tier_cascading_contagion():
    """
    X owes Y 100.
    Y owes W 80 (Y's total debt is 80).
    When X defaults:
      Round 1: Y suffers direct loss of 100.
      Round 2: Y transmits shock to W.
               W exposure = 100 * (80 / 80) = 80.
    """
    g = MerchantGraph()
    for m in ["X", "Y", "W"]:
        g.add_merchant(m)
    g.add_debt("X", "Y", 100.0)
    g.add_debt("Y", "W", 80.0)

    res = simulate_default_contagion(g, failed_merchant="X")
    assert res["direct_losses"]["Y"] == 100.0
    assert "W" in res["second_order_losses"]
    assert res["second_order_losses"]["W"] == 80.0
    assert len(res["cascade_rounds"]) == 2


def test_isolated_merchant_default():
    """If a merchant has zero outgoing debts, no creditors suffer loss."""
    g = MerchantGraph()
    for m in ["A", "B"]:
        g.add_merchant(m)
    g.add_debt("A", "B", 50.0)

    # B has no outgoing debts to anyone
    res = simulate_default_contagion(g, failed_merchant="B")
    assert res["total_network_loss"] == 0.0
    assert len(res["direct_losses"]) == 0
    assert len(res["affected_merchants"]) == 0


def test_invalid_merchant_raises():
    g = MerchantGraph()
    g.add_merchant("A")
    with pytest.raises(ValueError):
        simulate_default_contagion(g, failed_merchant="UNKNOWN")
