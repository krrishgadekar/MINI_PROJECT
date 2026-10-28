# CreditFlow Tax Module — Day 1 Frontend Foundation (Parth) Summary

## Branch
`feat/tax-d1-frontend`

## Acceptance Criteria Verification

| Acceptance Criterion | Status | Verification Detail |
|---|---|---|
| **Client builds** | PASSED | `npm --prefix client run build` succeeds cleanly (`tsc -b && vite build` completed in ~980ms, 0 errors). |
| **A group can be created with a domain on the mock** | PASSED | `api.groups.create({ name, type, domain })` passes chosen tax domain (`gst`, `income`, `customs`, `property`, `vehicle`). Verified via mock adapter unit tests and UI state binding. |
| **All Section 2.4 vectors pass in frontend unit test** | PASSED | All 15 Section 2.4 hand-computed vectors + edge cases pass (25/25 assertions passed in `src/tax/__tests__/rulesMock.test.ts`). |
| **Old pages unchanged** | PASSED | Existing ledger, overview, network graph, settlement, and zero-debt groups retain baseline functionality with domain `'none'` treated as legacy untaxed mode. |

---

## 1. What was built

### 1.1 Types (`client/src/types/index.ts`)
- Added `TaxDomain = 'none' | 'income' | 'gst' | 'customs' | 'property' | 'vehicle'`.
- Added `TaxInputDef`, `TaxTypeDef`, `TaxRulesResponse`, `TaxBreakupItem`, `TaxPreview`, and `TaxSummary`.
- Extended `Group` with optional `domain?: TaxDomain`.
- Extended `Debt` with optional tax fields:
  - `baseAmount?: number`
  - `taxType?: string`
  - `taxEffect?: 'add' | 'deduct'`
  - `taxAmount?: number`
  - `taxRate?: number`
  - `taxBreakup?: TaxBreakupItem[]`
  - `taxInputs?: Record<string, any>`
  - `taxRuleVersion?: string`

### 1.2 Typed API Contract (`client/src/api/contract.ts`)
- Added `TaxDomainItem`, `TaxPreviewRequest`, and `SetGroupDomainRequest`.
- Extended `CreateGroupRequest` with `domain?: TaxDomain`.
- Extended `CreateDebtRequest` with `baseAmount?: number`, `taxType?: string`, `taxInputs?: Record<string, any>`.
- Extended `Api.groups` with `setDomain(id: string, domain: TaxDomain): Promise<GroupResponse>`.
- Added `Api.tax` namespace:
  - `getDomains(): Promise<TaxDomainItem[]>`
  - `getRules(domain?: TaxDomain): Promise<TaxRulesResponse>`
  - `preview(data: TaxPreviewRequest): Promise<TaxPreview>`
  - `setGroupDomain(groupId: string, domain: TaxDomain): Promise<GroupResponse>`
  - `summary?(): Promise<TaxSummary>`

### 1.3 Tax Rules Engine & Mock Computation (`client/src/tax/rulesMock.ts`)
- Configured version string `TAX_RULE_VERSION = 'FY2026-27'`.
- Implemented `TAX_DOMAINS` metadata for all 5 domains.
- Implemented pure `computeTax(typeKey, base, inputs)` supporting:
  - **Income Tax (TDS)**: Section 393 (earlier 194C, 194J, 194H) with 1%, 2%, 10% rates (`deduct` effect).
  - **GST**: Intra-state (CGST + SGST equal split) and Inter-state (IGST) slabs (0%, 5%, 18%, 40%).
  - **Customs**: Import duty formula (BCD + SWS 10% of BCD + IGST on CIF+BCD+SWS) and Export duty.
  - **Property**: Maharashtra Stamp Duty (Mumbai 6%/5% woman concession, Rest of MH 7%/6%) and Maharashtra registration fee (1% capped at ₹30,000).
  - **Vehicle**: Maharashtra one-time road tax slabs across Petrol (11/12/13%), Diesel (13/14/15%), CNG (12/13/14%), EV (0% exempt), and Corporate/Imported (flat 20%).
- Implemented half-up rounding to 2 decimals (`round2`).

### 1.4 Mock Adapter & Delegation Switch (`client/src/api/mock/tax.mock.ts` & `client/src/api/index.ts`)
- Created `client/src/api/mock/tax.mock.ts` implementing `getDomains`, `getRules`, `preview`, and `setGroupDomain`.
- Enforces `409 DOMAIN_LOCKED` when attempting to change a group that already has debts or already has a domain configured.
- Registered `'tax'` domain in `client/src/api/index.ts` via `isMockDomain('tax') ? mockApi.tax : realApi.tax`.
- Implemented real Axios fallback client in `client/src/api/real.ts`.

