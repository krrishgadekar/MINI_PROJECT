/**
 * tax/rulesMock.ts — Frontend Tax Rules & Mock Computation Engine (§2.3 & §2.4)
 *
 * Implements:
 *   - 5 Domains: income, gst, customs, property, vehicle (+ none)
 *   - Rates as of October 2026 (Maharashtra state rates)
 *   - Pure TypeScript computeTax(typeKey, base, inputs) with half-up 2-decimal rounding
 *   - Verifiable against exact Section 2.4 hand-computed test vectors
 */

import type {
  TaxDomain,
  TaxTypeDef,
  TaxRulesResponse,
  TaxPreview,
  TaxBreakupItem,
} from '../types';
import type { TaxDomainItem } from '../api/contract';

export const TAX_RULE_VERSION = 'FY2026-27';

/**
 * Standard half-up rounding to 2 decimal places (§2.1).
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export const TAX_DOMAINS: TaxDomainItem[] = [
  {
    key: 'income',
    label: 'Income Tax (TDS)',
    description: 'Tax Deducted at Source under Income-tax Act 2025 on contracts, professional fees and brokerage.',
  },
  {
    key: 'gst',
    label: 'Goods & Services Tax (GST)',
    description: 'Intra-state (CGST + SGST) and inter-state (IGST) standard tax slabs (0%, 5%, 18%, 40%).',
  },
  {
    key: 'customs',
    label: 'Customs (Import & Export)',
    description: 'Customs duty on imports (BCD + SWS + IGST) and export tariff lines with zero-rated IGST.',
  },
  {
    key: 'property',
    label: 'Property & Stamp Duty',
    description: 'Maharashtra Stamp Duty (Mumbai & rest of MH with woman buyer concession) and capped registration fee.',
  },
  {
    key: 'vehicle',
    label: 'Motor Vehicle Tax',
    description: 'Maharashtra one-time road tax slabs across Petrol, Diesel, CNG, EV (exempt) and corporate registrations.',
  },
];

export interface TaxRuleDefinition extends TaxTypeDef {
  domain: TaxDomain;
  compute: (base: number, inputs?: Record<string, any>) => {
    taxAmount: number;
    taxRate: number;
    breakup: TaxBreakupItem[];
  };
}

export const TAX_RULES: Record<string, TaxRuleDefinition> = {
  // ── INCOME DOMAIN (TDS) ────────────────────────────────────────────────────
  'income.tds_contractor_individual': {
    domain: 'income',
    key: 'income.tds_contractor_individual',
    label: 'TDS u/s 393 — Contractor (Individual / HUF)',
    effect: 'deduct',
    legalRef: 'Income-tax Act 2025, s.393 (earlier 194C) contractor, individual or HUF payer',
    note: '1% deduction on contractor or sub-contractor payments to individuals or HUFs.',
    inputs: [],
    compute: (base: number) => {
      const taxAmount = round2(base * 0.01);
      return {
        taxAmount,
        taxRate: 1,
        breakup: [{ label: 'TDS u/s 393 (194C) Individual/HUF (1%)', rate: 1, amount: taxAmount }],
      };
    },
  },
  'income.tds_contractor_other': {
    domain: 'income',
    key: 'income.tds_contractor_other',
    label: 'TDS u/s 393 — Contractor (Company / Other)',
    effect: 'deduct',
    legalRef: 'same, other payers',
    note: '2% deduction on contractor payments to corporate and non-individual payers.',
    inputs: [],
    compute: (base: number) => {
      const taxAmount = round2(base * 0.02);
      return {
        taxAmount,
        taxRate: 2,
        breakup: [{ label: 'TDS u/s 393 (194C) Corporate/Other (2%)', rate: 2, amount: taxAmount }],
      };
    },
  },
  'income.tds_professional': {
    domain: 'income',
    key: 'income.tds_professional',
    label: 'TDS u/s 393 — Professional Fees',
    effect: 'deduct',
    legalRef: 's.393 (earlier 194J) professional fees',
    note: '10% deduction on professional, consultancy, or architectural services.',
    inputs: [],
    compute: (base: number) => {
      const taxAmount = round2(base * 0.1);
      return {
        taxAmount,
        taxRate: 10,
        breakup: [{ label: 'TDS u/s 393 (194J) Professional Fees (10%)', rate: 10, amount: taxAmount }],
      };
    },
  },
  'income.tds_technical': {
    domain: 'income',
    key: 'income.tds_technical',
    label: 'TDS u/s 393 — Technical Services',
    effect: 'deduct',
    legalRef: 's.393 (earlier 194J) technical services',
    note: '2% deduction on fees for technical services (FTS).',
    inputs: [],
    compute: (base: number) => {
      const taxAmount = round2(base * 0.02);
      return {
        taxAmount,
        taxRate: 2,
        breakup: [{ label: 'TDS u/s 393 (194J) Technical Services (2%)', rate: 2, amount: taxAmount }],
      };
    },
  },
  'income.tds_commission': {
    domain: 'income',
    key: 'income.tds_commission',
    label: 'TDS u/s 393 — Commission / Brokerage',
    effect: 'deduct',
    legalRef: 's.393 (earlier 194H) commission or brokerage',
    note: '2% deduction on commission or brokerage fees.',
    inputs: [],
    compute: (base: number) => {
      const taxAmount = round2(base * 0.02);
      return {
        taxAmount,
        taxRate: 2,
        breakup: [{ label: 'TDS u/s 393 (194H) Commission/Brokerage (2%)', rate: 2, amount: taxAmount }],
      };
    },
  },

  // ── GST DOMAIN ─────────────────────────────────────────────────────────────
  'gst.intra': {
    domain: 'gst',
    key: 'gst.intra',
    label: 'Intra-State GST (CGST + SGST)',
    effect: 'add',
    legalRef: 'CGST/SGST Acts; GST Council 56th meeting, rates from 22 Sep 2025 (5%, 18%, 40% and nil)',
    note: 'Tax split equally into Central GST (rate/2) and State GST (rate/2).',
    inputs: [
      {
        name: 'gstRate',
        label: 'GST Slab Rate (%)',
        type: 'select',
        options: [0, 5, 18, 40],
        default: 18,
      },
    ],
    compute: (base: number, inputs?: Record<string, any>) => {
      const rawRate = Number(inputs?.gstRate ?? 18);
      const halfRate = rawRate / 2;
      const cgst = round2(base * (halfRate / 100));
      const sgst = round2(base * (halfRate / 100));
      const taxAmount = round2(cgst + sgst);
      return {
        taxAmount,
        taxRate: rawRate,
        breakup: [
          { label: 'CGST', rate: halfRate, amount: cgst },
          { label: 'SGST', rate: halfRate, amount: sgst },
        ],
      };
    },
  },
  'gst.inter': {
    domain: 'gst',
    key: 'gst.inter',
    label: 'Inter-State GST (IGST)',
    effect: 'add',
    legalRef: 'IGST Act; same rates',
    note: 'Integrated GST on inter-state commercial supplies.',
    inputs: [
      {
        name: 'gstRate',
        label: 'GST Slab Rate (%)',
        type: 'select',
        options: [0, 5, 18, 40],
        default: 18,
      },
    ],
    compute: (base: number, inputs?: Record<string, any>) => {
      const rawRate = Number(inputs?.gstRate ?? 18);
      const igst = round2(base * (rawRate / 100));
      return {
        taxAmount: igst,
        taxRate: rawRate,
        breakup: [{ label: 'IGST', rate: rawRate, amount: igst }],
      };
    },
  },

  // ── CUSTOMS DOMAIN ─────────────────────────────────────────────────────────
  'customs.import': {
    domain: 'customs',
    key: 'customs.import',
    label: 'Customs Import (BCD + SWS + IGST)',
    effect: 'add',
    legalRef:
      'Customs Tariff Act 1975; Finance Act 2018 (SWS 10% of BCD); IGST on imports; base = CIF value',
    note: 'BCD = base × bcdRate; SWS = 10% of BCD; IGST = (base + BCD + SWS) × igstRate; tax = BCD + SWS + IGST.',
    inputs: [
      {
        name: 'bcdRate',
        label: 'Basic Customs Duty Rate (%)',
        type: 'select',
        options: [0, 5, 7.5, 10, 15, 20],
        default: 7.5,
      },
      {
        name: 'igstRate',
        label: 'IGST Import Rate (%)',
        type: 'select',
        options: [0, 5, 18, 40],
        default: 18,
      },
    ],
    compute: (base: number, inputs?: Record<string, any>) => {
      const bcdRate = Number(inputs?.bcdRate ?? 7.5);
      const igstRate = Number(inputs?.igstRate ?? 18);

      const bcd = round2(base * (bcdRate / 100));
      const sws = round2(bcd * 0.1);
      const igstBase = base + bcd + sws;
      const igst = round2(igstBase * (igstRate / 100));
      const taxAmount = round2(bcd + sws + igst);
      const effectiveRate = base > 0 ? round2((taxAmount / base) * 100) : 0;

      return {
        taxAmount,
        taxRate: effectiveRate,
        breakup: [
          { label: 'Basic Customs Duty (BCD)', rate: bcdRate, amount: bcd },
          { label: 'Social Welfare Surcharge (SWS 10%)', rate: 10, amount: sws },
          { label: 'Integrated GST on Import', rate: igstRate, amount: igst },
        ],
      };
    },
  },
  'customs.export': {
    domain: 'customs',
    key: 'customs.export',
    label: 'Customs Export Duty',
    effect: 'add',
    legalRef:
      'Customs Act 1962, export duty only on notified goods; exports are zero-rated under IGST',
    note: 'Export duty = base × exportDutyRate (default 0); exports are zero-rated under IGST.',
    inputs: [
      {
        name: 'exportDutyRate',
        label: 'Export Duty Rate (%)',
        type: 'number',
        default: 0,
      },
    ],
    compute: (base: number, inputs?: Record<string, any>) => {
      const dutyRate = Number(inputs?.exportDutyRate ?? 0);
      const exportDuty = round2(base * (dutyRate / 100));
      return {
        taxAmount: exportDuty,
        taxRate: dutyRate,
        breakup: [
          { label: 'Export Duty', rate: dutyRate, amount: exportDuty },
          { label: 'IGST (Export Zero-Rated)', rate: 0, amount: 0 },
        ],
      };
    },
  },

  // ── PROPERTY DOMAIN ────────────────────────────────────────────────────────
  'property.stamp_mumbai': {
    domain: 'property',
    key: 'property.stamp_mumbai',
    label: 'Stamp Duty — Mumbai (City & Suburban)',
    effect: 'add',
    legalRef: 'Maharashtra Stamp Act; Mumbai rates',
    note: '6% (5% duty + 1% metro cess); 5% if woman purchaser.',
    inputs: [
      {
        name: 'womanBuyer',
        label: 'Purchaser is a Woman (1% Stamp Duty Concession)',
        type: 'boolean',
        default: false,
      },
    ],
    compute: (base: number, inputs?: Record<string, any>) => {
      const isWoman = Boolean(inputs?.womanBuyer);
      const dutyRate = isWoman ? 4 : 5;
      const cessRate = 1;
      const dutyAmount = round2(base * (dutyRate / 100));
      const cessAmount = round2(base * (cessRate / 100));
      const taxAmount = round2(dutyAmount + cessAmount);
      const totalRate = isWoman ? 5 : 6;

      return {
        taxAmount,
        taxRate: totalRate,
        breakup: [
          {
            label: isWoman
              ? 'Stamp Duty (Mumbai - Woman Concession)'
              : 'Stamp Duty (Mumbai)',
            rate: dutyRate,
            amount: dutyAmount,
          },
          { label: 'Metro Cess', rate: cessRate, amount: cessAmount },
        ],
      };
    },
  },
  'property.stamp_other_mh': {
    domain: 'property',
    key: 'property.stamp_other_mh',
    label: 'Stamp Duty — Rest of Maharashtra (Pune, Thane, Nagpur, etc.)',
    effect: 'add',
    legalRef: 'Maharashtra Stamp Act',
    note: '7%; 6% if woman purchaser (includes metro cess + local body tax).',
    inputs: [
      {
        name: 'womanBuyer',
        label: 'Purchaser is a Woman (1% Concession)',
        type: 'boolean',
        default: false,
      },
    ],
    compute: (base: number, inputs?: Record<string, any>) => {
      const isWoman = Boolean(inputs?.womanBuyer);
      const totalRate = isWoman ? 6 : 7;
      const taxAmount = round2(base * (totalRate / 100));
      return {
        taxAmount,
        taxRate: totalRate,
        breakup: [
          {
            label: isWoman
              ? 'Stamp Duty (Other MH - Woman Concession)'
              : 'Stamp Duty (Other MH)',
            rate: totalRate,
            amount: taxAmount,
          },
        ],
      };
    },
  },
  'property.registration': {
    domain: 'property',
    key: 'property.registration',
    label: 'Registration Fee — Maharashtra',
    effect: 'add',
    legalRef: 'Maharashtra registration fee, cap 30,000 for values above 30 lakh',
    note: '1% of agreement value, capped at ₹30,000.',
    inputs: [],
    compute: (base: number) => {
      const rawFee = round2(base * 0.01);
      const taxAmount = Math.min(rawFee, 30000);
      const effectiveRate = base > 0 ? round2((taxAmount / base) * 100) : 1;
      return {
        taxAmount,
        taxRate: effectiveRate,
        breakup: [
          {
            label: 'Registration Fee (1% capped at ₹30,000)',
            rate: effectiveRate,
            amount: taxAmount,
          },
        ],
      };
    },
  },

  // ── VEHICLE DOMAIN ─────────────────────────────────────────────────────────
  'vehicle.petrol': {
    domain: 'vehicle',
    key: 'vehicle.petrol',
    label: 'One-Time Tax — Petrol Vehicle',
    effect: 'add',
    legalRef:
      'Maharashtra Motor Vehicles Tax Act 1958, one-time tax, non-transport petrol cars',
    note: 'Slabs: up to 10L = 11%, 10L to 20L = 12%, above 20L = 13%.',
    inputs: [],
    compute: (base: number) => {
      const rate = base <= 1000000 ? 11 : base <= 2000000 ? 12 : 13;
      const taxAmount = round2(base * (rate / 100));
      return {
        taxAmount,
        taxRate: rate,
        breakup: [{ label: `Motor Vehicle Tax — Petrol (${rate}%)`, rate, amount: taxAmount }],
      };
    },
  },
  'vehicle.diesel': {
    domain: 'vehicle',
    key: 'vehicle.diesel',
    label: 'One-Time Tax — Diesel Vehicle',
    effect: 'add',
    legalRef: 'same',
    note: 'Slabs: up to 10L = 13%, 10L to 20L = 14%, above 20L = 15%.',
    inputs: [],
    compute: (base: number) => {
      const rate = base <= 1000000 ? 13 : base <= 2000000 ? 14 : 15;
      const taxAmount = round2(base * (rate / 100));
      return {
        taxAmount,
        taxRate: rate,
        breakup: [{ label: `Motor Vehicle Tax — Diesel (${rate}%)`, rate, amount: taxAmount }],
      };
    },
  },
  'vehicle.cng': {
    domain: 'vehicle',
    key: 'vehicle.cng',
    label: 'One-Time Tax — CNG / LPG Vehicle',
    effect: 'add',
    legalRef: 'same (CNG/LNG +1% from 1 Jul 2025)',
    note: 'Slabs: up to 10L = 12%, 10L to 20L = 13%, above 20L = 14%.',
    inputs: [],
    compute: (base: number) => {
      const rate = base <= 1000000 ? 12 : base <= 2000000 ? 13 : 14;
      const taxAmount = round2(base * (rate / 100));
      return {
        taxAmount,
        taxRate: rate,
        breakup: [{ label: `Motor Vehicle Tax — CNG (${rate}%)`, rate, amount: taxAmount }],
      };
    },
  },
  'vehicle.ev': {
    domain: 'vehicle',
    key: 'vehicle.ev',
    label: 'One-Time Tax — Electric Vehicle (EV)',
    effect: 'add',
    legalRef: 'same (EVs exempt)',
    note: '0% road tax (Exempt under Maharashtra EV Policy).',
    inputs: [],
    compute: () => {
      return {
        taxAmount: 0,
        taxRate: 0,
        breakup: [{ label: 'Motor Vehicle Tax — EV Exemption (0%)', rate: 0, amount: 0 }],
      };
    },
  },
  'vehicle.company_or_import': {
    domain: 'vehicle',
    key: 'vehicle.company_or_import',
    label: 'One-Time Tax — Company-Registered or Imported Vehicle',
    effect: 'add',
    legalRef: 'same (company-registered or imported, petrol or diesel)',
    note: 'Flat 20% on all valuations for company-registered or imported vehicles.',
    inputs: [],
    compute: (base: number) => {
      const taxAmount = round2(base * 0.2);
      return {
        taxAmount,
        taxRate: 20,
        breakup: [
          {
            label: 'Motor Vehicle Tax — Company / Imported (20%)',
            rate: 20,
            amount: taxAmount,
          },
        ],
      };
    },
  },
};

/**
 * Returns tax rules for a domain (§2.2).
 */
