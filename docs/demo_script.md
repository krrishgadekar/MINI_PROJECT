# CreditFlow — Live Demo Script
**Phase 5B · Branch `docs/c-p5-demo`**
**Author**: Parth Goggi · Estimated Duration: 8–10 minutes

---

## Pre-flight Checklist

Before starting the demo, complete all items:

```bash
# 1. Start the full stack (requires Docker)
docker compose up --build -d

# 2. Wait for healthy status (all four services: mongo, engine, server, client)
docker compose ps

# 3. (Optional) Fresh seed — press 'y' when prompted
npm run demo:reset

# 4. Open two browser windows side-by-side
#    Window A → http://localhost:3000  (Admin: Wholesale_A)
#    Window B → http://localhost:3000  (Member: Retailer_B)
```

> **Important:** All demo credentials share the password **`CreditFlow@123`**
>
> | User | Email | Role in Crawford Market |
> |------|-------|------------------------|
> | Wholesale_A | `wholesale_a@demo.com` | Owner / Admin |
> | Retailer_B | `retailer_b@demo.com` | Admin |
> | Supplier_C | `supplier_c@demo.com` | Member (high-risk) |
> | Logistics_E | `logistics_e@demo.com` | Member |
> | Farmer_F | `farmer_f@demo.com` | Member |

---

## Step 1 · Login & Group Isolation (0:00 – 1:00)

### Actions
| Window | Action |
|--------|--------|
| **A** | Navigate to `http://localhost:3000/login` → login as `wholesale_a@demo.com` |
| **B** | Navigate to `http://localhost:3000/login` → login as `retailer_b@demo.com` |

### What to Show
1. **Window A** lands on the **Overview** page, showing the "Crawford Market" group selected in the sidebar.
2. Open **Groups** (`/groups`) in both windows — Window A shows **two** groups (*Crawford Market* + *Supplier Circle*); Window B shows **one** (*Crawford Market* only).
3. Point out: Retailer_B cannot see Supplier Circle because they are not a member → **group isolation proven**.

### Expected Result
- Both sessions are independent; JWT tokens are user-scoped.
- Supplier Circle group card is absent in Window B.

### Fallback
If the wrong group appears, click the group switcher in the top-left and manually select "Crawford Market". If group data is stale, run `npm run demo:reset`.

### Screenshot Reference
`docs/report-assets/screens/01_login.webp` | `03_groups_admin.webp`

---

## Step 2 · Network Graph — Ego-Network vs Admin View (1:00 – 2:00)

### Actions
1. **Window A** → navigate to `/network`.
2. **Window B** → navigate to `/network`.

### What to Show
| Window | Expected Graph |
|--------|----------------|
| **A** (Admin / Owner) | Full 8-node directed graph; all Crawford Market edges rendered. Labels show merchant names & debt amounts. |
| **B** (Retailer_B / Admin) | Same full graph (admins see all nodes). |

Narrate:
> "An admin sees the entire group's credit graph — every node, every edge, every cycle. A plain member would see only their own ego-network: their direct neighbours."

5. Click any **edge** in Window A → the Transaction sidebar slides in (see Step 3).

### Expected Result
- Force-directed layout renders within 2 s.
- Edge thickness proportional to debt amount.
- Cycles highlighted (3-node cycle: `Supplier_C → Logistics_E → Supplier_C`).

### Fallback
If the graph is empty, check that the server seeded data (`GET /api/debts` returns debts). Refresh the page once.

### Screenshot Reference
`docs/report-assets/screens/04_network_graph.webp` | `09_network_member.webp`

---

## Step 3 · Edge Click → Transaction Detail (2:00 – 2:45)

### Actions
1. In **Window A → Network**, click the edge between **Supplier_C** and **Wholesale_A** (labelled "₹10,000 · Spice lot batch #440").
2. The **Transaction panel** slides in from the right.

### What to Show
- Debt metadata: debtor, creditor, original amount, remaining, due date, status.
- **Payment history** timeline.
- "Record Payment" button (leads to partial-payment flow in Step 4).

### Expected Result
- Panel renders with correct debt data.
- Payment history shows any prior seed payments.

### Fallback
If the panel doesn't open, navigate to `/ledger` → click the same row in the table.

---

## Step 4 · Partial Payment & Live Update (2:45 – 3:45)

### Actions
1. In the Transaction panel (or `/ledger`), click **"Record Payment"** on the `Supplier_C → Wholesale_A` debt (original: ₹10,000).
2. Enter **₹4,000** (partial) → confirm.
3. Watch **Window A** and **Window B** both update:
   - Remaining amount changes from ₹10,000 → ₹6,000.
   - Status badge stays **active** (not paid).

### What to Show
- Real-time socket push: Window B's ledger updates without manual refresh.
- Remaining balance reflects partial payment.
- Amount **greater than remaining** is rejected (validation): try entering ₹15,000 → should show a red toast `Amount exceeds remaining balance`.

