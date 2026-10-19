# Slice A (Phase 2) Summary: Ledger & Transaction (BE + FE + API)

**Owner:** Chetan Chavan (Node / Express / MongoDB / Socket.io Lead)  
**Phase:** Phase 2 (Ledger & Transaction, Backend + Frontend + API)  

---

## 1. Overview & Objective

Phase 2 builds the core transaction and ledger foundation for CreditFlow:
1. **Trust & Approval Workflow (BE-20)**: Peer-to-peer debts start in `pending` status. Only the designated counterparty (or group admin/owner) can confirm into the active graph or reject (`cancelled`). Debts can be disputed (`disputed`) and excluded from settlement cycles.
2. **Transaction Ledger & CAS Payments (BE-10, BE-11, BE-25)**: Partial and settlement payments recorded against debts using compare-and-swap optimistic locking (`casUpdate` with jittered backoff retry via `withRetry`). Stores `Payment` records and `PaymentEvent` documents capturing `dueDate`, `paidDate`, `wasLate`, and `delayDays`. Implements idempotency key deduplication per `(debtId, key)`.
3. **Audit Trail & Pagination (BE-21, BE-30)**: Immutable `AuditLog` collection capturing all debt proposals, approvals, rejections, disputes, payments, and settlements. Tenant-isolated query endpoint `GET /api/audit` and pagination/sorting/filtering utilities.
4. **Interactive Frontend (FE-20, FE-21, FE-22, FE-27, FE-45)**:
   - `Ledger.tsx` with tabs (Active, Pending, Overdue, Settled, Disputed), sortable data table, pagination, search, column filters, and role-aware ego vs all-group toggle.
   - `AddDebtModal.tsx` with searchable group member select, directional owe/owed toggle, due date, note, and awaiting approval banner.
   - `Transaction.tsx` (route `/ledger/:debtId`) with party header, status badges, repayment progress bar, overdue indicators, merged chronological timeline (payments + audit), action modals, and 409 conflict recovery with toast and auto-refresh.
   - `Activity.tsx` audit feed with entity filter chips and deep links directly navigating to `/ledger/:debtId`.
   - Mock modules `debts.mock.ts` and `audit.mock.ts` implementing the full contract with a 409 simulation toggle.

---

## 2. Mapping Built Components to Acceptance Criteria

