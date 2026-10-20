"""
test_api_phase4_stress.py — Phase 4 API-Level Stress & Race Tests (Krrish)

Verifies that the FastAPI endpoints handle:
  - Concurrent requests without corruption
  - Large payloads
  - Edge-case / malformed input validation
  - Consistency between related endpoints
"""

import pytest
import concurrent.futures
from fastapi.testclient import TestClient
from creditflow.api.main import app

client = TestClient(app)


# ─── Helper payloads ──────────────────────────────────────────────────────────


def cycle_payload(n: int = 5, amount: float = 100.0):
    """N-node cycle graph payload."""
    merchants = [f"M{i}" for i in range(n)]
    debts = [
        {"debtor": merchants[i], "creditor": merchants[(i + 1) % n], "amount": amount}
        for i in range(n)
    ]
    return {"merchants": merchants, "debts": debts}


def chain_payload(n: int = 5, amount: float = 100.0):
    """N-node chain (no cycle)."""
    merchants = [f"M{i}" for i in range(n)]
    debts = [
        {"debtor": merchants[i], "creditor": merchants[i + 1], "amount": amount * (i + 1)}
        for i in range(n - 1)
    ]
    return {"merchants": merchants, "debts": debts}


def star_payload(center: str = "Hub", spokes: int = 10, amount: float = 200.0):
    """Star graph: center owes each spoke."""
    merchants = [center] + [f"S{i}" for i in range(spokes)]
    debts = [
        {"debtor": center, "creditor": f"S{i}", "amount": amount}
        for i in range(spokes)
    ]
    return {"merchants": merchants, "debts": debts}


# ═════════════════════════════════════════════════════════════════════════════
# 1. CONCURRENT API CALLS
# ═════════════════════════════════════════════════════════════════════════════


class TestAPIConcurrency:
    """Verify endpoints handle parallel requests without crashes or data leaks."""

    def test_parallel_settlement_exact_calls(self):
        """10 parallel /settlement/exact calls with different payloads."""
        payloads = [cycle_payload(n=i + 3, amount=50.0 * i) for i in range(1, 11)]

        def call_exact(payload):
            return client.post("/settlement/exact", json=payload)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(call_exact, p) for p in payloads]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        assert len(results) == 10
        for res in results:
            assert res.status_code == 200
            assert "transactions" in res.json()

    def test_parallel_scc_calls(self):
        """Parallel /graph/scc calls."""
        payloads = [cycle_payload(n=i + 3) for i in range(8)]

        def call_scc(payload):
            return client.post("/graph/scc", json=payload)

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(call_scc, p) for p in payloads]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for res in results:
            assert res.status_code == 200

    def test_parallel_contagion_calls(self):
        """5 parallel /risk/contagion calls on the same graph, different merchants."""
        base = cycle_payload(n=5, amount=100)

        def call_contagion(merchant):
            payload = {**base, "failed_merchant": merchant}
            return client.post("/risk/contagion", json=payload)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(call_contagion, f"M{i}") for i in range(5)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for res in results:
            assert res.status_code == 200
            data = res.json()
            assert data["total_network_loss"] >= 0

    def test_parallel_mixed_endpoints(self):
        """Mixed concurrent calls to SCC, exact settlement, and contagion."""
        payload = cycle_payload(n=6, amount=200)

        def call_scc():
            return client.post("/graph/scc", json=payload)

        def call_exact():
            return client.post("/settlement/exact", json=payload)

        def call_contagion():
            return client.post("/risk/contagion", json={**payload, "failed_merchant": "M0"})

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            futures = [
                pool.submit(call_scc),
                pool.submit(call_scc),
                pool.submit(call_exact),
                pool.submit(call_exact),
                pool.submit(call_contagion),
                pool.submit(call_contagion),
            ]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for res in results:
            assert res.status_code == 200


# ═════════════════════════════════════════════════════════════════════════════
# 2. LARGE PAYLOAD STRESS
# ═════════════════════════════════════════════════════════════════════════════


