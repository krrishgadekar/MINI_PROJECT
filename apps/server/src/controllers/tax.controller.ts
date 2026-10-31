import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { GroupRequest } from '../middleware/group.middleware';
import { Debt } from '../models/Debt';
import { AppError } from '../utils/errors';
import {
  TaxDomain,
  TAX_DOMAINS,
  TAX_RULES,
  TAX_RULE_VERSION,
  applyTax,
  round2,
} from '../tax';

/**
 * GET /api/tax/domains (§2.2)
 * Returns all configured tax domains and descriptions.
 */
export const getTaxDomains = async (
  _req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    res.json(TAX_DOMAINS);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tax/rules (§2.2)
 * Query param: ?domain=gst (defaults to the active group's domain).
 */
export const getTaxRules = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const rawDomain = (req.query.domain as string | undefined)?.trim();
    const activeDomain = (rawDomain || req.group?.domain || 'none') as TaxDomain;

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

    res.json({
      domain: activeDomain,
      ruleVersion: TAX_RULE_VERSION,
      types,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tax/preview (§2.2)
 * Body: { taxType, baseAmount, taxInputs }
 * Uses the active group's domain. No DB write.
 */
export const previewTax = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupDomain = (req.group?.domain || 'none') as TaxDomain;
    const { taxType, baseAmount, taxInputs } = req.body;

    if (!taxType || typeof taxType !== 'string') {
      throw new AppError(400, 'VALIDATION', 'taxType is required for preview.');
    }

    if (baseAmount === undefined || typeof baseAmount !== 'number') {
      throw new AppError(400, 'VALIDATION', 'baseAmount is required for preview.');
    }

    const preview = applyTax(groupDomain, taxType, baseAmount, taxInputs);
    res.json(preview);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tax/summary (§2.2)
 * Returns tax totals broken down by taxType and grand totals.
 * Admin/Owner: whole group. Member: only own debts (debtor or creditor).
 */
export const getTaxSummary = async (
  req: GroupRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupId = req.groupId;
    const groupDomain = (req.group?.domain || 'none') as TaxDomain;
    const role = req.role ?? 'member';

    if (!groupId) {
      throw new AppError(403, 'FORBIDDEN_GROUP', 'Group context required.');
    }

    if (groupDomain === 'none') {
      res.json({
        domain: 'none',
        totals: [],
        grandBase: 0,
        grandTax: 0,
        grandPayable: 0,
      });
      return;
    }

    const query: Record<string, any> = {
      groupId: new mongoose.Types.ObjectId(groupId),
      taxType: { $exists: true, $ne: null },
      status: { $ne: 'cancelled' },
    };

    if (role === 'member') {
      const merchantId = req.merchant!._id;
      query.$or = [{ debtorId: merchantId }, { creditorId: merchantId }];
    }

    const debts = await Debt.find(query);

    const totalsMap = new Map<
      string,
      {
        taxType: string;
        label: string;
        count: number;
        baseTotal: number;
        taxTotal: number;
        effect: 'add' | 'deduct';
      }
    >();

    let grandBase = 0;
    let grandTax = 0;
    let grandPayable = 0;

    for (const d of debts) {
      const rule = TAX_RULES[d.taxType!];
      const effect = (d.taxEffect || rule?.effect || 'add') as 'add' | 'deduct';
      const label = rule?.label || d.taxType!;
      const base = d.baseAmount ?? d.amount;
      const tax = d.taxAmount ?? 0;
      const payable = d.amount;

      grandBase = round2(grandBase + base);
      grandTax = round2(grandTax + tax);
      grandPayable = round2(grandPayable + payable);

      const existing = totalsMap.get(d.taxType!);
      if (existing) {
        existing.count += 1;
        existing.baseTotal = round2(existing.baseTotal + base);
        existing.taxTotal = round2(existing.taxTotal + tax);
      } else {
        totalsMap.set(d.taxType!, {
          taxType: d.taxType!,
          label,
          count: 1,
          baseTotal: round2(base),
          taxTotal: round2(tax),
          effect,
        });
      }
    }

    res.json({
      domain: groupDomain,
      totals: Array.from(totalsMap.values()),
      grandBase: round2(grandBase),
      grandTax: round2(grandTax),
      grandPayable: round2(grandPayable),
    });
  } catch (error) {
    next(error);
  }
};

