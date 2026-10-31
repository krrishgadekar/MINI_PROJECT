/**
 * taxComponents.test.ts — Component and Mock Tests for Day 2 (D2-P §5)
 *
 * Tests:
 *   1. Render TaxPreviewBox for GST intra 18% on 10,000 -> expect payable 11,800
 *   2. Render TaxPreviewBox for Customs import on 5,00,000 -> expect payable 6,38,675
 *   3. debtsMock.create in tax groups computes amount and breakup from tax mock
 *   4. debtsMock.update recomputes payable and handles 409 simulation & locked debts
 *   5. debtsMock.create in untaxed ('none') groups keeps legacy behavior
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaxPreviewBox } from '../../components/tax/TaxPreviewBox.ts';
import { computeTax } from '../rulesMock.ts';
import { debtsMock, setSimulate409, mockDebts } from '../../api/mock/debts.mock.ts';

interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: TestCase[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function assertIncludes(haystack: string, needle: string, msg?: string) {
  if (!haystack.includes(needle)) {
    throw new Error(
      `${msg ? msg + ': ' : ''}Expected HTML output to contain "${needle}"\nOutput was:\n${haystack}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Component Test: GST intra 18% on 10,000 (expect 11,800)
// ─────────────────────────────────────────────────────────────────────────────
test('Component Test 1: Render TaxPreviewBox for GST intra 18% on 10,000 (expect 11,800 and 1,800 tax)', () => {
  const preview = computeTax('gst.intra', 10000, { gstRate: 18 });
  const html = renderToStaticMarkup(
    React.createElement(TaxPreviewBox, { preview })
  );

  assertIncludes(html, 'data-testid="tax-preview-box"', 'Preview container rendered');
  assertIncludes(html, '10,000', 'Base amount 10,000 rendered');
  assertIncludes(html, '1,800', 'Tax amount 1,800 rendered');
  assertIncludes(html, '11,800', 'Payable amount 11,800 rendered in preview');
  assertIncludes(html, 'CGST', 'CGST breakup line rendered');
  assertIncludes(html, 'SGST', 'SGST breakup line rendered');
  assertIncludes(html, '900', 'Split CGST/SGST 900 each rendered');
  assertIncludes(html, 'data-testid="payable-amount"', 'Payable amount testid present');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Component Test: Customs import on 5,00,000 (expect 6,38,675)
// ─────────────────────────────────────────────────────────────────────────────
test('Component Test 2: Render TaxPreviewBox for Customs import on 5,00,000 (expect 6,38,675 and 1,38,675 tax)', () => {
  const preview = computeTax('customs.import', 500000, { bcdRate: 7.5, igstRate: 18 });
  const html = renderToStaticMarkup(
    React.createElement(TaxPreviewBox, { preview })
  );

  assertIncludes(html, 'data-testid="tax-preview-box"', 'Preview container rendered');
  assertIncludes(html, '5,00,000', 'Base amount 5,00,000 rendered');
  assertIncludes(html, '1,38,675', 'Total tax 1,38,675 rendered');
  assertIncludes(html, '6,38,675', 'Payable amount 6,38,675 rendered in preview');
  assertIncludes(html, 'Basic Customs Duty', 'BCD line rendered');
  assertIncludes(html, 'Social Welfare Surcharge', 'SWS line rendered');
  assertIncludes(html, 'Integrated GST', 'IGST line rendered');
  assertIncludes(html, '37,500', 'BCD amount 37,500 rendered');
  assertIncludes(html, '3,750', 'SWS amount 3,750 rendered');
  assertIncludes(html, '97,425', 'IGST amount 97,425 rendered');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Mock Module Test: createDebt computes amount from tax mock
// ─────────────────────────────────────────────────────────────────────────────
test('Mock debts: create computes payable amount, taxRate and breakup from tax mock', async () => {
  const res = await debtsMock.create({
    debtorId: 'Vendor_A',
    creditorId: 'Vendor_B',
    baseAmount: 10000,
    taxType: 'gst.intra',
    taxInputs: { gstRate: 18 },
  });

  assert(res.success === true, 'Response is successful');
  assert(res.debt.amount === 11800, `Expected payable amount 11800, got ${res.debt.amount}`);
  assert(res.debt.baseAmount === 10000, `Expected base amount 10000, got ${res.debt.baseAmount}`);
  assert(res.debt.taxAmount === 1800, `Expected tax amount 1800, got ${res.debt.taxAmount}`);
  assert(res.debt.taxRate === 18, `Expected tax rate 18, got ${res.debt.taxRate}`);
  assert(res.debt.taxEffect === 'add', `Expected tax effect 'add', got ${res.debt.taxEffect}`);
  assert((res.debt.taxBreakup?.length ?? 0) === 2, 'Breakup has CGST and SGST items');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Mock Module Test: createDebt in 'none' group keeps legacy amount
// ─────────────────────────────────────────────────────────────────────────────
test("Mock debts: create in 'none' group preserves amount and sets baseAmount without tax", async () => {
  const res = await debtsMock.create({
    debtorId: 'Vendor_C',
    creditorId: 'Vendor_D',
    amount: 5000,
  });

  assert(res.success === true, 'Response is successful');
  assert(res.debt.amount === 5000, `Expected amount 5000, got ${res.debt.amount}`);
  assert(res.debt.baseAmount === 5000, `Expected baseAmount 5000, got ${res.debt.baseAmount}`);
  assert(res.debt.taxType === undefined, 'No taxType on untaxed debt');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Mock Module Test: update recomputes payable and increments version
// ─────────────────────────────────────────────────────────────────────────────
test('Mock debts: update recomputes payable amount on tax edit', async () => {
  // Find a debt without payments
  const debtToEdit = mockDebts.find((d) => d._id === 'debt-2');
  assert(Boolean(debtToEdit), 'Found debt-2');

  const prevVersion = debtToEdit!.version;
  const res = await debtsMock.update('debt-2', {
    baseAmount: 20000,
    taxType: 'gst.inter',
    taxInputs: { gstRate: 5 },
  });

  assert(res.success === true, 'Update successful');
  assert(res.debt.baseAmount === 20000, 'Base amount updated to 20000');
  assert(res.debt.amount === 21000, `Payable updated to 21000, got ${res.debt.amount}`);
  assert(res.debt.taxAmount === 1000, `Tax amount updated to 1000, got ${res.debt.taxAmount}`);
  assert(res.debt.version === prevVersion + 1, 'Version incremented');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Mock Module Test: 409 simulation throws conflict
// ─────────────────────────────────────────────────────────────────────────────
test('Mock debts: 409 toggle throws conflict error on edit', async () => {
  setSimulate409(true);
  let caught = false;
  try {
    await debtsMock.update('debt-2', {
      baseAmount: 15000,
      taxType: 'gst.intra',
    });
  } catch (err: any) {
    caught = true;
    assert(err.status === 409, 'Error status is 409');
    assert(err.response?.status === 409, 'Response status is 409');
  } finally {
    setSimulate409(false);
  }
  assert(caught, '409 error was caught when simulate409 is true');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Mock Module Test: Edit blocked with 409 if payments already exist
// ─────────────────────────────────────────────────────────────────────────────
test('Mock debts: update blocked with 409 if payments already recorded', async () => {
  // debt-1 has pay-mock-1 in debts.mock.ts
  let caught = false;
  try {
    await debtsMock.update('debt-1', {
      baseAmount: 30000,
    });
  } catch (err: any) {
    caught = true;
    assert(err.status === 409, 'Error status is 409');
    assert(
      err.response?.data?.code === 'PAYMENTS_ALREADY_RECORDED',
      'Error code is PAYMENTS_ALREADY_RECORDED'
    );
  }
  assert(caught, 'Edit blocked with 409 on debt with payments');
});

// Runner
const proc = (globalThis as any).process;
async function run() {
  let passed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✔ ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`✖ ${t.name}`);
      console.error(err);
      if (proc?.exit) {
        proc.exit(1);
      } else {
        throw err;
      }
    }
  }
  console.log(`\nAll ${passed}/${tests.length} Day 2 frontend & component tests passed successfully!\n`);
}

if (typeof proc !== 'undefined' && proc.argv && proc.argv[1]?.includes('taxComponents.test')) {
  run();
}

export { run as runDay2ComponentTests };
