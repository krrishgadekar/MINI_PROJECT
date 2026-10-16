# Slice A (Phase 0) Summary: Contract Skeleton & Tenancy Preparation

**Owner:** Chetan Chavan (Node / Express / MongoDB / Socket.io Lead)  
**Branch:** `feat/a-p0-contract`  
**Phase:** Phase 0 (Contract Freeze & Skeleton)  

---

## 1. Overview & Objective

In accordance with `IMPLEMENTATION_PLAN.md` (§2.3, §6, §7) and `FEATURES.md`, Phase 0 establishes the foundation and contract skeleton for multi-tenant tenancy (Groups), transaction ledgers (Payments & Audit), and resilient service-to-service communication with Krrish's FastAPI engine.

This work freezes the schemas and API contracts so that Chetan, Krrish, and Parth can proceed in parallel during Phase 1 without contract drift or blocking dependencies.

---

## 2. Mapping Built Components to Acceptance Criteria

| Task / Acceptance Criterion | Implementation Details | Status |
|---|---|---|
| **1. Python Bridge Modularization**<br>Refactor `pythonBridge.ts` into `bridge/{http.ts, settlementBridge.ts, riskBridge.ts, graphBridge.ts, index.ts}` with 8s timeout, 1 network-error retry, and 503 error mapping. Maintain legacy import path. | Created `apps/server/src/services/bridge/`: <br>• `http.ts`: Axios instance configured with `timeout: 8000`, interceptor performing 1 retry on network error (`!error.response`), and `handleEngineError` mapping connection failures to `503`.<br>• `settlementBridge.ts`: `callSettlement`, `callCycleDetection`, `callNetCycle`.<br>• `riskBridge.ts`: `callRiskScore`, `callPortfolioRisk`.<br>• `graphBridge.ts`: Types for engine graph, closure, and SCC responses.<br>• `index.ts`: Re-exports all bridge modules.<br>• `pythonBridge.ts`: Maintained as `export * from './bridge'` for 100% backwards compatibility.<br>• Added unit tests in `tests/bridge.test.ts`. | **Passed** |
| **2. AppError & Error Handling**<br>Create `errors.ts` with `AppError(statusCode, code, message)` and slice A error codes. Update `errorHandler.ts` to output `{ success: false, code, message }` while preserving untyped error behaviour. | Created `apps/server/src/utils/errors.ts` defining `AppError` and codes:<br>• `FORBIDDEN_GROUP`<br>• `CONCURRENT_MODIFICATION`<br>• `STALE_SETTLEMENT`<br>• `VALIDATION`<br>• `NOT_FOUND`<br>• `IDEMPOTENT_REPLAY`<br>Updated `errorHandler.ts` to inspect `err.code` and output `{ success: false, code, message }` for typed errors, while maintaining `{ success: false, message }` for untyped errors.<br>Added unit tests in `tests/errors.test.ts`. | **Passed** |
| **3. Slice A TypeScript Types**<br>Add types for Group, Membership, Role, Debt (with groupId, dueDate, note, status incl. pending/disputed, version), Payment, AuditEntry, DebtDetailResponse, and ApiError to `client/src/types/index.ts`. Do not remove existing types. | Updated `client/src/types/index.ts` strictly adhering to §2.3 and §7:<br>• `Role` (`'owner' \| 'admin' \| 'member'`)<br>• `GroupType` and `Group`<br>• `Membership`<br>• `DebtStatus` (`'pending' \| 'active' \| 'settled' \| 'disputed' \| 'netted'`)<br>• `Debt` (including `groupId`, `dueDate`, `note`, `version`, `confirmedBy`)<br>• `PaymentKind` and `Payment`<br>• `PaymentEvent`<br>• `AuditEntry`<br>• `DebtDetailResponse`<br>• `ApiError` and `ApiErrorCode`<br>• `NotificationItem`<br>All existing types preserved intact. | **Passed** |
| **4. API Contract Documentation**<br>Add section "Groups / Debts / Payments / Audit (v2 contract)" to `apps/server/API_DOCS.md` listing routes, `X-Group-Id` header, JSON examples, role rules, and error codes. | Added section `## 7. Groups / Debts / Payments / Audit (v2 contract)` to `apps/server/API_DOCS.md` covering:<br>• Multi-tenant header requirements (`Authorization` + `X-Group-Id`)<br>• Role rules (`admin`/`owner` full graph vs `member` ego-network only)<br>• Complete endpoint listings with request/response payloads for Groups, Debts v2 (including request/approval/dispute flow), Payment ledger (CAS with `expectedVersion`), and Audit logs.<br>• Standard error response schema and status code mappings. | **Passed** |
| **5. Environment & CORS Support**<br>Extend `.env.example` with `CLIENT_ORIGINS`, `CRON_ENABLED`, `INVITE_CODE_LENGTH` and parse `CLIENT_ORIGINS` in `app.ts` and `socket.ts`. | Created `apps/server/src/config/cors.ts` with `getClientOrigins()` parsing comma-separated URLs with fallbacks.<br>Updated `app.ts` Express CORS and `socket.ts` Socket.IO CORS to use `getClientOrigins()`.<br>Extended `apps/server/.env.example` and local `.env` with `CLIENT_ORIGINS`, `CRON_ENABLED`, and `INVITE_CODE_LENGTH`.<br>Added unit tests in `tests/cors.test.ts`. | **Passed** |

---

## 3. Test Suites & Verification

### Backend Tests (`apps/server`)
Ran `npm test` (`jest --runInBand --forceExit`):
```text
PASS tests/settlement.test.ts
PASS tests/auth.test.ts
PASS tests/risk.test.ts
PASS tests/cors.test.ts
PASS tests/errors.test.ts
PASS tests/bridge.test.ts
PASS tests/debts.test.ts
PASS tests/merchants.test.ts

Test Suites: 8 passed, 8 total
Tests:       43 passed, 43 total
Snapshots:   0 total
Time:        23.919 s
```

### Client Build (`client`)
Ran `npm --prefix client run build`:
```text
> client@0.0.0 build
> tsc -b && vite build

vite v8.2.1 building client environment for production...
transforming...✓ 3327 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.66 kB │ gzip:   0.41 kB
dist/assets/index-C9cY53xf.css   19.52 kB │ gzip:   4.47 kB
dist/assets/index-B6mLEO49.js   884.03 kB │ gzip: 268.95 kB
✓ built in 676ms
```

---

## 4. Contract Changes & Notes

1. **Python Engine Bridge**: All outgoing engine requests now transit through `engineClient` (`http.ts`), enforcing an 8,000 ms timeout and automatic single retry on network partition or socket drops before translating to HTTP 503.
2. **Error Protocol**: Structured error bodies now return `{ success: false, code: "...", message: "..." }` when instantiated via `AppError`. Untyped errors continue to emit `{ success: false, message: "..." }` to prevent regressions.
3. **CORS Configuration**: Allowed origins are dynamically loaded from `CLIENT_ORIGINS` (comma-separated), with safe defaults for `http://localhost:3000` and `http://localhost:4000`.
