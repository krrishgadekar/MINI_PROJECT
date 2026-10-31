/**
 * components/tax/TaxPreviewBox.tsx — Live Tax Calculation Preview Component (§1)
 *
 * Displays:
 *   - Base amount
 *   - Each breakup line with rate and amount
 *   - Total tax (with + or - effect)
 *   - Final payable amount in bold
 *   - Legal reference and rule version
 *
 * Implemented with React.createElement to support both browser/Vite bundlers
 * and direct node --experimental-strip-types execution in unit/component test suites.
 */

import React from 'react';
import type { TaxPreview } from '../../types';

export interface TaxPreviewBoxProps {
  preview?: TaxPreview | null;
  isLoading?: boolean;
  error?: Error | null;
  className?: string;
  style?: React.CSSProperties;
}

export const TaxPreviewBox: React.FC<TaxPreviewBoxProps> = ({
  preview,
  isLoading = false,
  error = null,
  className = '',
  style = {},
}) => {
  if (isLoading) {
    return React.createElement(
      'div',
      {
        'data-testid': 'tax-preview-loading',
        className: `tax-preview-loading ${className}`,
        style: {
          padding: '14px 16px',
          background: 'rgba(59, 130, 246, 0.05)',
          border: '1px dashed rgba(59, 130, 246, 0.3)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-muted, #94a3b8)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          ...style,
        },
      },
      React.createElement(
        'span',
        {
          style: {
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid #3b82f6',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          },
        }
      ),
      'Computing tax preview (debounced 300ms)...'
    );
  }

  if (error) {
    return React.createElement(
      'div',
      {
        'data-testid': 'tax-preview-error',
        className: `tax-preview-error ${className}`,
        style: {
          padding: '12px 14px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          fontSize: 12,
          color: '#ef4444',
          ...style,
        },
      },
      `Tax calculation error: ${error.message || 'Unable to compute tax preview.'}`
    );
  }

  if (!preview) {
    return null;
  }

  const isDeduct = preview.effect === 'deduct';
  const effectColor = isDeduct ? '#10b981' : '#3b82f6';
  const effectLabel = isDeduct ? 'Deducted from base (TDS)' : 'Added to base';
  const sign = isDeduct ? '-' : '+';

  return React.createElement(
    'div',
    {
      'data-testid': 'tax-preview-box',
      className: `tax-preview-box ${className}`,
      style: {
        padding: '14px 16px',
        background: 'var(--bg-tertiary, #1e293b)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontSize: 13,
        ...style,
      },
    },
    // Header
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: 8,
        },
      },
      React.createElement(
        'span',
        { style: { fontWeight: 700, color: 'var(--text-primary, #f8fafc)', fontSize: 13 } },
        'Live Tax Preview'
      ),
      React.createElement(
        'span',
        {
          style: {
            fontSize: 11,
            color: 'var(--text-muted, #94a3b8)',
            background: 'rgba(255, 255, 255, 0.05)',
            padding: '2px 6px',
            borderRadius: 4,
          },
        },
        'Estimate based on rates as of Oct 2026'
      )
    ),

    // Base Amount Row
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--text-secondary, #cbd5e1)',
        },
      },
      React.createElement('span', null, 'Base Amount:'),
      React.createElement(
        'span',
        { style: { fontWeight: 600 } },
        `₹${preview.baseAmount.toLocaleString('en-IN')}`
      )
    ),

    // Breakup Items
    preview.breakup && preview.breakup.length > 0
      ? React.createElement(
          'div',
          {
            'data-testid': 'tax-breakup-list',
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '6px 10px',
              background: 'rgba(0, 0, 0, 0.15)',
              borderRadius: 6,
            },
          },
          ...preview.breakup.map((item, idx) =>
            React.createElement(
              'div',
              {
                key: `breakup-${idx}`,
                'data-testid': 'tax-breakup-line',
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: 'var(--text-muted, #94a3b8)',
                },
              },
              React.createElement(
                'span',
                null,
                item.label + (item.rate !== undefined ? ` (${item.rate}%)` : '')
              ),
              React.createElement(
                'span',
                { style: { fontWeight: 500, color: 'var(--text-secondary, #cbd5e1)' } },
                `₹${item.amount.toLocaleString('en-IN')}`
              )
            )
          )
        )
      : null,

    // Total Tax Row
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: effectColor,
          fontWeight: 600,
        },
      },
      React.createElement(
        'span',
        { style: { fontSize: 12 } },
        `Total Tax (${effectLabel}):`
      ),
      React.createElement(
        'span',
        { 'data-testid': 'tax-total-amount' },
        `${sign}₹${preview.taxAmount.toLocaleString('en-IN')}`
      )
    ),

    // Divider
    React.createElement('hr', {
      style: {
        border: 'none',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        margin: '2px 0',
      },
    }),

    // Final Payable Row
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 2,
        },
      },
      React.createElement(
        'span',
        {
          style: {
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary, #f8fafc)',
          },
        },
        'Final Payable:'
      ),
      React.createElement(
        'span',
        {
          'data-testid': 'payable-amount',
          style: {
            fontSize: 18,
            fontWeight: 800,
            color: 'var(--accent-light, #60a5fa)',
          },
        },
        `₹${preview.payable.toLocaleString('en-IN')}`
      )
    ),

    // Legal Reference & Rule Version Footer
    preview.legalRef
      ? React.createElement(
          'div',
          {
            style: {
              fontSize: 10,
              color: 'var(--text-muted, #64748b)',
              fontStyle: 'italic',
              marginTop: 4,
              lineHeight: 1.35,
            },
          },
          `Ref: ${preview.legalRef} [${preview.ruleVersion || 'FY2026-27'}]`
        )
      : null
  );
};

export default TaxPreviewBox;
