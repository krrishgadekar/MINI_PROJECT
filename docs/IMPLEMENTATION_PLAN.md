# CreditFlow v2 — Implementation Plan (Krrish · Chetan · Parth)

Builds on the existing repo (FastAPI engine + Express/Mongo gateway + React client) and the v1 Engineering Blueprint.
**Rule: the underlying mechanisms stay the same** — Warshall closure, DFS cycle netting, greedy heap settlement, Poisson risk, JWT, Socket.io, optimistic locking, AIMD throttling. Everything below *wraps, scopes, or extends* them.

Assumed roles (matches your code comments): **Chetan** = Node/Express/MongoDB/Socket.io · **Krrish** = Python algorithms & statistics · **Parth** = React frontend.

---

## 1. What we found in the current code (fix these first)

| # | Finding | Where | Impact |
|---|---------|-------|--------|
| B1 | **No tenancy.** `getAllDebts`, `buildGraphPayload`, `getAllMerchants`, `scorePortfolio` read *every* document. | `debts/settlement/merchants/risk.controller.ts` | Any user sees everyone's data — this is requirement #1. |
| B2 | `confirmSettlement` runs `Debt.updateMany({status:'active'})` — settles **all** debts in the DB, not the batch's. | `settlement.controller.ts` | Cross-user data corruption. |
| B3 | Socket events are `io.emit(...)` to **everyone**; `join:merchant` is unauthenticated. | `realtime/socket.ts` + controllers | Data leak over websockets. |
| B4 | Risk enum mismatch: Python returns `CRITICAL`, `Merchant.riskProfile.riskCategory` enum has `VERY_HIGH` → `merchant.save()` throws on a critical merchant. Tests mock only `MEDIUM`, so it is hidden. | `Merchant.ts`, `risk_engine.py` | Runtime 500. |
| B5 | `versionKey:'version'` does **not** give optimistic locking for scalar fields (Mongoose only guards array edits). Blueprint §12 CAS isn't actually implemented. | `Debt.ts` | Double-settle race possible. |
| B6 | `scorePortfolio` / `scoreMerchant` use empty history (cold start for all); no `PaymentEvent` collection from blueprint §7.4. | `risk.controller.ts` | Risk scores are all 5% prior. |
| B7 | `net-cycle` in Node applies `amount_netted` per edge but `Debt` is looked up with `findOne` (ignores duplicates between same pair). | `settlement.controller.ts` | Incorrect netting if two debts exist for a pair. |
| B8 | Python `/graph/build` keeps a **global** in-memory graph. | `graph_router.py` | Shared state across users; keep Python stateless. |
| F1 | Whole frontend runs on `seedData.ts` mock data; API client exists but pages don't use it. | `client/src/pages/*` | Nothing is live. |
| F2 | Sidebar shows hardcoded "Parth Goggi". Login stores user but nothing reads it. | `Sidebar.tsx`, `Profile.tsx` | Not per-user. |
| F3 | Debts "Add Debt" button does nothing; Settlement "Cancel Loop" does nothing. | `Debts.tsx`, `Settlement.tsx` | Dead UI. |
| F4 | Graph labels `replace("_"," ")` only first underscore; edges aren't clickable; Risk page shows 4 categories while backend has 5. | `GraphVisualizer.tsx` | Requirement #2. |
| D1 | `Debt` has no `dueDate`, `groupId`, `note`; blueprint specified `dueDate`. | `Debt.ts` | Needed for aging/risk. |

---

## 2. Target design

### 2.1 Tenancy model — "Groups" (requirement #1)

A **Group** is a trade circle (e.g. "Crawford Market Wholesalers", "Family credit", "Supplier chain Q4"). Every debt, settlement, audit entry and socket room belongs to exactly one group. A user sees **only groups they are a member of**, and inside a group sees data according to role:

| Role | Sees in group | Can do |
|------|---------------|--------|
| `owner` / `admin` | Whole group graph, all debts | Add/remove members, compute & confirm settlement, net cycles |
| `member` | **Ego-network only**: debts where they are debtor or creditor + the counterparties | Create debt requests, record payments, view own settlement lines |