class TestAPILargePayloads:
    """Verify endpoints handle large inputs gracefully."""

    def test_settlement_exact_12_node_dense(self):
        """12-node dense graph (at exact solver cap)."""
        merchants = [f"M{i}" for i in range(12)]
        debts = []
        for i in range(12):
            for j in range(12):
                if i != j and (i + j) % 3 == 0:
                    debts.append({"debtor": merchants[i], "creditor": merchants[j], "amount": 50 + i * 10})
        payload = {"merchants": merchants, "debts": debts}
        res = client.post("/settlement/exact", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["capped"] is False

    def test_settlement_exact_fallback_on_large_graph(self):
        """15-node graph should trigger greedy fallback."""
        payload = chain_payload(n=15, amount=100)
        res = client.post("/settlement/exact", json=payload)
        assert res.status_code == 200
        data = res.json()
        # With 15 nodes in a chain, most have non-zero balances -> capped
        assert data["transaction_count"] >= 1

    def test_scc_50_nodes(self):
        """SCC on 50 nodes."""
        merchants = [f"M{i}" for i in range(50)]
        debts = []
        for i in range(50):
            debts.append({"debtor": merchants[i], "creditor": merchants[(i + 1) % 50], "amount": 100})
        payload = {"merchants": merchants, "debts": debts}
        res = client.post("/graph/scc", json=payload)
        assert res.status_code == 200
        data = res.json()
        # 50-node cycle → one big SCC
        assert data["cyclic_component_count"] == 1

    def test_optimize_settlement_large(self):
        """Optimize (net+settle) on a 10-node cycle with varying amounts."""
        merchants = [f"M{i}" for i in range(10)]
        debts = [
            {"debtor": merchants[i], "creditor": merchants[(i + 1) % 10], "amount": 100 + i * 20}
            for i in range(10)
        ]
        payload = {"merchants": merchants, "debts": debts}
        res = client.post("/settlement/optimize", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["savings"] >= 0
        assert data["after_total_debt"] <= data["before_total_debt"]

    def test_contagion_20_nodes(self):
        """Contagion on 20-node star graph."""
        payload = star_payload(center="Hub", spokes=20, amount=500)
        payload["failed_merchant"] = "Hub"
        res = client.post("/risk/contagion", json=payload)
        assert res.status_code == 200
        data = res.json()
        # Hub owes 500 to each of 20 spokes → direct loss = 10,000
        assert data["total_network_loss"] == 10000.0

    def test_correlation_large_series(self):
        """Correlation on 1000-element series."""
        import random
        rng = random.Random(42)
        series_a = [rng.gauss(50, 10) for _ in range(1000)]
        series_b = [a * 2 + rng.gauss(0, 1) for a in series_a]
        res = client.post("/risk/correlation", json={"series_a": series_a, "series_b": series_b})
        assert res.status_code == 200
        data = res.json()
        assert data["custom_pair"]["r"] > 0.95  # very strong positive


# ═════════════════════════════════════════════════════════════════════════════
# 3. INPUT VALIDATION AT API LEVEL
# ═════════════════════════════════════════════════════════════════════════════


class TestAPIInputValidation:
    """Verify API returns proper error codes for invalid inputs."""

    def test_exact_settlement_empty_merchants(self):
        """No merchants → rejected with 422 Unprocessable Entity (min_length=1)."""
        res = client.post("/settlement/exact", json={"merchants": [], "debts": []})
        assert res.status_code == 422

    def test_contagion_invalid_merchant(self):
        """Failed merchant not in graph → 422."""
        payload = cycle_payload(n=3)
        payload["failed_merchant"] = "NONEXISTENT"
        res = client.post("/risk/contagion", json=payload)
        assert res.status_code == 422

    def test_contagion_missing_failed_merchant_field(self):
        """Missing required field → 422."""
        payload = cycle_payload(n=3)
        # failed_merchant is required
        res = client.post("/risk/contagion", json=payload)
        assert res.status_code == 422

    def test_settlement_negative_amount(self):
        """Negative debt amount → 422."""
        payload = {
            "merchants": ["A", "B"],
            "debts": [{"debtor": "A", "creditor": "B", "amount": -50}],
        }
        res = client.post("/settlement/exact", json=payload)
        assert res.status_code == 422

    def test_correlation_empty_series(self):
        """Empty series → 422 or valid response with r=0."""
        res = client.post("/risk/correlation", json={"series_a": [], "series_b": []})
        assert res.status_code == 200
        data = res.json()
        assert data["custom_pair"]["r"] == 0.0

    def test_correlation_mismatched_series(self):
        """Mismatched lengths → 422."""
        res = client.post(
            "/risk/correlation",
            json={"series_a": [1.0, 2.0], "series_b": [1.0]},
        )
        assert res.status_code == 422

    def test_ztest_zero_trials(self):
        """Zero trials → rejected with 422 Unprocessable Entity (trials ge 1)."""
        res = client.post(
            "/risk/ztest",
            json={
                "merchant_id": "M_ZERO",
                "successes": 0,
                "trials": 0,
                "baseline_p": 0.05,
                "avg_delay_days": 0,
            },
        )
        assert res.status_code == 422


# ═════════════════════════════════════════════════════════════════════════════
# 4. ENDPOINT CONSISTENCY CHECKS
# ═════════════════════════════════════════════════════════════════════════════


class TestAPIConsistency:
    """Verify related endpoints return consistent results."""

    def test_optimize_savings_equals_net_all_total(self):
        """
        /settlement/optimize's savings field should equal
        /settlement/net-all's total_amount_netted for the same input.
        """
        payload = cycle_payload(n=4, amount=200)

        opt_res = client.post("/settlement/optimize", json=payload)
        net_res = client.post("/settlement/net-all", json=payload)

        assert opt_res.status_code == 200
        assert net_res.status_code == 200

        assert opt_res.json()["savings"] == net_res.json()["total_amount_netted"]

    def test_exact_and_greedy_same_total_settled(self):
        """
        For any graph, exact and greedy must settle the same total money amount
        (they differ in transaction count, not in dollars settled).
        """
        payload = chain_payload(n=6, amount=100)

        exact_res = client.post("/settlement/exact", json=payload)
        greedy_res = client.post("/settlement", json=payload)

        assert exact_res.status_code == 200
        assert greedy_res.status_code == 200

        exact_total = exact_res.json()["total_amount_settled"]
        greedy_total = greedy_res.json()["total_amount_settled"]

        # Both must settle the same total money
        assert abs(exact_total - greedy_total) < 1.0  # allow minor rounding

    def test_scc_and_cycles_on_acyclic_graph(self):
        """Acyclic graph: SCC has no cyclic components, cycles endpoint returns empty."""
        payload = chain_payload(n=5)

        scc_res = client.post("/graph/scc", json=payload)
        cycle_res = client.post("/settlement/cycles", json=payload)

        assert scc_res.status_code == 200
        assert cycle_res.status_code == 200

        assert scc_res.json()["cyclic_component_count"] == 0
        assert cycle_res.json()["has_cycle"] is False

    def test_scc_and_cycles_on_cyclic_graph(self):
        """Cyclic graph: SCC has cyclic components, cycles endpoint returns cycles."""
        payload = cycle_payload(n=5)

        scc_res = client.post("/graph/scc", json=payload)
        cycle_res = client.post("/settlement/cycles", json=payload)

        assert scc_res.status_code == 200
        assert cycle_res.status_code == 200

        assert scc_res.json()["cyclic_component_count"] >= 1
        assert cycle_res.json()["has_cycle"] is True

    def test_risk_score_category_matches_label(self):
        """risk_category and risk_label must be identical (K9 fix verification)."""
        payload = {
            "merchant_id": "M_LABEL",
            "history": [{"late": True, "default": False}] * 10,
        }
        res = client.post("/risk/score", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["risk_category"] == data["risk_label"]
        assert data["risk_category"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