### 1.5 React Query Hooks & Query Keys (`client/src/hooks/useTax.ts` & `client/src/api/keys.ts`)
- Added centralized query keys in `client/src/api/keys.ts`: `queryKeys.tax.domains()`, `queryKeys.tax.rules(domain)`, `queryKeys.tax.preview(...)`, `queryKeys.tax.summary()`.
- Implemented:
  - `useTaxDomains()`
  - `useTaxRules(domain)`
  - `useTaxPreview(typeKey, base, inputs)`: with 300ms debounce before executing network query
  - `useSetGroupDomain()`: invalidates `queryKeys.groups.all` on success

### 1.6 Reusable Tax Badge (`client/src/components/tax/TaxBadge.tsx`)
- Small, theme-consistent badge displaying domain color and icon (`Percent` for GST, `Landmark` for Income TDS, `Globe` for Customs, `Home` for Property, `Car` for Vehicle, `MinusCircle` for None).
- Displayed in:
  - Sidebar Group Switcher header (displays active circle's tax domain).
  - Every group card in the Groups view.

### 1.7 Groups View Overhaul (`client/src/pages/Groups.tsx`)
- **Create Group Modal**:
  - Added required 5-domain radio-card picker with title, icon, and one-line description for each domain.
  - Added rate note: *"Estimate based on rates as of Oct 2026"*.
  - Passes chosen domain to `api.groups.create`.
- **Existing Groups**:
  - Displays `<TaxBadge domain={group.domain || 'none'} />` on every card.
  - For groups with domain `'none'`, shows admin/owner button `Set tax domain`.
  - Button is disabled with tooltip if debts already exist (`DOMAIN_LOCKED`).
  - Clicking opens modal to configure tax domain.
  - Member role sees badge read-only without the configuration button.

---

## 2. Test Execution

Unit tests executed via `npm --prefix client test`:
- 15/15 Section 2.4 hand-computed vectors:
  - GST intra 18% (`base 10,000 -> tax 1,800, payable 11,800`)
  - GST inter 5% (`base 20,000 -> tax 1,000, payable 21,000`)
  - Customs import (`base 5,00,000; BCD 7.5%; IGST 18% -> tax 1,38,675, payable 6,38,675`)
  - Customs export default (`base 1,00,000; duty 0 -> tax 0, payable 1,00,000`)
  - Customs export duty (`base 1,00,000; duty 10% -> tax 10,000, payable 1,10,000`)
  - Income TDS professional (`base 1,00,000 -> tax 10,000 deduct, payable 90,000`)
  - Income TDS contractor other (`base 2,00,000 -> tax 4,000 deduct, payable 1,96,000`)
  - Stamp Mumbai standard (`base 50,00,000 -> tax 3,00,000, payable 53,00,000`)
  - Stamp Mumbai woman concession (`base 50,00,000 -> tax 2,50,000, payable 52,50,000`)
  - Registration capped (`base 50,00,000 -> tax 30,000, payable 50,30,000`)
  - Registration small (`base 20,00,000 -> tax 20,000, payable 20,20,000`)
  - Vehicle petrol (`base 12,00,000 -> tax 1,44,000, payable 13,44,000`)
  - Vehicle diesel (`base 8,00,000 -> tax 1,04,000, payable 9,04,000`)
  - Vehicle CNG (`base 9,00,000 -> tax 1,08,000, payable 10,08,000`)
  - Vehicle EV (`base 15,00,000 -> tax 0, payable 15,00,000`)
  - Vehicle company (`base 25,00,000 -> tax 5,00,000, payable 30,00,000`)
- Mock adapter lifecycle tests (domains list, rules fetch, domain locking on debts, domain setting on fresh circle).
- Total: **25 passed, 0 failed**.

---

## 3. Files Changed / Added

### Added
- `client/src/tax/rulesMock.ts`
- `client/src/tax/__tests__/rulesMock.test.ts`
- `client/src/components/tax/TaxBadge.tsx`
- `client/src/components/tax/index.ts`
- `client/src/hooks/useTax.ts`
- `client/src/api/mock/tax.mock.ts`
- `docs/report-assets/tax_d1_parth_summary.md`

### Modified
- `client/src/types/index.ts`
- `client/src/api/contract.ts`
- `client/src/api/keys.ts`
- `client/src/api/index.ts`
- `client/src/api/real.ts`
- `client/src/api/mock/index.ts`
- `client/src/api/mock/groups.mock.ts`
- `client/src/api/mock/debts.mock.ts`
- `client/src/hooks/index.ts`
- `client/src/components/Sidebar.tsx`
- `client/src/pages/Groups.tsx`
- `client/package.json`

---

## 4. Contract Deviations
None. All types, routes, rates, legal references, error codes (`DOMAIN_LOCKED`), rounding behavior, and response shapes adhere strictly to Section 2 of `TAX_PHASE_PROMPTS.md`.

