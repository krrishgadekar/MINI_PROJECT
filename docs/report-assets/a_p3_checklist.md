# Phase 3 Integration Checklist: Groups, Debts, Payments & Audit

**Feature Slice:** Slice A (Phase 3 Integration)  
**Lead:** Chetan Chavan  
**Verification Target:** Real Node.js / Express / MongoDB Backend (Port 4000) & Vite React Client (Port 5173)  
**Mode:** Full Stack Live API Verification (Cypress-less manual checklist)

---

## 1. Database Seeding & Dataset Integrity

- [x] **1.1 Fresh Seed Execution**
  - Command: `npm run seed` (via `apps/server/scripts/seed.ts`).
  - Result: Clears existing data across all collections (`Merchant`, `Debt`, `RiskAssessment`, `Settlement`, `Group`, `Membership`, `Payment`, `PaymentEvent`, `AuditLog`, `IdempotencyRecord`, `Notification`) and rebuilds deterministic state.
- [x] **1.2 Multi-Group Creation**
  - Group 1: `'Crawford Market'` (ID: `6ad5a8d5df48de79fa2abcb7`, type: `market`, inviteCode: `CRAWFORD`, 8 merchant members).
  - Group 2: `'Supplier Circle'` (ID: `6ad5a8d5df48de79fa2abcc4`, type: `supply_chain`, inviteCode: `SUPPLIER`, 3 members: Wholesale_A [owner], Supplier_C [admin], Logistics_E [member]).
- [x] **1.3 Default Password Integrity**
  - Default password for all seeded merchants: `CreditFlow@123` hashed with bcrypt (salt rounds: 12).
- [x] **1.4 Staggered Debt Due Dates**
  - Crawford Market: 9 debts with varied maturities:
    - Overdue: `Retailer_B -> Wholesale_A` (-5 days), `Wholesale_A -> Vendor_D` (-8 days), `Logistics_E -> Supplier_C` (-3 days).
    - Due in 2 days: `Vendor_D -> Retailer_B` (+2 days), `Supplier_C -> Wholesale_A` (+2 days).
    - Future: `Supplier_C -> Logistics_E` (+14 days), `Stall_G -> Farmer_F` (+7 days), `Buyer_H -> Stall_G` (+10 days), `Farmer_F -> Buyer_H` (+21 days).
  - Supplier Circle: 3 debts:
    - Due in 2 days: `Supplier_C -> Wholesale_A` (₹12,000, +2 days).
    - Overdue: `Logistics_E -> Supplier_C` (₹8,000, -4 days).
    - Future: `Wholesale_A -> Logistics_E` (₹6,000, +15 days).
- [x] **1.5 PaymentEvents Matching `seed_data.json` Risk Histories**
  - Vendor_D: 6 monthly PaymentEvents (months -6 to -1) with pattern `[late, late, ontime, ontime, late, ontime]`.
  - Supplier_C: 3 monthly PaymentEvents (months -3 to -1) with pattern `[default, late, late]`. The default event is seeded with `delayDays: 75` (>60 days threshold recognized as default by risk engine).
  - Wholesale_A: 12 monthly on-time PaymentEvents (months -12 to -1, `delayDays: 0`).
- [x] **1.6 Initial AuditLog Entries**
  - 12 initial immutable audit records seeded for all debt initializations with timestamps matching debt creation dates.

---

## 2. Mock Domain Delegation & Configuration

- [x] **2.1 Mock Domain Pruning**
  - `client/src/api/index.ts`: Default `rawMockDomains` changed from `'all'` to `'risk,settlement,graph,notifications'`.
  - `groups`, `debts`, `audit`, and `auth` are permanently removed from mock domains and hit the real backend at `http://localhost:4000/api`.
- [x] **2.2 Environment Documentation**
  - Created `client/.env.example` documenting `VITE_API_BASE_URL=http://localhost:4000/api`, `VITE_WS_URL=http://localhost:4000`, and `VITE_MOCK_DOMAINS=risk,settlement,graph,notifications`.
- [x] **2.3 Client Code Clean-up**
  - `client/src/pages/Groups.tsx` refactored from direct `groupsMock` imports to the unified gateway `api.groups.*`.

---

## 3. End-to-End Walkthrough on Live Backend

All steps executed against the live Express server (`http://localhost:4000/api`):

