# Phase 2 (Parth — Risk, Realtime & Notifications) Summary Report

## 1. Overview
- **Owner**: Parth (Slice C: Risk & Realtime)
- **Branch**: `feat/c-p2-risk-realtime`
- **Phase**: P2 — Core features
- **Acceptance Gate**: Pytest and Jest test suites pass; client builds without TypeScript/Vite errors; Risk, Inbox, and Overview pages functional on mock and real contract; live toasts & throttled socket batching verified.

---

## 2. Feature Mapping & Acceptance Criteria

| Feature ID | Scope | Implementation Details | Acceptance Status |
| :--- | :--- | :--- | :--- |
| **BE-08** | Realtime Auth & Scoping | Implemented JWT authentication in `socket.ts` handshake (`socket.handshake.auth.token`). Auto-joins `group:<groupId>` (for all groups the merchant is a member of) and `merchant:<merchantId>` (for private messaging). Eliminated client-controlled room joining. Exported `emitToGroup` and `emitToMerchant`. | **PASSED** |
| **BE-09** | AIMD Throttler | Implemented `throttler.ts` with per-socket sliding window: initial window = 10, additive increase (+1 on client ack) capped at 50, multiplicative decrease (halved on 500ms ack timeout) floored at 1. Periodic flush every 200ms emitting coalesced `batch:update` events. Fully tested with fake timers in `throttler.test.ts`. | **PASSED** |
| **BE-12** | Risk Engine v2 & Scoping | Rewrote `risk.controller.ts` with tenant isolation (`requireGroup`). Aggregates monthly payment histories from `PaymentEvent` per merchant, computes group-wide late baseline `p0`, calls Python bridge for Poisson $\lambda$, one-proportion $z$-test ($p$-value), and delay-amount correlation ($r$). Persists `RiskAssessment` and emits `risk:flagged` to `group:<groupId>` when label $\ge$ HIGH. | **PASSED** |
| **AL-06** | Contagion Simulation | Integrated Python contagion engine `creditflow/algorithms/contagion.py` with Node route `POST /risk/contagion` via `riskBridge.ts`. Calculates direct debtor-loss and multi-round second-order cascades using Warshall reachability and BFS level ordering. | **PASSED** |
| **BE-22** | Notifications System | Implemented `utils/notify.ts` to persist `Notification` records and emit `notification:new` to `merchant:<id>`. Created `notification.routes.ts` (`GET /`, `PATCH /:id/read`, `POST /read-all`) scoped to group and merchant. | **PASSED** |
| **BE-23** | Due-Date Scheduler | Implemented `services/dueDateJob.ts` scheduled hourly via `node-cron` (respecting `CRON_ENABLED`). Identifies debts due in 3 days and overdue debts, deduplicating notifications per merchant/debt per day. Exported `runDueDateJob()` for direct test invocation. | **PASSED** |
| **FE-05** | Realtime Hook | Created `useSocket.ts` hook: connects with token, listens for `batch:update` and `notification:new`, sends `presence:ack`, invalidates React Query keys, and raises instant toast notifications. Mounted once in `Layout.tsx`. | **PASSED** |
| **FE-24** | Risk Radar Page | Rebuilt `pages/Risk.tsx` with sortable assessment table with `UNKNOWN` badge support, drill-down drawer (Poisson $\lambda$, $z$-score, $p$-value statistical significance disclaimer, Recharts monthly late payment history), Pearson scatter chart, and interactive Contagion simulator panel with "Show on network" navigation. | **PASSED** |
| **FE-26** | Inbox Page | Rebuilt `pages/Inbox.tsx` with tabbed notification management (all / unread), mark read / mark all read, deep links to `/ledger/:id`, `/settle`, and `/risk`, plus "Pending debt requests" section with instant counterparty approve/reject buttons. | **PASSED** |
| **FE-28** | Overview Dashboard | Created `pages/Overview.tsx` aggregating real hook statistics, overdue debt warnings, 7-day upcoming maturities, exposure donut chart, latest system activity, and live unread notification count badge in header/sidebar. | **PASSED** |

---

## 3. Test Suites & Verification Results

1. **Server Unit & Integration Tests (Jest)**:
   - Command: `npm test` in `apps/server`
   - Result: **10 test suites passed, 55 tests passed (100%)**
   - Verified suites:
     - `tests/throttler.test.ts` (AIMD additive increase, timeout decrease, cap 50, floor 1)
     - `tests/risk_v2.test.ts` (recompute, isolation, contagion, notifications, due-date cron dedupe)
     - `tests/auth.test.ts`, `tests/merchants.test.ts`, `tests/settlement.test.ts`, `tests/debts.test.ts`, `tests/risk.test.ts`, `tests/errors.test.ts`, `tests/bridge.test.ts`, `tests/cors.test.ts`

2. **Python Engine Tests (Pytest)**:
   - Command: `pytest tests` in repository root
   - Result: **133 passed** (including stats engine $z$-test, Pearson correlation, composite risk, and contagion)

3. **Client Production Build**:
   - Command: `npm --prefix client run build` (`tsc -b && vite build`)
   - Result: **Success (0 errors)** in 1.19s, all routes bundled cleanly.

---

## 4. Contract Conformance
- All routes and payloads conform strictly to `apps/server/API_DOCS.md` Section 8.
- No existing database fields were renamed or removed.
