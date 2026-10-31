export type TaxDomain = 'none' | 'income' | 'gst' | 'customs' | 'property' | 'vehicle';

export type TaxInputType = 'select' | 'number' | 'boolean';

export interface TaxInputDef {
  name: string;
  label: string;
  type: TaxInputType;
  options?: (number | string)[];
  default?: number | string | boolean;
}

export interface TaxTypeDef {
  key: string;
  label: string;
  effect: 'add' | 'deduct';
  note: string;
  legalRef: string;
  inputs: TaxInputDef[];
}

export interface TaxBreakupItem {
  label: string;
  rate?: number;
  amount: number;
}

export interface TaxRuleDefinition extends TaxTypeDef {
  domain: TaxDomain;
  compute: (
    base: number,
    inputs?: Record<string, any>,
  ) => {
    taxAmount: number;
    taxRate: number;
    breakup: TaxBreakupItem[];
  };
}

export interface TaxPreviewResult {
  baseAmount: number;
  taxAmount: number;
  effect: 'add' | 'deduct';
  payable: number;
  taxRate: number;
  breakup: TaxBreakupItem[];
  legalRef: string;
  ruleVersion: string;
}

export interface TaxDomainItem {
  key: TaxDomain;
  label: string;
  description: string;
}

export interface TaxRulesResponse {
  domain: TaxDomain;
  ruleVersion: string;
  types: TaxTypeDef[];
}

export interface TaxSummaryTotalItem {
  taxType: string;
  label: string;
  count: number;
  baseTotal: number;
  taxTotal: number;
  effect: 'add' | 'deduct';
}

export interface TaxSummaryResponse {
  domain: TaxDomain;
  totals: TaxSummaryTotalItem[];
  grandBase: number;
  grandTax: number;
  grandPayable: number;
}

