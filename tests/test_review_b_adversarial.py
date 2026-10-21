"""
test_review_b_adversarial.py — Slice B (Settlement & Graph) Review Tests (Chetan)

Adversarial and boundary condition verification for:
  - 13+ non-zero balances cap fallback vs 12-balance exact bitmask DP
  - Floating point debt sums (0.1 + 0.2) and conservation of zero-sum balances
  - Duplicate debts between a single pair accumulating into aggregated weights
  - Empty graphs and single-merchant networks
  - Self-loop debt behavior and non-negative transaction amounts
"""

import pytest
from creditflow.graph import MerchantGraph
from creditflow.algorithms.exact_settlement import exact_minimum_settlement
from creditflow.algorithms.settlement import (
    compute_net_balances,
    greedy_minimum_settlement,
    settlement_summary,
)
from creditflow.algorithms.cycle_detection import (
    find_all_cycles,
    has_cycle,
    net_cycle,
    net_all_cycles,
)
from creditflow.algorithms.scc import tarjan_scc, scc_summary


class TestSliceBAdversarial:
    """Adversarial test suite covering Slice B core graph & settlement invariants."""

    def test_cap_fallback_at_13_balances(self) -> None:
        """
        13 non-zero balances exceeds MAX_EXACT_BALANCES (12).
        The exact solver must safely fall back to greedy heuristic and report capped=True.
        """
        g = MerchantGraph()
        # Create 13 merchants in a directed ring
        names = [f"M_{i}" for i in range(13)]
        for name in names:
            g.add_merchant(name)

        for i in range(13):
            # Imbalanced ring so all 13 have non-zero net balances
            g.add_debt(names[i], names[(i + 1) % 13], 100.0 + (i * 10))

        balances = compute_net_balances(g)
        non_zero_count = sum(1 for b in balances.values() if abs(b) > 1e-6)
        assert non_zero_count == 13

        res = exact_minimum_settlement(g, max_balances=12)
        assert res["capped"] is True
        assert "Fallback" in res["algorithm"]
        assert res["transaction_count"] > 0
        assert res["optimality_gap"] == 0

    def test_exact_solver_at_12_balances_boundary(self) -> None:
        """
        Exactly 12 non-zero balances is within the solver cap.
        Must execute the bitmask DP exact solver and report capped=False.
        """
        g = MerchantGraph()
        names = [f"M_{i}" for i in range(12)]
        for name in names:
            g.add_merchant(name)

        # 6 positive, 6 negative matching in pairs
        for i in range(6):
            g.add_debt(names[i], names[i + 6], 50.0 * (i + 1))

        balances = compute_net_balances(g)
        non_zero_count = sum(1 for b in balances.values() if abs(b) > 1e-6)
        assert non_zero_count == 12

        res = exact_minimum_settlement(g, max_balances=12)
        assert res["capped"] is False
        assert res["algorithm"] == "Exact Backtracking (Optimal)"
        assert res["transaction_count"] == 6

    def test_floating_point_amounts_precision(self) -> None:
        """
        Floating point amounts like 0.1 and 0.2 must not introduce precision drift.
        0.1 + 0.2 = 0.30000000000000004 in IEEE 754 float; rounding to 2 decimals
        ensures balances sum to exactly 0.0 and transactions clear accurately.
        """
        g = MerchantGraph()
        g.add_merchant("Debtor")
        g.add_merchant("Creditor_1")
        g.add_merchant("Creditor_2")

        g.add_debt("Debtor", "Creditor_1", 0.1)
        g.add_debt("Debtor", "Creditor_2", 0.2)

        balances = compute_net_balances(g)
        assert balances["Debtor"] == -0.3
        assert balances["Creditor_1"] == 0.1
        assert balances["Creditor_2"] == 0.2
        assert abs(sum(balances.values())) < 1e-6

        res = exact_minimum_settlement(g)
        assert res["total_amount_settled"] == 0.3
        assert res["transaction_count"] == 2

    def test_duplicate_debts_for_one_pair(self) -> None:
        """
        Adding multiple debts between the same debtor and creditor must accumulate
        into a single directed weight without duplicate edge corruption.
        """
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")

        g.add_debt("A", "B", 100.0)
        g.add_debt("A", "B", 50.0)
        g.add_debt("A", "B", 25.5)

        assert g.get_debt("A", "B") == 175.5
        all_edges = g.get_all_edges()
        assert len(all_edges) == 1
        assert all_edges[0] == ("A", "B", 175.5)

    def test_empty_graph_settlement_and_cycles(self) -> None:
        """An empty graph with 0 merchants must return clean empty results."""
        g = MerchantGraph()
        assert g.merchants == []
        assert g.merchant_count == 0

        balances = compute_net_balances(g)
        assert balances == {}

        greedy_txns = greedy_minimum_settlement(g)
        assert greedy_txns == []

        exact_res = exact_minimum_settlement(g)
        assert exact_res["transactions"] == []
        assert exact_res["transaction_count"] == 0
        assert exact_res["capped"] is False

        assert has_cycle(g) is False
        assert find_all_cycles(g) == []
        assert tarjan_scc(g) == []

    def test_single_merchant_settlement_and_cycles(self) -> None:
        """A single isolated merchant has 0 net balance, 0 transactions, and no cycles."""
        g = MerchantGraph()
        g.add_merchant("Solo")

        balances = compute_net_balances(g)
        assert balances == {"Solo": 0.0}

        greedy_txns = greedy_minimum_settlement(g)
        assert greedy_txns == []

        exact_res = exact_minimum_settlement(g)
        assert exact_res["transaction_count"] == 0
        assert exact_res["transactions"] == []

        assert has_cycle(g) is False
        assert find_all_cycles(g) == []
        sccs = tarjan_scc(g)
        assert sccs == [["Solo"]]

    def test_self_loop_net_balance_conservation(self) -> None:
        """
        If a self-debt A→A is added, net balance for A must remain 0.0,
        and settlement produces 0 transactions.
        """
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_debt("A", "A", 250.0)

        balances = compute_net_balances(g)
        assert abs(balances["A"]) < 1e-6

        txns = greedy_minimum_settlement(g)
        assert txns == []

        exact_res = exact_minimum_settlement(g)
        assert exact_res["transaction_count"] == 0
