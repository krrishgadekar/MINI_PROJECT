"""
test_cycle_optimize.py — Unit tests for cycle pre-netting and settlement optimization
"""

import pytest
from creditflow.graph import MerchantGraph
from creditflow.algorithms.cycle_detection import net_all_cycles
from creditflow.algorithms.settlement import settlement_summary


def test_net_all_cycles_single_cycle():
    """
    A owes B 100, B owes C 80, C owes A 60.
    Min flow is 60.
    After netting:
      A owes B 40
      B owes C 20
      C owes A is eliminated (0)
    Total netted amount = 60.0.
    """
    g = MerchantGraph()
    for m in ["A", "B", "C"]:
        g.add_merchant(m)
    g.add_debt("A", "B", 100.0)
    g.add_debt("B", "C", 80.0)
    g.add_debt("C", "A", 60.0)

    netted_g, cycles_netted, total_netted = net_all_cycles(g)

    assert total_netted == 60.0
    assert len(cycles_netted) == 1
    assert netted_g.get_debt("A", "B") == 40.0
    assert netted_g.get_debt("B", "C") == 20.0
    assert netted_g.get_debt("C", "A") == 0.0

    # Remaining graph is acyclic
    from creditflow.algorithms.cycle_detection import has_cycle
    assert not has_cycle(netted_g)


def test_net_all_cycles_two_intersecting_cycles():
    """
    Graph with two loops:
      Loop 1: A -> B (50) -> A (50)
      Loop 2: B -> C (30) -> D (30) -> B (30)
    All cycles should be netted to 0.
    """
    g = MerchantGraph()
    for m in ["A", "B", "C", "D"]:
        g.add_merchant(m)
    g.add_debt("A", "B", 50.0)
    g.add_debt("B", "A", 50.0)
    g.add_debt("B", "C", 30.0)
    g.add_debt("C", "D", 30.0)
    g.add_debt("D", "B", 30.0)

    netted_g, cycles_netted, total_netted = net_all_cycles(g)
    assert total_netted == 80.0
    assert len(netted_g.get_all_edges()) == 0


def test_pre_netting_reduces_settlement_volume():
    """
    Cycle pre-netting strictly preserves net balances while reducing intermediate edge volume.
    """
    g = MerchantGraph()
    for m in ["A", "B", "C"]:
        g.add_merchant(m)
    g.add_debt("A", "B", 100.0)
    g.add_debt("B", "C", 80.0)
    g.add_debt("C", "A", 60.0)

    # Initial net balances:
    # A: -100 + 60 = -40
    # B: +100 - 80 = +20
    # C: +80 - 60  = +20
    initial_summary = settlement_summary(g)

    netted_g, _, _ = net_all_cycles(g)
    netted_summary = settlement_summary(netted_g)

    # Net balances MUST remain identical after netting!
    assert initial_summary["net_balances"] == netted_summary["net_balances"]
    assert netted_summary["total_amount_settled"] == 40.0