| Task / Acceptance Criterion | Implementation Details | Status |
|---|---|---|
| **1. Payment & AuditLog Models & Helper (BE-21)**<br>Payment model `{groupId, debtId, amount, kind partial\|settlement\|netting, recordedBy, note, createdAt, index {debtId:1,createdAt:-1}}`. AuditLog model `{groupId, actorId, action, entityType, entityId, meta, createdAt}` and helper `utils/audit.ts` `audit(req, action, entityType, entityId, meta)`. | • Created `apps/server/src/models/Payment.ts` with compound index `{ debtId: 1, createdAt: -1 }`.<br>• Created `apps/server/src/models/AuditLog.ts` with tenant index `{ groupId: 1, entityId: 1, createdAt: -1 }`.<br>• Created `apps/server/src/utils/audit.ts` safe helper capturing tenant and actor identifiers without interrupting request pipeline. | **Passed** |
| **2. Debt Approval Flow (BE-20)**<br>POST `/debts` creates status `'pending'` (`confirmedBy` null, `createdBy` set); counterparty hits POST `/debts/:id/confirm` -> `'active'`; `/reject` -> `'cancelled'`; `/dispute` -> `'disputed'`. Only the OTHER party can confirm. Admin may force-confirm. | • Extended `apps/server/src/models/Debt.ts` with `confirmedBy` and `createdBy` references.<br>• Implemented `confirmDebt`: verifies caller is the counterparty and prevents creator from self-confirming (403 `FORBIDDEN_GROUP`), while allowing admin force-confirmation.<br>• Implemented `rejectDebt`: transitions pending debt to `cancelled`.<br>• Implemented `disputeDebt`: transitions active debt to `disputed` with reason note. | **Passed** |
| **3. Single Debt Detail & CAS Payments (BE-10, BE-11, BE-25)**<br>GET `/debts/:id` returns debt + payments + audit entries, restricted to parties and admins. POST `/debts/:id/payments`: decrement amount via `casUpdate` from `concurrency/optimisticLock` with `withRetry`; write `Payment`; write `PaymentEvent` (`wasLate`, `delayDays`); status -> `settled` at 0; reject `amount > remaining`. Idempotency (BE-25) store key per `(debtId, key)` and return `IDEMPOTENT_REPLAY`. Refactor `updateDebt` and `settleDebt` to `casUpdate`. | • Created `apps/server/src/concurrency/optimisticLock.ts` implementing `casUpdate` and `withRetry` with jittered exponential backoff.<br>• Created `apps/server/src/models/Idempotency.ts` storing `(debtId, key)` pairs with TTL.<br>• Implemented `getDebtById`: enforces party/admin authorization and returns merged debt, payments, and audit logs.<br>• Implemented `recordPayment`: executes atomic version CAS decrement, creates `Payment`, computes `wasLate` and `delayDays` on `PaymentEvent`, and returns `IDEMPOTENT_REPLAY` on duplicate keys.<br>• Refactored `updateDebt` and `settleDebt` to `casUpdate`. | **Passed** |
| **4. Audit Endpoint & Pagination Helper (BE-21, BE-30)**<br>GET `/audit?entityId=&page=` (admin or party). Pagination/sort/filter helper `utils/paginate.ts` applied to GET `/debts` (`?page&limit&sort&status&scope&q`). | • Created `apps/server/src/utils/paginate.ts` parsing pagination, skip, limit, and directional sort expressions.<br>• Created `apps/server/src/controllers/audit.controller.ts` and `apps/server/src/routes/audit.routes.ts` mounted on `/api/audit` with role-aware scoping and pagination.<br>• Applied `parsePaginationParams` and search regex to `getAllDebts`. | **Passed** |
| **5. Backend Tests**<br>Payment race (two concurrent payments same version -> one retries, final amount correct, never double-decremented), approval permissions, idempotent replay, isolation. | • Created `apps/server/tests/ledger_phase2.test.ts` (13 comprehensive tests).<br>• Validated debt creation in pending state and creator self-confirmation rejection (403).<br>• Validated counterparty confirmation and rejection.<br>• Validated dispute workflow.<br>• Validated single transaction detail and tenant isolation.<br>• Validated payment recording, `PaymentEvent` with `wasLate` and `delayDays`.<br>• Validated idempotent replay returning `IDEMPOTENT_REPLAY` and preventing double-decrement.<br>• Validated payment race: two parallel requests against version 0 both complete via `withRetry`, decrementing exactly 600 from 1000 to 400 with version 2.<br>• Validated cross-tenant audit isolation and pagination. | **Passed** |
| **6. Frontend Ledger Page (FE-21)**<br>Tabs Active/Pending/Overdue/Settled/Disputed, sortable table with pagination, search, column filters, row click -> `/ledger/:debtId`, role-aware (member sees only own, 'All debts' toggle for admin). | • Implemented `client/src/pages/Ledger.tsx` with 6 status tabs, search query input, sortable column headers, pagination bar, and admin scope switcher.<br>• Row click navigates directly to `/ledger/:debtId`.<br>• Added top KPI summary cards for receivables, payables, pending count, and overdue count. | **Passed** |
| **7. Add Debt Modal (FE-22, FE-45)**<br>Searchable merchant select (group members), amount, due date, note; shows 'awaiting approval' state; wire the Add Debt button. | • Implemented `client/src/components/AddDebtModal.tsx` with group member select, direction toggle ("They Owe Me" vs "I Owe Them"), amount, due date, note, and awaiting approval banner.<br>• Wired Add Debt button in `Ledger.tsx`. | **Passed** |
| **8. Transaction Page (FE-20)**<br>Route `/ledger/:debtId`: header with parties, status badge, original/remaining progress bar, due date + overdue indicator, payment timeline (payments + audit merged chronologically), actions: record payment modal (idempotency key generated client side), confirm/reject/dispute for counterparty, settle for admin; handles 409 with toast 'Debt changed, refreshed' and refetch. | • Implemented `client/src/pages/Transaction.tsx` and re-exported from `TransactionDetail.tsx`.<br>• Header displays parties, status badges, version indicator, repayment progress bar, and overdue indicators.<br>• Chronological merged timeline for payments and audit entries.<br>• Actions: Record Payment modal (client-side generated UUID idempotency key), Confirm/Reject for counterparty, Dispute modal with reason, Force Settle for admin.<br>• Intercepts 409 `CONCURRENT_MODIFICATION` errors, issues toast `"Debt changed, refreshed"`, and automatically refetches. | **Passed** |
| **9. Activity Page (FE-27)**<br>Audit feed with entity deep links, pagination. | • Implemented `client/src/pages/Activity.tsx` fetching from `api.audit.list`.<br>• Entity filter chips (`All`, `Debt`, `Payment`, `Settlement`, `RiskAssessment`).<br>• Deep links on Debt entries navigating to `/ledger/:debtId`.<br>• Pagination controls. | **Passed** |
| **10. Mock Modules**<br>Mock modules `api/mock/debts.mock.ts` and `audit.mock.ts` implementing the contract incl. payments and 409 simulation toggle. | • Enhanced `client/src/api/mock/debts.mock.ts` with `setSimulate409` and `getSimulate409` toggle, rich status/query filtering, and audit log generation.<br>• Enhanced `client/src/api/mock/audit.mock.ts` with entity filtering, deep link data, and pagination. | **Passed** |
| **11. API Documentation Update**<br>Update `API_DOCS.md` with final shapes. | • Updated root `API_DOCS.md` and `apps/server/API_DOCS.md` with final query parameters for `/debts` and `/audit`, pagination response objects, and `idempotencyKey` in payment requests. | **Passed** |

