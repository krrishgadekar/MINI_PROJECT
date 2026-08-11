"""
test_warshall.py — Unit tests for Warshall's Transitive Closure Algorithm

All expected values in these tests are hand-computed first, then validated
against the implementation. This satisfies the DAA deliverable requirement
of 'unit-test against small hand-solved cases.'

Tests cover:
  1. Simple chain:    A→B→C   (A reaches C transitively, C does not reach A)
  2. 3-node cycle:    A→B→C→A (all nodes reach each other)
  3. Disconnected:    A→B, C→D (A cannot reach C or D; B cannot reach anything)
  4. Single node:     just self-reachability
  5. Cyclic risk pair detection
  6. Reachable merchants query
  7. Performance: larger graph still produces correct results
"""

import pytest
from creditflow.graph import MerchantGraph
from creditflow.algorithms.warshall import (
    warshall_transitive_closure,
    get_reachable_merchants,
    get_cyclic_risk_pairs,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_graph(merchants, edges):
    """Convenience: build a MerchantGraph from lists."""
    g = MerchantGraph()
    for m in merchants:
        g.add_merchant(m)
    for d, c, a in edges:
        g.add_debt(d, c, a)
    return g


# ---------------------------------------------------------------------------
# 1. Simple linear chain: A→B→C
# ---------------------------------------------------------------------------

class TestLinearChain:
    """
    Graph: A --100--> B --80--> C
    Hand-computed closure:
        A: A=T, B=T, C=T   (A reaches B directly, C transitively via B)
        B: A=F, B=T, C=T   (B reaches C directly; cannot go back to A)
        C: A=F, B=F, C=T   (C has no outgoing edges)
    """

    @pytest.fixture
    def graph(self):
        return make_graph(
            ["A", "B", "C"],
            [("A", "B", 100), ("B", "C", 80)],
        )

    def test_a_reaches_b(self, graph):
        reach = warshall_transitive_closure(graph)
        assert reach["A"]["B"] is True

    def test_a_reaches_c_transitively(self, graph):
        reach = warshall_transitive_closure(graph)
        assert reach["A"]["C"] is True

    def test_c_cannot_reach_a(self, graph):
        reach = warshall_transitive_closure(graph)
        assert reach["C"]["A"] is False

    def test_b_cannot_reach_a(self, graph):
        reach = warshall_transitive_closure(graph)
        assert reach["B"]["A"] is False

    def test_all_nodes_reach_themselves(self, graph):
        reach = warshall_transitive_closure(graph)
        for m in ["A", "B", "C"]:
            assert reach[m][m] is True

    def test_no_cyclic_risk_pairs(self, graph):
        pairs = get_cyclic_risk_pairs(graph)
        assert pairs == []


# ---------------------------------------------------------------------------
# 2. 3-node full cycle: A→B→C→A
# ---------------------------------------------------------------------------

class TestFullCycle:
    """
    Graph: A→B→C→A (amounts: 100, 80, 60)
    Hand-computed closure: ALL entries True (every node can reach every other).
    """

    @pytest.fixture
    def graph(self):
        return make_graph(
            ["A", "B", "C"],
            [("A", "B", 100), ("B", "C", 80), ("C", "A", 60)],
        )

    def test_full_closure_is_all_true(self, graph):
        reach = warshall_transitive_closure(graph)
        for u in ["A", "B", "C"]:
            for v in ["A", "B", "C"]:
                assert reach[u][v] is True, f"Expected reach[{u}][{v}] == True"

    def test_all_three_are_cyclic_risk_pairs(self, graph):
        pairs = get_cyclic_risk_pairs(graph)
        pair_set = {frozenset(p) for p in pairs}
        assert frozenset(["A", "B"]) in pair_set
        assert frozenset(["B", "C"]) in pair_set
        assert frozenset(["A", "C"]) in pair_set


# ---------------------------------------------------------------------------
# 3. Disconnected graph: A→B   C→D
# ---------------------------------------------------------------------------

class TestDisconnectedGraph:
    """
    Graph: A→B=50, C→D=30  (two separate components)
    Hand-computed closure:
        A: A=T, B=T, C=F, D=F
        B: A=F, B=T, C=F, D=F
        C: A=F, B=F, C=T, D=T
        D: A=F, B=F, C=F, D=T
    """

    @pytest.fixture
    def graph(self):
        return make_graph(
            ["A", "B", "C", "D"],
            [("A", "B", 50), ("C", "D", 30)],
        )

    def test_a_cannot_reach_c_or_d(self, graph):
        reach = warshall_transitive_closure(graph)
        assert reach["A"]["C"] is False
        assert reach["A"]["D"] is False

    def test_c_cannot_reach_a_or_b(self, graph):
        reach = warshall_transitive_closure(graph)
        assert reach["C"]["A"] is False
        assert reach["C"]["B"] is False

    def test_c_can_reach_d(self, graph):
        reach = warshall_transitive_closure(graph)
        assert reach["C"]["D"] is True

    def test_d_cannot_reach_c(self, graph):
        reach = warshall_transitive_closure(graph)
        assert reach["D"]["C"] is False

    def test_no_cyclic_risk_pairs(self, graph):
        pairs = get_cyclic_risk_pairs(graph)
        assert pairs == []


# ---------------------------------------------------------------------------
# 4. Single node
# ---------------------------------------------------------------------------

class TestSingleNode:

    def test_single_node_reaches_itself(self):
        g = MerchantGraph()
        g.add_merchant("Solo")
        reach = warshall_transitive_closure(g)
        assert reach["Solo"]["Solo"] is True

    def test_single_node_no_cyclic_pairs(self):
        g = MerchantGraph()
        g.add_merchant("Solo")
        assert get_cyclic_risk_pairs(g) == []


# ---------------------------------------------------------------------------
# 5. Reachable merchants query
# ---------------------------------------------------------------------------

class TestReachableMerchants:

    def test_reachable_from_chain_start(self):
        g = make_graph(["A", "B", "C"], [("A", "B", 10), ("B", "C", 10)])
        reachable = get_reachable_merchants(g, "A")
        assert set(reachable) == {"B", "C"}

    def test_reachable_from_chain_end(self):
        g = make_graph(["A", "B", "C"], [("A", "B", 10), ("B", "C", 10)])
        reachable = get_reachable_merchants(g, "C")
        assert reachable == []

    def test_reachable_from_cycle(self):
        g = make_graph(["A", "B", "C"], [("A", "B", 10), ("B", "C", 10), ("C", "A", 10)])
        reachable = get_reachable_merchants(g, "A")
        assert set(reachable) == {"B", "C"}

    def test_reachable_raises_for_unknown_merchant(self):
        g = make_graph(["A", "B"], [("A", "B", 10)])
        with pytest.raises(ValueError):
            get_reachable_merchants(g, "GHOST")


# ---------------------------------------------------------------------------
# 6. Larger graph correctness
# ---------------------------------------------------------------------------

class TestLargerGraph:
    """
    5-node graph:
        A→B=10, B→C=10, C→D=10, D→E=10, A→E=10
    Expected: A reaches all; E reaches nothing (no outgoing edges)
    """

    @pytest.fixture
    def graph(self):
        return make_graph(
            ["A", "B", "C", "D", "E"],
            [("A","B",10),("B","C",10),("C","D",10),("D","E",10),("A","E",10)],
        )

    def test_a_reaches_all(self, graph):
        reach = warshall_transitive_closure(graph)
        for v in ["B", "C", "D", "E"]:
            assert reach["A"][v] is True, f"A should reach {v}"

    def test_e_reaches_nothing(self, graph):
        reach = warshall_transitive_closure(graph)
        for v in ["A", "B", "C", "D"]:
            assert reach["E"][v] is False, f"E should not reach {v}"