```
Merchant (account) ──< Membership >── Group
                                       │
                 Debt, Settlement, Payment, AuditLog, Notification  (all carry groupId)
```

The active group is chosen in the UI (group switcher) and sent as header `X-Group-Id`. One middleware (`requireGroup`) validates membership and attaches `req.group` + `req.role`; **no controller touches Mongo without `groupId` in the filter.**

### 2.2 Click-through transactions (requirement #2)

* Node click → **Merchant drawer** (their debts in/out, risk, BFS reachable) with "Open ledger" link.
* Edge click → **Debt detail page** `/debts/:id` = the transaction: parties, original/remaining amount, due date, status, payment timeline (every partial payment / netting / settlement entry), actions (record payment, dispute, settle).
* Debt table rows, settlement transaction rows, risk rows and notifications all deep-link to the same page. One URL per transaction.

### 2.3 New data model (additive — no field renamed, per Rule 5)

```ts
// NEW
Group        { name, type: 'market'|'supply_chain'|'friends'|'other', ownerId, inviteCode, createdAt }
Membership   { groupId, merchantId, role: 'owner'|'admin'|'member', joinedAt }   // unique (groupId, merchantId)
Payment      { groupId, debtId, amount, kind: 'partial'|'settlement'|'netting', recordedBy, note, createdAt }   // transaction ledger
PaymentEvent { groupId, merchantId, debtId, dueDate, paidDate, wasLate, delayDays }                            // blueprint §7.4, feeds risk
AuditLog     { groupId, actorId, action, entityType, entityId, meta, createdAt }
Notification { groupId, merchantId, type, message, refType, refId, readAt, createdAt }

// EXTENDED (new optional fields only)
Debt        += { groupId, dueDate, note, status: + 'pending' | 'disputed', confirmedBy?, version (explicit CAS counter) }
Settlement  += { groupId, debtSnapshot: [{ debtId, version, amount }], status: + 'executing' | 'failed' }
RiskAssessment += { groupId, zScore, pValue, correlation }
Merchant.riskProfile.riskCategory enum -> LOW|MEDIUM|HIGH|CRITICAL|UNKNOWN   (fixes B4; keep VERY_HIGH as legacy alias)
```

Indexes: `{groupId:1,status:1}`, `{groupId:1,debtorId:1}`, `{groupId:1,creditorId:1}`, `{groupId:1,dueDate:1}`, `Membership {groupId:1,merchantId:1} unique`, `PaymentEvent {merchantId:1,dueDate:-1}`.

---

## 3. Backend changes (Chetan)

### Major
1. **Groups & membership module** — `models/Group.ts`, `models/Membership.ts`, `controllers/groups.controller.ts`, `routes/groups.routes.ts`, `middleware/group.middleware.ts`.
   * `POST /api/groups`, `GET /api/groups` (mine), `POST /api/groups/join` (invite code), `GET /api/groups/:id/members`, `PATCH /api/groups/:id/members/:mid` (role), `DELETE …` (leave/remove), `POST /api/groups/:id/invite-code/rotate`.
2. **Scope every controller by group** (fixes B1, B2, B7).
   * `buildGraphPayload(groupId)` → merchants = group members only; debts = `{groupId, status:'active'}`.
   * `getAllDebts`: admin → all in group; member → `$or:[{debtorId:me},{creditorId:me}]`.
   * `getAllMerchants` → members of group only.
3. **Real optimistic locking** (fixes B5) — `concurrency/optimisticLock.ts`:
   ```ts
   export async function casUpdate(model, id, expectedVersion, set) {
     const r = await model.updateOne({ _id:id, version:expectedVersion }, { $set:set, $inc:{version:1} });
     if (r.matchedCount === 0) throw new ConcurrentModificationError();
   }
   export const withRetry = (fn, max=3) => /* jittered backoff 50–200ms * attempt */;
   ```
   Used by `updateDebt`, `recordPayment`, `netCycle`, `confirmSettlement`.
