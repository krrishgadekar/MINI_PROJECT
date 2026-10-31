# CreditFlow Tax Module — Day 1 Backend Implementation (Chetan) Summary

## Branch
`feat/tax-d1-backend`

## Acceptance Criteria Verification

| Acceptance Criterion | Status | Verification Detail |
|---|---|---|
| **Every Section 2.4 vector passes** | PASSED | All 15 Section 2.4 hand-computed vectors pass with exact integer and float matching in `apps/server/tests/tax.test.ts`. |
| **All existing test suites pass** | PASSED | All existing test suites (`groups.test.ts`, `debts.test.ts`, `isolation.test.ts`, `ledger_phase2.test.ts`) pass without modification or regression. |
| **Existing groups & debts unchanged** | PASSED | Legacy groups retain `domain: 'none'`, legacy debts keep `baseAmount = amount`, and tax fields in `'none'` group return `400 DOMAIN_REQUIRED`. |
| **No existing algorithms or routes changed** | PASSED | Preserved all settlement algorithms, cycle detection, Warshall transitive closure, optimistic locking, and socket flows. |
| **Client builds cleanly** | PASSED | `npm --prefix client run build` succeeds cleanly (`tsc -b && vite build` in ~800ms, 0 errors). |
| **API documentation updated** | PASSED | `apps/server/API_DOCS.md` updated with `PATCH /groups/:id/domain`, tax debt creation rules, and Section 9 (`/api/tax/*`). |

---

## 1. What Was Built

### 1.1 Data Models (`apps/server/src/models/`)
- **`Group.ts`**:
  - Added `domain: 'none' | 'income' | 'gst' | 'customs' | 'property' | 'vehicle'` with default `'none'`.
  - Exported `TaxDomain` type.
- **`Debt.ts`**:
  - Added optional/defaulted tax fields:
    - `baseAmount: number` (for legacy debts, equals `amount`)
    - `taxType?: string` (e.g. `'gst.intra'`)
    - `taxEffect?: 'add' | 'deduct'`
    - `taxAmount: number` (default `0`, always non-negative)
    - `taxRate?: number` (effective % for display)
    - `taxBreakup: [{ label: string, rate?: number, amount: number }]` (default `[]`)
    - `taxInputs?: Record<string, any>` (e.g. `{ gstRate: 18 }`, `{ womanBuyer: true }`)
    - `taxRuleVersion?: string` (`'FY2026-27'`)
  - Added migration helper: `ensureBaseAmount(debt)` and Mongoose `init`, `toJSON`, and `toObject` hooks that seamlessly treat missing `baseAmount` as `amount` when reading legacy records.

### 1.2 Pure Tax Calculation Engine (`apps/server/src/tax/`)
Zero-database pure TypeScript module containing:
- **`types.ts`**: Strict types for `TaxDomain`, `TaxTypeDef`, `TaxInputDef`, `TaxBreakupItem`, `TaxRuleDefinition`, `TaxPreviewResult`, `TaxDomainItem`, `TaxRulesResponse`, and `TaxSummaryResponse`.
- **`rules.ts`**: ONE data table (`TAX_RULES`) covering all 5 domains and 17 rules matching Section 2.3:
  - `TAX_RULE_VERSION = 'FY2026-27'`
  - Standard half-up 2-decimal rounding (`round2`)
  - Real tax slabs as of October 2026:
    - **Income (TDS)**: s.393 (194C, 194J, 194H) individual (1%), corporate (2%), professional (10%), technical (2%), commission (2%) with `deduct` effect.
    - **GST**: Intra-state (CGST + SGST equal split) and Inter-state (IGST) slabs (0%, 5%, 18%, 40%).
    - **Customs**: Import duty formula (BCD + SWS 10% of BCD + IGST on CIF+BCD+SWS) and Export duty with zero-rated IGST.
    - **Property**: Maharashtra Stamp Act Mumbai (6% / 5% woman concession), Rest of MH (7% / 6%), and Maharashtra registration fee (1% capped at ₹30,000).
    - **Vehicle**: Maharashtra Motor Vehicles Tax Act 1958 road tax slabs across Petrol (11/12/13%), Diesel (13/14/15%), CNG (12/13/14%), EV (0% exempt), and Corporate/Imported (flat 20%).
