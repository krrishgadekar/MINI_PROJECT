# CreditFlow — Graph-Theoretic Debt Settlement & Credit-Risk Analysis

**SPIT Mumbai — Semester V Mini Project (AY 2026–27)**  
**Team:** Krrish · Parth Goggi · Chetan Chavan

---

## Overview

CreditFlow models informal merchant debt networks as weighted directed graphs and
provides:
- **Graph analysis** — Warshall's transitive closure, cyclic risk detection
- **Debt settlement** — Greedy minimum-transaction settlement, cycle netting
- **Credit risk scoring** — Poisson-distribution model for default probability

---

## Project Structure

```
MINI_PROJECT/
├── creditflow/
│   ├── graph.py                    # MerchantGraph (adj-list + adj-matrix)
│   ├── algorithms/
│   │   ├── warshall.py             # Warshall's O(V³) transitive closure
│   │   ├── cycle_detection.py      # DFS cycle detection + cycle netting
│   │   ├── settlement.py           # Greedy O(N log N) settlement
│   │   └── risk_engine.py          # Poisson risk scoring
│   └── api/
│       ├── main.py                 # FastAPI app entry-point
│       ├── schemas.py              # Pydantic request/response models (API contract)
│       ├── graph_router.py         # /graph endpoints
│       ├── settlement_router.py    # /settlement endpoints
│       └── risk_router.py          # /risk endpoints
├── tests/
│   ├── test_graph.py
│   ├── test_warshall.py
│   ├── test_settlement.py
│   └── test_risk_engine.py
├── requirements.txt
└── pyproject.toml
```

---

## Team Responsibilities

| Member | Role | Owns |
|--------|------|------|
| **Krrish** | Backend Logic & Algorithms | `creditflow/graph.py`, `creditflow/algorithms/`, `creditflow/api/`, `tests/` |
| **Parth Goggi** | Frontend | React/TypeScript app, graph visualisation |
| **Chetan Chavan** | Backend Infra | Node/Express, MongoDB, JWT auth, Socket.io |

---

## Setup & Run

```bash
# Install dependencies
pip install -r requirements.txt

# Run all unit tests
pytest

# Start the API server (dev mode)
uvicorn creditflow.api.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

---

## Concept Traceability (Krrish's courses)

| Course | Component | What's implemented |
|--------|-----------|-------------------|
| Discrete Structures & Graph Theory | `graph.py` | Weighted directed graph, adj-list + adj-matrix |
| Design & Analysis of Algorithms | `warshall.py`, `settlement.py` | O(V³) DP transitive closure, O(N log N) greedy settlement |
| Data Structures | `graph.py` | Dual representation tradeoff justified |
| Statistical Methods / FoM | `risk_engine.py` | Poisson model: P(X≥1) = 1 - e^(-λ) |
| OOP / Imperative Programming | All modules | Clean class boundaries, full unit-test coverage |

---

## API Endpoints

### Graph API (`/graph`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/graph/build` | Build/replace the merchant debt graph |
| GET | `/graph` | Retrieve current graph |
| POST | `/graph/transitive-closure` | Warshall's closure + cyclic risk pairs |
| GET | `/graph/{id}/reachable` | Merchants reachable from a given node |

### Settlement API (`/settlement`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/settlement` | Greedy minimum settlement plan |
| POST | `/settlement/cycles` | Detect all circular debt cycles |
| POST | `/settlement/net-cycle` | Net (cancel) a specific cycle |

### Risk API (`/risk`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/risk/score` | Poisson risk score for one merchant |
| POST | `/risk/portfolio` | Risk scores for a full portfolio |
| GET | `/risk/portfolio/summary` | Last loaded portfolio summary |

---

## Integration Notes (for Chetan & Parth)

- **Node ↔ Python bridge**: Chetan's Express backend calls these endpoints as **synchronous REST requests** (decided over message queue for simplicity).
- **Auth**: Krrish's endpoints are **unauthenticated**; Chetan's Node layer handles JWT verification before proxying requests here.
- **CORS**: Configured to allow `localhost:3000` (Parth's React dev server) and `localhost:4000` (Chetan's Node server).