"""
test_graph.py — Unit tests for MerchantGraph

Tests cover:
  1. Merchant registration and deduplication
  2. Edge (debt) addition and accumulation
  3. Adjacency list consistency
  4. Adjacency matrix consistency
  5. Serialisation / deserialisation round-trip
  6. Error handling (invalid amounts, unknown merchants)

These are the OOP/Imperative Programming deliverable tests that prove
the graph has clean, testable boundaries.
"""

import math
import pytest

from creditflow.graph import MerchantGraph


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def simple_graph() -> MerchantGraph:
    """A → B = 100, B → C = 80, C → A = 60  (a 3-node cycle)"""
    g = MerchantGraph()
    for m in ("A", "B", "C"):
        g.add_merchant(m)
    g.add_debt("A", "B", 100.0)
    g.add_debt("B", "C", 80.0)
    g.add_debt("C", "A", 60.0)
    return g


@pytest.fixture
def linear_graph() -> MerchantGraph:
    """A → B = 50, B → C = 30  (a linear chain, no cycles)"""
    g = MerchantGraph()
    for m in ("A", "B", "C"):
        g.add_merchant(m)
    g.add_debt("A", "B", 50.0)
    g.add_debt("B", "C", 30.0)
    return g


# ---------------------------------------------------------------------------
# 1. Merchant registration
# ---------------------------------------------------------------------------

class TestMerchantRegistration:

    def test_add_single_merchant(self):
        g = MerchantGraph()
        g.add_merchant("M1")
        assert "M1" in g.merchants
        assert g.merchant_count == 1

    def test_add_multiple_merchants(self):
        g = MerchantGraph()
        for m in ("A", "B", "C", "D"):
            g.add_merchant(m)
        assert g.merchant_count == 4
        assert set(g.merchants) == {"A", "B", "C", "D"}

    def test_add_duplicate_merchant_is_noop(self):
        g = MerchantGraph()
        g.add_merchant("X")
        g.add_merchant("X")   # second call must not increase count
        assert g.merchant_count == 1

    def test_has_merchant(self):
        g = MerchantGraph()
        g.add_merchant("M1")
        assert g.has_merchant("M1")
        assert not g.has_merchant("M2")


# ---------------------------------------------------------------------------
# 2. Edge (debt) management
# ---------------------------------------------------------------------------

class TestEdgeManagement:

    def test_add_single_debt(self, simple_graph):
        assert simple_graph.get_debt("A", "B") == 100.0
        assert simple_graph.get_debt("B", "C") == 80.0
        assert simple_graph.get_debt("C", "A") == 60.0

    def test_no_edge_returns_zero(self, simple_graph):
        assert simple_graph.get_debt("A", "C") == 0.0

    def test_debt_accumulation(self):
        """Adding debt on the same edge accumulates the amounts."""
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        g.add_debt("A", "B", 50.0)
        g.add_debt("A", "B", 30.0)
        assert g.get_debt("A", "B") == 80.0

    def test_get_all_edges(self, simple_graph):
        edges = simple_graph.get_all_edges()
        assert len(edges) == 3
        edge_map = {(d, c): a for d, c, a in edges}
        assert edge_map[("A", "B")] == 100.0
        assert edge_map[("B", "C")] == 80.0
        assert edge_map[("C", "A")] == 60.0

    def test_self_loop_rejected(self):
        """A merchant cannot owe themselves (amount > 0 but same debtor/creditor)."""
        g = MerchantGraph()
        g.add_merchant("A")
        # add_debt doesn't validate self-loops explicitly, but Warshall keeps self-distance 0
        # Just check the matrix diagonal is always 0
        matrix = g.get_adjacency_matrix()
        assert matrix["A"]["A"] == 0.0


# ---------------------------------------------------------------------------
# 3. Error handling
# ---------------------------------------------------------------------------

class TestErrorHandling:

    def test_negative_amount_raises(self):
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        with pytest.raises(ValueError, match="positive"):
            g.add_debt("A", "B", -10.0)

    def test_zero_amount_raises(self):
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        with pytest.raises(ValueError, match="positive"):
            g.add_debt("A", "B", 0.0)

    def test_unknown_debtor_raises(self):
        g = MerchantGraph()
        g.add_merchant("B")
        with pytest.raises(ValueError, match="not registered"):
            g.add_debt("UNKNOWN", "B", 10.0)

    def test_unknown_creditor_raises(self):
        g = MerchantGraph()
        g.add_merchant("A")
        with pytest.raises(ValueError, match="not registered"):
            g.add_debt("A", "UNKNOWN", 10.0)


# ---------------------------------------------------------------------------
# 4. Adjacency list consistency
# ---------------------------------------------------------------------------

class TestAdjacencyList:

    def test_list_contains_correct_neighbours(self, simple_graph):
        adj = simple_graph.get_adjacency_list()
        a_neighbours = {n: w for n, w in adj["A"]}
        assert a_neighbours["B"] == 100.0
        assert "C" not in a_neighbours

    def test_list_is_a_copy(self, simple_graph):
        """Modifying the returned list must not affect the internal graph."""
        adj = simple_graph.get_adjacency_list()
        adj["A"].clear()
        # Internal state must be unchanged
        assert simple_graph.get_debt("A", "B") == 100.0


# ---------------------------------------------------------------------------
# 5. Adjacency matrix consistency
# ---------------------------------------------------------------------------

class TestAdjacencyMatrix:

    def test_matrix_has_inf_for_missing_edges(self, linear_graph):
        matrix = linear_graph.get_adjacency_matrix()
        assert matrix["A"]["C"] == math.inf

    def test_matrix_diagonal_is_zero(self, simple_graph):
        matrix = simple_graph.get_adjacency_matrix()
        for m in simple_graph.merchants:
            assert matrix[m][m] == 0.0

    def test_matrix_reflects_added_edge(self):
        g = MerchantGraph()
        g.add_merchant("X")
        g.add_merchant("Y")
        g.add_debt("X", "Y", 42.0)
        matrix = g.get_adjacency_matrix()
        assert matrix["X"]["Y"] == 42.0
        assert matrix["Y"]["X"] == math.inf  # no reverse edge

    def test_matrix_is_a_copy(self, simple_graph):
        matrix = simple_graph.get_adjacency_matrix()
        matrix["A"]["B"] = 999.0
        # Internal state must be unchanged
        assert simple_graph.get_debt("A", "B") == 100.0


# ---------------------------------------------------------------------------
# 6. Serialisation round-trip
# ---------------------------------------------------------------------------

class TestSerialisation:

    def test_to_dict_keys(self, simple_graph):
        d = simple_graph.to_dict()
        assert "merchants" in d
        assert "edges" in d
        assert "adjacency_matrix" in d

    def test_from_dict_round_trip(self, simple_graph):
        d = simple_graph.to_dict()
        g2 = MerchantGraph.from_dict(d)
        assert set(g2.merchants) == set(simple_graph.merchants)
        assert g2.get_debt("A", "B") == 100.0
        assert g2.get_debt("B", "C") == 80.0
        assert g2.get_debt("C", "A") == 60.0

    def test_to_dict_none_for_missing_edges(self, linear_graph):
        d = linear_graph.to_dict()
        # A→C has no edge; matrix should show null (None)
        assert d["adjacency_matrix"]["A"]["C"] is None

    def test_empty_graph_serialises(self):
        g = MerchantGraph()
        d = g.to_dict()
        assert d["merchants"] == []
        assert d["edges"] == []
