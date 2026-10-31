/**
 * api/mock/tax.mock.ts — Mock Implementation for Tax Domain (§2.2, D3 §5)
 *
 * Implements:
 *   - getDomains(): returns the 5 domains
 *   - getRules(domain): returns rules for given domain
 *   - preview(data): calls computeTax
 *   - setGroupDomain(groupId, domain): locks domain on groups with debts or already set
 *   - summary(): returns tax summary using taxSummaryMock
 */

import type {
  TaxDomain,
  TaxRulesResponse,
  TaxPreview,
  TaxSummary,
} from '../../types';
import type {
  TaxDomainItem,
  TaxPreviewRequest,
  GroupResponse,
} from '../contract';
import {
  TAX_DOMAINS,
  getDomainRules,
  computeTax,
} from '../../tax/rulesMock.ts';
import { mockGroups } from './groups.mock.ts';
import { mockDebts } from './debts.mock.ts';
import { getTaxSummaryMock } from './taxSummary.mock.ts';

export const taxMock = {
  getDomains: async (): Promise<TaxDomainItem[]> => {
    return [...TAX_DOMAINS];
  },

  getRules: async (domain?: TaxDomain): Promise<TaxRulesResponse> => {
    return getDomainRules(domain);
  },

  preview: async (data: TaxPreviewRequest): Promise<TaxPreview> => {
    return computeTax(data.taxType, data.baseAmount, data.taxInputs);
  },

  setGroupDomain: async (groupId: string, domain: TaxDomain): Promise<GroupResponse> => {
    const group = mockGroups.find((g) => g._id === groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    // 409 if domain is already set and not 'none'
    if (group.domain && group.domain !== 'none') {
      const err = new Error('DOMAIN_LOCKED: Tax domain has already been configured for this group.');
      (err as any).code = 'DOMAIN_LOCKED';
      (err as any).status = 409;
      throw err;
    }

    // 409 DOMAIN_LOCKED if the group already has debts
    const hasDebts = mockDebts.some((d) => d.groupId === groupId);
    if (hasDebts) {
      const err = new Error('DOMAIN_LOCKED: Cannot modify tax domain on a group with existing debts.');
      (err as any).code = 'DOMAIN_LOCKED';
      (err as any).status = 409;
      throw err;
    }

    group.domain = domain;
    return {
      success: true,
      group: { ...group },
    };
  },

  summary: async (): Promise<TaxSummary> => {
    return getTaxSummaryMock();
  },
};
