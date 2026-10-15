# CreditFlow v2 — Features File

Legend — **Priority:** M = Must (do first), S = Should, C = Could (stretch) · **Owner:** CH = Chetan, KR = Krrish, PA = Parth · **Phase** refers to IMPLEMENTATION_PLAN.md §6.
Underlying mechanisms (Warshall, DFS cycle netting, greedy heap, Poisson, JWT, Socket.io, CAS, AIMD) are unchanged; features below extend or wrap them.

---

## A. Required by the team (the 3 asks)

| ID | Feature | Owner | Pri | Phase |
|----|---------|-------|-----|-------|
| R1 | Groups: users/merchants belong to groups; every record is group-scoped; user sees only their groups | CH + PA | M | 1 |
| R1a | Role-based visibility: admin sees whole group, member sees only own debts / ego-network | CH + PA | M | 1 |
| R2 | Redesigned graph (layouts, curved weighted edges, clustering, legend) | PA | M | 1–2 |
| R2a | Click an edge or table row → transaction detail page (`/ledger/:id`) | PA + CH | M | 2 |
| R3 | New tabs / flexible IA (Overview, Network, Ledger, Transaction, Settle, Risk Radar, Groups, Inbox, Activity) | PA | M | 1 |
| R4 | Features file + implementation plan (this document set) | all | M | 0 |

---

## B. Backend features (Node / Express / MongoDB / Socket.io) — Chetan

### Core
| ID | Feature | Subject | Pri |
|----|---------|---------|-----|
| BE-01 | `Group` + `Membership` models, invite code, join/leave, role change | DBMS | M |
| BE-02 | `requireGroup` middleware (`X-Group-Id`), 403 `FORBIDDEN_GROUP` | DBMS, SE | M |
| BE-03 | Scope all queries (`debts`, `merchants`, `settlement`, `risk`) by `groupId` | DBMS | M |
| BE-04 | Fix `confirmSettlement` to settle **only the batch's debts** | OS, DBMS | M |
| BE-05 | Real optimistic locking helper (`casUpdate`, `withRetry`, jittered backoff) | OS | M |
| BE-06 | Settlement state machine `pending → executing → confirmed/failed` (idempotent, 409 on repeat/stale) | OS | M |
| BE-07 | Fix risk enum mismatch (`CRITICAL` vs `VERY_HIGH`) | — | M |
| BE-08 | Socket JWT handshake, auto-join `group:<id>` / `merchant:<id>` rooms, replace global `io.emit` | CCN | M |
| BE-09 | AIMD throttler: windowSize 10, +1 on ack, ÷2 on timeout, cap 50, `batch:update` | CCN | M |
| BE-10 | Payment ledger (`Payment`) + `POST /debts/:id/payments` (partial payments) + `GET /debts/:id` detail | DBMS | M |
| BE-11 | `dueDate`, `note` on debts; `PaymentEvent` collection (wasLate, delayDays) | DBMS | M |
| BE-12 | Risk uses real `PaymentEvent` history; group-scoped portfolio | SMCS | M |
| BE-13 | Cross-tenant isolation tests + race-condition tests | SE, OS | M |

### Workflow & trust
| ID | Feature | Subject | Pri |
|----|---------|---------|-----|
| BE-20 | Debt request/approval: `pending → active` after counterparty confirms; reject; dispute | SE | S |
| BE-21 | Audit log for every mutation + `GET /audit` | DBMS | S |
| BE-22 | Notifications (new request, approved, due soon, overdue, settlement ready, risk flagged) + read/unread | SE | S |
| BE-23 | Due-date cron: mark overdue, notify, write payment events | OS (scheduling) | S |
| BE-24 | Member-private settlement view (only my transactions in a batch) | DBMS | S |
| BE-25 | Idempotency key on `POST /debts` and `/payments` (prevent double-submit) | OS | S |

