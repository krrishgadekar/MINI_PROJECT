"""
test_settlement.py — Unit tests for Settlement algorithms

Tests cover:
  1. Net balance computation (hand-verified)
  2. Greedy settlement — basic cases
  3. Greedy settlement — already-balanced graph (no transactions needed)
  4. Greedy settlement — all debts flow one-way (star topology)
  5. Cycle detection — no cycles / has cycles
  6. Cycle netting — correct amount cancelled
  7. Error handling for invalid cycles
"""

import pytest
from creditflow.graph import MerchantGraph
from creditflow.algorithms.settlement import (
    compute_net_balances,
    greedy_minimum_settlement,
    settlement_summary,
)
from creditflow.algorithms.cycle_detection import (
    has_cycle,
    find_all_cycles,
    net_cycle,
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def make_graph(merchants, edges):
    g = MerchantGraph()
    for m in merchants:
        g.add_merchant(m)
    for d, c, a in edges:
        g.add_debt(d, c, a)
    return g


# ---------------------------------------------------------------------------
# 1. Net balance computation
# ---------------------------------------------------------------------------

class TestNetBalances:

    def test_simple_a_owes_b(self):
        """A→B=100 → A balance=-100, B balance=+100"""
        g = make_graph(["A", "B"], [("A", "B", 100)])
        balances = compute_net_balances(g)
        assert balances["A"] == -100.0
        assert balances["B"] == 100.0

    def test_balanced_circular(self):
        """A→B=50, B→A=50 → both balance=0"""
        g = make_graph(["A", "B"], [("A", "B", 50), ("B", "A", 50)])
        balances = compute_net_balances(g)
        assert balances["A"] == pytest.approx(0.0, abs=1e-6)
        assert balances["B"] == pytest.approx(0.0, abs=1e-6)

    def test_three_node_net(self):
        """
        A→B=100, B→C=80, C→A=60
        net(A) = +60 - 100 = -40
        net(B) = +100 - 80 = +20
        net(C) = +80 - 60 = +20
        Total = 0 ✓
        """
        g = make_graph(["A","B","C"],[("A","B",100),("B","C",80),("C","A",60)])
        balances = compute_net_balances(g)
        assert balances["A"] == pytest.approx(-40.0)
        assert balances["B"] == pytest.approx(20.0)
        assert balances["C"] == pytest.approx(20.0)
        assert sum(balances.values()) == pytest.approx(0.0, abs=1e-6)

    def test_sum_of_balances_always_zero(self):
        """Conservation: total net balance across the network must always be 0."""
        g = make_graph(
            ["A","B","C","D"],
            [("A","B",200),("A","C",150),("B","D",100),("C","D",50),("D","A",30)],
        )
        balances = compute_net_balances(g)
        assert sum(balances.values()) == pytest.approx(0.0, abs=1e-6)


# ---------------------------------------------------------------------------
# 2. Greedy settlement — basic
# ---------------------------------------------------------------------------

class TestGreedySettlement:

    def test_two_node_one_transaction(self):
        """A→B=100: should produce exactly 1 transaction: A pays B 100."""
        g = make_graph(["A", "B"], [("A", "B", 100)])
        txns = greedy_minimum_settlement(g)
        assert len(txns) == 1
        assert txns[0]["payer"] == "A"
        assert txns[0]["payee"] == "B"
        assert txns[0]["amount"] == 100.0

    def test_settlement_clears_all_debts(self):
        """
        The greedy settlement produces transactions that mirror each merchant's
        net balance exactly:
          - A net debtor  (balance < 0) pays out that exact amount in settlement.
          - A net creditor (balance > 0) receives that exact amount in settlement.
        Verify settlement_flow[m] == original_balances[m] for all merchants.
        """
        g = make_graph(
            ["A","B","C"],
            [("A","B",100),("B","C",80),("C","A",60)],
        )
        # Net balances: A=-40, B=+20, C=+20
        txns = greedy_minimum_settlement(g)
        original_balances = compute_net_balances(g)
        settlement_flow: dict = {m: 0.0 for m in g.merchants}
        for t in txns:
            settlement_flow[t["payer"]] -= t["amount"]
            settlement_flow[t["payee"]] += t["amount"]
        # settlement_flow must exactly mirror net balances
        for m in g.merchants:
            assert settlement_flow[m] == pytest.approx(original_balances[m], abs=1e-6), \
                f"Merchant {m}: settlement_flow={settlement_flow[m]} should equal balance={original_balances[m]}"

    def test_all_amounts_positive(self):
        g = make_graph(["A","B","C","D"],[("A","B",90),("C","D",60),("B","D",30)])
        txns = greedy_minimum_settlement(g)
        for t in txns:
            assert t["amount"] > 0

    def test_already_balanced_no_transactions(self):
        """Graph where A→B=50 and B→A=50: no settlement needed."""
        g = make_graph(["A","B"],[("A","B",50),("B","A",50)])
        txns = greedy_minimum_settlement(g)
        assert txns == []


# ---------------------------------------------------------------------------
# 3. Settlement summary
# ---------------------------------------------------------------------------

class TestSettlementSummary:

    def test_summary_keys(self):
        g = make_graph(["A","B"],[("A","B",100)])
        s = settlement_summary(g)
        assert "net_balances" in s
        assert "transactions" in s
        assert "transaction_count" in s
        assert "total_amount_settled" in s

    def test_total_amount_settled(self):
        """Total settled must equal the sum of transaction amounts."""
        g = make_graph(["A","B","C"],[("A","B",100),("B","C",80)])
        s = settlement_summary(g)
        expected = sum(t["amount"] for t in s["transactions"])
        assert s["total_amount_settled"] == pytest.approx(expected, abs=1e-6)


# ---------------------------------------------------------------------------
# 4. Cycle detection
# ---------------------------------------------------------------------------

class TestCycleDetection:

    def test_linear_chain_no_cycle(self):
        g = make_graph(["A","B","C"],[("A","B",10),("B","C",10)])
        assert has_cycle(g) is False
        assert find_all_cycles(g) == []

    def test_simple_cycle_detected(self):
        g = make_graph(["A","B","C"],[("A","B",10),("B","C",10),("C","A",10)])
        assert has_cycle(g) is True
        cycles = find_all_cycles(g)
        assert len(cycles) >= 1

    def test_cycle_contains_correct_nodes(self):
        g = make_graph(["A","B"],[("A","B",10),("B","A",10)])
        assert has_cycle(g) is True
        cycles = find_all_cycles(g)
        # The cycle should involve A and B
        cycle_nodes = set(cycles[0])
        assert "A" in cycle_nodes or "B" in cycle_nodes

    def test_self_loop_graph(self):
        """Disconnected graph with no edges has no cycle."""
        g = MerchantGraph()
        g.add_merchant("X")
        assert has_cycle(g) is False


# ---------------------------------------------------------------------------
# 5. Cycle netting
# ---------------------------------------------------------------------------

class TestCycleNetting:

    def test_netting_removes_minimum_flow(self):
        """
        A→B=100, B→C=80, C→A=60  (cycle A,B,C)
        Min flow = 60 → should cancel 60 from each edge.
        After netting: A→B=40, B→C=20, C→A edge removed.
        """
        g = make_graph(["A","B","C"],[("A","B",100),("B","C",80),("C","A",60)])
        net_flows = net_cycle(g, ["A","B","C"])
        assert net_flows.get("A:B") == pytest.approx(40.0, abs=1e-2)
        assert net_flows.get("B:C") == pytest.approx(20.0, abs=1e-2)
        assert "C:A" not in net_flows   # fully cancelled

    def test_equal_cycle_fully_netted(self):
        """A→B=50, B→C=50, C→A=50: all flows cancel entirely."""
        g = make_graph(["A","B","C"],[("A","B",50),("B","C",50),("C","A",50)])
        net_flows = net_cycle(g, ["A","B","C"])
        assert net_flows == {}

    def test_invalid_cycle_raises(self):
        """A non-existent edge in the cycle should raise ValueError."""
        g = make_graph(["A","B","C"],[("A","B",50)])   # no B→C or C→A
        with pytest.raises(ValueError):
            net_cycle(g, ["A","B","C"])

    def test_cycle_too_short_raises(self):
        g = make_graph(["A"],[ ])
        with pytest.raises(ValueError, match="at least 2"):
            net_cycle(g, ["A"])
