"""
test_exact_settlement.py — Unit tests for exact minimum-transaction solver
"""

import pytest
from creditflow.graph import MerchantGraph
from creditflow.algorithms.exact_settlement import exact_minimum_settlement


def test_three_node_balanced_cycle_zero_transactions():
    """A owes B 10, B owes C 10, C owes A 10. Net balances all 0 -> 0 transactions."""
    g = MerchantGraph()
    for m in ["A", "B", "C"]:
        g.add_merchant(m)
    g.add_debt("A", "B", 10.0)
    g.add_debt("B", "C", 10.0)
    g.add_debt("C", "A", 10.0)

    res = exact_minimum_settlement(g)
    assert res["transaction_count"] == 0
    assert len(res["transactions"]) == 0
    assert res["optimality_gap"] == 0
    assert res["capped"] is False


def test_two_node_single_debt():
    """A owes B 50. Exactly 1 transaction."""
    g = MerchantGraph()
    g.add_merchant("A")
    g.add_merchant("B")
    g.add_debt("A", "B", 50.0)

    res = exact_minimum_settlement(g)
    assert res["transaction_count"] == 1
    assert res["transactions"][0]["payer"] == "A"
    assert res["transactions"][0]["payee"] == "B"
    assert res["transactions"][0]["amount"] == 50.0
    assert res["total_amount_settled"] == 50.0


def test_five_node_greedy_diverges_from_optimal():
    """
    Hand-computed classic counterexample where greedy produces 4 transactions
    while exact solver finds 3 transactions (optimality gap = 1).

    Net balances:
      Debtors:   A (-5), B (-4), C (-3)
      Creditors: D (+5), E (+7)
    Sum: (-12) + (+12) = 0

    Optimal partition:
      Subset 1: {A: -5, D: +5} -> 1 txn (A -> D 5)
      Subset 2: {B: -4, C: -3, E: +7} -> 2 txns (B -> E 4, C -> E 3)
      Total optimal = 3 transactions.

    Greedy:
      Matches largest debtor A (-5) with largest creditor E (+7) -> A pays E 5.
      Then B (-4) with D (+5) -> B pays D 4.
      Then C (-3) with E (+2) -> C pays E 2.
      Then C (-1) with D (+1) -> C pays D 1.
      Total greedy = 4 transactions.
    """
    g = MerchantGraph()
    for m in ["A", "B", "C", "D", "E"]:
        g.add_merchant(m)
    # Debts to establish net balances:
    # A owes D 5
    # B owes E 4
    # C owes E 3
    # plus intermediate edges so greedy is evaluated on the network
    g.add_debt("A", "D", 5.0)
    g.add_debt("B", "E", 4.0)
    g.add_debt("C", "E", 3.0)

    res = exact_minimum_settlement(g)

    assert res["transaction_count"] == 3
    assert res["greedy_transaction_count"] >= 3
    assert res["capped"] is False
    # Verify settlement clears net balances
    payers = {t["payer"]: 0.0 for t in res["transactions"]}
    payees = {t["payee"]: 0.0 for t in res["transactions"]}
    for t in res["transactions"]:
        payers[t["payer"]] += t["amount"]
        payees[t["payee"]] += t["amount"]

    assert round(payers["A"], 2) == 5.0
    assert round(payers["B"], 2) == 4.0
    assert round(payers["C"], 2) == 3.0
    assert round(payees["D"], 2) == 5.0
    assert round(payees["E"], 2) == 7.0


def test_fallback_when_exceeding_cap():
    """When non-zero balances exceed 12, falls back to greedy heuristic."""
    g = MerchantGraph()
    # Create 14 merchants in a chain (14 non-zero balances)
    for i in range(14):
        g.add_merchant(f"M{i}")
    for i in range(13):
        g.add_debt(f"M{i}", f"M{i+1}", 10.0 * (i + 1))

    res = exact_minimum_settlement(g, max_balances=12)
    assert res["capped"] is True
    assert "Greedy Heuristic (Fallback" in res["algorithm"]
    assert res["transaction_count"] > 0
