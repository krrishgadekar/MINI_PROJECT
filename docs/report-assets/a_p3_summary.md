# Slice A (Phase 3) Summary: Integration of Groups, Debts, Payments & Audit

**Owner:** Chetan Chavan (Node / Express / MongoDB / Socket.io Lead)  
**Phase:** Phase 3 (Integrate groups, debts, payments, audit against the real backend)  
**Branch:** `feat/a-p3-integrate`  

---

## 1. Overview & Objective

Phase 3 transitions the CreditFlow core domain slices (`auth`, `groups`, `debts`, `audit`) from client mock adapters to the live production Express/MongoDB backend:
1. **Multi-Group & Tenancy Seeding (`seed.ts`)**:
   - Re-architected `seed.ts` to create two realistic groups: `'Crawford Market'` with all 8 merchants and `'Supplier Circle'` with `Wholesale_A`, `Supplier_C`, and `Logistics_E`.
   - Staggered debt maturities across overdue (-8, -5, -3 days), due in 2 days (+2 days), and future horizons (+7 to +21 days).
   - Seeded `PaymentEvents` history for `Vendor_D` (6 monthly records) and `Supplier_C` (3 monthly records with default trigger `delayDays: 75 > 60`) strictly matching `seed_data.json` risk histories.
   - Preserved default password `CreditFlow@123` across all merchant accounts.
2. **Real Backend Integration & Mock Delegation**:
   - Updated `client/src/api/index.ts` default `VITE_MOCK_DOMAINS` from `'all'` to `'risk,settlement,graph,notifications'`.
   - `auth`, `groups`, `debts`, and `audit` now call the live Express backend on port 4000.
   - Documented environment variables in newly created `client/.env.example`.
   - Refactored `client/src/pages/Groups.tsx` to communicate exclusively through `api.groups.*`.
3. **API Contract Mismatches Resolved**:
   - Implemented `GET /api/groups/:id` on the server returning `{ success: true, group, members }` matching `GroupDetailResponse`.
   - Implemented `POST /api/groups/:id/invite` returning the group's invite code.
   - Added `POST /api/groups/:id/join` alias alongside `POST /api/groups/join` supporting both invite codes and IDs.
   - Extended `client/src/api/contract.ts` and `client/src/api/real.ts` with typed methods for `getMembers`, `updateRole`, `removeMember`, and `rotateInviteCode`.
4. **403 Tenancy & Cross-Group UI Enforcement**:
   - Added an Axios response interceptor in `client/src/api/client.ts` to capture HTTP 403 responses and dispatch `creditflow:forbidden-group`.
   - Mounted `<ForbiddenGroupHandler />` in `client/src/App.tsx` displaying an error toast and redirecting the user to `/groups`.
   - Validated server-level isolation: regular members are forbidden from querying `scope=all` on debts and can only see activity for transactions they participate in.

---

## 2. Mapping Built Components to Acceptance Criteria

| Task / Acceptance Criterion | Implementation Details | Status |
|---|---|:---:|
| **1. Update `seed.ts`**<br>`npm run seed` creates: two groups ('Crawford Market' with all 8 merchants + 'Supplier Circle' with Wholesale_A, Supplier_C, Logistics_E), debts with groupId, dueDates (some overdue, some due in 2 days), and PaymentEvents history for Vendor_D and Supplier_C consistent with seed_data.json risk_histories. Default password CreditFlow@123. | • Clears all collections (`Merchant`, `Debt`, `RiskAssessment`, `Settlement`, `Group`, `Membership`, `Payment`, `PaymentEvent`, `AuditLog`, `IdempotencyRecord`, `Notification`).<br>• Seeds Crawford Market (8 merchants) & Supplier Circle (3 merchants).<br>• Staggers due dates (-8d to +21d).<br>• Writes 21 `PaymentEvent` records with exact delay days matching `seed_data.json` (Vendor_D late/ontime sequence, Supplier_C 75d default + late sequence).<br>• Seeds initial `AuditLog` records for all debt creations. | **Passed** |
| **2. Remove `groups,debts,audit` from default `VITE_MOCK_DOMAINS`**<br>Create `client/.env.example`. Walk through: register -> create group -> join with invite code from a second browser profile -> add debt -> counterparty confirms -> record partial payment -> view timeline -> activity feed. Fix contract mismatches. Add checklist in `docs/report-assets/a_p3_checklist.md`. | • Set default `rawMockDomains` to `'risk,settlement,graph,notifications'` in `client/src/api/index.ts`.<br>• Created `client/.env.example`.<br>• Added `getGroupById` (`GET /api/groups/:id`), `inviteMember` (`POST /api/groups/:id/invite`), and dual join route (`/join` and `/:id/join`) in `groups.controller.ts` and `groups.routes.ts`.<br>• Fixed `audit` response shape mapping in client/tests.<br>• Automated walkthrough script `test-walkthrough.ts` validated all 11 steps against live backend.<br>• Documented results in `docs/report-assets/a_p3_checklist.md`. | **Passed** |
| **3. Verify cross-group 403 & member debt isolation**<br>Cross-group access returns 403 in UI (toast + redirect to `/groups`). Member never sees others' debts in Ledger/Activity. | • Axios response interceptor in `client/src/api/client.ts` detects 403 and dispatches `creditflow:forbidden-group`.<br>• `<ForbiddenGroupHandler />` in `client/src/App.tsx` catches the event, issues a `toast.error`, and navigates to `/groups`.<br>• `getAllDebts` in `debts.controller.ts` restricts members to `scope=mine` ($or: debtorId or creditorId) and rejects `scope=all` with 403.<br>• `getAuditLogs` in `audit.controller.ts` restricts members to logs where they are actor or party to the debt entity. | **Passed** |
| **4. Fix failing tests & run full test suites**<br>Run full Jest suite and client build. Clean merge. | • Added unit and isolation tests in `apps/server/tests/groups.test.ts`.<br>• Full Jest test suite: **13/13 suites passed (102/102 tests)**.<br>• Client build: **`tsc -b && vite build` succeeded with 0 errors**. | **Passed** |

