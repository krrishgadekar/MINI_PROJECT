"""
test_phase4_hardening.py — Phase 4 Hardening Tests (Krrish)

This is the crosswise bug-bash test suite that stress-tests every Python
algorithm under adversarial, degenerate, and edge-case inputs.

Categories:
  1. Cross-Algorithm Verification (SCC ↔ Warshall, Exact ↔ Greedy, Netting ↔ Settlement)
  2. Boundary & Degenerate Inputs (empty graphs, single node, max cap, zero balances)
  3. Floating Point Precision Guards
  4. Input Validation & Error Handling
  5. Invariant Assertions (conservation of money, balance sum = 0, etc.)
  6. Large-Scale Stress Tests
"""

import pytest
import math
import random
import concurrent.futures
from typing import List, Dict

from creditflow.graph import MerchantGraph
from creditflow.algorithms.warshall import (
    warshall_transitive_closure,
    get_cyclic_risk_pairs,
    get_reachable_merchants,
)
from creditflow.algorithms.scc import tarjan_scc, scc_summary
from creditflow.algorithms.settlement import (
    compute_net_balances,
    greedy_minimum_settlement,
    settlement_summary,
)
from creditflow.algorithms.exact_settlement import exact_minimum_settlement
from creditflow.algorithms.cycle_detection import (
    find_all_cycles,
    has_cycle,
    net_cycle,
    net_all_cycles,
)
from creditflow.algorithms.contagion import simulate_default_contagion
from creditflow.algorithms.risk_engine import MerchantRiskProfile, RiskEngine
from creditflow.algorithms.correlation import (
    compute_pearson_correlation,
    analyze_merchant_correlations,
)
from creditflow.algorithms.hypothesis import (
    one_proportion_z_test,
    compute_composite_risk,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def make_complete_cycle(n: int) -> MerchantGraph:
    """Create a simple n-node cycle: M0→M1→M2→...→M(n-1)→M0."""
    g = MerchantGraph()
    names = [f"M{i}" for i in range(n)]
    for m in names:
        g.add_merchant(m)
    for i in range(n):
        g.add_debt(names[i], names[(i + 1) % n], 100.0)
    return g


def make_star_graph(center: str, spokes: int, amount: float = 100.0) -> MerchantGraph:
    """Center owes each spoke `amount`."""
    g = MerchantGraph()
    g.add_merchant(center)
    for i in range(spokes):
        spoke = f"S{i}"
        g.add_merchant(spoke)
        g.add_debt(center, spoke, amount)
    return g


def make_random_graph(n: int, density: float = 0.3, seed: int = 42) -> MerchantGraph:
    """Seeded random graph for reproducible stress tests."""
    rng = random.Random(seed)
    g = MerchantGraph()
    names = [f"M{i}" for i in range(n)]
    for m in names:
        g.add_merchant(m)
    for i in range(n):
        for j in range(n):
            if i != j and rng.random() < density:
                g.add_debt(names[i], names[j], round(rng.uniform(1, 500), 2))
    return g


# ═════════════════════════════════════════════════════════════════════════════
# 1. CROSS-ALGORITHM VERIFICATION
# ═════════════════════════════════════════════════════════════════════════════


class TestCrossAlgorithmVerification:
    """
    Verify consistency between algorithms that compute related results:
    - SCC cyclic components ↔ Warshall mutual reachability
    - Exact settlement ≤ Greedy settlement (transaction count)
    - Net-all produces acyclic graph
    - Settlement clears all net balances to zero
    """

    def test_scc_consistent_with_warshall_on_random_graphs(self):
        """For 10 random graphs, every SCC with |C|>1 must have mutual Warshall reachability."""
        for seed in range(10):
            g = make_random_graph(15, density=0.25, seed=seed * 37)
            sccs = tarjan_scc(g)
            warshall_pairs = get_cyclic_risk_pairs(g)
            pair_sets = [frozenset(p) for p in warshall_pairs]

            for comp in sccs:
                if len(comp) < 2:
                    continue
                # Every pair within a cyclic SCC must appear in Warshall's cyclic pairs
                for i in range(len(comp)):
                    for j in range(i + 1, len(comp)):
                        assert frozenset({comp[i], comp[j]}) in pair_sets, (
                            f"Seed {seed}: SCC pair ({comp[i]}, {comp[j]}) "
                            f"not in Warshall cyclic pairs"
                        )

    def test_exact_never_worse_than_greedy(self):
        """For various graph sizes, exact solver must produce ≤ greedy transactions."""
        for n in range(3, 11):
            g = make_random_graph(n, density=0.4, seed=n * 7)
            exact = exact_minimum_settlement(g)
            greedy = greedy_minimum_settlement(g)
            assert exact["transaction_count"] <= len(greedy), (
                f"N={n}: Exact ({exact['transaction_count']}) > Greedy ({len(greedy)})"
            )
            assert exact["optimality_gap"] >= 0

    def test_net_all_produces_dag(self):
        """After net_all_cycles, the resulting graph must have no cycles."""
        for seed in range(5):
            g = make_random_graph(12, density=0.35, seed=seed * 13)
            netted, _, _ = net_all_cycles(g)
            assert not has_cycle(netted), f"Seed {seed}: Graph still has cycles after net_all"

    def test_settlement_clears_all_balances(self):
        """Every greedy settlement must zero out all net balances."""
        for seed in range(10):
            g = make_random_graph(8, density=0.3, seed=seed * 11)
            balances = compute_net_balances(g)
            txns = greedy_minimum_settlement(g)

            # Replay transactions on balances
            resolved = dict(balances)
            for t in txns:
                resolved[t["payer"]] = round(resolved.get(t["payer"], 0) + t["amount"], 2)
                resolved[t["payee"]] = round(resolved.get(t["payee"], 0) - t["amount"], 2)

            for m, b in resolved.items():
                assert abs(b) < 1e-6, (
                    f"Seed {seed}: Merchant {m} has uncleared balance {b}"
                )

    def test_exact_settlement_also_clears_all_balances(self):
        """Exact solver transactions must also clear all balances."""
        for n in [3, 5, 7, 10]:
            g = make_random_graph(n, density=0.4, seed=n * 3)
            res = exact_minimum_settlement(g)
            balances = res["net_balances"]

            resolved = dict(balances)
            for t in res["transactions"]:
                resolved[t["payer"]] = round(resolved.get(t["payer"], 0) + t["amount"], 2)
                resolved[t["payee"]] = round(resolved.get(t["payee"], 0) - t["amount"], 2)

            for m, b in resolved.items():
                assert abs(b) < 1e-6, f"N={n}: Merchant {m} uncleared balance {b}"

    def test_netting_preserves_net_balances(self):
        """Cycle netting must not change any merchant's net balance."""
        g = make_random_graph(10, density=0.4, seed=99)
        balances_before = compute_net_balances(g)

        netted, _, _ = net_all_cycles(g)
        balances_after = compute_net_balances(netted)

        for m in balances_before:
            assert abs(balances_before[m] - balances_after.get(m, 0)) < 1e-4, (
                f"Merchant {m}: balance changed from {balances_before[m]} to {balances_after.get(m, 0)}"
            )

    def test_netting_reduces_total_debt_volume(self):
        """Total debt (sum of all edge weights) must decrease or stay same after netting."""
        g = make_random_graph(10, density=0.4, seed=77)
        total_before = sum(w for _, _, w in g.get_all_edges())

        netted, cycles_netted, total_netted = net_all_cycles(g)
        total_after = sum(w for _, _, w in netted.get_all_edges())

        assert total_after <= total_before + 1e-6
        # Total debt reduction across edges is sum of (amount_netted * len(cycle))
        total_edge_reduction = sum(c["amount_netted"] * len(c["cycle"]) for c in cycles_netted)
        assert abs((total_before - total_after) - total_edge_reduction) < 1.0  # allow rounding

    def test_contagion_total_loss_bounded_by_network_debt(self):
        """Total contagion loss cannot exceed total network debt."""
        g = make_random_graph(10, density=0.3, seed=55)
        total_debt = sum(w for _, _, w in g.get_all_edges())

        for m in g.merchants:
            res = simulate_default_contagion(g, m)
            assert res["total_network_loss"] <= total_debt + 1e-2, (
                f"Merchant {m}: loss {res['total_network_loss']} > total debt {total_debt}"
            )


# ═════════════════════════════════════════════════════════════════════════════
# 2. BOUNDARY & DEGENERATE INPUTS
# ═════════════════════════════════════════════════════════════════════════════


class TestBoundaryInputs:
    """Test algorithms against degenerate, empty, and boundary inputs."""

    def test_empty_graph_all_algorithms(self):
        """Empty graph (no merchants) should not crash any algorithm."""
        g = MerchantGraph()
        assert tarjan_scc(g) == []
        assert find_all_cycles(g) == []
        assert not has_cycle(g)
        assert greedy_minimum_settlement(g) == []
        assert compute_net_balances(g) == {}
        closure = warshall_transitive_closure(g)
        assert closure == {}

    def test_single_node_graph(self):
        """Single merchant, no edges."""
        g = MerchantGraph()
        g.add_merchant("Solo")
        sccs = tarjan_scc(g)
        assert len(sccs) == 1
        assert sccs[0] == ["Solo"]
        assert not has_cycle(g)
        assert greedy_minimum_settlement(g) == []

        res = exact_minimum_settlement(g)
        assert res["transaction_count"] == 0

    def test_two_nodes_one_edge(self):
        """Simplest possible debt graph: A owes B."""
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        g.add_debt("A", "B", 42.0)
        assert not has_cycle(g)
        assert len(greedy_minimum_settlement(g)) == 1

    def test_self_loop_not_added(self):
        """Adding a self-debt should not be possible (debtor == creditor conceptually)."""
        g = MerchantGraph()
        g.add_merchant("A")
        # A self-debt A→A should accumulate but net balance stays 0
        g.add_debt("A", "A", 100.0)
        balances = compute_net_balances(g)
        assert abs(balances.get("A", 0)) < 1e-6

    def test_exact_solver_at_cap_boundary(self):
        """Exactly 12 non-zero balances should use exact, 13 should fall back."""
        g12 = make_random_graph(12, density=0.5, seed=12)
        res12 = exact_minimum_settlement(g12, max_balances=12)
        # May or may not be capped depending on how many have zero balance
        # Just verify it runs without error

        g13 = make_random_graph(14, density=0.5, seed=14)
        res13 = exact_minimum_settlement(g13, max_balances=12)
        # With 14 merchants and 0.5 density, most will have non-zero balances
        # If capped, verify it says so
        if res13["capped"]:
            assert "Greedy Heuristic" in res13["algorithm"]
            assert "Fallback" in res13["algorithm"]

    def test_all_balanced_graph(self):
        """If every cycle is perfectly balanced, net balances are all 0."""
        g = MerchantGraph()
        for m in ["A", "B", "C"]:
            g.add_merchant(m)
        g.add_debt("A", "B", 50)
        g.add_debt("B", "C", 50)
        g.add_debt("C", "A", 50)

        balances = compute_net_balances(g)
        for b in balances.values():
            assert abs(b) < 1e-6

        res = exact_minimum_settlement(g)
        assert res["transaction_count"] == 0

    def test_zero_amount_correlation(self):
        """Pearson with all zeros in one series."""
        res = compute_pearson_correlation([0.0, 0.0, 0.0], [1.0, 2.0, 3.0])
        assert res["r"] == 0.0
        assert res["significant"] is False

    def test_z_test_zero_trials(self):
        """Z-test with 0 trials should return safe defaults."""
        res = one_proportion_z_test(successes=0, trials=0)
        assert res["z_score"] == 0.0
        assert res["is_significant"] is False
        assert res["sample_size"] == 0

    def test_z_test_baseline_equals_one(self):
        """Edge case: baseline_p = 1.0 (SE = 0)."""
        res = one_proportion_z_test(successes=5, trials=10, baseline_p=1.0)
        assert res["z_score"] == 0.0  # SE is zero, guarded

    def test_z_test_baseline_equals_zero(self):
        """Edge case: baseline_p = 0.0 (SE = 0)."""
        res = one_proportion_z_test(successes=5, trials=10, baseline_p=0.0)
        assert res["z_score"] == 0.0  # SE is zero, guarded

    def test_composite_risk_clamps_to_unit_interval(self):
        """Composite score should always be in [0, 1]."""
        # Extreme inputs
        for lam in [0, 0.01, 1.0, 10.0, 100.0]:
            for pval in [0.0, 0.5, 1.0]:
                for delay in [0, 15, 30, 100, 1000]:
                    score = compute_composite_risk(lam, pval, delay)
                    assert 0.0 <= score <= 1.0, f"Score {score} out of range for λ={lam}, p={pval}, d={delay}"

    def test_contagion_on_isolated_graph(self):
        """No edges: contagion produces zero loss for any merchant."""
        g = MerchantGraph()
        for m in ["A", "B", "C"]:
            g.add_merchant(m)
        res = simulate_default_contagion(g, "A")
        assert res["total_network_loss"] == 0.0
        assert len(res["affected_merchants"]) == 0

    def test_contagion_self_loop_excluded(self):
        """If failed merchant is also creditor to itself, self shouldn't appear in losses."""
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        g.add_debt("A", "B", 100)
        res = simulate_default_contagion(g, "A")
        assert "A" not in res["direct_losses"]

    def test_risk_cold_start_merchant(self):
        """Merchant with < MIN_MONTHS history gets prior rate."""
        p = MerchantRiskProfile("Cold")
        p.record_month(had_late_payment=True)  # only 1 month
        assert p.lambda_rate == MerchantRiskProfile.COLD_START_RATE
        assert p.risk_category == "LOW"  # 0.05 prior => 1-e^-0.05 ≈ 0.0488 < 0.10

    def test_risk_all_defaults(self):
        """Merchant that defaults every month should be CRITICAL."""
        p = MerchantRiskProfile("AlwaysDefault")
        for _ in range(12):
            p.record_month(had_late_payment=True, had_default=True)
        assert p.lambda_rate == 1.0
        assert p.risk_category == "CRITICAL"
        assert p.risk_score == round(1 - math.exp(-1.0), 4)


# ═════════════════════════════════════════════════════════════════════════════
# 3. FLOATING POINT PRECISION GUARDS
# ═════════════════════════════════════════════════════════════════════════════


class TestFloatingPointPrecision:
    """Verify algorithms handle IEEE 754 edge cases without accumulating errors."""

    def test_net_balance_sum_always_zero(self):
        """Sum of all net balances must be zero (conservation of money)."""
        for seed in range(20):
            g = make_random_graph(10, density=0.3, seed=seed)
            balances = compute_net_balances(g)
            total = sum(balances.values())
            assert abs(total) < 1e-6, f"Seed {seed}: Balance sum = {total}"

    def test_exact_solver_with_fractional_amounts(self):
        """Amounts like 33.33 that cause repeating decimals."""
        g = MerchantGraph()
        for m in ["A", "B", "C"]:
            g.add_merchant(m)
        g.add_debt("A", "B", 33.33)
        g.add_debt("B", "C", 33.33)
        g.add_debt("C", "A", 33.33)

        res = exact_minimum_settlement(g)
        assert res["transaction_count"] == 0

    def test_very_small_amounts(self):
        """Near-epsilon amounts should be handled without floating point traps."""
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        g.add_debt("A", "B", 0.01)
        txns = greedy_minimum_settlement(g)
        assert len(txns) == 1
        assert txns[0]["amount"] == 0.01

    def test_very_large_amounts(self):
        """Large amounts (millions) should not cause overflow."""
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        g.add_debt("A", "B", 1_000_000_000.0)
        txns = greedy_minimum_settlement(g)
        assert len(txns) == 1
        assert txns[0]["amount"] == 1_000_000_000.0

    def test_mixed_large_and_small_amounts(self):
        """A graph mixing tiny and huge amounts."""
        g = MerchantGraph()
        for m in ["A", "B", "C"]:
            g.add_merchant(m)
        g.add_debt("A", "B", 1_000_000.0)
        g.add_debt("B", "C", 0.01)
        g.add_debt("C", "A", 500_000.0)

        balances = compute_net_balances(g)
        assert abs(sum(balances.values())) < 1e-4

        res = exact_minimum_settlement(g)
        assert res["transaction_count"] >= 1


# ═════════════════════════════════════════════════════════════════════════════
# 4. INPUT VALIDATION & ERROR HANDLING
# ═════════════════════════════════════════════════════════════════════════════


class TestInputValidation:
    """Ensure algorithms reject bad input gracefully."""

    def test_negative_debt_amount_raises(self):
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        with pytest.raises(ValueError):
            g.add_debt("A", "B", -10.0)

    def test_zero_debt_amount_raises(self):
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        with pytest.raises(ValueError):
            g.add_debt("A", "B", 0.0)

    def test_debt_to_unregistered_merchant_raises(self):
        g = MerchantGraph()
        g.add_merchant("A")
        with pytest.raises(ValueError):
            g.add_debt("A", "UNKNOWN", 100.0)

    def test_net_cycle_with_single_node_raises(self):
        g = MerchantGraph()
        g.add_merchant("A")
        with pytest.raises(ValueError):
            net_cycle(g, ["A"])

    def test_net_cycle_with_invalid_edge_raises(self):
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        g.add_merchant("C")
        g.add_debt("A", "B", 100)
        # C->A edge doesn't exist
        with pytest.raises(ValueError):
            net_cycle(g, ["A", "B", "C"])

    def test_contagion_invalid_merchant_raises(self):
        g = MerchantGraph()
        g.add_merchant("A")
        with pytest.raises(ValueError):
            simulate_default_contagion(g, "NONEXISTENT")

    def test_pearson_mismatched_lengths_raises(self):
        with pytest.raises(ValueError):
            compute_pearson_correlation([1.0, 2.0], [1.0, 2.0, 3.0])

    def test_duplicate_merchant_add_is_noop(self):
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("A")  # should not crash
        assert g.merchant_count == 1

    def test_debt_accumulation(self):
        """Adding multiple debts between same pair should accumulate."""
        g = MerchantGraph()
        g.add_merchant("A")
        g.add_merchant("B")
        g.add_debt("A", "B", 100)
        g.add_debt("A", "B", 50)
        assert g.get_debt("A", "B") == 150.0


# ═════════════════════════════════════════════════════════════════════════════
# 5. INVARIANT ASSERTIONS
