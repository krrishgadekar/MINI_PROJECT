/**
 * api/mock/taxSummary.mock.ts — Mock for Tax Summary Endpoint (§2.2, D3 §5)
 */

import type { TaxSummary, TaxSummaryTotalItem, TaxDomain } from '../../types/index.ts';
import { mockDebts } from './debts.mock.ts';
import { mockGroups } from './groups.mock.ts';

export const getTaxSummaryMock = (groupId?: string): TaxSummary => {
  const group = mockGroups.find((g) => (groupId ? g._id === groupId : true));
  const domain = (group?.domain || 'none') as TaxDomain;

  if (domain === 'none') {
    return {
      domain: 'none',
      totals: [],
      grandBase: 0,
      grandTax: 0,
      grandPayable: 0,
    };
  }

  // Active debts with taxType, excluding settled and cancelled
  const debts = mockDebts.filter(
    (d) =>
      Boolean(d.taxType) &&
      d.status !== 'settled' &&
      d.status !== 'cancelled' &&
      (!groupId || d.groupId === groupId)
  );

  const totalsMap = new Map<string, TaxSummaryTotalItem>();
  let grandBase = 0;
  let grandTax = 0;
  let grandPayable = 0;

  for (const d of debts) {
    const taxType = d.taxType!;
    const base = d.baseAmount ?? d.amount;
    const tax = d.taxAmount ?? 0;
    const payable = d.amount;
    const effect = (d.taxEffect || 'add') as 'add' | 'deduct';

    grandBase += base;
    grandTax += tax;
    grandPayable += payable;

    const existing = totalsMap.get(taxType);
    if (existing) {
      existing.count += 1;
      existing.baseTotal += base;
      existing.taxTotal += tax;
    } else {
      totalsMap.set(taxType, {
        taxType,
        label: taxType.toUpperCase(),
        count: 1,
        baseTotal: base,
        taxTotal: tax,
        effect,
      });
    }
  }

  // If no debts in mock yet, return representative mock totals for demonstration
  if (totalsMap.size === 0 && domain === 'gst') {
    return {
      domain: 'gst',
      totals: [
        {
          taxType: 'gst.intra',
          label: 'GST INTRA (18%)',
          count: 1,
          baseTotal: 10000,
          taxTotal: 1800,
          effect: 'add',
        },
        {
          taxType: 'gst.inter',
          label: 'GST INTER (5%)',
          count: 1,
          baseTotal: 20000,
          taxTotal: 1000,
          effect: 'add',
        },
      ],
      grandBase: 30000,
      grandTax: 2800,
      grandPayable: 32800,
    };
  }

  return {
    domain,
    totals: Array.from(totalsMap.values()),
    grandBase,
    grandTax,
    grandPayable,
  };
};
