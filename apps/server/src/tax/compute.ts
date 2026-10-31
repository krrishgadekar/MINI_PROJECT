import { AppError } from '../utils/errors';
import { TaxDomain, TaxPreviewResult } from './types';
import { TAX_RULES, TAX_RULE_VERSION, round2 } from './rules';

/**
 * Pure tax calculation and input validation engine (§2.1, §2.2 & §2.4).
 * Validates domain, taxType, inputs and base amount, and applies rounding rules.
 * No database access in this module.
 */
export function applyTax(
  domain: TaxDomain,
  taxType: string,
  baseAmount: number,
  taxInputs?: Record<string, any>,
): TaxPreviewResult {
  // Validate base amount: reject negative or non-finite numbers
  if (typeof baseAmount !== 'number' || !Number.isFinite(baseAmount) || baseAmount < 0) {
    throw new AppError(
      400,
      'VALIDATION',
      'baseAmount must be a non-negative finite number.',
    );
  }

  // Validate tax type belongs to domain
  const rule = TAX_RULES[taxType];
  if (!rule || rule.domain !== domain) {
    throw new AppError(
      400,
      'INVALID_TAX_TYPE',
      `Tax type '${taxType}' is invalid for domain '${domain}'.`,
    );
  }

  // Validate inputs against definition
  const sanitizedInputs: Record<string, any> = {};

  for (const inputDef of rule.inputs) {
    const rawVal = taxInputs?.[inputDef.name];

    if (inputDef.type === 'select') {
      if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
        const numVal =
          typeof rawVal === 'string' && !isNaN(Number(rawVal))
            ? Number(rawVal)
            : rawVal;

        const isValid = inputDef.options?.some(
          (opt) => opt === rawVal || opt === numVal,
        );

        if (!isValid) {
          throw new AppError(
            400,
            'VALIDATION',
            `Invalid option '${rawVal}' for input '${inputDef.name}'. Allowed options: ${inputDef.options?.join(', ')}`,
          );
        }

        sanitizedInputs[inputDef.name] = numVal;
      } else {
        sanitizedInputs[inputDef.name] = inputDef.default;
      }
    } else if (inputDef.type === 'number') {
      if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
        const num = Number(rawVal);
        if (!Number.isFinite(num) || num < 0) {
          throw new AppError(
            400,
            'VALIDATION',
            `Input '${inputDef.name}' must be a non-negative finite number.`,
          );
        }
        sanitizedInputs[inputDef.name] = num;
      } else {
        sanitizedInputs[inputDef.name] = inputDef.default ?? 0;
      }
    } else if (inputDef.type === 'boolean') {
      if (rawVal !== undefined && rawVal !== null) {
        sanitizedInputs[inputDef.name] = Boolean(rawVal);
      } else {
        sanitizedInputs[inputDef.name] = Boolean(inputDef.default);
      }
    }
  }

  const cleanBase = round2(baseAmount);
  const { taxAmount, taxRate, breakup } = rule.compute(cleanBase, sanitizedInputs);

  // Round every component half-up to 2 decimals, then sum/subtract
  const roundedTaxAmount = round2(taxAmount);
  const roundedBreakup = breakup.map((item) => ({
    label: item.label,
    ...(item.rate !== undefined && { rate: item.rate }),
    amount: round2(item.amount),
  }));

  const payable =
    rule.effect === 'add'
      ? round2(cleanBase + roundedTaxAmount)
      : round2(cleanBase - roundedTaxAmount);

  return {
    baseAmount: cleanBase,
    taxAmount: roundedTaxAmount,
    effect: rule.effect,
    payable,
    taxRate,
    breakup: roundedBreakup,
    legalRef: rule.legalRef,
    ruleVersion: TAX_RULE_VERSION,
  };
}

