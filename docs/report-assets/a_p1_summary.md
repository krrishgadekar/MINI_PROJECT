# Slice A (Phase 1) Summary: Tenancy Foundation (BE + FE + API)

**Owner:** Chetan Chavan (Node / Express / MongoDB / Socket.io Lead)  
**Phase:** Phase 1 (Tenancy Foundation, Backend + Frontend + API)  

---

## 1. Overview & Objective

Phase 1 establishes the multi-tenant architecture for CreditFlow. It isolates debt networks, risk calculations, and settlements by Tenant Groups, ensuring complete data partitioning between disparate trade circles while supporting shared merchant accounts across multiple coalitions.

All tasks 1 through 9 defined in the Phase 1 blueprint have been implemented, thoroughly tested, and validated with passing unit tests and a production client build.

---

## 2. Mapping Built Components to Acceptance Criteria

| Task / Acceptance Criterion | Implementation Details | Status |
|---|---|---|
| **1. Tenancy Models & Schema Extensions**<br>Group & Membership models. Extend Debt (groupId, dueDate, note, numeric version default 0, status enum). Extend Settlement (groupId, debtSnapshot, status). Extend RiskAssessment (groupId, zScore, pValue, correlation). Fix BE-07 riskCategory enum to LOW\|MEDIUM\|HIGH\|CRITICAL\|UNKNOWN (accept VERY_HIGH legacy). | • Created `apps/server/src/models/Group.ts` with `Group` and `Membership` schemas, indexing `{ groupId: 1, merchantId: 1 }` with unique compound constraint.<br>• Extended `Debt` model with required `groupId`, `dueDate`, `note`, `version: 0`, and status enum `active\|settled\|netted\|pending\|disputed`.<br>• Extended `Settlement` model with `groupId`, `debtSnapshot`, and `status`.<br>• Extended `RiskAssessment` model with `groupId`, `zScore`, `pValue`, and `correlation`.<br>• Fixed BE-07 in `Merchant.ts`: enum `['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'VERY_HIGH', 'UNKNOWN']`.<br>• Added BE-07 test in `tests/risk.test.ts`. | **Passed** |
| **2. Group Middleware**<br>`requireGroup` reads `X-Group-Id`, verifies membership, attaches `req.group`, `req.role` (throws 403 `FORBIDDEN_GROUP`). `requireRole('admin')`. | • Created `apps/server/src/middleware/group.middleware.ts` exporting `requireGroup` and `requireRole`.<br>• Validates ObjectId format, queries membership in DB, populates group name and role onto `req`.<br>• Throws 403 AppError `FORBIDDEN_GROUP` for missing header or non-members.<br>• Helper `requireRole` guarantees caller possesses admin/owner privileges. | **Passed** |
| **3. Router Tenancy Scoping & Isolation**<br>Apply `requireGroup` to debts, merchants, settlement, risk. Scope `getAllDebts` (admin sees all in group, member sees ego debts), `getAllMerchants` (group members only), `buildGraphPayload(groupId)`, and `scorePortfolio`. `createDebt` stamps groupId and enforces both parties are members. | • Updated `debts.controller.ts`: Enforces membership check for debtor and creditor upon creation; scopes listing to active group; implements `?scope=mine\|all` filter with role gating.<br>• Updated `merchants.controller.ts`: Restricts merchant listing to members of active group.<br>• Updated `settlement.controller.ts`: `buildGraphPayload` filters merchants and debts by `groupId`; Socket.io events emit to room `group:<groupId>`.<br>• Updated `risk.routes.ts`: Scoped v2 endpoints (`/group`, `/merchant/:id`, `/recompute`, `/contagion`) with `requireGroup`. | **Passed** |
| **4. Group Controller & Auth Extensions**<br>POST `/groups`, GET `/groups`, POST `/groups/join`, GET `/groups/:id/members`, PATCH `/groups/:id/members/:merchantId`, DELETE `/groups/:id/members/:merchantId`, POST `/groups/:id/invite-code/rotate`. Update GET `/auth/me` to include groups+roles. Add PATCH `/auth/me`. | • Implemented `apps/server/src/controllers/groups.controller.ts` with complete CRUD and invite code rotation.<br>• Mounted routes in `apps/server/src/routes/groups.routes.ts` on `/api/groups`.<br>• Updated `auth.controller.ts`: `getMe` populates merchant's groups and roles; implemented `updateMe` (PATCH `/api/auth/me`) supporting `name`, `phone`, `businessName`. | **Passed** |
| **5. Comprehensive Test Suites**<br>Update all existing Jest tests with group context and `X-Group-Id`. Add `tests/groups.test.ts` and `tests/isolation.test.ts` (cross-group 403, member ego visibility vs admin full visibility, multi-group isolation). | • Created `tests/groups.test.ts` (10 tests covering creation, listing, joining, role changes, member removal, and code rotation).<br>• Created `tests/isolation.test.ts` (9 tests verifying cross-tenant 403 isolation, ego vs admin visibility, independent multi-coalition debt graphs).<br>• Updated `debts.test.ts`, `settlement.test.ts`, `risk.test.ts`, `risk_v2.test.ts` to provision test groups and transmit `X-Group-Id`.<br>• All 12 test suites (85 tests) pass cleanly. | **Passed** |
| **6. Seed Script Update**<br>Update `scripts/seed.ts` minimally: create group "Crawford Market" (all 8 merchants, Wholesale_A owner) and stamp `groupId` on seeded debts. | • Updated `apps/server/scripts/seed.ts` to create `Crawford Market` (invite code `CRAWFORD`), assign Wholesale_A as owner and the remaining 7 merchants as members, and stamp `groupId` on all initial debts. | **Passed** |
| **7. Frontend Auth & Group Providers**<br>`client/src/state/AuthProvider.tsx` & `GroupProvider.tsx`. Axios interceptor in `api/client.ts` adds `X-Group-Id` and handles refresh-token flow on 401 once. Sidebar & Profile read real user (FE-04), group switcher dropdown in sidebar header (FE-03). | • Created `AuthProvider.tsx` loading authenticated user and group memberships from `/auth/me`.<br>• Created `GroupProvider.tsx` managing active group persisted in `localStorage` (`creditflow_active_group`).<br>• Enhanced `api/client.ts` with request interceptor injecting `X-Group-Id` and response interceptor implementing single-retry refresh-token queue on 401.<br>• Updated `Sidebar.tsx` with group switcher dropdown and real user avatar/initials/name.<br>• Updated `Profile.tsx` reading real user context. | **Passed** |
| **8. Frontend Groups Page**<br>`pages/Groups.tsx`: list my groups with role badges, create group modal, join by invite code, members table with role change/remove (admin only), copy/rotate invite code. Redirect to `/groups` when user has zero groups. Register route. Extended mock adapter. | • Fully implemented `client/src/pages/Groups.tsx` with glassmorphic cards, active group indicator, Create Group modal, Join Group modal, and Members table with role update and removal.<br>• Configured zero-groups redirect in `App.tsx` `ProtectedRoute`.<br>• Extended `client/src/api/mock/groups.mock.ts` supporting full offline/mock interactions. | **Passed** |
| **9. API Documentation**<br>Document any contract deviations in `API_DOCS.md`. | • Updated `apps/server/API_DOCS.md` with Section 1.1 Tenant Groups (`/api/groups`), Section 1.2 Tenancy Header Requirement (`X-Group-Id`), and updated Auth contract. | **Passed** |