---

## 3. Test Suites & Verification

### Backend Tests (`apps/server`)
Ran `npm --prefix apps/server test` (`jest --runInBand --forceExit`):
```text
PASS tests/ledger_phase2.test.ts (5.689 s)
  Phase 2 — Ledger, Transactions, Approval Flow, CAS Payments & Audit
    1. Debt Approval Flow (BE-20)
      √ creates debt in pending status with createdBy set (79 ms)
      √ prevents creator (User A) from self-confirming the debt proposal (21 ms)
      √ allows counterparty (User B) to confirm the debt proposal -> active (37 ms)
      √ allows debt rejection for pending debts (53 ms)
      √ allows disputing active debt (32 ms)
    2. Single Debt Detail (BE-10)
      √ returns debt, payments timeline, and audit logs for parties (31 ms)
      √ prevents cross-tenant access to debt detail (23 ms)
    3. Payments, CAS, Idempotency & Concurrency Race (BE-10, BE-11, BE-25)
      √ records partial payment, updates status, and logs PaymentEvent with delayDays (36 ms)
      √ idempotency key returns IDEMPOTENT_REPLAY with identical response on replay (57 ms)
      √ rejects payment exceeding remaining amount (17 ms)
      √ payment race test: two concurrent payments against same initial version both succeed via withRetry and result in exact final amount (213 ms)
    4. Audit Log Endpoint & Isolation (BE-21, BE-30)
      √ admin views all group audit entries with pagination (27 ms)
      √ cross-tenant user cannot view another group audit logs (10 ms)
PASS tests/isolation.test.ts
PASS tests/groups.test.ts
PASS tests/auth.test.ts
PASS tests/risk_v2.test.ts
PASS tests/settlement.test.ts
PASS tests/debts.test.ts
PASS tests/risk.test.ts
PASS tests/merchants.test.ts
PASS tests/bridge.test.ts
PASS tests/errors.test.ts
PASS tests/throttler.test.ts
PASS tests/cors.test.ts

Test Suites: 13 passed, 13 total
Tests:       98 passed, 98 total
Snapshots:   0 total
Time:        17.274 s
```

### Client Build (`client`)
Ran `npm --prefix client run build`:
```text
> client@0.0.0 build
> tsc -b && vite build

vite v8.2.1 building client environment for production...
transforming...✓ 3438 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                0.74 kB │ gzip:   0.43 kB
dist/assets/index-CFdgqXrm.css                24.83 kB │ gzip:   5.31 kB
dist/assets/check-HXpHm4FV.js                  0.11 kB │ gzip:   0.12 kB
dist/assets/plus-C0ONiL6q.js                   0.13 kB │ gzip:   0.13 kB
dist/assets/circle-x-B4rhkhfK.js               0.19 kB │ gzip:   0.16 kB
dist/assets/calendar-y-lh51Hg.js               0.24 kB │ gzip:   0.19 kB
dist/assets/file-text-VXIjDy2I.js              0.37 kB │ gzip:   0.24 kB
dist/assets/Settle-TccMgtpk.js                 2.04 kB │ gzip:   0.75 kB
dist/assets/Network-qF8RyKWY.js                2.34 kB │ gzip:   0.83 kB
dist/assets/Activity-PBZJXVIe.js               6.53 kB │ gzip:   2.28 kB
dist/assets/Inbox-DmT0D34B.js                  8.16 kB │ gzip:   2.36 kB
dist/assets/Groups-9eBoDo8r.js                16.10 kB │ gzip:   4.49 kB
dist/assets/ui-COk3hLgT.js                    17.41 kB │ gzip:   6.28 kB
dist/assets/Ledger-C9Hmflom.js                19.22 kB │ gzip:   5.10 kB
dist/assets/TransactionDetail-F7CMlEMC.js     21.74 kB │ gzip:   6.07 kB
dist/assets/index-C-gGbT50.js              1,013.43 kB │ gzip: 305.03 kB

✓ built in 700ms
```
