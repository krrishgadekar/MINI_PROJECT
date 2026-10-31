/**
 * components/tax/TaxBreakupCard.tsx — Transaction Page Tax Breakup Card (§3)
 *
 * Displays:
 *   - Tax type & legal reference
 *   - Rule version (FY2026-27)
 *   - Each breakup line (label, rate, amount)
 *   - Effect (added vs deducted)
 *   - Base amount, Tax amount, and Payable amount
 *   - 'Edit tax' action button if the debt is editable (no payments recorded yet)
 */

import React from 'react';
import type { Debt } from '../../types';
import { TAX_RULES } from '../../tax/rulesMock';
import { FileText, Edit2 } from 'lucide-react';

export interface TaxBreakupCardProps {
  debt: Debt;
  isEditable?: boolean;
  onEditTax?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const TaxBreakupCard: React.FC<TaxBreakupCardProps> = ({
  debt,
  isEditable = false,
  onEditTax,
  className = '',
  style = {},
}) => {
  const taxTypeKey = debt.taxType;
  const ruleDef = taxTypeKey ? TAX_RULES[taxTypeKey] : null;
  const ruleVersion = debt.taxRuleVersion || 'FY2026-27';
  const legalRef = ruleDef?.legalRef || (debt as any).legalRef || 'Indian Tax Statute (Oct 2026)';
  const effect = debt.taxEffect || ruleDef?.effect || 'add';
  const isDeduct = effect === 'deduct';
  const effectColor = isDeduct ? '#10b981' : '#3b82f6';

  const baseAmount = debt.baseAmount ?? debt.amount;
  const taxAmount = debt.taxAmount ?? 0;
  const payable = debt.amount;
  const breakup = debt.taxBreakup || [];

  return (
    <div
      className={`card ${className}`}
      data-testid="tax-breakup-card"
      style={{
        padding: 22,
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.1))',
        borderRadius: 'var(--border-radius-md, 10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        ...style,
      }}
    >
      {/* Header with Title, Badge, Version and Edit Action */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          borderBottom: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.08))',
          paddingBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={18} color="var(--accent-light, #60a5fa)" />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tax Breakup</h3>
          {taxTypeKey && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
                background: isDeduct ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                color: isDeduct ? '#10b981' : '#3b82f6',
                border: `1px solid ${isDeduct ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                textTransform: 'uppercase',
              }}
            >
              {taxTypeKey}
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted, #94a3b8)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            {ruleVersion}
          </span>
        </div>

        {isEditable && onEditTax && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onEditTax}
            id="edit-tax-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <Edit2 size={13} />
            Edit Tax
          </button>
        )}
      </div>

      {/* Breakup Summary Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          background: 'var(--bg-tertiary, rgba(0, 0, 0, 0.2))',
          padding: '12px 16px',
          borderRadius: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>
            Base Amount
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3 }}>
            ₹{baseAmount.toLocaleString('en-IN')}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>
            Total Tax ({isDeduct ? 'Deducted' : 'Added'})
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, color: effectColor }}>
            {isDeduct ? '-' : '+'}₹{taxAmount.toLocaleString('en-IN')}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>
            Payable (Net)
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: 'var(--accent-light, #60a5fa)' }}>
            ₹{payable.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Breakup Line Items Table / List */}
      {breakup.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #cbd5e1)' }}>
            Detailed Breakup Lines:
          </div>
          <div
            style={{
              border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.08))',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {breakup.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                  fontSize: 13,
                  borderBottom:
                    idx < breakup.length - 1
                      ? '1px solid var(--border-secondary, rgba(255, 255, 255, 0.05))'
                      : 'none',
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{item.label}</span>
                  {item.rate !== undefined && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', marginLeft: 8 }}>
                      ({item.rate}%)
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>
                  ₹{item.amount.toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legal Reference Note */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted, #94a3b8)',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '8px 12px',
          borderRadius: 6,
          lineHeight: 1.45,
          fontStyle: 'italic',
        }}
      >
        <strong>Legal Reference:</strong> {legalRef} — Effective under CreditFlow {ruleVersion} rules table.
        Rates as of October 2026.
      </div>
    </div>
  );
};

export default TaxBreakupCard;
