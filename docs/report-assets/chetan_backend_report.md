# Backend Infrastructure & Integration Report
**Project:** CreditFlow  
**Owner:** Chetan Chavan (Backend Infrastructure & Integration Lead)  
**Semester:** V (Mini Project, SPIT Mumbai)  

---

## 1. Executive Summary

As the Backend Infrastructure & Integration Lead, I architected and implemented the core Node.js/Express application gateway, MongoDB persistence layer, JWT authentication system, synchronous Python REST bridge (Axios), and real-time WebSocket event layer (Socket.io). This service acts as the central orchestration hub interfacing Parth Goggi's React frontend with Krrish's FastAPI mathematical and graph algorithm engine.

---

## 2. Architectural Design & Separation of Concerns

```
                  ┌─────────────────────────────────────────┐
                  │          Parth's React UI               │
                  └──────────────┬──────────────────────────┘
                                 │ HTTP REST (JWT) / WebSockets
                                 ▼
                  ┌─────────────────────────────────────────┐
                  │    Chetan's Node/Express Gateway        │
                  │   • Authentication & Rate Limiting      │
                  │   • MongoDB Atlas Persistence           │
                  │   • Concurrency & Optimistic Locking    │
                  │   • Real-Time Broadcasts (Socket.io)    │
                  └──────────────┬──────────────────────────┘
                                 │ Synchronous REST Bridge (Axios)
                                 ▼
                  ┌─────────────────────────────────────────┐
                  │      Krrish's Python Engine             │
                  │   • Greedy Min-Settlement (O(N log N))  │
                  │   • Warshall's Transitive Closure (O(V³))│
                  │   • DFS Cycle Netting (O(V + E))        │
                  │   • Poisson Risk Engine (O(N × M))      │
                  └─────────────────────────────────────────┘
```

### Why Decouple Node.js and Python?
1. **High Concurrency & I/O:** Node.js excels at asynchronous I/O, maintaining thousands of concurrent WebSocket connections, and fast JSON payload parsing.
2. **Computational Specialization:** Python's scientific ecosystem is optimized for complex graph theory and numerical algorithms.
3. **Fault Isolation:** If a heavy graph computation is underway in Python, the Node.js API gateway continues serving auth, cached merchant data, and WebSocket pings without thread blocking.

---

## 3. Database Modeling & Optimistic Concurrency Control

### Data Schemas (`MongoDB / Mongoose`)
- **`Merchant`**: Stores merchant credentials (hashed with Bcrypt), profile metadata, and embedded `riskProfile` cache (`riskScore`, `riskCategory`, `lastUpdated`).
- **`Debt`**: Represents weighted directed edges $(u, v, w)$ with indexing on `{ debtorId: 1, creditorId: 1 }` and `{ status: 1 }` for sub-millisecond querying.
- **`Settlement`**: Immutable audit logs of computed settlement batches with unique `batchId` (UUIDv4), ordered transactions list, and confirmation lifecycle.
- **`RiskAssessment`**: Time-series assessment records of monthly default probabilities and Poisson rate parameters ($\lambda$).

### Optimistic Concurrency Control (`versionKey: 'version'`)
To prevent race conditions where two simultaneous transactions modify the same debt edge concurrently, Mongoose optimistic locking is enforced using document versioning. If another process modifies a debt document during settlement computation, updates fail fast rather than causing inconsistent state.

---

## 4. Security & Authentication Architecture

1. **Password Hashing:** Bcrypt with 12 salt rounds ensures irreversible password security against rainbow table attacks.
2. **JWT Lifecycle:**
   - **Access Token:** Short-lived (15 minutes), signed with `JWT_ACCESS_SECRET`.
   - **Refresh Token:** Long-lived (7 days), signed with `JWT_REFRESH_SECRET`, enabling frictionless re-authentication.
3. **Rate Limiting:** Express rate-limiting guards `/api/auth` endpoints against brute-force attacks (max 100 requests per 15-minute window).
4. **Security Headers & CORS:** Helmet middleware sets HTTP security headers (`Content-Security-Policy`, `X-Frame-Options`, `HSTS`), while CORS restricts cross-origin access strictly to authorized frontend origins.

---

## 5. Real-Time WebSockets (Socket.io)

The real-time layer enables zero-latency updates for multi-merchant environments:
- **Room Subscriptions:** Merchants join dedicated rooms (`join:merchant`) to receive targeted debt notices.
- **Broadcast Events:**
  - `debt:created`, `debt:updated`, `debt:settled`
  - `settlement:ready`, `settlement:confirmed`
  - `cycle:netted`
  - `risk:updated`

---

## 6. Acceptance Criteria & Test Verification

| Module | Criteria | Verification Status |
| :--- | :--- | :--- |
| **Auth** | Secure registration, login, token refresh, protected routes | ✅ 100% Pass (`tests/auth.test.ts`) |
| **Merchants** | List and get single merchant, password hashes never leaked | ✅ 100% Pass (`tests/merchants.test.ts`) |
| **Debts** | Create, update, filter, settle debts, real-time dispatch | ✅ 100% Pass (`tests/debts.test.ts`) |
| **Settlement Bridge** | Python integration for greedy settlement, cycle check, cycle netting, batch confirm | ✅ 100% Pass (`tests/settlement.test.ts`) |
| **Risk Bridge** | Poisson calculation bridge, database persistence, profile updates | ✅ 100% Pass (`tests/risk.test.ts`) |

**Test Summary:** 5 Test Suites, 23 Unit Tests passed in `14.8s`.