---

## 3. Contract & Schema Changes

1. **New Backend Endpoints (`apps/server`)**:
   - `GET /api/groups/:id`: Protected by `requireGroup`. Returns `{ success: true, group, members }`.
   - `POST /api/groups/:id/invite`: Protected by `requireGroup`. Returns `{ success: true, inviteCode }`.
   - `POST /api/groups/:id/join`: Protected by `protect`. Supports joining via route parameter `:id` or body `{ inviteCode }`.
2. **Client Contract Interface (`client/src/api/contract.ts`)**:
   - Added `getMembers(groupId: string): Promise<{ success: boolean; members: any[] }>`
   - Added `updateRole(groupId: string, merchantId: string, role: Role): Promise<{ success: boolean; membership: any }>`
   - Added `removeMember(groupId: string, merchantId: string): Promise<{ success: boolean; message: string }>`
   - Added `rotateInviteCode(groupId: string): Promise<InviteResponse>`
   - Added optional pagination fields (`total`, `page`, `totalPages`) to `AuditLogResponse`.
3. **Client Real Adapter (`client/src/api/real.ts`)**:
   - Implemented real Axios calls for all newly added `groups` methods.

---

## 4. Test Suites Run & Verification Results

### Backend Jest Test Suites
Command: `npm --prefix apps/server test`
```text
PASS tests/ledger_phase2.test.ts (35.323 s)
PASS tests/isolation.test.ts
PASS tests/groups.test.ts (24/24 tests)
PASS tests/auth.test.ts
PASS tests/settlement.test.ts
PASS tests/risk_v2.test.ts
PASS tests/risk.test.ts
PASS tests/debts.test.ts
PASS tests/merchants.test.ts
PASS tests/bridge.test.ts
PASS tests/throttler.test.ts
PASS tests/errors.test.ts
PASS tests/cors.test.ts

Test Suites: 13 passed, 13 total
Tests:       102 passed, 102 total
Snapshots:   0 total
Time:        66.01 s
```

### Client TypeScript Strict Build
Command: `npm --prefix client run build`
```text
> client@0.0.0 build
> tsc -b && vite build

vite v8.2.1 building client environment for production...
transforming...✓ 3438 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                              0.81 kB │ gzip:   0.45 kB
dist/assets/index-CFdgqXrm.css              24.83 kB │ gzip:   5.31 kB
...
✓ built in 11.29s
```

---

## 5. Files Changed

### Backend (`apps/server`)
- `scripts/seed.ts`: Seeded Crawford Market (8 merchants) and Supplier Circle (3 merchants), debts with varied dueDates, PaymentEvents for risk histories, and initial audit logs.
- `src/controllers/groups.controller.ts`: Added `getGroupById`, `inviteMember`, and enhanced `joinGroup`.
- `src/routes/groups.routes.ts`: Mounted `GET /:id`, `POST /:id/invite`, and `POST /:id/join`.
- `tests/groups.test.ts`: Added test cases for single group fetch, invite code generation, and cross-group 403 rejections.
- `scripts/test-walkthrough.ts`: Automated full-stack E2E walkthrough script.

### Frontend (`client`)
- `src/api/index.ts`: Updated `rawMockDomains` fallback to exclude `groups`, `debts`, `audit`, and `auth`.
- `.env.example`: Created environment template documenting mock domain configuration and backend endpoints.
- `src/api/contract.ts`: Added `getMembers`, `updateRole`, `removeMember`, and `rotateInviteCode` to `groups` contract; added pagination fields to `AuditLogResponse`.
- `src/api/real.ts`: Implemented `getMembers`, `updateRole`, `removeMember`, and `rotateInviteCode` on `realApi.groups`.
- `src/api/client.ts`: Configured dynamic `VITE_API_BASE_URL` and 403 HTTP interceptor dispatching `creditflow:forbidden-group`.
- `src/App.tsx`: Mounted `<ForbiddenGroupHandler />` to catch 403 events, display toasts, and redirect to `/groups`.
- `src/pages/Groups.tsx`: Replaced direct `groupsMock` imports with unified `api.groups.*`.
- `src/pages/Login.tsx` & `src/pages/Register.tsx`: Preserved `creditflow_refresh_token` in `localStorage`.

### Documentation (`docs/`)
- `docs/report-assets/a_p3_checklist.md`: Manual checklist with live API verification results.
- `docs/report-assets/a_p3_summary.md`: Phase 3 summary mapping built components to acceptance criteria.
