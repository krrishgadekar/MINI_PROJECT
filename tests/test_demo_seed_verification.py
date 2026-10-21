"""
test_demo_seed_verification.py — Phase 5B Demo Seed Verification Test Suite

Validates all Phase 1-5 algorithmic endpoints against the seeded demo dataset:
- Crawford Market (8 merchants, 3 cyclic components, ₹39,000 netting)
- Supplier_C delinquency hypothesis testing (z-test p < 0.001, CRITICAL)
- Systemic contagion propagation across directed credit topologies
- Exact DP vs Greedy heuristic optimality gap and balance conservation
- Supplier Circle cross-tenant coalition isolation
"""

import json
import os
import pytest
from fastapi.testclient import TestClient
from creditflow.api.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def seed_data():
    """Load the canonical seed_data.json used by demo seedService."""
    candidate_paths = [
        os.path.join(os.path.dirname(__file__), "..", "seed_data.json"),
        os.path.join(os.getcwd(), "seed_data.json"),
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError("seed_data.json not found in expected paths")


class TestDemoSeedGraphAndSCC:
    """Validate Tarjan's SCC and cycle identification on Crawford Market demo data."""

    def test_scc_identifies_all_crawford_market_cycles(self, seed_data):
        """Tarjan SCC must detect all 3 cyclic trading loops in Crawford Market."""
        res = client.post(
            "/graph/scc",
            json={
                "merchants": seed_data["merchants"],
                "debts": seed_data["debts"],
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "components" in data
        assert "cyclic_components" in data

        cyclic_sets = [set(c) for c in data["cyclic_components"]]
        assert len(cyclic_sets) == 3

        # Loop 1: Retailer_B -> Wholesale_A -> Vendor_D -> Retailer_B
        assert {"Retailer_B", "Wholesale_A", "Vendor_D"} in cyclic_sets

        # Loop 2: Supplier_C <-> Logistics_E (2-cycle)
        assert {"Supplier_C", "Logistics_E"} in cyclic_sets

        # Loop 3: Stall_G -> Farmer_F -> Buyer_H -> Stall_G
        assert {"Stall_G", "Farmer_F", "Buyer_H"} in cyclic_sets

        # Total partition coverage: all 8 merchants must belong to a component
        all_partitioned = set().union(*[set(c) for c in data["components"]])
        assert all_partitioned == set(seed_data["merchants"])


class TestDemoSeedNettingAndOptimization:
    """Validate loop netting and exact settlement on Crawford Market demo data."""

    def test_cycle_netting_clears_39k_cash_free(self, seed_data):
        """
        Netting must clear:
        - min(50k, 20k, 25k) = 20k from Loop 1
        - min(15k, 15k) = 15k from Loop 2
        - min(5k, 4.5k, 4k) = 4k from Loop 3
        Total cash-free clearance = 39,000.
        """
        res = client.post(
            "/settlement/net-all",
            json={
                "merchants": seed_data["merchants"],
                "debts": seed_data["debts"],
            },
        )
        assert res.status_code == 200
        data = res.json()

        assert data["total_amount_netted"] == 39000.0
        assert len(data["cycles_netted"]) == 3
        assert data["eliminated_edge_count"] >= 2  # Bottleneck edges eliminated

    def test_settlement_optimize_endpoint(self, seed_data):
        """POST /settlement/optimize must report ₹39,000 savings and correct post-netting stats."""
        total_seeded_debt = sum(d["amount"] for d in seed_data["debts"])
        assert total_seeded_debt == 148500.0

        res = client.post(
            "/settlement/optimize",
            json={
                "merchants": seed_data["merchants"],
                "debts": seed_data["debts"],
            },
        )
        assert res.status_code == 200
        data = res.json()

        assert data["savings"] == 39000.0
        assert data["total_netted_amount"] == 39000.0
        assert data["before_total_debt"] == 148500.0
        # In a directed cycle C, each edge is reduced by w_min, decreasing total edge weights by sum(|C_i| * w_min_i)
        # 3 * 20k + 2 * 15k + 3 * 4k = 60k + 30k + 12k = 102k debt reduction -> 148,500 - 102,000 = 46,500
        assert data["after_total_debt"] == 46500.0
        assert data["transaction_count"] > 0
        assert len(data["transactions"]) == data["transaction_count"]

    def test_exact_vs_greedy_settlement_consistency(self, seed_data):
        """Exact DP solver and greedy heuristic must clear identical net obligations."""
        res_exact = client.post(
            "/settlement/exact",
            json={
                "merchants": seed_data["merchants"],
                "debts": seed_data["debts"],
            },
        )
        assert res_exact.status_code == 200
        exact_data = res_exact.json()

        res_greedy = client.post(
            "/settlement",
            json={
                "merchants": seed_data["merchants"],
                "debts": seed_data["debts"],
            },
        )
        assert res_greedy.status_code == 200
        greedy_data = res_greedy.json()

        # Invariant: Exact count <= Greedy count
        assert exact_data["transaction_count"] <= greedy_data["transaction_count"]
        assert exact_data["capped"] is False
        assert exact_data["algorithm"] == "Exact Backtracking (Optimal)"

        # Invariant: Sum of settled cash must match
        exact_sum = sum(t["amount"] for t in exact_data["transactions"])
        greedy_sum = sum(t["amount"] for t in greedy_data["transactions"])
        assert abs(exact_sum - greedy_sum) < 1e-4


class TestDemoSeedContagionRisk:
    """Validate systemic default-contagion propagation on Crawford Market topology."""

    def test_contagion_from_retailer_b_propagation(self, seed_data):
        """
        When Retailer_B defaults:
        - Wholesale_A suffers first-order direct loss of ₹50,000.
        - Wholesale_A transmits second-order shortfall downstream to Vendor_D (₹20,000 edge).
        - Total network loss > 50,000.
        """
        res = client.post(
            "/risk/contagion",
            json={
                "merchants": seed_data["merchants"],
                "debts": seed_data["debts"],
                "failed_merchant": "Retailer_B",
                "loss_given_default": 1.0,
                "max_rounds": 5,
            },
        )
        assert res.status_code == 200
        data = res.json()

        assert data["failed_merchant"] == "Retailer_B"
        assert data["direct_losses"]["Wholesale_A"] == 50000.0
        assert "Vendor_D" in data["second_order_losses"]
        assert data["total_network_loss"] >= 50000.0
        assert 0.0 < data["network_vulnerability_score"] <= 1.0
        assert len(data["cascade_rounds"]) >= 2

    def test_contagion_from_supplier_c(self, seed_data):
        """When Supplier_C defaults, creditors suffer direct exposure."""
        res = client.post(
            "/risk/contagion",
            json={
                "merchants": seed_data["merchants"],
                "debts": seed_data["debts"],
                "failed_merchant": "Supplier_C",
                "loss_given_default": 1.0,
                "max_rounds": 5,
            },
        )
        assert res.status_code == 200
        data = res.json()

        assert data["failed_merchant"] == "Supplier_C"
        # Supplier_C owes Wholesale_A (10,000) and Logistics_E (15,000)
        assert data["direct_losses"]["Wholesale_A"] == 10000.0
        assert data["direct_losses"]["Logistics_E"] == 15000.0
        assert data["total_network_loss"] >= 25000.0


class TestDemoSeedStatisticalHypothesisAndRisk:
    """Validate one-proportion z-test and Pearson correlation on seeded histories."""

    def test_supplier_c_ztest_critical_risk(self):
        """
        Supplier_C is seeded with 8 consecutive late payments (8/8 late, baseline p0=0.05).
        Must reject H0 with p < 0.001 and trigger CRITICAL classification.
        """
        res = client.post(
            "/risk/ztest",
            json={
                "merchant_id": "Supplier_C",
                "successes": 8,
                "trials": 8,
                "baseline_p": 0.05,
                "alpha": 0.05,
                "avg_delay_days": 50.0,
            },
        )
        assert res.status_code == 200
        data = res.json()

        assert data["merchant_id"] == "Supplier_C"
        assert data["observed_p"] == 1.0
        assert data["is_significant"] is True
        assert data["p_value"] < 0.001
        assert data["z_score"] > 3.0
        assert data["composite_risk_score"] >= 0.70  # CRITICAL band

    def test_wholesale_a_ztest_low_risk(self):
        """
        Wholesale_A is seeded with 12 consecutive on-time payments (0/12 late).
        Must not reject H0, z <= 0, and yield LOW risk classification.
        """
        res = client.post(
            "/risk/ztest",
            json={
                "merchant_id": "Wholesale_A",
                "successes": 0,
                "trials": 12,
                "baseline_p": 0.05,
                "alpha": 0.05,
                "avg_delay_days": 0.0,
            },
        )
        assert res.status_code == 200
        data = res.json()

        assert data["merchant_id"] == "Wholesale_A"
        assert data["observed_p"] == 0.0
        assert data["is_significant"] is False
        assert data["z_score"] < 0.0
        assert data["composite_risk_score"] < 0.15  # LOW band

    def test_pearson_correlation_on_demo_delay_vs_amount(self):
        """Pearson correlation on paired delay days vs debt exposure."""
        # Realistic sample series across merchants
        delays = [0.0, 5.0, 50.0, 15.0, 2.0, 3.0, 1.0, 4.0]
        amounts = [10000.0, 25000.0, 50000.0, 20000.0, 15000.0, 5000.0, 4000.0, 4500.0]

        res = client.post(
            "/risk/correlation",
            json={
                "series_a": delays,
                "series_b": amounts,
            },
        )
        assert res.status_code == 200
        data = res.json()

        assert data["sample_size"] == 8
        metric = data["custom_pair"]
        assert metric is not None
        assert -1.0 <= metric["r"] <= 1.0
        assert 0.0 <= metric["p_value"] <= 1.0


class TestCrossTenantBoundaryIsolation:
    """Validate strict tenant coalition isolation between Crawford Market and Supplier Circle."""

    def test_supplier_circle_group_isolation(self):
        """Supplier Circle contains Wholesale_A, Supplier_C, Logistics_E with 3 debts."""
        supplier_circle_merchants = ["Wholesale_A", "Supplier_C", "Logistics_E"]
        supplier_circle_debts = [
            {"debtor": "Supplier_C", "creditor": "Wholesale_A", "amount": 12000},
            {"debtor": "Logistics_E", "creditor": "Supplier_C", "amount": 8000},
            {"debtor": "Wholesale_A", "creditor": "Logistics_E", "amount": 6000},
        ]

        # 1. SCC on Supplier Circle: forms a single 3-cycle
        res_scc = client.post(
            "/graph/scc",
            json={
                "merchants": supplier_circle_merchants,
                "debts": supplier_circle_debts,
            },
        )
        assert res_scc.status_code == 200
        scc_data = res_scc.json()
        assert len(scc_data["cyclic_components"]) == 1
        assert set(scc_data["cyclic_components"][0]) == set(supplier_circle_merchants)

        # 2. Netting on Supplier Circle: min capacity is 6000
        res_net = client.post(
            "/settlement/net-all",
            json={
                "merchants": supplier_circle_merchants,
                "debts": supplier_circle_debts,
            },
        )
        assert res_net.status_code == 200
        net_data = res_net.json()
        assert net_data["total_amount_netted"] == 6000.0

        # Invariant: Crawford Market merchants are NOT present in Supplier Circle calculations
        for edge in net_data["remaining_debts"]:
            assert edge["debtor"] in supplier_circle_merchants
            assert edge["creditor"] in supplier_circle_merchants
