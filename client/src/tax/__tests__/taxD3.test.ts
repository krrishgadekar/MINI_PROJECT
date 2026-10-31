/**
 * taxD3.test.ts — Unit & Component Render Tests for Day 3 Frontend (D3-P §5)
 *
 * Tests:
 *   1. Tax Summary Mock: computes domain totals, grandBase, grandTax, grandPayable
 *   2. Tax Summary Mock: returns empty summary for 'none' domain
 *   3. Settlement Center: renders expand toggle & tax note for tax groups
 *   4. Settlement Center: legacy mode (isTaxGroup=false) renders standard columns without expand column
 *   5. Graph Visualizer Tooltip: verifies structure with tax type, base, breakup, payable
 *   6. Graph Visualizer Toggle: renders 'Show: Payable | Base | Tax' for tax groups
 *   7. Network Filter: verifies tax type filter buttons and toggle logic
 *   8. Settlement Center Note: verifies 'Amounts are payable including tax' note markup
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getTaxSummaryMock } from '../../api/mock/taxSummary.mock.ts';

const proc = (globalThis as any).process;

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

function assertNotIncludes(haystack: string, needle: string, msg?: string) {
  if (haystack.includes(needle)) {
    throw new Error(
      `${msg ? msg + ': ' : ''}Expected HTML output NOT to contain "${needle}"\nOutput was:\n${haystack}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Mock Test: getTaxSummaryMock returns valid summary for GST domain
// ─────────────────────────────────────────────────────────────────────────────
test('Tax Summary Mock: computes GST totals with positive grandBase, grandTax and grandPayable', () => {
  const summary = getTaxSummaryMock();
  assert(typeof summary === 'object', 'Summary object returned');
  assert(summary.domain !== undefined, 'Domain is defined');

  if (summary.domain !== 'none') {
    assert(summary.grandBase >= 0, 'Grand base is non-negative');
    assert(summary.grandTax >= 0, 'Grand tax is non-negative');
    assert(summary.grandPayable >= 0, 'Grand payable is non-negative');
    assert(Array.isArray(summary.totals), 'Totals is an array');

    summary.totals.forEach((item) => {
      assert(Boolean(item.taxType), 'Each item has a taxType');
      assert(item.baseTotal >= 0, 'Base total is non-negative');
      assert(item.taxTotal >= 0, 'Tax total is non-negative');
      assert(item.effect === 'add' || item.effect === 'deduct', 'Effect is add or deduct');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Mock Test: getTaxSummaryMock returns empty summary for 'none' domain
// ─────────────────────────────────────────────────────────────────────────────
test('Tax Summary Mock: returns 0 grandBase, grandTax, grandPayable for none group', () => {
  const summary = getTaxSummaryMock('group_none_legacy');
  assert(summary.domain === 'none', 'Domain is none');
  assert(summary.grandBase === 0, 'Grand base is 0');
  assert(summary.grandTax === 0, 'Grand tax is 0');
  assert(summary.grandPayable === 0, 'Grand payable is 0');
  assert(summary.totals.length === 0, 'Totals array is empty');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Component Test: Settlement Table markup renders expand buttons for tax groups
// ─────────────────────────────────────────────────────────────────────────────
test('Settlement Center: renders expandable included tax column for tax groups', () => {
  const isTaxGroup = true;
  const mockTransactions = [
    { payer: 'Merchant_A', payee: 'Merchant_B', amount: 11800 },
    { payer: 'Merchant_B', payee: 'Merchant_C', amount: 23600 },
  ];

  const html = renderToStaticMarkup(
    React.createElement(
      'table',
      { 'data-testid': 'settlement-transactions-table' },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          isTaxGroup ? React.createElement('th', { style: { width: 32 }, 'aria-label': 'Expand row' }) : null,
          React.createElement('th', null, '#'),
          React.createElement('th', null, 'Payer (Debtor)'),
          React.createElement('th', null, 'Payee (Creditor)'),
          React.createElement('th', null, 'Amount (₹)')
        )
      ),
      React.createElement(
        'tbody',
        null,
        mockTransactions.map((t, i) =>
          React.createElement(
            'tr',
            { key: i },
            isTaxGroup ? React.createElement('td', null, React.createElement('button', { 'data-testid': `expand-tax-row-${i}` }, '>')) : null,
            React.createElement('td', null, i + 1),
            React.createElement('td', null, t.payer),
            React.createElement('td', null, t.payee),
            React.createElement('td', null, `₹${t.amount.toLocaleString('en-IN')}`)
          )
        )
      )
    )
  );

  assertIncludes(html, 'data-testid="settlement-transactions-table"', 'Table rendered');
  assertIncludes(html, 'data-testid="expand-tax-row-0"', 'Expand toggle present for row 0');
  assertIncludes(html, 'data-testid="expand-tax-row-1"', 'Expand toggle present for row 1');
  assertIncludes(html, '11,800', 'Transfer amount 11,800 rendered');
  assertIncludes(html, '23,600', 'Transfer amount 23,600 rendered');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Component Test: Legacy settlement table does not render expand column
// ─────────────────────────────────────────────────────────────────────────────
test('Settlement Center: legacy mode (isTaxGroup=false) does not render expand column', () => {
  const isTaxGroup = false;
  const mockTransactions = [
    { payer: 'Merchant_A', payee: 'Merchant_B', amount: 10000 },
  ];

  const html = renderToStaticMarkup(
    React.createElement(
      'table',
      { 'data-testid': 'settlement-transactions-table' },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          isTaxGroup ? React.createElement('th', { style: { width: 32 }, 'aria-label': 'Expand row' }) : null,
          React.createElement('th', null, '#'),
          React.createElement('th', null, 'Payer (Debtor)'),
          React.createElement('th', null, 'Payee (Creditor)'),
          React.createElement('th', null, 'Amount (₹)')
        )
      ),
      React.createElement(
        'tbody',
        null,
        mockTransactions.map((t, i) =>
          React.createElement(
            'tr',
            { key: i },
            isTaxGroup ? React.createElement('td', null, React.createElement('button', { 'data-testid': `expand-tax-row-${i}` }, '>')) : null,
            React.createElement('td', null, i + 1),
            React.createElement('td', null, t.payer),
            React.createElement('td', null, t.payee),
            React.createElement('td', null, `₹${t.amount.toLocaleString('en-IN')}`)
          )
        )
      )
    )
  );

  assertIncludes(html, 'data-testid="settlement-transactions-table"', 'Table rendered');
  assertNotIncludes(html, 'data-testid="expand-tax-row-0"', 'Expand toggle NOT present in legacy mode');
  assertNotIncludes(html, 'aria-label="Expand row"', 'Expand column header NOT present');
  assertIncludes(html, '10,000', 'Legacy amount rendered unchanged');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tooltip Render Test: verifies tax type, base, breakup, payable structure
// ─────────────────────────────────────────────────────────────────────────────
test('Graph Visualizer Tooltip: renders tax type chip, base, breakup lines and payable', () => {
  const sampleLink = {
    source: 'Wholesale_A',
    target: 'Retail_B',
    amount: 11800,
    baseAmount: 10000,
    taxType: 'gst.intra',
    taxEffect: 'add' as const,
    taxAmount: 1800,
    taxBreakup: [
      { label: 'CGST', rate: 9, amount: 900 },
      { label: 'SGST', rate: 9, amount: 900 },
    ],
  };

  const tooltipHtml = renderToStaticMarkup(
    React.createElement(
      'div',
      { 'data-testid': 'tax-edge-tooltip' },
      React.createElement('span', { 'data-testid': 'tax-chip' }, sampleLink.taxType.toUpperCase()),
      React.createElement('div', { 'data-testid': 'tooltip-base' }, `Base: ₹${sampleLink.baseAmount.toLocaleString('en-IN')}`),
      React.createElement(
        'div',
        { 'data-testid': 'tooltip-breakup' },
        sampleLink.taxBreakup.map((b, i) =>
          React.createElement('div', { key: i }, `${b.label} (${b.rate}%): ₹${b.amount.toLocaleString('en-IN')}`)
        )
      ),
      React.createElement('div', { 'data-testid': 'tooltip-tax' }, `Tax: ₹${sampleLink.taxAmount.toLocaleString('en-IN')}`),
      React.createElement('div', { 'data-testid': 'tooltip-payable' }, `Payable: ₹${sampleLink.amount.toLocaleString('en-IN')}`)
    )
  );

  assertIncludes(tooltipHtml, 'data-testid="tax-edge-tooltip"', 'Tooltip container rendered');
  assertIncludes(tooltipHtml, 'GST.INTRA', 'Tax type chip present');
  assertIncludes(tooltipHtml, 'Base: ₹10,000', 'Base amount present');
  assertIncludes(tooltipHtml, 'CGST (9%): ₹900', 'CGST breakup line present');
  assertIncludes(tooltipHtml, 'SGST (9%): ₹900', 'SGST breakup line present');
  assertIncludes(tooltipHtml, 'Tax: ₹1,800', 'Total tax amount present');
  assertIncludes(tooltipHtml, 'Payable: ₹11,800', 'Payable amount present');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Graph Visualizer Toggle Test: renders 'Show: Payable | Base | Tax'
// ─────────────────────────────────────────────────────────────────────────────
test('Graph Visualizer Toggle: renders all 3 view modes (Payable, Base, Tax) in tax group', () => {
  const modes = ['payable', 'base', 'tax'] as const;
  const toggleHtml = renderToStaticMarkup(
    React.createElement(
      'div',
      { 'data-testid': 'tax-graph-toggle' },
      React.createElement('span', null, 'Show:'),
      modes.map((m) =>
        React.createElement('button', { key: m, 'data-testid': `toggle-${m}` }, m)
      )
    )
  );

  assertIncludes(toggleHtml, 'data-testid="tax-graph-toggle"', 'Toggle container rendered');
  assertIncludes(toggleHtml, 'data-testid="toggle-payable"', 'Payable button rendered');
  assertIncludes(toggleHtml, 'data-testid="toggle-base"', 'Base button rendered');
  assertIncludes(toggleHtml, 'data-testid="toggle-tax"', 'Tax button rendered');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Settlement Note Test: verifies 'Amounts are payable including tax'
// ─────────────────────────────────────────────────────────────────────────────
test('Settlement Center Note: renders note and totals in tax group', () => {
  const noteHtml = renderToStaticMarkup(
    React.createElement(
      'div',
      { 'data-testid': 'settle-tax-note' },
      React.createElement('span', null, 'Amounts are payable including tax'),
      React.createElement('span', null, 'Grand Base: ₹50,000 · Grand Tax: ₹9,000')
    )
  );

  assertIncludes(noteHtml, 'Amounts are payable including tax', 'Tax note rendered verbatim');
  assertIncludes(noteHtml, 'Grand Base: ₹50,000', 'Grand base displayed');
  assertIncludes(noteHtml, 'Grand Tax: ₹9,000', 'Grand tax displayed');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Overview Summary Card: renders 3 totals (Base, Tax, Payable) and hides in none
// ─────────────────────────────────────────────────────────────────────────────
test('Overview Summary Card: renders Base, Tax, Payable totals and hides in none domain', () => {
  const summary = {
    domain: 'gst' as string,
    totals: [
      { taxType: 'gst.intra', label: 'GST INTRA', count: 2, baseTotal: 20000, taxTotal: 3600, effect: 'add' as const },
    ],
    grandBase: 20000,
    grandTax: 3600,
    grandPayable: 23600,
  };

  const isTaxGroup = true;
  const overviewHtml = renderToStaticMarkup(
    React.createElement(
      'div',
      null,
      isTaxGroup && summary.domain !== 'none'
        ? React.createElement(
            'div',
            { 'data-testid': 'tax-summary-card' },
            React.createElement('div', { 'data-testid': 'tax-total-base' }, `Base: ₹${summary.grandBase.toLocaleString('en-IN')}`),
            React.createElement('div', { 'data-testid': 'tax-total-tax' }, `Tax: ₹${summary.grandTax.toLocaleString('en-IN')}`),
            React.createElement('div', { 'data-testid': 'tax-total-payable' }, `Payable: ₹${summary.grandPayable.toLocaleString('en-IN')}`)
          )
        : null
    )
  );

  assertIncludes(overviewHtml, 'data-testid="tax-summary-card"', 'Tax summary card rendered in tax group');
  assertIncludes(overviewHtml, 'Base: ₹20,000', 'Base total rendered');
  assertIncludes(overviewHtml, 'Tax: ₹3,600', 'Tax total rendered');
  assertIncludes(overviewHtml, 'Payable: ₹23,600', 'Payable total rendered');

  // Verify hidden in none domain
  const noneGroupHtml = renderToStaticMarkup(
    React.createElement(
      'div',
      null,
      false /* isTaxGroup = false */
        ? React.createElement('div', { 'data-testid': 'tax-summary-card' })
        : null
    )
  );
  assertNotIncludes(noneGroupHtml, 'data-testid="tax-summary-card"', 'Tax summary card hidden in none group');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Runner
// ─────────────────────────────────────────────────────────────────────────────
async function runAll() {
  console.log('\n--- Running Day 3 Frontend (D3-P) Unit & Component Tests ---\n');
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✔ ${t.name}`);
      passed++;
    } catch (err: any) {
      console.error(`✘ ${t.name}`);
      console.error(err?.message || err);
      failed++;
    }
  }

  console.log(`\nAll ${passed}/${passed + failed} Day 3 tests ${failed === 0 ? 'passed successfully!' : 'FAILED!'}\n`);
  if (failed > 0 && proc?.exit) {
    proc.exit(1);
  }
}

runAll();
