/**
 * rulesMock.test.ts — Unit tests asserting all 15 hand-computed Section 2.4 vectors.
 * Self-contained: works with both Vite/tsc -b and node --experimental-strip-types.
 */

import { computeTax, getDomainRules, TAX_DOMAINS, TAX_RULE_VERSION } from '../rulesMock.ts';
import { taxMock } from '../../api/mock/tax.mock.ts';
import { groupsMock } from '../../api/mock/groups.mock.ts';

interface TestCase {
  name: string;
  fn: () => void;
}

const tests: TestCase[] = [];

function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg ? msg + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

test('Tax Domains: exports all 5 active domains with descriptions', () => {
  assertEqual(TAX_DOMAINS.length, 5, 'Domain count');
  const keys = TAX_DOMAINS.map((d) => d.key);
  assertEqual(JSON.stringify(keys), JSON.stringify(['income', 'gst', 'customs', 'property', 'vehicle']));
});

test('Vector 1: GST intra 18% (base 10,000 -> CGST 900 + SGST 900 = 1,800, payable 11,800)', () => {
  const result = computeTax('gst.intra', 10000, { gstRate: 18 });
  assertEqual(result.taxAmount, 1800, 'Tax amount');
  assertEqual(result.payable, 11800, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
  assertEqual(result.breakup.length, 2, 'Breakup components');
  assertEqual(result.breakup[0].amount, 900, 'CGST amount');
  assertEqual(result.breakup[1].amount, 900, 'SGST amount');
  assertEqual(result.ruleVersion, TAX_RULE_VERSION, 'Rule version');
});

test('Vector 2: GST inter 5% (base 20,000 -> IGST 1,000, payable 21,000)', () => {
  const result = computeTax('gst.inter', 20000, { gstRate: 5 });
  assertEqual(result.taxAmount, 1000, 'Tax amount');
  assertEqual(result.payable, 21000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
  assertEqual(result.breakup[0].amount, 1000, 'IGST amount');
});

test('Vector 3: Customs import (base 5,00,000; BCD 7.5%; IGST 18% -> BCD 37,500 + SWS 3,750 + IGST 97,425 = 1,38,675, payable 6,38,675)', () => {
  const result = computeTax('customs.import', 500000, { bcdRate: 7.5, igstRate: 18 });
  assertEqual(result.taxAmount, 138675, 'Tax amount');
  assertEqual(result.payable, 638675, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
  assertEqual(result.breakup[0].amount, 37500, 'BCD amount');
  assertEqual(result.breakup[1].amount, 3750, 'SWS amount');
  assertEqual(result.breakup[2].amount, 97425, 'IGST amount');
});

test('Vector 4: Customs export, default (base 1,00,000; duty 0 -> tax 0, payable 1,00,000)', () => {
  const result = computeTax('customs.export', 100000, { exportDutyRate: 0 });
  assertEqual(result.taxAmount, 0, 'Tax amount');
  assertEqual(result.payable, 100000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 5: Customs export duty (base 1,00,000; duty 10% -> tax 10,000, payable 1,10,000)', () => {
  const result = computeTax('customs.export', 100000, { exportDutyRate: 10 });
  assertEqual(result.taxAmount, 10000, 'Tax amount');
  assertEqual(result.payable, 110000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 6: Income TDS professional (base 1,00,000 -> tax 10,000 deduct, payable 90,000)', () => {
  const result = computeTax('income.tds_professional', 100000);
  assertEqual(result.taxAmount, 10000, 'Tax amount');
  assertEqual(result.payable, 90000, 'Payable');
  assertEqual(result.effect, 'deduct', 'Effect');
});

test('Vector 7: Income TDS contractor other (base 2,00,000 -> tax 4,000 deduct, payable 1,96,000)', () => {
  const result = computeTax('income.tds_contractor_other', 200000);
  assertEqual(result.taxAmount, 4000, 'Tax amount');
  assertEqual(result.payable, 196000, 'Payable');
  assertEqual(result.effect, 'deduct', 'Effect');
});

test('Vector 8a: Stamp Mumbai standard (base 50,00,000 -> tax 3,00,000, payable 53,00,000)', () => {
  const result = computeTax('property.stamp_mumbai', 5000000, { womanBuyer: false });
  assertEqual(result.taxAmount, 300000, 'Tax amount');
  assertEqual(result.payable, 5300000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 8b: Stamp Mumbai woman concession (base 50,00,000 -> tax 2,50,000, payable 52,50,000)', () => {
  const result = computeTax('property.stamp_mumbai', 5000000, { womanBuyer: true });
  assertEqual(result.taxAmount, 250000, 'Tax amount');
  assertEqual(result.payable, 5250000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 9: Registration capped (base 50,00,000 -> 30,000 capped, payable 50,30,000)', () => {
  const result = computeTax('property.registration', 5000000);
  assertEqual(result.taxAmount, 30000, 'Tax amount');
  assertEqual(result.payable, 5030000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 10: Registration small (base 20,00,000 -> 20,000, payable 20,20,000)', () => {
  const result = computeTax('property.registration', 2000000);
  assertEqual(result.taxAmount, 20000, 'Tax amount');
  assertEqual(result.payable, 2020000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 11: Vehicle petrol (base 12,00,000 -> 12% = 1,44,000, payable 13,44,000)', () => {
  const result = computeTax('vehicle.petrol', 1200000);
  assertEqual(result.taxAmount, 144000, 'Tax amount');
  assertEqual(result.payable, 1344000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 12: Vehicle diesel (base 8,00,000 -> 13% = 1,04,000, payable 9,04,000)', () => {
  const result = computeTax('vehicle.diesel', 800000);
  assertEqual(result.taxAmount, 104000, 'Tax amount');
  assertEqual(result.payable, 904000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 13: Vehicle CNG (base 9,00,000 -> 12% = 1,08,000, payable 10,08,000)', () => {
  const result = computeTax('vehicle.cng', 900000);
  assertEqual(result.taxAmount, 108000, 'Tax amount');
  assertEqual(result.payable, 1008000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 14: Vehicle EV (base 15,00,000 -> tax 0, payable 15,00,000)', () => {
  const result = computeTax('vehicle.ev', 1500000);
  assertEqual(result.taxAmount, 0, 'Tax amount');
  assertEqual(result.payable, 1500000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('Vector 15: Vehicle company (base 25,00,000 -> 20% = 5,00,000, payable 30,00,000)', () => {
  const result = computeTax('vehicle.company_or_import', 2500000);
  assertEqual(result.taxAmount, 500000, 'Tax amount');
  assertEqual(result.payable, 3000000, 'Payable');
  assertEqual(result.effect, 'add', 'Effect');
});

test('getDomainRules returns correct metadata for domain', () => {
  const gstRules = getDomainRules('gst');
  assertEqual(gstRules.domain, 'gst', 'GST domain');
  assertEqual(gstRules.ruleVersion, 'FY2026-27', 'GST rule version');
  assertEqual(gstRules.types.length, 2, 'GST types count');

  const incomeRules = getDomainRules('income');
  assertEqual(incomeRules.domain, 'income', 'Income domain');
  assertEqual(incomeRules.types.length, 5, 'Income types count');
});

test('Invalid tax type throws descriptive error', () => {
  let threw = false;
  try {
    computeTax('unknown.type', 1000);
  } catch (err: any) {
    threw = true;
    assertEqual(err.message.includes('Invalid tax type'), true, 'Error message content');
  }
  assertEqual(threw, true, 'Did throw on unknown type');
});


test('Mock Adapter: getDomains returns all 5 domains', async () => {
  const domains = await taxMock.getDomains();
  assertEqual(domains.length, 5, 'Domains length');
});

test('Mock Adapter: getRules returns rules for given domain', async () => {
  const rules = await taxMock.getRules('customs');
  assertEqual(rules.domain, 'customs', 'Rules domain');
  assertEqual(rules.types.length, 2, 'Customs rules count');
});

test('Mock Adapter: preview returns exact preview for GST intra 18%', async () => {
  const preview = await taxMock.preview({ taxType: 'gst.intra', baseAmount: 10000, taxInputs: { gstRate: 18 } });
  assertEqual(preview.taxAmount, 1800, 'Preview taxAmount');
  assertEqual(preview.payable, 11800, 'Preview payable');
});

test('Mock Adapter: Create group preserves tax domain', async () => {
  const res = await groupsMock.create({
    name: 'Auto Spare Hub',
    type: 'market',
    domain: 'vehicle',
  });
  assertEqual(res.group.domain, 'vehicle', 'Created group domain');
});

test('Mock Adapter: setGroupDomain locks group with existing debts', async () => {
  let threw = false;
  try {
    // grp-1 has debts from seed data
    await taxMock.setGroupDomain('grp-1', 'income');
  } catch (err: any) {
    threw = true;
    assertEqual(err.message.includes('DOMAIN_LOCKED'), true, 'Domain locked message');
  }
  assertEqual(threw, true, 'Threw DOMAIN_LOCKED for group with debts');
});

test('Mock Adapter: setGroupDomain allows setting domain on zero-debt none group', async () => {
  // Create a clean group with domain 'none' and no debts
  const cleanGrp = await groupsMock.create({
    name: 'Zero Debt Circle',
    type: 'friends',
    domain: 'none',
  });
  assertEqual(cleanGrp.group.domain, 'none', 'Initial domain');

  const updated = await taxMock.setGroupDomain(cleanGrp.group._id, 'property');
  assertEqual(updated.group.domain, 'property', 'Updated domain');

  // Second set should fail with DOMAIN_LOCKED
  let threwSecond = false;
  try {
    await taxMock.setGroupDomain(cleanGrp.group._id, 'income');
  } catch (err: any) {
    threwSecond = true;
  }
  assertEqual(threwSecond, true, 'Second domain change blocked');
});

export async function runTaxVectorTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  for (const t of tests) {
    await t.fn();
    passed++;
    console.log(`✔ ${t.name}`);
  }
  return { passed, total: tests.length };
}

// Auto-run if executed directly via Node
const proc = (globalThis as any).process;
if (typeof proc !== 'undefined' && proc.argv && proc.argv[1]?.includes('rulesMock.test')) {
  runTaxVectorTests().then(({ passed, total }) => { console.log(`\nAll ${passed}/${total} frontend tests passed successfully!`); }).catch(err => { console.error(err); (globalThis as any).process.exit(1); });
  
}