### Quality & ops
| ID | Feature | Pri |
|----|---------|-----|
| BE-30 | Pagination, sorting, filtering on list endpoints | S |
| BE-31 | CSV export / admin-only CSV import (zod validated) | S |
| BE-32 | Profile update, change password, refresh-token rotation, session list | S |
| BE-33 | Env-driven CORS/socket origins; extend `.env.example` | M |
| BE-34 | Python bridge: timeout + single retry + typed wrappers for new engine endpoints | M |
| BE-35 | Rate limiting beyond auth (per-user token bucket on mutations) | C |
| BE-36 | Health endpoint reporting DB + Python engine status | S |
| BE-37 | Seed script: 2 groups, shared merchant, cycles, high-risk merchant, overdue debts, payment history | M |
| BE-38 | PDF settlement statement per batch | C |
| BE-39 | Webhook/email stub for reminders | C |

---

## C. Algorithms & analytics features (Python / FastAPI) — Krrish

| ID | Feature | Subject | Pri |
|----|---------|---------|-----|
| AL-01 | Stateless engine endpoints (no global graph in Node-used routes) | DC | M |
| AL-02 | **Exact min-transaction solver** (backtracking, ≤12 nonzero balances) + greedy-vs-exact gap | DAA | M |
| AL-03 | `settlement/optimize`: detect cycles → net all → greedy → savings report | DSGT, DAA | M |
| AL-04 | `settlement/net-all` (loop until acyclic) + ordered cycles with netted amount | DSGT | M |
| AL-05 | **Tarjan SCC** (`/graph/scc`) – cycle groups for clustering the graph | DSGT, DS | S |
| AL-06 | **Default-contagion simulator** (who loses how much if X defaults; 1st & 2nd order) | DSGT, SMCS | S |
| AL-07 | **One-proportion z-test** vs network baseline (`z_score`, `p_value`) | SMCS | M |
| AL-08 | **Pearson correlation** (delay vs amount, frequency vs late-rate) | SMCS | S |
| AL-09 | Composite risk score 0.4·λ + 0.4·(1−p) + 0.2·delay; label alias; additive response fields | SMCS | M |
| AL-10 | Shortest/most-indebted path between two merchants (BFS/Dijkstra) for "how exposed am I to X" | DSGT, DAA | C |
| AL-11 | Weighted centrality (in/out exposure, PageRank-style) to rank "systemically important" merchants | DSGT | C |
| AL-12 | Benchmarks: exact vs greedy, SCC vs Warshall, updated plots | DAA | S |
| AL-13 | Hand-computed unit tests for every new function | SE | M |
| AL-14 | Updated academic report (complexities, optimality gap, model assumptions) | — | M |

---

## D. Frontend features (React / TypeScript) — Parth

### Structure & data
| ID | Feature | Pri |
|----|---------|-----|
| FE-01 | New routes/tabs: Overview, Network, Ledger, Transaction, Settle, Risk Radar, Groups, Inbox, Activity, Settings | M |
| FE-02 | React Query data layer + mock adapter (`VITE_USE_MOCK`) on frozen contract | M |
| FE-03 | `AuthProvider` + `GroupProvider`, group switcher in sidebar, `X-Group-Id` interceptor, refresh flow | M |
| FE-04 | Real user data in sidebar/profile (remove hardcoded names) | M |
| FE-05 | Socket hook: auth handshake, `batch:update`, ack replies, query invalidation, toasts | M |
| FE-06 | Role-aware UI (admin vs member views and controls) | M |

### Network graph
| ID | Feature | Pri |
|----|---------|-----|
| FE-10 | Curved, weight-scaled directional edges; node size = exposure; risk ring | M |
| FE-11 | **Edge click → transaction drawer / page; node click → merchant drawer** | M |
| FE-12 | Layout toggle: force / radial-by-exposure / cluster-by-SCC | S |
| FE-13 | Filters: min amount, risk, status, overdue; search-to-focus | S |
| FE-14 | Cycle highlighting + "Net this cycle" button | S |
| FE-15 | Contagion overlay (select merchant → affected nodes shaded by loss) | S |
| FE-16 | Ego-network (double-click focus), minimap, legend, pin on drag | C |
| FE-17 | Animated flow particles on hover/settlement preview | C |
| FE-18 | Fix underscore replacement bug (`/_/g`), larger edge hit areas | M |