### Expected Result
- Ledger row updates within 1–2 s in both windows.
- Negative / zero / NaN amounts are rejected client-side before submission.

### Fallback
If socket update doesn't propagate in Window B, press `F5` — the HTTP refetch will show the updated balance.

### Screenshot Reference
`docs/report-assets/screens/05_ledger.webp`

---

## Step 5 · Approval Flow (Admin Inbox) (3:45 – 4:30)

### Actions
1. **Window B (Retailer_B)** → `/ledger` → click **"Add Debt"** → fill in a new debt:
   - Creditor: `Farmer_F`
   - Amount: ₹7,500
   - Note: "Grain delivery"
   - Submit.
2. **Window A (Wholesale_A admin)** → `/inbox` → the pending debt approval request appears.
3. Admin clicks **"Approve"** → debt becomes active; Window B refreshes.

### What to Show
- Non-admin members cannot bypass the approval gate.
- The inbox badge in the sidebar (Window A) increments by 1 on new submission.
- Approval creates an **AuditLog** entry.

### Expected Result
- After approval, debt appears in Window B's ledger with status `active`.
- Admin inbox shows `Approved` status chip.

### Fallback
If the inbox badge doesn't increment, reload Window A. If the debt stays `pending`, check `GET /api/debts?status=pending` on the server.

### Screenshot Reference
`docs/report-assets/screens/08_inbox_admin.webp`

---

## Step 6 · Optimise — Greedy vs Exact (4:30 – 5:30)

### Actions
1. **Window A** → `/settle`.
2. Click **"Optimise"** — default algorithm is **Greedy** (fast, approximate).
3. Note the proposed settlement plan: number of transactions and total flow.
4. Switch algorithm toggle to **"Exact"** → click Optimise again.
5. Compare the two plans side-by-side.

### What to Show
- Greedy: O(n log n), may retain some cycles.
- Exact (Bellman-Ford / cycle elimination): fewer transactions, all 3-node cycles netted to zero.
- Crawford Market has a known 3-node cycle (`Supplier_C → Logistics_E → Supplier_C` with matching ₹15,000) that Exact eliminates completely.

### Expected Result
- Exact plan has ≤ greedy plan transaction count for the seeded data.
- Cycle net displayed: "Cycle of ₹15,000 eliminated between 3 merchants."

### Fallback
If Python engine is unavailable, the UI shows a `503 Engine Unavailable` toast. Check `docker compose ps engine`.

### Screenshot Reference
`docs/report-assets/screens/07_settlement.webp`

---

## Step 7 · Double-Confirm Race → HTTP 409 (5:30 – 6:00)

### Actions
```bash
# In a new terminal at repo root:
npm run demo:race
```

### What to Show
- The script fires **two simultaneous** `POST /api/settlement/confirm/:batchId` requests.
- **One** succeeds with `200 { status: "executing" }`.
- **The other** returns `409 CONCURRENT_MODIFICATION`.

### Expected Result
```
Batch ID: <batchId>
→ Race started (2 parallel confirms)...

Response 1: 200 OK
  { "status": "executing", "batchId": "..." }

Response 2: 409 Conflict
  { "code": "CONCURRENT_MODIFICATION", "message": "..." }

✅  OCC isolation confirmed — only one confirm succeeded.
```

### Fallback
If both return 200, it means no pending batch exists in the DB → run `npm run demo:reset` to re-seed.

---

## Step 8 · Risk Z-Test & Contagion Overlay (6:00 – 7:00)

### Actions
1. **Window A** → `/risk`.
2. Show the risk heatmap — **Supplier_C** highlighted in red (risk score 0.88 / CRITICAL).
3. Click **"Contagion Overlay"** toggle → shows which connected nodes would be impacted if Supplier_C defaults.
4. Click **"Run Z-Test"** → statistical z-score table appears comparing each merchant's exposure to the group mean.

### What to Show
- Supplier_C's CRITICAL risk propagates to Logistics_E and Wholesale_A via credit edges.
- Z-scores above 2.0 are flagged in orange.
- The heatmap cell colour is proportional to `riskScore`.

### Expected Result
- Contagion overlay highlights at least 2 downstream nodes.
- Z-test table renders with p-values < 0.05 for Supplier_C.

### Fallback
If risk data is missing, refresh the page. If Python engine is down, risk scores are served from DB cache.

### Screenshot Reference
`docs/report-assets/screens/06_risk_heatmap.webp`

---

## Step 9 · AIMD Throttle Load Demo (7:00 – 7:45)

> **Note:** This step demonstrates the Additive-Increase Multiplicative-Decrease (AIMD) rate-limiter built into the Python engine.

### Actions
```bash
# Run the included benchmark (from repo root):
npx ts-node benchmarks/load_test.ts --rps 50 --duration 15
# or if Python script exists:
python benchmarks/load_test.py --rps 50 --duration 15
```

