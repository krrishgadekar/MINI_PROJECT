# CreditFlow Tax Module — Day 3 Network Graph, Settlement Center & Overview Summary (Parth) Summary

## Branch
`feat/tax-d3-frontend`

## Acceptance Criteria Verification

| Acceptance Criterion | Status | Verification Detail |
|---|---|---|
| **Client builds** | PASSED | `npm --prefix client run build` succeeds cleanly (`tsc -b && vite build` completes in <1s, 0 errors, strict TypeScript mode). |
| **Graph toggle switches labels without re-laying out** | PASSED | `GraphVisualizer.tsx` toolbar toggle switches `showMode` (`Payable` \| `Base` \| `Tax`) updating edge labels and widths directly in `linkCanvasObject` without resetting force simulation or graph positions. |
| **Edge hover shows tax tooltip** | PASSED | On hovering over any debt edge in tax groups, floating tooltip card renders: tax type badge, base amount, each breakup line with rates and amounts, and total payable amount. |
| **Edge tax-type chip** | PASSED | Each edge label renders a colored tax-type chip (`#c8502a` for add effect, `#16a34a` for deduct effect) alongside the formatted amount. |
| **Clicking edge opens `/ledger/:id`** | PASSED | `onLinkClick` in `ForceGraph2D` passes `link.debtId` and navigates directly to `/ledger/:id`. |
| **Multi-select 'Tax type' filter** | PASSED | `Network.tsx` renders a multi-select filter for active tax types extracted from debts in view, allowing dynamic filtering of visible graph edges. |
| **Settlement Center tax note & grand totals** | PASSED | `Settle.tsx` renders note `'Amounts are payable including tax'` and displays `grandBase`, `grandTax`, and `grandPayable` above the table from `useTaxSummary`. |
| **Expandable 'Included tax' line in settlement rows** | PASSED | `TransactionList.tsx` provides an expand/collapse toggle on each settlement transaction row detailing that the obligation is settled as net payable inclusive of taxes. Settlement algorithms and clearing numbers remain 100% untouched. |
| **Overview Tax Summary card** | PASSED | `Overview.tsx` renders a `'Tax summary'` card with Recharts `<BarChart>` (add bars in terracotta `#c8502a`, deduct bars in green `#16a34a`) and three totals: Base, Tax, and Payable. |
| **'none' groups look exactly as before** | PASSED | In circles with domain `'none'`, graph toggle, tax chips, edge tooltips, tax filters, settlement tax notes, and overview tax summary cards are completely hidden. |
| **Tests pass** | PASSED | All 40 frontend tests pass (25 Day 1 rules tests + 7 Day 2 component tests + 8 Day 3 unit & render tests) and all 60 backend debt/tax tests pass. |

---

## 1. What Was Built

### 1.1 Network Graph & Explorer (`components/GraphVisualizer.tsx` & `pages/Network.tsx`)
- **Payable Edge Amounts**: Default edge label display is payable amount (`amount`), preserving existing layout, physics forces, and graph traversal algorithms.
- **Toolbar Toggle ('Show: Payable | Base | Tax')**:
  - Rendered in graph toolbar when `isTaxGroup` is true.
  - Allows instant switching between Payable, Base, and Tax amount views.
  - Controls canvas rendering (`linkCanvasObject`) and width scaling without triggering force engine restart or node re-layout.
- **Tax-Type Chip on Edge Label**:
  - Midpoint label pill renders a small chip colored by tax effect: accent `#c8502a` for add (e.g. GST, Customs, Stamp) and green `#16a34a` for deduct (e.g. TDS).
  - Displays tax type name in uppercase alongside the formatted amount.
- **Edge Hover Tooltip**:
  - Displays floating card on link hover with tax type badge, base amount (`₹baseAmount`), itemized tax breakup lines (`rate%` and `₹amount`), total tax, and bold final payable amount.
- **Edge Click Navigation**:
  - Clicking any edge invokes `onLinkClick` navigating directly to `/ledger/${link.debtId}`.
- **Multi-Select 'Tax type' Filter**:
  - Dynamically extracts available tax types from debts in view.
  - Filter bar in `Network.tsx` allows multi-selecting specific tax types with active indicator pills and a clear filter option.
  - Hidden when group domain is `'none'`.

### 1.2 Settlement Center (`pages/Settle.tsx` & `components/TransactionList.tsx`)
- **Statutory Note**:
  - Displays one-line note `'Amounts are payable including tax'` for tax-enabled circles.
  - Displays `Grand Base`, `Grand Tax`, and `Grand Payable` summary above the clearing table powered by `useTaxSummary()`.
