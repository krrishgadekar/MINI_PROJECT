import pytest
from fastapi.testclient import TestClient
from creditflow.api.main import app

client = TestClient(app)

def test_settlement_endpoint():
    response = client.post(
        "/settlement",
        json={
            "merchants": ["A", "B", "C"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 100},
                {"debtor": "B", "creditor": "C", "amount": 80},
                {"debtor": "C", "creditor": "A", "amount": 60}
            ]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "transactions" in data
    assert "net_balances" in data
    # Expected greedy settlement for A=-40, B=+20, C=+20 is A->B: 20, A->C: 20
    txns = data["transactions"]
    assert len(txns) == 2
    assert {"payer": "A", "payee": "B", "amount": 20.0} in txns
    assert {"payer": "A", "payee": "C", "amount": 20.0} in txns

def test_settlement_cycles_endpoint():
    response = client.post(
        "/settlement/cycles",
        json={
            "merchants": ["A", "B", "C"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 100},
                {"debtor": "B", "creditor": "C", "amount": 80},
                {"debtor": "C", "creditor": "A", "amount": 60}
            ]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["has_cycle"] is True
    assert "cycles" in data
    assert len(data["cycles"]) == 1
    cycle = data["cycles"][0]
    assert set(cycle) == {"A", "B", "C"}

def test_settlement_net_cycle_endpoint():
    response = client.post(
        "/settlement/net-cycle",
        json={
            "merchants": ["A", "B", "C"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 100},
                {"debtor": "B", "creditor": "C", "amount": 80},
                {"debtor": "C", "creditor": "A", "amount": 60}
            ],
            "cycle": ["A", "B", "C"]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["amount_netted"] == 60.0
    assert data["cycle"] == ["A", "B", "C"]
