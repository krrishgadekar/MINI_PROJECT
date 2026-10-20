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