export function getDomainRules(domain?: TaxDomain): TaxRulesResponse {
  const activeDomain = domain && domain !== 'none' ? domain : 'gst';
  const types = Object.values(TAX_RULES)
    .filter((r) => r.domain === activeDomain)
    .map(({ key, label, effect, note, legalRef, inputs }) => ({
      key,
      label,
      effect,
      note,
      legalRef,
      inputs,
    }));

  return {
    domain: activeDomain,
    ruleVersion: TAX_RULE_VERSION,
    types,
  };
}

/**
 * Computes exact tax and payable for a transaction (§2.1 & §2.4).
 * Used by the mock preview adapter.
 */
export function computeTax(
  typeKey: string,
  base: number,
  inputs?: Record<string, any>
): TaxPreview {
  const rule = TAX_RULES[typeKey];
  if (!rule) {
    throw new Error(`Invalid tax type: "${typeKey}"`);
  }

  const cleanBase = Math.max(0, round2(base));
  const { taxAmount, taxRate, breakup } = rule.compute(cleanBase, inputs);

  const payable =
    rule.effect === 'add'
      ? round2(cleanBase + taxAmount)
      : round2(cleanBase - taxAmount);

  return {
    baseAmount: cleanBase,
    taxAmount,
    effect: rule.effect,
    payable,
    taxRate,
    breakup,
    legalRef: rule.legalRef,
    ruleVersion: TAX_RULE_VERSION,
  };
}