- **`compute.ts`**: `applyTax(domain, taxType, baseAmount, taxInputs)`:
  - Validates `taxType` belongs to `domain` (else `AppError 400 INVALID_TAX_TYPE`).
  - Validates `baseAmount` is a non-negative finite number.
  - Validates select inputs against allowed options and numeric inputs against non-negativity.
  - Rounds every component half-up to 2 decimals, then computes final payable (`baseAmount + taxAmount` if `add`, `baseAmount - taxAmount` if `deduct`).
- **`index.ts`**: Centralized exports for the tax subsystem.

### 1.3 Error Handling & Tenancy Middleware (`apps/server/src/utils/errors.ts` & `apps/server/src/middleware/group.middleware.ts`)
- Added error codes: `INVALID_TAX_TYPE`, `DOMAIN_LOCKED`, `DOMAIN_REQUIRED`.
- Extended `requireGroup` middleware to populate `req.group.domain` from the tenant group.

### 1.4 API Endpoints & Routes
- **`apps/server/src/routes/tax.routes.ts` & `apps/server/src/controllers/tax.controller.ts`** (protected by `protect` and `requireGroup`):
  - `GET /api/tax/domains` -> `[{ key, label, description }]`
  - `GET /api/tax/rules?domain=gst` -> `{ domain, ruleVersion, types: [...] }` (defaults to active group's domain if omitted).
  - `POST /api/tax/preview` -> `{ baseAmount, taxAmount, effect, payable, taxRate, breakup, legalRef, ruleVersion }` (uses active group's domain; no DB write; returns `400 INVALID_TAX_TYPE` if mismatched).
  - `GET /api/tax/summary` -> `{ domain, totals: [...], grandBase, grandTax, grandPayable }` (`admin`/`owner` receives entire group summary; `member` receives only own debts where debtor or creditor).
- **`PATCH /api/groups/:id/domain` (`groups.controller.ts` & `groups.routes.ts`)**:
  - Admin/Owner only.
  - Enforces `409 DOMAIN_LOCKED` if group domain is already set (not `'none'`) or if group has existing debts.
  - Writes audit log with action `GROUP_DOMAIN_UPDATED`.
  - Emits realtime socket event `group:updated` to `group:<id>` room.
- **`POST /api/debts` (`debts.controller.ts`)**:
  - Accepts `debtorId|debtor`, `creditorId|creditor`.
  - In a group with `domain: 'none'`: client sends `amount`, `baseAmount = amount`, `taxAmount = 0`. If client attempts to send tax fields (`taxType`, `taxInputs`), responds `400 DOMAIN_REQUIRED`.
  - In a tax group (`domain !== 'none'`): requires `baseAmount` and `taxType`. Server ignores any client-provided `amount` and computes payable. Stores all tax metadata.
  - Records tax fields in audit log meta and emits full debt payload via `debt:created` socket event.

---

## 2. Test Execution

### 2.1 Server Unit & Integration Test Suite (`apps/server/tests/tax.test.ts`)
Total: **35 passed, 0 failed**.
- **15 Hand-Computed Section 2.4 Vectors**:
  - Vector 1: GST intra 18% (`base 10,000 -> tax 1,800, payable 11,800`)
  - Vector 2: GST inter 5% (`base 20,000 -> tax 1,000, payable 21,000`)
  - Vector 3: Customs import (`base 5,00,000; BCD 7.5%; IGST 18% -> tax 1,38,675, payable 6,38,675`)
  - Vector 4: Customs export default (`base 1,00,000; duty 0 -> tax 0, payable 1,00,000`)
  - Vector 5: Customs export duty (`base 1,00,000; duty 10% -> tax 10,000, payable 1,10,000`)
  - Vector 6: Income TDS professional (`base 1,00,000 -> tax 10,000 deduct, payable 90,000`)
  - Vector 7: Income TDS contractor other (`base 2,00,000 -> tax 4,000 deduct, payable 1,96,000`)
  - Vector 8a: Stamp Mumbai standard (`base 50,00,000 -> tax 3,00,000, payable 53,00,000`)
  - Vector 8b: Stamp Mumbai woman concession (`base 50,00,000 -> tax 2,50,000, payable 52,50,000`)
  - Vector 9: Registration capped (`base 50,00,000 -> tax 30,000, payable 50,30,000`)
  - Vector 10: Registration small (`base 20,00,000 -> tax 20,000, payable 20,20,000`)
  - Vector 11: Vehicle petrol (`base 12,00,000 -> tax 1,44,000, payable 13,44,000`)
  - Vector 12: Vehicle diesel (`base 8,00,000 -> tax 1,04,000, payable 9,04,000`)
  - Vector 13: Vehicle CNG (`base 9,00,000 -> tax 1,08,000, payable 10,08,000`)
  - Vector 14: Vehicle EV (`base 15,00,000 -> tax 0, payable 15,00,000`)
  - Vector 15: Vehicle company (`base 25,00,000 -> tax 5,00,000, payable 30,00,000`)
- **Domain & Validation Checks**:
  - Invalid type for domain throws `400 INVALID_TAX_TYPE`.
  - Unknown select options throw `400 VALIDATION`.
  - Negative and non-finite base amounts throw `400 VALIDATION`.
- **Domain Lock Rules**:
  - Group domain configuration on zero-debt circle succeeds, audits, and emits socket event.
  - Re-setting domain on non-'none' group throws `409 DOMAIN_LOCKED`.
  - Setting domain on group with existing debts throws `409 DOMAIN_LOCKED`.
  - Member role attempting domain patch throws `403 FORBIDDEN_GROUP`.
- **Debt Lifecycle & Isolation**:
  - Creating debt in `'none'` group keeps old behaviour untouched (`baseAmount = amount`).
  - Creating debt with tax fields in `'none'` group throws `400 DOMAIN_REQUIRED`.
  - Creating debt in GST group computes payable and stores tax metadata while ignoring client `amount`.
  - Cross-tenant user cannot preview using another group's domain (`403 FORBIDDEN_GROUP`).
  - Migration helper correctly provides `baseAmount` for documents missing the field.
  - Tax summary endpoint accurately differentiates admin (group-wide) vs member (own debts) visibility.

### 2.2 Full Regressions Run
- `npm --prefix apps/server test -- tests/groups.test.ts tests/debts.test.ts tests/isolation.test.ts tests/tax.test.ts`: **83 passed, 0 failed**.
- `npm --prefix client test`: **25 passed, 0 failed**.
- `npm --prefix client run build`: **0 errors**.

---

## 3. Files Changed / Added

### Added
- `apps/server/src/tax/types.ts`
- `apps/server/src/tax/rules.ts`
- `apps/server/src/tax/compute.ts`
- `apps/server/src/tax/index.ts`
- `apps/server/src/controllers/tax.controller.ts`
- `apps/server/src/routes/tax.routes.ts`
- `apps/server/tests/tax.test.ts`
- `docs/report-assets/tax_d1_chetan_summary.md`

### Modified
- `apps/server/src/models/Group.ts`
- `apps/server/src/models/Debt.ts`
- `apps/server/src/utils/errors.ts`
- `apps/server/src/middleware/group.middleware.ts`
- `apps/server/src/controllers/groups.controller.ts`
- `apps/server/src/routes/groups.routes.ts`
- `apps/server/src/controllers/debts.controller.ts`
- `apps/server/src/app.ts`
- `apps/server/API_DOCS.md`

---

## 4. Contract Deviations & Design Decisions
None. All implementations adhere strictly to Section 2 of the tax contract:
- Handled `debtorId|debtor` and `creditorId|creditor` interchangeably in `POST /api/debts`.
- In `GET /api/tax/rules`, default domain is taken from active group context (`X-Group-Id`), falling back to `'none'` if not specified.
- `GET /api/tax/summary` scopes aggregation to debts with non-cancelled status (`status !== 'cancelled'`).