4. **Settlement lifecycle fix** (fixes B2):
   * `computeSettlement` stores `debtSnapshot` (id + version + amount).
   * `confirmSettlement`: atomically move batch `pending → executing` (`findOneAndUpdate` on status → idempotent, second caller gets 409), then CAS each debt in the snapshot → `settled`; write `Payment(kind:'settlement')`; if any CAS fails → batch `failed`, return 409 with "graph changed, recompute".
5. **Debt request/approval flow** — new debts start `pending`; creditor (or debtor if creditor created) confirms → `active`. Prevents one user inventing debt against another inside a group. `POST /debts/:id/confirm`, `/reject`, `/dispute`.
6. **Payment ledger (the "transaction")** — `POST /api/debts/:id/payments` (partial payment, CAS on debt, creates `Payment` + `PaymentEvent`, auto-`settled` at 0). `GET /api/debts/:id` returns debt + payments + audit entries.
7. **Realtime hardening** (fixes B3) — socket handshake verifies JWT (`io.use`), server auto-joins rooms `group:<id>` for each membership and `merchant:<id>`; controllers call `emitToGroup(groupId, event, payload)` instead of `io.emit`. Member-private events go to `merchant:<id>`.
8. **AIMD throttler** (blueprint §13) — `realtime/throttler.ts`: per-socket `windowSize` (start 10, +1 on ack, ÷2 on timeout, cap 50), 200 ms flush tick, `batch:update` event, `presence:ping/ack`.
9. **Risk with real history** (fixes B4, B6) — `risk.controller` builds history from `PaymentEvent` grouped by month (`{late, default}`), group-scoped portfolio; recompute endpoint; emit `risk:flagged` to group when category ≥ HIGH.
10. **Python bridge additions** — `callExactSettlement`, `callContagion`, `callSccGroups`, `callPearson`, `callZTest` (Krrish's new endpoints, §4). Add timeout + one retry; keep 503 mapping.

### Minor
* `GET /api/auth/me` returns groups + roles; `PATCH /api/auth/me` (name/phone/businessName); `POST /api/auth/change-password`; refresh token rotation.
* `AuditLog` writer helper `audit(req, action, entity, meta)` called from every mutating controller.
* Notifications: create on debt request, confirm, due-in-3-days, overdue, settlement ready, risk flagged; `GET /api/notifications`, `PATCH /:id/read`, `POST /read-all`.
* Due-date scheduler (`node-cron`, hourly): flag overdue, create notifications, write `PaymentEvent`.
* `GET /api/debts/export.csv`, `POST /api/debts/import` (CSV, admin only, validated with zod).
* Pagination + sorting (`?page&limit&sort`) on debts, audit, notifications.
* Extend `.env.example`: `CLIENT_ORIGINS`, `CRON_ENABLED`, `INVITE_CODE_LENGTH`. Move CORS origins from hardcoded to env (also in socket.ts).
* Seed: 2 groups (market cluster with cycles + one "supply chain"), 1 merchant belonging to both, one deliberately high-risk merchant, payment history for risk, due dates incl. overdue.
* Update `API_DOCS.md` and Jest tests: **cross-tenant isolation tests** (user in Group B gets 403/empty for Group A data), race test (two parallel confirms → exactly one wins), AIMD throttler tests with fake timers.

---

## 4. Algorithm / analytics changes (Krrish) — same mechanisms, more depth

| Item | Change | Subject |
|------|--------|---------|
| K1 | Make Python **fully stateless**: remove global `_graph_store` use from anything the Node layer calls (B8). Keep `/graph/*` for demo only. | DC / SE |
| K2 | **Exact minimum-transaction solver** (DFS/backtracking over net balances, cap ≤12 nonzero balances) → `POST /settlement/exact`; response includes greedy vs exact counts and the optimality gap. | DAA |
| K3 | **Settlement "with cycle pre-netting" mode**: `POST /settlement/optimize` = detect cycles → net all → greedy → returns `{before_edges, after_netting_edges, txns, savings}`. | DSGT, DAA |
| K4 | **Strongly Connected Components (Tarjan, O(V+E))** — `POST /graph/scc`: groups of mutually-indebted merchants; faster cycle-group listing and used to size netting. Warshall stays as the reachability source. | DSGT, DS |
| K5 | **Default-contagion simulator** — `POST /risk/contagion {merchant}`: using adjacency + Warshall closure, computes who loses how much if X defaults (BFS levels, loss = Σ edges into X, then second-order exposure). Returns per-merchant loss and total network loss. | DSGT, SMCS |
| K6 | **Cycle detection returns ordered cycles + amount netted per cycle + savings**, and a `net-all` endpoint that loops until no cycle remains. | DAA |
| K7 | **Pearson correlation** `POST /risk/correlation` over (avg delay, avg amount) and (frequency, late-rate) with `scipy.stats.pearsonr`. | SMCS |
| K8 | **One-proportion z-test** `POST /risk/ztest` vs network baseline; composite `risk_score = 0.4·norm(λ)+0.4·(1−p)+0.2·norm(delay)` (blueprint §11.4). Existing `/risk/score` response shape stays; new fields are additive (`z_score`, `p_value`). | SMCS |
| K9 | Fix category naming: keep `CRITICAL`, expose `risk_label` alias. | — |
| K10 | **Benchmarks** add exact-vs-greedy and SCC-vs-Warshall plots; update `krrish_academic_report.md`. | DAA |
| K11 | Unit tests with **hand-computed** expected values for z-test, Pearson, contagion, exact solver; extend `tests/test_api_*`. | SE |

---

## 5. Frontend changes (Parth)

### 5.1 New information architecture (flexible; names can change later)

| Tab | Route | Purpose |
|-----|-------|---------|
| **Overview** | `/` | Stat cards + mini graph + due-soon + activity |
| **Network** (new) | `/network` | Full-screen redesigned graph (§5.3) |
| **Ledger** (was Debts) | `/ledger` | Table, filters, tabs: Active / Pending / Overdue / Settled |
| **Transaction** (new) | `/ledger/:debtId` | Click-through detail + payment timeline |
| **Settle** | `/settle` | Greedy vs exact, cycle pre-netting, what-if, confirm |
| **Risk Radar** | `/risk` | Scores, z-test, correlation, contagion simulator |
| **Groups** (new) | `/groups` | Switch, create, join by code, members, roles |
| **Inbox** (new) | `/inbox` | Notifications, debt requests to approve |
| **Activity** (new) | `/activity` | Audit feed for the group |
| **Settings / Profile** | `/settings`, `/profile` | Real user data, password, sessions |

Global: **group switcher** in sidebar header, notification bell with live count, command-palette search (Ctrl+K) across merchants/debts.

### 5.2 Major changes
1. **Replace mock data with the real API** (F1): add React Query (`@tanstack/react-query`) hooks `useDebts`, `useGroup`, `useSettlement`, `useRisk`; delete `seedData.ts` usage from pages (keep only for storybook/offline demo behind `VITE_USE_MOCK`).
2. **Auth context + group context** (`state/AuthProvider`, `state/GroupProvider`): sets `X-Group-Id` in the axios interceptor, handles refresh-token flow, redirects to `/groups` if user has no group (F2).
3. **Socket client** (`hooks/useSocket`): authenticated handshake, listens to `batch:update`, `debt:*`, `settlement:*`, `risk:*`; invalidates React Query keys; answers `presence:ping` with `presence:ack`; shows toasts.
4. **Transaction detail page** + deep links from every table/graph/notification.
5. **Role-aware UI**: members see ego-network graph and own lines; admin sees full graph and settlement controls.
6. **Settlement Center rebuild**: before/after cards, greedy vs exact count, cycle list with working **Net this cycle** and **Net all**, per-batch confirm with 409-conflict handling ("graph changed — recompute").
7. **Risk Radar**: z-test p-value, Pearson scatter, λ chart per merchant, **contagion simulator** (select merchant → highlight affected nodes in the graph).

### 5.3 Graph redesign (requirement #2)
* Layouts: force (default), **radial by exposure**, **cluster by SCC** (cycle groups share a halo). Toggle in toolbar.
* Nodes: size = exposure, ring = risk colour, avatar initials, label handles all underscores (`/_/g`), "you" node highlighted.
* Edges: curved, **width ∝ amount**, directional arrows + animated particles on hover, colour by status (active/overdue/disputed), cycle edges in accent colour with dash.
* Interactions: **click edge → open transaction** (`/ledger/:id` in side drawer, "open full page" link); click node → merchant drawer; double-click → focus ego-network; drag to pin; mouse-wheel zoom; minimap; search-to-focus; filters (min amount, risk ≥, status, overdue only).
* Hit-testing for canvas edges via `linkPointerAreaPaint` (react-force-graph) so thin edges are still clickable.
* Legend + "Highlight cycles" button + "Show contagion for X".
* Keep client-side BFS/DFS in `graph/traversal.ts` exactly as is (Parth's viva deliverable) — now also used for ego-network and "who can be affected".

### 5.4 Minor changes
* Wire "Add Debt" modal (searchable merchant select, amount, due date, note) and "Cancel Loop" button (F3).
* Fix `replace("_"," ")` → `replace(/_/g," ")` everywhere.
* Risk categories: add `UNKNOWN`; fix pie/bars colours; "NO DATA" state.
* Skeleton loaders, empty states, error boundaries, toast system.
* Sidebar user block from auth context; remove hardcoded name.
* Table: column filters, pagination, row click → transaction, CSV export button.
* Settings: working dark/light, change password form, session list.
* Footer links updated; privacy page route reachable from footer.
* Accessibility pass (focus rings, aria-labels on icon buttons), responsive sidebar (hamburger on ≤768px — CSS already prepared).
* Keep design tokens in `index.css`; new components consume tokens so the UI re-skin later is cheap.

---

## 6. Order of work — parallel vs sequential

```
Phase 0  (sequential, all 3, 1 day)   Contract freeze
           └─ schemas (§2.3), API contract (§7), event contract, error codes

Phase 1  (PARALLEL, ~1 week)
  Chetan: tenancy core ─────────────► groups/membership, requireGroup, scope all controllers, B4 fix, tests
  Krrish: engine upgrades ──────────► stateless, exact solver, optimize, SCC, Pearson, z-test, contagion
  Parth : FE foundation (mock adapter, same contract) ► auth+group context, new IA/routes, graph redesign on mock data

Phase 2  (PARALLEL, ~1 week)
  Chetan: CAS + settlement lifecycle + payments/ledger + debt approval + audit + realtime rooms/AIMD
  Krrish: Python bridge fields + risk history aggregation contract + benchmarks (hands bridge types to Chetan)
  Parth : Transaction page, Ledger, Settle center UI, Inbox, Groups page (still on mock, flip env flag when BE ready)

Phase 3  (SEQUENTIAL integration, ~3–4 days)  Chetan ↔ Parth first, then Krrish endpoints
  1 flip VITE_USE_MOCK=false → auth/groups/debts
  2 settlement + payments
  3 risk + contagion
  4 sockets + notifications

Phase 4  (PARALLEL hardening, ~4 days)  Race tests, isolation tests, load test on throttler, bug-bash crosswise
Phase 5  (joint)  Seed data, docs, report assets, demo rehearsal
```

**Why this order:** the only hard dependencies are (a) the contract (Phase 0), (b) `groupId` on every record before Parth can render real role-aware views, and (c) Krrish's new endpoints before Chetan's bridge wrappers return real data. Everything else is independent if all three code against the frozen contract; Parth uses a **mock adapter returning the same JSON shapes**, so nothing blocks.

### Dependency rules
* Chetan never merges a controller without a cross-tenant test.
* Krrish's endpoints are stateless and group-agnostic — Node passes only that group's merchants/debts.
* Parth never calls Python directly; only the Node API.
* Any contract change → PR touching `API_DOCS.md` + `client/src/types/index.ts` together, reviewed by the other two.

---

## 7. API contract additions (freeze in Phase 0)

All routes except auth/groups-list require `Authorization: Bearer` + `X-Group-Id`.

| Method & Path | Role | Notes |
|---------------|------|-------|
| `POST /groups`, `GET /groups`, `POST /groups/join`, `GET /groups/:id/members` | any / admin | |
| `GET /debts?scope=mine|all&status=&page=` | member / admin | `all` admin-only |
| `GET /debts/:id` | party/admin | debt + payments + audit |
| `POST /debts` | member | creates `pending` |
| `POST /debts/:id/confirm|reject|dispute` | counterparty | |
| `POST /debts/:id/payments` | party | CAS; `409 CONCURRENT_MODIFICATION` |
| `GET /graph?mode=full|ego` | admin / member | nodes+edges with `debtId` on each edge |
| `POST /settlement/optimize` | admin | cycles pre-netted + greedy + exact |
| `POST /settlement/net-all` | admin | |
| `POST /settlement/confirm/:batchId` | admin | idempotent; 409 if stale |
| `GET /settlement/history`, `GET /settlement/mine/:batchId` | admin / member | member sees own lines |
| `POST /risk/contagion {merchantId}` | admin | |
| `GET /risk/group`, `POST /risk/recompute` | admin | |
| `GET /notifications`, `PATCH /notifications/:id/read` | any | |
| `GET /audit?entityId=` | admin/party | |

Error shape: `{ success:false, code, message }` with codes `FORBIDDEN_GROUP`, `CONCURRENT_MODIFICATION`, `STALE_SETTLEMENT`, `VALIDATION`.

Socket events (same names + new): `debt:*`, `settlement:*`, `risk:flagged`, `cycle:netted`, `batch:update`, `presence:ping/ack`, `notification:new` (private room).

---

## 8. Step-by-step procedure per person

### Chetan
1. Add `Group`, `Membership`; extend `Debt`, `Settlement`, `RiskAssessment` (§2.3). `feat: add group tenancy models`
2. `requireGroup` middleware; apply to debts/merchants/settlement/risk routers. `feat: group-scoped access`
3. Rewrite `buildGraphPayload(groupId)`; role-based `getAllDebts`. `fix: scope graph payload`
4. Update seed.ts for groups; update existing tests to send `X-Group-Id`; add isolation tests. `test: cross-tenant isolation`
5. Fix risk enum (B4) + test with CRITICAL. `fix: risk category enum mismatch`
6. `optimisticLock.ts` + race test with mongodb-memory-server. `feat: CAS helper`
7. Settlement lifecycle rewrite (B2). `fix: batch-scoped settlement confirm`
8. Payment ledger + `GET /debts/:id`. `feat: payment ledger`
9. Debt approval flow, audit log, notifications, cron. `feat: approval, audit, notifications`
10. Socket auth + rooms + `emitToGroup`; AIMD throttler + tests. `feat: authenticated rooms and AIMD batching`
11. Bridge wrappers for Krrish's endpoints; CSV import/export; docs.

### Krrish
1. Remove state dependence in endpoints used by Node; keep `/graph/*` demo-only. `refactor: stateless engine`
2. `algorithms/exact_settlement.py` + tests (hand cases: 3-party cycle, 4-party where greedy ≠ optimal). `feat: exact solver`
3. `algorithms/scc.py` (Tarjan) + `/graph/scc`. `feat: SCC grouping`
4. `settlement/optimize` and `net-all`. `feat: pre-netting pipeline`
5. `analytics`: `correlation.py`, `hypothesis.py`, composite score; additive fields in `RiskScoreResponse`. `feat: z-test and pearson`
6. `risk/contagion` (`contagion.py`). `feat: contagion simulator`
7. Benchmarks + updated academic report with new complexity claims (SCC O(V+E), exact exponential with cap).
8. Publish `schemas.py` → hand TS types to Chetan/Parth within 24h of each endpoint.

### Parth
1. Install React Query + zustand; `AuthProvider`, `GroupProvider`, axios header interceptor. `feat: auth and group context`
2. Routes/IA from §5.1; empty pages with skeletons. `feat: new tab structure`
3. Mock adapter (`api/mock.ts`) returning final contract JSON; toggle by `VITE_USE_MOCK`.
4. Graph redesign (§5.3) with edge click-through. `feat: interactive network graph`
5. Transaction page + drawer; Ledger table; Add Debt modal. `feat: transaction detail`
6. Settle center, Risk radar, Groups, Inbox, Activity pages.
7. Socket hook + toasts; flip to real API in Phase 3.
8. Polish pass (§5.4), responsive, a11y.

---

## 9. Acceptance criteria

1. **Isolation:** user in Group B cannot read/modify anything of Group A via REST or sockets (tests for each router + socket subscription test).
2. **Member scope:** a `member` never receives a debt where they are neither debtor nor creditor.
3. **Click-through:** clicking any edge or table row lands on `/ledger/:debtId`; the page loads the same debt id.
4. **Race:** two parallel `confirm` calls → one `200`, one `409`; no debt double-decremented.
5. **Settlement:** after confirm, only the batch's debts are `settled`; other groups untouched.
6. **Algorithms:** greedy ≤ k+m−1 txns; exact ≤ greedy; netting reduces total edge weight by the min-cycle amount; SCC groups equal mutual-reachability classes from Warshall.
7. **Risk:** z-test flags a synthetic high-late merchant at p<0.05; Pearson of independent series within ±0.1; `CRITICAL` persists without error.
8. **Throttler:** window shrinks under simulated lag, grows to cap 50 when healthy.

---

## 10. Subject traceability (for the report)

| Subject | Where it shows up |
|---------|-------------------|
| DSGT (Discrete Structures & Graph Theory) | Directed weighted graph, Warshall closure, DFS cycles, **SCC**, BFS reachability, contagion |
| DAA | Greedy O(N log N), **exact backtracking** + optimality gap, Warshall O(V³), Tarjan O(V+E), benchmark plots |
| DS | Adjacency list/matrix, max-heap, queue/stack in BFS/DFS |
| SMCS | Poisson λ, **z-test**, **Pearson**, composite risk score |
| DBMS | Normalised multi-tenant schema, compound indexes, referential design, audit log |
| OS | **Optimistic locking = CAS**, critical section, idempotent batch state machine |
| CCN | **AIMD batching**, ack/timeouts, JWT-auth'd socket rooms, rate limiting |
| DC | Node↔Python service boundary, stateless services, retries/timeouts |
| SE | Conventional commits, isolation + race tests, CI, API docs |

---

## 11. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Tenancy retrofit breaks existing tests | Do Phase 1 first; update tests in the same PR |
| Exact solver explodes | Hard cap at 12 nonzero balances; fall back to greedy with a message |
| Mongo transactions need replica set | Use CAS + idempotent status machine (no multi-doc transactions required) |
| FE blocked on BE | Mock adapter on frozen contract |
| Scope creep | Features file has MUST/SHOULD/COULD; build MUST first (Rule 9) |

## 12. Demo script (2 users, 2 groups)
1. Login as Wholesale_A → sees Group "Crawford Market" full graph (admin) and "Family" group separately.
2. Login as Vendor_D in a second browser → sees only own ego-network.
3. Click an edge → transaction page; record partial payment → other tab updates live.
4. Settle Center: optimise → cycles netted, greedy 4 vs exact 3 shown.
5. Fire two confirms at once → one wins, one gets "graph changed".
6. Risk Radar → contagion for Supplier_C highlights affected nodes.
