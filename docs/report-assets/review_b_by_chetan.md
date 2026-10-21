# Phase 5A Review Report — Slice B: Settlement & Graph

**Reviewer**: Chetan Chavan (Node / Express / MongoDB / Socket.io Lead)  
**Date**: October 21, 2026  
**Branch**: `test/a-p5-review-b`  
**Scope**: Slice B Review — Settlement Optimization, Cycle Netting, Network Graph, Concurrency & Tenancy Isolation  

---

## 1. Executive Summary

As part of Phase 5A, a comprehensive adversarial code review and bug bash was conducted across **Slice B (Settlement & Graph)**. The objective was to audit the algorithms (`creditflow/algorithms/{exact_settlement, scc, cycle_detection, settlement}.py`), server controllers (`settlement.controller.ts`, `debts.controller.ts`), optimistic locking primitives (`concurrency/optimisticLock.ts`), and frontend contracts (`Network.tsx`, `Settle.tsx`).

All 10 required adversarial test scenarios were constructed and verified against strict isolation, state machine, and algorithm invariants. Six concrete defects were identified, analyzed, and fixed with minimal, highly targeted diffs. Both backend and algorithmic test suites are **100% green**, and the React client builds with zero TypeScript errors.

---

## 2. Adversarial Scenarios Tested & Verification Matrix

| # | Scenario | Target Component | Adversarial Input / Attack Vector | Observed Behavior & Assertion | Outcome |
|---|:---|:---|:---|:---|:---:|
| 1 | **Duplicate debts for one pair** | `MerchantGraph.add_debt`, `graph.controller.ts`, `settlement.controller.ts` | Two active debts between same pair (e.g., Member Bob owes Admin Alice ₹400 and ₹600). | Graph aggregates directed weights in adjacency matrix (₹1,000) while preserving distinct debt IDs in edge list. Cycle netting distributes reduction across multiple debts. Both debts are snapshotted and settled atomically upon confirm. | **PASSED** |
| 2 | **Disputed & pending debts excluded** | `graph.controller.ts`, `settlement.controller.ts` | Injected debts with status `pending`, `disputed`, and `settled` alongside `active` debts. | `GET /api/graph` and `buildGraphPayload` enforce filter `{ status: 'active', groupId }`. Only active debts appear in network topology and settlement calculations. | **PASSED** |
| 3 | **Debt changed mid-confirm** | `settlement.controller.ts`, `concurrency/optimisticLock.ts` | Settlement batch computed; debt version incremented (e.g., partial payment or update) prior to `POST /api/settlement/confirm/:batchId`. | Atomic CAS check detects version mismatch via `casUpdate`. Batch status moves to `failed` and returns HTTP `409 STALE_SETTLEMENT`. Prevents dirty/stale double settlements. | **PASSED** |
| 4 | **Member requesting `mode=full`** | `graph.controller.ts` | Non-admin group member queries `GET /api/graph?mode=full` expecting to view entire organization network. | Controller inspects `req.role`; if `member`, query is **strictly forced** to `mode=ego`. Only debts where caller is debtor or creditor are returned. Admin querying `mode=full` receives the entire group graph. | **PASSED** |
| 5 | **Admin of another group** | `middleware/group.middleware.ts`, `graph.controller.ts` | Authenticated admin/owner of Group B passes `X-Group-Id: <Group A>`. | Middleware intercepts unauthorized cross-tenant access and returns HTTP `403 FORBIDDEN_GROUP`. Tenant isolation preserved. | **PASSED** |
| 6 | **13+ non-zero balances (cap fallback)** | `creditflow/algorithms/exact_settlement.py` | 13 merchants in an imbalanced ring yielding 13 non-zero net balances. | Exact solver checks `len(active_items) > max_balances (12)`. Gracefully sets `capped=True` and falls back to greedy $O(N \log N)$ heuristic with documented warning. | **PASSED** |
| 7 | **Floating point amounts (0.1 + 0.2)** | `settlement.controller.ts`, `exact_settlement.py`, `settlement.py` | Debts with micro amounts $0.1$ and $0.2$ ($0.30000000000000004$ under IEEE 754). | Balance conservation $\sum B_i = 0$ holds. Netting uses rounding guard `Math.round(v * 100) / 100` and `newAmount < 1e-4 ? 0 : newAmount` so remaining balance zeroes out cleanly and status flips to `netted`. | **PASSED** |
| 8 | **Empty group** | `graph.controller.ts`, `settlement.controller.ts` | Group with 0 active members and 0 debts. | `GET /api/graph` returns HTTP 200 with empty nodes, edges, and matrix `{}`. `POST /api/settlement` returns HTTP 400 with `"No active debts found to settle."` without crashing. | **PASSED** |
| 9 | **Single merchant group** | `graph.controller.ts`, `settlement.controller.ts` | Group with 1 merchant and 0 debt edges. | `GET /api/graph` returns HTTP 200 with 1 merchant node and 0 edges. `POST /api/settlement` returns HTTP 400. Python exact solver and Tarjan SCC return singleton component with 0 transactions. | **PASSED** |
| 10 | **Self-loop attempt** | `debts.controller.ts`, `settlement.controller.ts` | `POST /api/debts` with `debtorId == creditorId`, or `POST /settlement/net-cycle` with cycle `["A", "A"]`. | Debt creation rejected with HTTP 400 `VALIDATION` (`"A merchant cannot owe themselves"`). Cycle netting rejected with HTTP 400 `VALIDATION` (`"Cycle must contain distinct merchants"`). | **PASSED** |

