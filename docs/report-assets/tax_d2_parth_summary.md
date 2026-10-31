# CreditFlow Tax Module — Day 2 Add-Debt Tax Form, Ledger & Transaction Breakup (Parth) Summary

## Branch
`feat/tax-d2-frontend`

## Acceptance Criteria Verification

| Acceptance Criterion | Status | Verification Detail |
|---|---|---|
| **Client builds** | PASSED | `npm --prefix client run build` succeeds cleanly (`tsc -b && vite build` completes in <1s, 0 errors, strict TypeScript mode). |
| **Creating and viewing a taxed debt works in all three places on the mock** | PASSED | 1. **AddDebtModal**: displays Base amount, Tax type, extra parameters, and live `TaxPreviewBox`. Sends `{ baseAmount, taxType, taxInputs }` without `amount`.<br>2. **Ledger**: shows Base, Tax (+/- sign and badge), and Payable columns.<br>3. **Transaction**: renders `TaxBreakupCard` under amounts, progress bar based on payable, and 'Edit tax' action. |
| **'none' groups look exactly as before** | PASSED | Untaxed groups with domain `'none'` retain the single Principal Amount field in `AddDebtModal` and the standard Remaining / Original columns in `Ledger`. Untaxed debts do not render tax cards or edit tax actions. |
| **Component & mock tests pass** | PASSED | All 32 frontend tests pass (25 Day 1 vector & domain tests + 7 Day 2 component & mock tests asserting preview for GST intra 18% on 10,000 -> 11,800 and Customs import on 5,00,000 -> 6,38,675). |

---

## 1. What was built

### 1.1 `AddDebtModal.tsx` (§1)
- Detects the active circle's tax domain (e.g. `gst`, `income`, `customs`, `property`, `vehicle`).
- When the domain is **not `'none'`**:
  - Replaces the single Amount input with:
    - **Base amount** (`baseAmount`, number input with ₹ prefix).
    - **Tax type selector** (populated dynamically from `useTaxRules(domain)`).
    - **Rule parameters / extra inputs**: dynamically renders selects (e.g. `gstRate`, `bcdRate`, `igstRate`), numbers (e.g. `exportDutyRate`), and checkboxes (e.g. `womanBuyer` for property stamp duty concession).
    - **Live Tax preview box** (`<TaxPreviewBox />`): connects to `useTaxPreview(taxType, baseAmount, taxInputs)` debounced by 300ms, rendering base, breakup components with rates and amounts, total tax with effect indicator, and final bold payable.
  - Submit button is disabled until the live preview computation succeeds.
  - On submit: sends `{ debtorId, creditorId, baseAmount, taxType, taxInputs, dueDate, note }` (never `amount`).
- When the domain is **`'none'`**:
  - The legacy single Amount field and submission payload (`{ amount }`) remain completely untouched.

### 1.2 `Ledger.tsx` Table Overhaul (§2)
- Added domain detection for active circle:
  - If tax group (`domain !== 'none'`):
    - Table header displays: **Debtor (Payer)**, **Creditor (Payee)**, **Base**, **Tax** (with sign and badge), **Payable**, **Status**, **Due Date**, **Action**.
    - **Base column**: formatted as `₹baseAmount`.
    - **Tax column**: formatted with `+` or `-` sign (green for deduct/TDS, blue for add) and a styled tax type badge (e.g. `gst.intra`, `gst.inter`).
    - **Payable column**: shows the final payable amount (`debt.amount`), retaining the original strikethrough value if payments were recorded.
    - Sort by payable amount (`handleSort('amount')`), search query filtering, status tabs (`active`, `pending`, `overdue`, etc.), and CSV export button keep working seamlessly.
  - If `'none'` group:
    - Renders the original columns (**Remaining / Original**, etc.) untouched.

### 1.3 `Transaction.tsx` Breakup & Edit Tax (§3)
- **Tax Breakup Card** (`<TaxBreakupCard />`):
  - Positioned directly under the header amounts.
  - Displays tax type badge, rule version (`FY2026-27`), legal reference (e.g. CGST/SGST Acts, Customs Tariff Act 1975, Income-tax Act 2025), each detailed breakup line item with percentage rate and amount, tax effect (`added` vs `deducted`), base amount, total tax, and bold net payable amount.
- **Partial-payment progress bar**:
  - Now explicitly calculated against payable amount (`payable = debt.originalAmount || debt.amount`):
    `Repayment Progress: X% (₹Y paid of ₹Z payable)`.
- **Edit Tax Action & 409 Handling**:
  - When the debt is editable (no payments recorded yet, status is `active` or `pending`), an **'Edit Tax'** action button is displayed in both the `TaxBreakupCard` and the Available Operations panel.
  - Clicking opens `<EditTaxModal />` pre-filled with the debt's current base amount, tax type, and inputs, running the live `useTaxPreview`.
  - Submitting calls `api.debts.update(debt._id, { baseAmount, taxType, taxInputs, expectedVersion: debt.version })`.
  - If blocked by concurrent edits or if payments exist, displays the 409 conflict message in a warning toast.

### 1.4 Mock Debts Module Extension (`api/mock/debts.mock.ts`) (§4)
- **`create`**:
  - When `taxType` is provided, invokes `computeTax` to calculate `payable`, `taxAmount`, `taxRate`, `taxEffect`, `taxBreakup`, and `taxRuleVersion`.
  - Sets `amount = preview.payable` and `originalAmount = preview.payable`.
  - Preserves untaxed creation for domain `'none'` groups.