---

## 3. Test Suites & Verification

### Backend Tests (`apps/server`)
Ran `npm test` (`jest --runInBand --forceExit`):
```text
PASS tests/throttler.test.ts
PASS tests/errors.test.ts
PASS tests/cors.test.ts
PASS tests/bridge.test.ts
PASS tests/merchants.test.ts
PASS tests/settlement.test.ts
PASS tests/debts.test.ts
PASS tests/risk_v2.test.ts
PASS tests/auth.test.ts
PASS tests/groups.test.ts
PASS tests/isolation.test.ts
PASS tests/risk.test.ts

Test Suites: 12 passed, 12 total
Tests:       85 passed, 85 total
Snapshots:   0 total
Time:        11.198 s
```

### Client Build (`client`)
Ran `npm --prefix client run build`:
```text
> client@0.0.0 build
> tsc -b && vite build

vite v8.2.1 building client environment for production...
transforming...✓ 3436 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                0.74 kB │ gzip:   0.43 kB
dist/assets/index-CFdgqXrm.css                24.83 kB │ gzip:   5.31 kB
dist/assets/check-D-6YAIwA.js                  0.11 kB │ gzip:   0.12 kB
dist/assets/Activity-D7kw1RQy.js               1.60 kB │ gzip:   0.67 kB
dist/assets/Settle-mtuOElI3.js                 2.04 kB │ gzip:   0.75 kB
dist/assets/Ledger-BESD3wjg.js                 2.08 kB │ gzip:   0.74 kB
dist/assets/TransactionDetail-C0RtVYTO.js      2.09 kB │ gzip:   0.81 kB
dist/assets/Network-Bml720Tr.js                2.34 kB │ gzip:   0.82 kB
dist/assets/Inbox-BNjK1oiR.js                  8.44 kB │ gzip:   2.48 kB
dist/assets/Groups-DHOqqMAo.js                16.15 kB │ gzip:   4.48 kB
dist/assets/ui-vCqlDByI.js                    16.54 kB │ gzip:   6.03 kB
dist/assets/index-BSuE1LrH.js              1,009.81 kB │ gzip: 304.19 kB
✓ built in 9.64s
```
