import pytest
from fastapi.testclient import TestClient
from creditflow.api.main import app

client = TestClient(app)

def test_risk_score_endpoint():
    response = client.post(
        "/risk/score",
        json={
            "merchant_id": "M001",
            "history": [
                {"late": True, "default": False},
                {"late": True, "default": False},
                {"late": True, "default": False}
            ] + [{"late": False, "default": False}] * 9
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["merchant_id"] == "M001"
    assert data["late_payment_events"] == 3
    assert data["lambda_rate"] == 0.25 # 3/12
    assert data["risk_category"] == "MEDIUM"

def test_risk_score_cold_start():
    response = client.post(
        "/risk/score",
        json={
            "merchant_id": "M002",
            "history": []
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["cold_start"] is True
    assert data["lambda_rate"] == 0.05

def test_risk_portfolio_endpoint():
    response = client.post(
        "/risk/portfolio",
        json={
            "merchants": [
                {
                    "merchant_id": "M001",
                    "history": [{"late": True}] * 3 + [{"late": False}] * 9
                },
                {
                    "merchant_id": "M002",
                    "history": [{"late": True}] * 12 + [{"default": True}] * 1 + [{"late": False}] * 11
                }
            ]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "portfolio_average_risk" in data
    assert data["merchants"] == 2
    
    profiles = data["profiles"]
    assert len(profiles) == 2
    # Ensure sorted by risk descending
    assert profiles[0]["merchant_id"] == "M002"
    assert profiles[1]["merchant_id"] == "M001"