| Step | Action | Endpoint & Payload | Response & Validation | Result |
|---|---|---|---|:---:|
| **1** | Register User 1 | `POST /api/auth/register`<br>`{ name: "Alice Wholesaler", email: "alice@test.com", password: "CreditFlow@123" }` | HTTP 201 Created. Returns JWT `accessToken`, `refreshToken`, and merchant profile `{ id, name, email }`. | ✅ PASS |
| **2** | Register User 2 | `POST /api/auth/register`<br>`{ name: "Bob Retailer", email: "bob@test.com", password: "CreditFlow@123" }` | HTTP 201 Created. Returns distinct JWT tokens and merchant profile. | ✅ PASS |
| **3** | Create Group | `POST /api/groups`<br>Auth: Alice<br>`{ name: "Apex Trade Circle", type: "market" }` | HTTP 201 Created. Alice automatically assigned `role: "owner"`. Generates unique uppercase 8-char invite code. | ✅ PASS |
| **4** | Join Group | `POST /api/groups/join`<br>Auth: Bob<br>`{ inviteCode: "<code-from-step-3>" }` | HTTP 200 OK. Returns membership record for Bob with `role: "member"`. Idempotent on replay. | ✅ PASS |
| **5** | Add Debt | `POST /api/debts`<br>Auth: Alice, Header: `X-Group-Id`<br>`{ debtorId: Bob, creditorId: Alice, amount: 10000, dueDate: "+2 days", note: "Advance for dry fruits" }` | HTTP 201 Created. Stamped with `groupId`, `createdBy: Alice`, `confirmedBy: null`, `status: "pending"`, and `version: 0`. | ✅ PASS |
| **6** | Counterparty Confirms | `POST /api/debts/:id/confirm`<br>Auth: Bob, Header: `X-Group-Id` | HTTP 200 OK. Validates Bob is the counterparty debtor. Status transitions from `pending` -> `active`, `confirmedBy: Bob`. Alice self-confirmation attempt correctly rejected with 403 `FORBIDDEN_GROUP`. | ✅ PASS |
| **7** | Partial Payment | `POST /api/debts/:id/payments`<br>Auth: Bob, Header: `X-Group-Id`<br>`{ amount: 3000, expectedVersion: 0, note: "First installment payment" }` | HTTP 200 OK. Decrements debt amount from ₹10,000 -> ₹7,000, increments CAS version to 1. Creates `Payment` record and logs `PaymentEvent`. Status remains `active`. | ✅ PASS |
| **8** | View Timeline | `GET /api/debts/:id`<br>Auth: Bob, Header: `X-Group-Id` | HTTP 200 OK. Returns debt object, populated counterparties, payment history timeline (`payments: [1]`), and merged immutable audit log (`audit: [3]`). | ✅ PASS |
| **9** | Activity Feed & Pagination | `GET /api/audit?page=1&limit=5`<br>Auth: Bob, Header: `X-Group-Id` | HTTP 200 OK. Returns paginated audit trail: `count: 3`, `total: 3`, `page: 1`, `totalPages: 1`, `audit: [...]`. | ✅ PASS |

---

## 4. Tenancy & Cross-Group Isolation Checks

- [x] **4.1 Cross-Group Access (403 Enforcement)**
  - Bob attempts to access debts belonging to `Supplier Circle` (`X-Group-Id: 6ad5a8d5df48de79fa2abcc4`) where he is not a member.
  - Server returns HTTP 403 `{ success: false, code: "FORBIDDEN_GROUP", message: "You are not a member of this group." }`.
- [x] **4.2 UI 403 Interception & Redirection**
  - In `client/src/api/client.ts`, an Axios response interceptor catches all 403 responses and emits `creditflow:forbidden-group`.
  - In `client/src/App.tsx`, `<ForbiddenGroupHandler />` listens to this event, triggers a red error toast (`toast.error(...)`), and redirects the browser to `/groups`.
- [x] **4.3 Ledger Member-Only Debt Visibility**
  - Regular member calls `GET /api/debts?scope=all`. Server immediately returns 403 `FORBIDDEN_GROUP` ("Members may only query scope=mine.").
  - Regular member calls `GET /api/debts?scope=mine`. Query is restricted to `$or: [{ debtorId: user }, { creditorId: user }]`. Member only sees their own transactions and never sees bilateral debts between other members.
- [x] **4.4 Audit Log Member-Only Activity Visibility**
  - In `apps/server/src/controllers/audit.controller.ts`, when `role === 'member'`, query filters by `$or: [{ actorId: user }, { entityType: 'Debt', entityId: { $in: userDebtIds } }]`.
  - Regular members never see proposals, payments, or actions for transactions in which they are not a participant.

---

## 5. Automated Test Suites & Build Verification

- [x] **5.1 Full Backend Jest Test Suite**
  - Command: `npm test` in `apps/server`.
  - Result: **13/13 suites passed (102/102 tests)** in 66.01s.
  - Includes new tests in `tests/groups.test.ts` for `GET /api/groups/:id`, `POST /api/groups/:id/invite`, and cross-group 403 checks.
- [x] **5.2 TypeScript Strict Client Build**
  - Command: `npm --prefix client run build` (`tsc -b && vite build`).
  - Result: **Clean build, 0 type errors, 0 lint errors**, bundles generated in `dist/`.

---

## 6. Acceptance Sign-Off

- [x] Manual checklist fully ticked on real API.
- [x] No mock data used for `auth`, `groups`, `debts`, or `audit`.
- [x] All tenancy boundaries and cross-group isolation rules verified.
- [x] Zero regressions across existing algorithms (Warshall, DFS cycle netting, greedy heap settlement, Poisson risk).