### What to Show
- Engine starts accepting at full rate.
- When queue depth exceeds threshold, the AIMD window halves (multiplicative decrease).
- As load subsides, window grows by 1 per RTT (additive increase).
- Observe the `x-ratelimit-remaining` header in responses drop then recover.

### Expected Result
- P95 latency stays under 300 ms at 50 rps.
- No `502 Bad Gateway` from engine; only graceful `429 Too Many Requests` at peak.

### Fallback
If the engine container is unhealthy, show the AIMD logic in `creditflow/throttler.py` instead.

---

## Step 10 · Command Palette & CSV Export (7:45 – 8:30)

### Actions — Command Palette
1. **Window A** → Press `Ctrl+K` (or `Cmd+K` on Mac).
2. Type "ledger" → select "Go to Ledger".
3. Type "risk" → select "Go to Risk".
4. Type "logout" → verify it signs out and redirects to `/login`.

### Actions — CSV Export
1. Navigate back to `/ledger` (log in again as `wholesale_a@demo.com`).
2. Click the **"Export CSV"** button in the top-right of the Ledger table.
3. Verify the downloaded `creditflow_ledger_*.csv` file opens correctly in Excel/Sheets.
4. Check that all columns are present: `id, debtor, creditor, amount, remaining, status, dueDate, note`.

### Expected Result
- Command palette opens within 100 ms.
- Navigation is instant (React Router client-side routing).
- CSV file is UTF-8, no formula injection (`=cmd(...)` is escaped to `'=cmd(...)`).

### Fallback
If `Ctrl+K` doesn't open the palette, click the search icon in the sidebar. If CSV download doesn't trigger, use `GET /api/debts/export` directly.

### Screenshot Reference
`docs/report-assets/screens/02_overview_admin.webp` | `10_activity_log.webp`

---

## Full Demo Flow Summary

| # | Step | Duration | Page | Key Point |
|---|------|----------|------|-----------|
| 1 | Login & Group Isolation | 0:00–1:00 | `/login` → `/groups` | Two groups for admin; one for member |
| 2 | Network Graph | 1:00–2:00 | `/network` | Admin full graph vs member ego-net |
| 3 | Edge Click → Transaction | 2:00–2:45 | `/network` | Slide-in detail panel |
| 4 | Partial Payment + Live Update | 2:45–3:45 | `/ledger` | Socket push, validation guards |
| 5 | Approval Flow | 3:45–4:30 | `/inbox` | Pending → approved workflow |
| 6 | Optimise (Greedy vs Exact) | 4:30–5:30 | `/settle` | Cycle elimination, algorithm toggle |
| 7 | Double-Confirm Race → 409 | 5:30–6:00 | Terminal | OCC/optimistic lock proof |
| 8 | Risk Z-Test + Contagion | 6:00–7:00 | `/risk` | CRITICAL node, downstream impact |
| 9 | AIMD Throttle Load Script | 7:00–7:45 | Terminal | Rate-limiter adaptation |
| 10 | Command Palette + CSV | 7:45–8:30 | All pages | UX polish + data export |

---

## Screenshot Gallery

All screenshots are captured by the headless Playwright script at
`scripts/capture-screenshots.ts` (run via `npm run demo:screenshots`).

Screenshots are saved to `docs/report-assets/screens/` and named:

| File | Step |
|------|------|
| `01_login.webp` | Step 1 — Login page |
| `02_overview_admin.webp` | Step 1 — Admin overview |
| `03_groups_admin.webp` | Step 1 — Groups (isolation) |
| `04_network_graph.webp` | Step 2 — Admin full network |
| `05_ledger.webp` | Step 4 — Ledger table |
| `06_risk_heatmap.webp` | Step 8 — Risk heatmap |
| `07_settlement.webp` | Step 6 — Settlement optimise |
| `08_inbox_admin.webp` | Step 5 — Approval inbox |
| `09_network_member.webp` | Step 2 — Member ego-network |
| `10_activity_log.webp` | Step 10 — Activity log |

---

## Utility Scripts Reference

| Script | Command | Purpose |
|--------|---------|---------|
| DB Reset | `npm run demo:reset` | Re-seeds Crawford Market + Supplier Circle; prompts Rule 8 confirmation |
| Race Test | `npm run demo:race` | Fires 2 parallel confirm requests → proves HTTP 409 OCC isolation |
| Screenshots | `npm run demo:screenshots` | Headless Playwright: captures 10 labeled `.webp` frames |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Blank network graph | Engine container not healthy | `docker compose restart engine` |
| Groups page empty | DB not seeded | `npm run demo:reset` |
| 403 on ledger | Wrong group header | Log out and back in; check group switcher |
| 409 not triggered | No pending batch | `npm run demo:reset`, then run `demo:race` |
| Risk data stale | Python engine down | Show cached scores in DB; restart engine |
| CSV columns missing | Old client build | `npm run build:client` then redeploy |

---

*Generated by Phase 5B demo-readiness pass · branch `docs/c-p5-demo`*