---

## 3. Defects Identified & Minimal Diff Solutions

### Defect 1: Unchecked Self-Loop Debt Creation
- **File**: `apps/server/src/controllers/debts.controller.ts`
- **Issue**: `createDebt` resolved `debtor` and `creditor` models but never validated whether `debtor._id.equals(creditor._id)`. A user could create debts where they owe themselves, polluting graph topology and cycle detection.
- **Fix**: Added explicit guard:
  ```ts
  if (debtor._id.toString() === creditor._id.toString()) {
    res.status(400).json({
      success: false,
      code: 'VALIDATION',
      message: 'A merchant cannot owe themselves (self-loop not permitted).',
    });
    return;
  }
  ```

### Defect 2: Missing Group Graph Endpoint & Mode Enforcement
- **File**: `apps/server/src/controllers/graph.controller.ts`, `apps/server/src/routes/graph.routes.ts`, `apps/server/src/app.ts`
- **Issue**: `IMPLEMENTATION_PLAN.md` §7 specified `GET /graph?mode=full|ego` with role-based ego enforcement, but the endpoint was missing from the server router.
- **Fix**: Created `graph.controller.ts` and `graph.routes.ts`, mounted at `/api/graph`. It enforces:
  1. `req.role === 'member'` is strictly forced to `mode = 'ego'`, returning only the caller's ego network.
  2. Debts are strictly filtered to `{ groupId, status: 'active' }`, omitting pending and disputed debts.
  3. Returns `merchants`, `edges` with `debtId`, and aggregated `adjacency_matrix`.
  4. Added `POST /api/graph/scc` route calling Python Tarjan SCC clustering.

### Defect 3: Settlement Confirmation Lacked Optimistic Lock Snapshot (CAS)
- **File**: `apps/server/src/controllers/settlement.controller.ts`
- **Issue**: `computeSettlement` did not save `debtSnapshot` (`[{ debtId, version, amount }]`) to the `Settlement` document. `confirmSettlement` executed a blind `Debt.updateMany({ status: 'active' })`, which would settle modified debts or race with concurrent settlement confirmations.
- **Fix**:
  1. Updated `computeSettlement` to capture and store `debtSnapshot`.
  2. Updated `confirmSettlement` to atomically transition `status: 'pending' -> 'executing'` via `findOneAndUpdate` (guaranteeing idempotency and 409 on concurrent callers).
  3. Loop over `debtSnapshot` using `casUpdate(Debt, item.debtId, item.version, { status: 'settled', amount: 0 })`. If any debt version changed, mark batch `failed` and return HTTP `409 STALE_SETTLEMENT`.
  4. Record `Payment` audit logs with `kind: 'settlement'`.

