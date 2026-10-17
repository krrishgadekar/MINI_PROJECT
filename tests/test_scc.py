"""
test_scc.py — Unit tests for Tarjan's Strongly Connected Components algorithm
"""

import pytest
from creditflow.graph import MerchantGraph
from creditflow.algorithms.scc import tarjan_scc, scc_summary
from creditflow.algorithms.warshall import get_cyclic_risk_pairs


def test_linear_chain_sccs():
    """A -> B -> C: each vertex is its own SCC (no cycles)."""
    g = MerchantGraph()
    for m in ["A", "B", "C"]:
        g.add_merchant(m)
    g.add_debt("A", "B", 10.0)
    g.add_debt("B", "C", 20.0)

    sccs = tarjan_scc(g)
    assert len(sccs) == 3
    components_as_sets = [set(c) for c in sccs]
    assert {"A"} in components_as_sets
    assert {"B"} in components_as_sets
    assert {"C"} in components_as_sets

    summary = scc_summary(g)
    assert summary["component_count"] == 3
    assert summary["cyclic_component_count"] == 0


def test_single_cycle_scc():
    """A -> B -> C -> A: all 3 vertices belong to a single SCC."""
    g = MerchantGraph()
    for m in ["A", "B", "C"]:
        g.add_merchant(m)
    g.add_debt("A", "B", 10.0)
    g.add_debt("B", "C", 10.0)
    g.add_debt("C", "A", 10.0)

    sccs = tarjan_scc(g)
    assert len(sccs) == 1
    assert set(sccs[0]) == {"A", "B", "C"}

    summary = scc_summary(g)
    assert summary["cyclic_component_count"] == 1
    assert set(summary["cyclic_components"][0]) == {"A", "B", "C"}


def test_disconnected_sccs_with_bridge():
    """
    Component 1: A <-> B (cycle)
    Component 2: C <-> D (cycle)
    Bridge: B -> C (directed, no return)

    Should detect 2 SCCs: {A, B} and {C, D}.
    """
    g = MerchantGraph()
    for m in ["A", "B", "C", "D"]:
        g.add_merchant(m)
    g.add_debt("A", "B", 10.0)
    g.add_debt("B", "A", 10.0)
    g.add_debt("B", "C", 5.0)  # bridge
    g.add_debt("C", "D", 20.0)
    g.add_debt("D", "C", 20.0)

    sccs = tarjan_scc(g)
    assert len(sccs) == 2
    comp_sets = [set(c) for c in sccs]
    assert {"A", "B"} in comp_sets
    assert {"C", "D"} in comp_sets


def test_scc_consistency_with_warshall_cyclic_risk_pairs():
    """
    Merchants in any SCC of size >= 2 must have mutual reachability in Warshall's.
    """
    g = MerchantGraph()
    for m in ["A", "B", "C", "D"]:
        g.add_merchant(m)
    g.add_debt("A", "B", 10.0)
    g.add_debt("B", "C", 15.0)
    g.add_debt("C", "A", 20.0)
    g.add_debt("C", "D", 5.0)  # D is outside the cycle

    sccs = tarjan_scc(g)
    cyclic_sccs = [c for c in sccs if len(c) > 1]
    assert len(cyclic_sccs) == 1
    assert set(cyclic_sccs[0]) == {"A", "B", "C"}

    warshall_pairs = get_cyclic_risk_pairs(g)
    pair_sets = [set(p) for p in warshall_pairs]
    assert {"A", "B"} in pair_sets
    assert {"B", "C"} in pair_sets
    assert {"A", "C"} in pair_sets
    assert not any("D" in p for p in pair_sets)
