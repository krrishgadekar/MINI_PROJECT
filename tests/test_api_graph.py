import pytest
from fastapi.testclient import TestClient
from creditflow.api.main import app

client = TestClient(app)

def test_build_graph():
    response = client.post(
        "/graph/build",
        json={
            "merchants": ["A", "B", "C"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 100},
                {"debtor": "B", "creditor": "C", "amount": 80}
            ]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "merchants" in data
    assert "edges" in data
    assert "adjacency_matrix" in data
    assert data["merchants"] == ["A", "B", "C"]



def test_transitive_closure():
    response = client.post(
        "/graph/transitive-closure",
        json={
            "merchants": ["A", "B", "C"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 10},
                {"debtor": "B", "creditor": "C", "amount": 20}
            ]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["closure"]["A"]["C"] is True
    assert data["closure"]["C"]["A"] is False
    assert len(data["cyclic_risk_pairs"]) == 0

def test_reachable_merchants():
    client.post(
        "/graph/build",
        json={
            "merchants": ["A", "B", "C"],
            "debts": [
                {"debtor": "A", "creditor": "B", "amount": 10},
                {"debtor": "B", "creditor": "C", "amount": 20}
            ]
        }
    )
    response = client.get("/graph/A/reachable")
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "A"
    assert set(data["reachable"]) == {"B", "C"}

def test_reachable_merchants_not_found():
    response = client.get("/graph/UNKNOWN/reachable")
    assert response.status_code == 404