### Pages
| ID | Feature | Pri |
|----|---------|-----|
| FE-20 | **Transaction page**: parties, original/remaining, due date, status, payment timeline, record payment, dispute, settle | M |
| FE-21 | Ledger: tabs (Active/Pending/Overdue/Settled), sort, filter, pagination, CSV export, row → transaction | M |
| FE-22 | Add-debt modal (merchant search, amount, due date, note) + approval states | M |
| FE-23 | Settle center: before/after, greedy vs exact, cycle pre-netting, what-if, confirm with 409 handling | M |
| FE-24 | Risk Radar: score table, λ chart, z-test p-value, Pearson scatter, contagion simulator | S |
| FE-25 | Groups page: create/join by code, members, roles, rotate invite | M |
| FE-26 | Inbox: notifications + pending debt requests to approve/reject | S |
| FE-27 | Activity feed (audit log) with deep links | S |
| FE-28 | Overview: due-soon list, overdue alert, exposure donut, activity snippet | S |
| FE-29 | Global command palette (Ctrl+K) for merchants/debts/pages | C |
| FE-30 | Settlement PDF/print view | C |

### Polish
| ID | Feature | Pri |
|----|---------|-----|
| FE-40 | Skeleton loaders, empty states, error boundaries, toasts | M |
| FE-41 | Risk categories: add UNKNOWN, fix colours/labels | M |
| FE-42 | Working Settings (theme, password, sessions) | S |
| FE-43 | Responsive sidebar (hamburger ≤768px), accessibility pass | S |
| FE-44 | Design tokens kept in `index.css` so later UI re-skin is cheap | M |
| FE-45 | Wire "Add Debt" and "Cancel Loop" dead buttons | M |

---

## E. Cross-cutting

| ID | Feature | Owner | Pri |
|----|---------|-------|-----|
| X-01 | Frozen API + socket contract in `API_DOCS.md` and `client/src/types/index.ts` | all | M |
| X-02 | Conventional commits, small PRs for algorithms/concurrency/realtime (repo Rule 10) | all | M |
| X-03 | CI (GitHub Actions): Jest, Pytest, client build in parallel | CH | S |
| X-04 | Docker Compose for client + server + engine + Mongo | CH | S |
| X-05 | Module summaries saved under `docs/report-assets/` after each module (Rule 7) | each | M |
| X-06 | Demo dataset + scripted demo (two browsers, race, contagion) | all | M |

---

## F. Unique / differentiating features (viva talking points)

1. **Group-scoped multi-tenancy with role-based ego-network graph** — same engine, isolated data.
2. **Greedy vs exact settlement with a visible optimality gap** (AL-02).
3. **Cycle pre-netting pipeline with savings report** — cash-free cancellation (AL-03/04).
4. **Default-contagion simulator** built from Warshall reachability + exposure (AL-06).
5. **Idempotent settlement state machine + CAS** — "two people settle at once" answered correctly (BE-05/06).
6. **AIMD-throttled realtime batches** per connection (BE-09).
7. **Debt approval workflow + audit trail** — trust layer for informal credit (BE-20/21).
8. **Statistical risk with quantified confidence** — z-test p-values, Pearson, Poisson (AL-07..09).
9. **Click-through ledger** — graph ⇄ transaction ⇄ inbox deep links (R2a).

---

## G. Recommended build order (summary)

1. Phase 0 (all): freeze contract.
2. Phase 1 parallel: BE-01..04, 07, 13 · AL-01..04, 07 · FE-01..04, 10, 18.
3. Phase 2 parallel: BE-05, 06, 08..12 · AL-05, 06, 08, 09 · FE-11, 20..23, 25.
4. Phase 3 sequential integration: auth/groups → debts/payments → settlement → risk → sockets.
5. Phase 4: S-priority items, hardening, benchmarks, docs.
6. Phase 5: C-priority items only if time remains.