- **Expandable 'Included tax' Row**:
  - `TransactionList.tsx` adds an expand/collapse toggle for each transaction row in tax groups.
  - Expanding reveals the `'Included tax'` details: obligation settled as net payable inclusive of statutory domain taxes.
  - Preserves all settlement graph algorithms (netting, cycle detection, cash minimization) and calculation numbers with zero deviations.

### 1.3 Overview Page (`pages/Overview.tsx`)
- **Tax Summary Card**:
  - Connects to `useTaxSummary()`.
  - Hidden in `'none'` domain circles.
  - Displays three prominent specification cards: **Base Total**, **Tax Total**, and **Payable Total**.
  - Renders a Recharts `<BarChart>` displaying tax breakdown by type, with add bars colored `#c8502a` and deduct bars colored `#16a34a`.

### 1.4 Mock Module & React Query Hook (`api/mock/taxSummary.mock.ts` & `hooks/useTax.ts`)
- **`getTaxSummaryMock(groupId)`**:
  - Computes aggregated totals by `taxType`, `grandBase`, `grandTax`, and `grandPayable` from mock debts.
  - Returns zeroed empty totals for `'none'` domain circles.
- **`useTaxSummary()`**:
  - React Query hook fetching `/tax/summary` or delegating to `taxMock.summary()` with 30s cache stale time.

### 1.5 Unit & Component Tests (`tax/__tests__/taxD3.test.ts`)
- 8 automated tests asserting:
  1. Tax summary mock computes GST totals and grand totals.
  2. Tax summary mock returns zeroed totals for `'none'` domain.
  3. `TransactionList` renders expand toggle in tax groups.
  4. `TransactionList` hides expand column in legacy mode.
  5. Graph visualizer tooltip markup contains tax type chip, base, breakup, and payable.
  6. Graph visualizer toggle renders all three view modes (`Payable`, `Base`, `Tax`).
  7. Settlement note renders `'Amounts are payable including tax'`.
  8. Overview tax summary card renders three totals and hides in `'none'` domain.

---

## 2. Files Changed

- `client/package.json` — Added Day 3 test suite to `npm test`.
- `client/src/api/mock/index.ts` — Exported `getTaxSummaryMock`.
- `client/src/api/mock/tax.mock.ts` — Connected `taxMock.summary` to `getTaxSummaryMock`.
- `client/src/api/mock/taxSummary.mock.ts` (New) — Mock summary aggregation implementation.
- `client/src/components/GraphVisualizer.tsx` — Added toolbar toggle, edge chips, hover tooltip, and edge click navigation.
- `client/src/components/TransactionList.tsx` — Added expandable `'Included tax'` detail row.
- `client/src/hooks/useTax.ts` — Added `useTaxSummary()` hook.
- `client/src/pages/Network.tsx` — Added domain check, tax type multi-select filter, and enriched debt edge mapping.
- `client/src/pages/Overview.tsx` — Added Tax Summary card with Recharts bar chart and Base/Tax/Payable totals.
- `client/src/pages/Settle.tsx` — Added tax note and grand totals above table.
- `client/src/tax/__tests__/taxD3.test.ts` (New) — 8 unit and component render tests for Day 3.
- `client/src/types/index.ts` — Enriched `DebtEdge` and `GraphLink` with optional tax fields (`debtId`, `baseAmount`, `taxType`, etc.).
- `docs/report-assets/tax_d3_parth_summary.md` (New) — Day 3 summary report.

---

## 3. Tests Run

1. **Client Build Test**:
   ```bash
   npm --prefix client run build
   ```
   *Result:* Passed (0 TypeScript errors, bundle generated in 837ms).

2. **Client Test Suite**:
   ```bash
   npm --prefix client test
   ```
   *Result:* Passed (40/40 tests passed):
   - 25 Day 1 rules & vector tests.
   - 7 Day 2 component & mock tests.
   - 8 Day 3 graph, tooltip, toggle, settlement, and overview tests.

3. **Backend Test Suite**:
   ```bash
   npm --prefix apps/server test -- tests/debts.test.ts tests/tax.test.ts
   ```
   *Result:* Passed (60/60 tests passed across both test suites).

---

## 4. Contract Deviations

None. All contract endpoints, interfaces, data formats, and behavioral rules strictly follow the specification. Existing netting and settlement graph algorithms, legacy groups (`domain: 'none'`), and risk engines remain completely intact.
