# CreditFlow — Graph-Theoretic Debt Settlement & Credit Risk Intelligence Platform

[![CI](https://github.com/krrishgadekar/MINI_PROJECT/actions/workflows/ci.yml/badge.svg)](https://github.com/krrishgadekar/MINI_PROJECT/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-teal.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.x-61dafb.svg)](https://react.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248.svg)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)

**SPIT Mumbai — Semester V Mini Project (Academic Year 2026–27)**  
**Team Members:**  
- **Krrish** — Backend Algorithms, Graph Theory & Statistical Analytics (`creditflow/`, `tests/`)  
- **Parth Goggi** — Frontend Engineering, Interactive Visualizations & IA (`client/`)  
- **Chetan Chavan** — Backend Systems, Tenancy, Concurrency, Realtime & DevOps (`apps/server/`, Docker, CI)  

---

## 1. Executive Summary & Architecture

CreditFlow is a full-stack, multi-tenant platform designed to untangle informal credit rings and optimize liquidity among interconnected merchants. By modeling credit obligations as weighted directed graphs $G=(V, E, w)$, CreditFlow discovers circular debt cycles, executes zero-cash netting, runs greedy and exact settlement optimizations, and quantifies default risk through statistical hypothesis testing and contagion cascades.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CreditFlow React 19 Client                            │
│  (Vite · Tailwind/Tokens · ForceGraph2D Canvas · Recharts · Zustand · Axios)│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / REST  (X-Group-Id header)
                                       │ WebSocket    (JWT authenticated)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                  Node.js / Express API Gateway (Port 4000)                  │
│  ├── Multi-Tenant Coalitions (Group & Membership Scoping)                   │
│  ├── CAS Optimistic Locking (withRetry & jittered backoff)                  │
│  ├── Transaction Ledger & Partial Payments                                  │
│  ├── Authenticated Socket Rooms & AIMD Congestion Throttler                │
│  └── Automated Due-Date & Overdue Notification Schedulers                   │
└──────────────────┬──────────────────────────────────────┬───────────────────┘
                   │ Mongoose ODM                         │ Sync REST
                   │                                      │ (Retry / Fallback)
┌──────────────────▼───────────────┐   ┌──────────────────▼───────────────────┐
│         MongoDB 7.0              │   │     FastAPI Analytics Engine (8000)  │
│  ├── Multi-tenant collections    │   │  ├── Warshall Transitive Closure     │
│  ├── Compound indexed isolation  │   │  ├── Tarjan SCC Decomposition (O(V+E))│
│  ├── Idempotency logs            │   │  ├── DFS Cycle Netting Pipeline      │
│  └── Payment event histories     │   │  ├── Greedy Heap vs Exact Solver     │
│                                  │   │  ├── Poisson Default Rate (λ)        │
│                                  │   │  ├── One-Proportion Z-Test (p<0.05)  │
│                                  │   │  ├── Pearson Correlation Analysis    │
│                                  │   │  └── Systemic Contagion Simulation   │
└──────────────────────────────────┘   └──────────────────────────────────────┘
```

### Academic Concept Traceability

| Subject | Theory & Algorithms Implemented in CreditFlow | Location |
|:---|:---|:---|
| **DSGT** | Directed weighted graph, Warshall's $O(V^3)$ closure, Tarjan SCC decomposition, DFS cycle search | `creditflow/algorithms/`, `client/src/graph/` |
| **DAA** | Greedy $O(N \log N)$ settlement, Exact branch-and-bound subset solver, cycle pre-netting | `creditflow/algorithms/settlement.py`, `exact_settlement.py` |
| **SMCS** | Poisson delinquency parameter $\lambda$, one-proportion z-test ($p < 0.05$), Pearson correlation $r$ | `creditflow/algorithms/stats_engine.py`, `risk_engine.py` |
| **DBMS** | Multi-tenant schema design, compound indices, referential integrity, audit logging | `apps/server/src/models/`, `controllers/` |
| **OS** | Compare-And-Swap (CAS) optimistic concurrency control, cron scheduling, idempotent state machines | `apps/server/src/concurrency/optimisticLock.ts` |
| **CCN** | JWT-authenticated WebSocket rooms, AIMD packet window throttling, connection rate-limiting | `apps/server/src/realtime/` |
| **DC** | Stateless microservice contract, timeout-resilient HTTP bridge, fault-tolerant healthchecks | `apps/server/src/services/bridge/` |
| **SE** | Test-driven development, cross-tenant isolation suites, GitHub Actions CI, Docker containerization | `.github/workflows/ci.yml`, `docker-compose.yml` |

---

## 2. Quickstart with Docker Compose (Recommended)

CreditFlow is fully containerized. A clean clone can be started with all 4 services (Mongo, Python Engine, Node Gateway, Nginx Client) healthy and pre-seeded.

### Step 1: Clone and configure
```bash
git clone https://github.com/krrishgadekar/MINI_PROJECT.git
cd MINI_PROJECT

# Copy environment variables
cp .env.example .env
```

### Step 2: Build and start containers
```bash
docker compose up --build -d
```

### Step 3: Access the platform
- **Frontend Web Application:** [http://localhost:3000](http://localhost:3000)
- **Node.js Express API:** [http://localhost:4000/api](http://localhost:4000/api)
- **Health Check Endpoint:** [http://localhost:4000/api/health](http://localhost:4000/api/health)
- **Python Engine Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

> **Auto-Seeding:** On first boot with an empty database, the server automatically executes `seedDatabase()` to populate the Crawford Market demo scenario.

### Managing containers
```bash
# View real-time container logs
docker compose logs -f

# Manually trigger re-seed inside the container
docker compose exec server npm run seed

# Stop all containers and persist database volume
docker compose down

# Stop and purge volumes (complete fresh wipe)
docker compose down -v
```

---

## 3. Manual Bare-Metal Setup

If running locally without Docker:

### Prerequisites
- **Node.js**: v20.x or higher & npm
- **Python**: v3.11 or higher
- **MongoDB**: Community Server v7.0 running on `localhost:27017`

### 1. MongoDB
Ensure MongoDB is running locally:
```bash
mongod --dbpath <path_to_data_folder>
```

### 2. Python Analytics Engine
```bash
# In repo root:
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn creditflow.api.main:app --port 8000 --reload
```

### 3. Node.js Express Gateway
```bash
cd apps/server
cp .env.example .env
npm install
npm run seed     # Seeds demo groups, cycles, risk profiles
npm run dev      # Runs on port 4000
```

### 4. React Client
```bash
cd client
cp .env.example .env
npm install
npm run dev      # Runs on http://localhost:3000
```

---

## 4. Demo Credentials & Key Walkthrough Scenarios

All seeded merchant accounts share the default password: **`CreditFlow@123`**

### Active Trade Groups & Merchant Roles

#### Group 1: `Crawford Market` (Invite Code: `CRAWFORD`)
| Merchant | Email | Group Role | Scenario Context |
|:---|:---|:---|:---|
| **Wholesale_A** | `wholesale.a@demo.com` | **Owner / Admin** | Admin view of full graph; owes Vendor_D ₹20k (-8d overdue); party in 3-cycle |
| **Retailer_B** | `retailer.b@demo.com` | **Admin** | Owes Wholesale_A ₹50k (-5d overdue); party in 3-cycle |
| **Vendor_D** | `vendor.d@demo.com` | **Member** | Ego-network view; owes Retailer_B ₹25k; party in 3-cycle |
| **Supplier_C** | `supplier.c@demo.com` | **Member** | **Deliberately High Risk:** 8 late payments, 3 defaults ($p < 0.001$, CRITICAL) |
| **Logistics_E** | `logistics.e@demo.com` | **Member** | Owes Supplier_C ₹15k (-3d overdue); also member of Supplier Circle |
| **Farmer_F** | `farmer.f@demo.com` | **Member** | Created a pending debt of ₹7,500 against Stall_G awaiting confirmation |
| **Stall_G** | `stall.g@demo.com` | **Member** | Has incoming approval notification in Inbox for onion crate invoice |
| **Buyer_H** | `buyer.h@demo.com` | **Member** | Downstream buyer; owes Stall_G ₹4k |

#### Group 2: `Supplier Circle` (Invite Code: `SUPPLIER`)
- **Members:** `Wholesale_A` (Owner), `Supplier_C` (Admin), `Logistics_E` (Member)
- Demonstrates **cross-tenant data isolation**: user switches between groups via sidebar switcher; obligations and graphs remain strictly isolated.

---

### Core Walkthrough Highlights

#### 1. Circular Debt Netting (3-Cycle Demo)
1. Log in as **`wholesale.a@demo.com`** (Crawford Market).
2. Observe the deliberate cycle:  
   $$\text{Retailer\_B} \xrightarrow{₹50,000} \text{Wholesale\_A} \xrightarrow{₹20,000} \text{Vendor\_D} \xrightarrow{₹25,000} \text{Retailer\_B}$$
3. Navigate to **Settle Center** (`/settle`).
4. Click **"Net this cycle"** or **"Net all cycles"**:
   - The cycle's minimum capacity ($\min(50k, 20k, 25k) = ₹20,000$) is instantly cancelled across all three edges with zero cash transferred.
   - The Wholesale_A $\to$ Vendor_D debt is fully resolved (`settled`), while remaining edges are decremented atomically via CAS.

#### 2. Hypothesis Z-Test & Risk Radar
1. Navigate to **Risk Radar** (`/risk`).
2. Observe **Supplier_C** flagged as **`CRITICAL`** risk:
   - Sample proportion late $\hat{p} = 1.0$ (8 of 8 late payments) with severe delays ($\mu_{\text{delay}} = 50$ days).
   - Right-tailed one-proportion z-test yields $z = 3.72$ and $p < 0.001$ ($p < 0.05$ threshold), rejecting the null hypothesis $H_0: p = p_0$.
   - Select Supplier_C in the **Contagion Simulator** to observe 1st and 2nd order default shockwaves through counterparty edges.

#### 3. Click-Through Transaction Ledger
1. Click any edge on the Network Graph (`/network`) or row in Trade Ledger (`/ledger`).
2. Opens the canonical **Transaction Detail** page (`/ledger/:debtId`).
3. View the chronological event timeline (Creation $\to$ Partial Payments $\to$ Netting $\to$ Settlement), supported by optimistic locking (`version` CAS).

#### 4. Role-Based Ego Networks & Inbox Approvals
1. Log in as **`vendor.d@demo.com`** (Regular Member) in a separate browser window.
2. Notice the graph automatically restricts to Vendor_D's **ego-network** (only direct obligations and counterparties are visible).
3. Log in as **`stall.g@demo.com`** and navigate to **Inbox** (`/inbox`):
   - Notice the pending debt request of ₹7,500 submitted by Farmer_F.
   - Click **"Approve"** to transition debt state from `pending` to `active`.

---

## 5. Environment Variables Reference

| Variable | Description | Default / Example |
|:---|:---|:---|
| `PORT` | Node.js Express server listening port | `4000` |
| `NODE_ENV` | Runtime environment mode | `production` / `development` |
| `AUTO_SEED` | Automatically run demo seed if MongoDB is empty on boot | `true` |
| `MONGO_URI` | MongoDB connection connection string | `mongodb://mongo:27017/creditflow` |
| `PYTHON_ENGINE_URL`| HTTP base URL for Python FastAPI analytics service | `http://engine:8000` |
| `JWT_ACCESS_SECRET`| Secret used to sign short-lived access tokens (15m) | Random 64-char string |
| `JWT_REFRESH_SECRET`| Secret used to sign refresh tokens (7d rotation) | Random 64-char string |
| `CLIENT_ORIGINS` | Comma-separated allowed CORS & Socket.io origins | `http://localhost:3000,http://localhost:80` |
| `CRON_ENABLED` | Enables hourly overdue flagger and daily digest cron | `true` |
| `INVITE_CODE_LENGTH`| Character length of generated tenant invite codes | `8` |
| `VITE_API_BASE_URL` | Frontend API client base URL | `http://localhost:4000/api` |
| `VITE_WS_URL` | Frontend Socket.io WebSocket base URL | `http://localhost:4000` |
| `VITE_MOCK_DOMAINS` | Allows mock adapter fallback for specific subdomains | `""` (empty = fully live backend) |

---

## 6. Comprehensive Verification & Test Suites

CreditFlow maintains strict test suites covering unit algorithms, mathematical formulations, database concurrency, and multi-tenant isolation.

```bash
# 1. Run all Node.js Express backend Jest suites (with in-memory MongoDB)
npm --prefix apps/server test

# 2. Run all Python unit tests & statistical verification with coverage
pytest --cov=creditflow tests/

# 3. Run client linting and production build
npm --prefix client run lint
npm --prefix client run build
```

### Test Suite Highlights
- **Cross-Tenant Isolation (`apps/server/tests/isolation.test.ts`, `socket_isolation.test.ts`):** Guarantees members of Group A receive `403 FORBIDDEN_GROUP` or filtered empty sets when querying Group B debts or socket rooms.
- **Race Condition & CAS (`apps/server/tests/settlement.test.ts`):** Verifies that concurrent settlement confirmations resolve with exactly one winning `200` and one `409 CONCURRENT_MODIFICATION`.
- **Hand-Calculated Statistical Tests (`tests/test_stats_engine.py`):** Hand-verified numerical assertions for one-proportion z-tests, Pearson $r$ guards, Poisson rates, and composite risk formulas.
- **Cycle Netting & Backtracking (`tests/test_settlement.py`, `test_review_b_adversarial.py`):** Conservation of net balance tests across circular and disconnected components.

---

## 7. Monorepo Directory Map

```
MINI_PROJECT/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions parallel CI workflow
├── apps/
│   └── server/                  # Node.js + Express + TypeScript Gateway
│       ├── Dockerfile           # Multi-stage production container
│       ├── scripts/
│       │   └── seed.ts          # CLI runner for demo seeding
│       ├── src/
│       │   ├── config/          # MongoDB connection config
│       │   ├── controllers/     # Debts, Groups, Settlement, Risk, Auth, etc.
│       │   ├── middleware/      # requireGroup, requireRole, JWT auth
│       │   ├── models/          # Group, Membership, Debt, Payment, Risk, etc.
│       │   ├── realtime/        # Socket.io JWT rooms & AIMD throttler
│       │   ├── routes/          # Express route definitions
│       │   └── services/        # Python bridge, seedService, dueDateJob
│       └── tests/               # 20 Jest test suites (isolation, CAS, seed)
├── client/                      # React 19 + TypeScript + Vite Frontend
│   ├── Dockerfile               # Multi-stage Nginx static container
│   ├── nginx.conf               # SPA routing + API reverse-proxy configuration
│   ├── src/
│   │   ├── api/                 # Axios client, contract interfaces, mock adapters
│   │   ├── components/          # Sidebar, CommandPalette, AddDebtModal, etc.
│   │   ├── pages/               # Overview, Network, Ledger, Settle, Risk, Groups
│   │   ├── state/               # AuthProvider, GroupProvider
│   │   └── types/               # TypeScript interfaces matching backend schemas
│   └── vite.config.ts
├── creditflow/                  # Python 3.11 Algorithms & Analytics Engine
│   ├── Dockerfile               # Python slim container with healthcheck
│   ├── algorithms/
│   │   ├── cycle_detection.py   # DFS cycle detection & flow netting
│   │   ├── exact_settlement.py  # Branch-and-bound minimum transaction solver
│   │   ├── risk_engine.py       # Poisson distribution credit risk scoring
│   │   ├── scc.py               # Tarjan Strongly Connected Components
│   │   ├── settlement.py        # Greedy max-heap settlement algorithm
│   │   ├── stats_engine.py      # Z-test, Pearson correlation, composite risk
│   │   └── warshall.py          # O(V³) dynamic programming transitive closure
│   └── api/                     # FastAPI route handlers & Pydantic schemas
├── docs/                        # Specifications, blueprints, and phase assets
├── tests/                       # 228 Pytest tests covering all algorithms
├── .dockerignore                # Container build exclusion patterns
├── .env.example                 # Root environment template for Docker & bare-metal
├── docker-compose.yml           # 4-service Docker Compose orchestration
├── package.json                 # Monorepo root scripts
├── requirements.txt             # Python dependencies
└── seed_data.json               # Seed scenario configuration
```

---

## 8. License & Team Acknowledgments

Built for the **Department of Computer Engineering, Sardar Patel Institute of Technology (SPIT)**.  
Course: **Mini Project — Semester V (AY 2026–27)**  
Faculty Coordinator: *Department of Computer Engineering, SPIT Mumbai*