- **`update`**:
  - Recomputes payable and tax fields when updating a taxed debt.
  - Enforces lock rule: throws `409 PAYMENTS_ALREADY_RECORDED` if any payments exist for the debt.
  - Enforces status check: allowed only when status is `active` or `pending`.
  - Respects the `simulate409` toggle to test optimistic concurrency recovery.
- **`exportCsv`**:
  - Extended to output `baseAmount`, `taxType`, `taxAmount`, and payable `amount`.
- **Initial mock debts**:
  - Initialized `debt-1` and `debt-2` with GST tax details (`gst.intra` 18% on ₹10,000 -> payable ₹11,800; `gst.inter` 5% on ₹20,000 -> payable ₹21,000) for immediate mock visualization.

### 1.5 Component & Mock Tests (`client/src/tax/__tests__/taxComponents.test.ts`) (§5)
- Added test suite executed via `npm --prefix client test`:
  1. Component Test: Render `TaxPreviewBox` for GST intra 18% on 10,000 -> asserts HTML contains bold payable `11,800`, base `10,000`, tax `1,800`, and CGST/SGST split `900`.
  2. Component Test: Render `TaxPreviewBox` for Customs import on 5,00,000 -> asserts HTML contains bold payable `6,38,675`, base `5,00,000`, tax `1,38,675`, and BCD/SWS/IGST components.
  3. Mock test: `debtsMock.create` computes amount, taxRate and breakup from tax mock.
  4. Mock test: `debtsMock.create` in untaxed groups preserves amount.
  5. Mock test: `debtsMock.update` recomputes payable on tax edit.
  6. Mock test: `simulate409` toggle throws 409 conflict on edit.
  7. Mock test: `debtsMock.update` blocked with 409 when payments exist.

---

## 2. Test Execution Results

Executed `npm --prefix client test`:
```text
✔ Tax Domains: exports all 5 active domains with descriptions
✔ Vector 1: GST intra 18% (base 10,000 -> CGST 900 + SGST 900 = 1,800, payable 11,800)
✔ Vector 2: GST inter 5% (base 20,000 -> IGST 1,000, payable 21,000)
✔ Vector 3: Customs import (base 5,00,000; BCD 7.5%; IGST 18% -> BCD 37,500 + SWS 3,750 + IGST 97,425 = 1,38,675, payable 6,38,675)
✔ Vector 4: Customs export, default (base 1,00,000; duty 0 -> tax 0, payable 1,00,000)
✔ Vector 5: Customs export duty (base 1,00,000; duty 10% -> tax 10,000, payable 1,10,000)
✔ Vector 6: Income TDS professional (base 1,00,000 -> tax 10,000 deduct, payable 90,000)
✔ Vector 7: Income TDS contractor other (base 2,00,000 -> tax 4,000 deduct, payable 1,96,000)
✔ Vector 8a: Stamp Mumbai standard (base 50,00,000 -> tax 3,00,000, payable 53,00,000)
✔ Vector 8b: Stamp Mumbai woman concession (base 50,00,000 -> tax 2,50,000, payable 52,50,000)
✔ Vector 9: Registration capped (base 50,00,000 -> 30,000 capped, payable 50,30,000)
✔ Vector 10: Registration small (base 20,00,000 -> 20,000, payable 20,20,000)
✔ Vector 11: Vehicle petrol (base 12,00,000 -> 12% = 1,44,000, payable 13,44,000)
✔ Vector 12: Vehicle diesel (base 8,00,000 -> 13% = 1,04,000, payable 9,04,000)
✔ Vector 13: Vehicle CNG (base 9,00,000 -> 12% = 1,08,000, payable 10,08,000)
✔ Vector 14: Vehicle EV (base 15,00,000 -> tax 0, payable 15,00,000)
✔ Vector 15: Vehicle company (base 25,00,000 -> 20% = 5,00,000, payable 30,00,000)
✔ getDomainRules returns correct metadata for domain
✔ Invalid tax type throws descriptive error
✔ Mock Adapter: getDomains returns all 5 domains
✔ Mock Adapter: getRules returns rules for given domain
✔ Mock Adapter: preview returns exact preview for GST intra 18%
✔ Mock Adapter: Create group preserves tax domain
✔ Mock Adapter: setGroupDomain locks group with existing debts
✔ Mock Adapter: setGroupDomain allows setting domain on zero-debt none group
All 25/25 frontend tests passed successfully!

✔ Component Test 1: Render TaxPreviewBox for GST intra 18% on 10,000 (expect 11,800 and 1,800 tax)
✔ Component Test 2: Render TaxPreviewBox for Customs import on 5,00,000 (expect 6,38,675 and 1,38,675 tax)
✔ Mock debts: create computes payable amount, taxRate and breakup from tax mock
✔ Mock debts: create in 'none' group preserves amount and sets baseAmount without tax
✔ Mock debts: update recomputes payable amount on tax edit
✔ Mock debts: 409 toggle throws conflict error on edit
✔ Mock debts: update blocked with 409 if payments already recorded
All 7/7 Day 2 frontend & component tests passed successfully!
```

Build execution: `npm --prefix client run build`:
```text
✓ built in 556ms (0 TypeScript errors)
```

---

## 3. Contract Deviations
None. All data shapes, routes, test vectors, and error codes match Section 2 of `TAX_PHASE_PROMPTS.md` and the shared contract.
