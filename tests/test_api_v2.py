"""
test_api_v2.py — Test client validation for all new v2 API endpoints
"""

import pytest
from fastapi.testclient import TestClient
from creditflow.api.main import app

client = TestClient(app)


def test_api_graph_scc():
    res = client.post(
        "/graph/scc",
        json={
            "merchants": ["A", "B", "C", "D"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 10},
                {"debtor": "B", "creditor": "C", "amount": 10},
                {"debtor": "C", "creditor": "A", "amount": 10},
                {"debtor": "C", "creditor": "D", "amount": 5},
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "components" in data
    assert data["component_count"] == 2
    comp_sets = [set(c) for c in data["components"]]
    assert {"A", "B", "C"} in comp_sets
    assert {"D"} in comp_sets


def test_api_settlement_exact():
    res = client.post(
        "/settlement/exact",
        json={
            "merchants": ["A", "B", "C"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 100},
                {"debtor": "B", "creditor": "C", "amount": 80},
                {"debtor": "C", "creditor": "A", "amount": 60},
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "transactions" in data
    assert data["transaction_count"] == 2
    assert data["algorithm"] == "Exact Backtracking (Optimal)"
    assert data["capped"] is False


def test_api_settlement_net_all():
    res = client.post(
        "/settlement/net-all",
        json={
            "merchants": ["A", "B", "C"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 100},
                {"debtor": "B", "creditor": "C", "amount": 80},
                {"debtor": "C", "creditor": "A", "amount": 60},
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_amount_netted"] == 60.0
    assert len(data["cycles_netted"]) == 1
    assert data["eliminated_edge_count"] == 1
    assert data["remaining_edge_count"] == 2


def test_api_settlement_optimize():
    res = client.post(
        "/settlement/optimize",
        json={
            "merchants": ["A", "B", "C"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 100},
                {"debtor": "B", "creditor": "C", "amount": 80},
                {"debtor": "C", "creditor": "A", "amount": 60},
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["savings"] == 60.0
    assert data["total_netted_amount"] == 60.0
    assert data["before_total_debt"] == 240.0
    assert data["after_total_debt"] == 60.0
    assert data["transaction_count"] == 2


def test_api_risk_contagion():
    res = client.post(
        "/risk/contagion",
        json={
            "merchants": ["M1", "M2", "M3"],
            "debts": [
                {"debtor": "M1", "creditor": "M2", "amount": 200},
                {"debtor": "M2", "creditor": "M3", "amount": 150},
            ],
            "failed_merchant": "M1",
            "loss_given_default": 1.0,
            "max_rounds": 5,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["failed_merchant"] == "M1"
    assert data["direct_losses"]["M2"] == 200.0
    assert "M3" in data["second_order_losses"]
    assert data["total_network_loss"] > 200.0


def test_api_risk_correlation():
    res = client.post(
        "/risk/correlation",
        json={
            "series_a": [10.0, 20.0, 30.0, 40.0, 50.0],
            "series_b": [100.0, 200.0, 300.0, 400.0, 500.0],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["custom_pair"]["r"] == 1.0
    assert data["custom_pair"]["significant"] is True


def test_api_risk_ztest():
    res = client.post(
        "/risk/ztest",
        json={
            "merchant_id": "M_TEST",
            "successes": 12,
            "trials": 50,
            "baseline_p": 0.05,
            "alpha": 0.05,
            "avg_delay_days": 10.0,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["merchant_id"] == "M_TEST"
    assert data["observed_p"] == 0.24
    assert data["is_significant"] is True
    assert "composite_risk_score" in data
    assert 0.0 <= data["composite_risk_score"] <= 1.0


def test_api_risk_score_has_risk_label():
    res = client.post(
        "/risk/score",
        json={
            "merchant_id": "M_SCORE",
            "history": [{"late": True, "default": False} for _ in range(5)],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "risk_category" in data
    assert "risk_label" in data
    assert data["risk_label"] == data["risk_category"]