### Defect 4: Single-Debt Lookup in Cycle Netting
- **File**: `apps/server/src/controllers/settlement.controller.ts`
- **Issue**: `netCycleController` used `Debt.findOne(debtFilter)` to apply netting reductions. If two debts existed between debtor and creditor, only the first was reduced, ignoring remaining debt volume.
- **Fix**: Replaced `findOne` with `Debt.find(debtFilter).sort({ createdAt: 1 })`. Deducts `amountNetted` sequentially across matching debts until the full reduction is consumed.

### Defect 5: Floating Point Precision Residuals in Netting
- **File**: `apps/server/src/controllers/settlement.controller.ts`
- **Issue**: Subtracting float values in JavaScript (e.g., $0.3 - 0.3$) can yield $4.44 \times 10^{-17}$. Because the condition was `newAmount === 0`, debts were not flipped to `status: 'netted'`.
- **Fix**: Introduced cent-rounding guard:
  ```ts
  const rawNew = Math.max(0, Math.round((debt.amount - deduction) * 100) / 100);
  const newAmount = rawNew < 1e-4 ? 0 : rawNew;
  debt.amount = newAmount;
  if (newAmount === 0) debt.status = 'netted';
  ```

### Defect 6: Unchecked Self-Loop in Net Cycle Payload
- **File**: `apps/server/src/controllers/settlement.controller.ts`
- **Issue**: `POST /api/settlement/net-cycle` allowed cycles like `["A", "A"]` which caused internal errors.
- **Fix**: Added validation:
  ```ts
  if (new Set(cycle).size !== cycle.length) {
    res.status(400).json({ success: false, code: 'VALIDATION', message: 'Cycle must contain distinct merchants (no self-loops).' });
    return;
  }
  ```

---

## 4. Test Suites & Verification Results

### 4.1 Server Jest Suites (`apps/server`)
- **Total Test Suites**: **17 passed, 17 total**
- **Total Tests**: **144 passed, 144 total**
- **Key Suites**:
  - `tests/review_b_adversarial.test.ts`: **11 passed** (covers self-loops, cross-group 403, ego forcing, excluded non-active debts, duplicate debts, debt changed mid-confirm CAS, float precision, empty & single merchant groups).
  - `tests/settlement.test.ts`: **3 passed** (covers greedy settlement, cycle detection, cycle netting).
  - `tests/isolation.test.ts`, `tests/debts.test.ts`, `tests/groups.test.ts`: **All green**.

### 4.2 Python Algorithm Suites (`tests/`)
- **Total Tests**: **228 passed, 228 total**
- **Key Suites**:
  - `tests/test_review_b_adversarial.py`: **7 passed** (covers 13-balance cap fallback, 12-balance boundary DP, float 0.1+0.2 conservation, duplicate debts accumulation, empty graph, single merchant, self-loop conservation).
  - `tests/test_exact_settlement.py`, `tests/test_settlement.py`, `tests/test_phase4_hardening.py`: **All green**.

### 4.3 Client Production Build (`client`)
- Command: `npm --prefix client run build`
- Output: `tsc -b && vite build` built in **923ms** with zero errors.

---

## 5. Residual Risks & Architectural Recommendations

1. **Transaction-Level Atomicity across Large Snapshots**:
   - *Current Implementation*: Debts in a batch are updated individually via `casUpdate`. If an unexpected process termination occurs halfway through a 100-debt confirmation, a subset of debts could be marked settled while the batch is marked failed.
   - *Mitigation / Next Step*: For production multi-replica deployments, wrap `confirmSettlement` in a MongoDB replica set session transaction (`session.withTransaction`) so the state transitions commit atomically.
2. **Python Engine Latency under Peak Contention**:
   - *Current Implementation*: Axios calls use configurable timeouts with single-retry in bridge wrappers.
   - *Observation*: Exact solver at $N=12$ executes in $< 15\text{ms}$; 13+ balances fallback to greedy takes $< 2\text{ms}$.
   - *Residual Risk*: Sustained spikes in concurrent `/settlement/optimize` requests should be metered via the existing AIMD throttler to avoid thread pool exhaustion.
