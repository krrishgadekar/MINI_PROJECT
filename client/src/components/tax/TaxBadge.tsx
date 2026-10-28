/**
 * components/tax/TaxBadge.tsx — Domain Badge with Distinct Color & Icon (§5)
 *
 * Visual indicator for group tax domains:
 *   - income: emerald / Landmark
 *   - gst: blue / Percent
 *   - customs: teal / Globe
 *   - property: purple / Home
 *   - vehicle: amber / Car
 *   - none: slate / MinusCircle
 */

import React from 'react';
import {
  Landmark,
  Percent,
  Globe,
  Home,
  Car,
  MinusCircle,
} from 'lucide-react';
import type { TaxDomain } from '../../types';

interface TaxBadgeProps {
  domain?: TaxDomain | string | null;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface DomainMeta {
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  bg: string;
  border: string;
  text: string;
}

const DOMAIN_CONFIG: Record<TaxDomain, DomainMeta> = {
  income: {
    label: 'INCOME (TDS)',
    shortLabel: 'TDS',
    icon: Landmark,
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    text: '#10b981',
  },
  gst: {
    label: 'GST',
    shortLabel: 'GST',
    icon: Percent,
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
    text: '#3b82f6',
  },
  customs: {
    label: 'CUSTOMS',
    shortLabel: 'CUSTOMS',
    icon: Globe,
    bg: 'rgba(20, 184, 166, 0.12)',
    border: 'rgba(20, 184, 166, 0.35)',
    text: '#14b8a6',
  },
  property: {
    label: 'PROPERTY',
    shortLabel: 'PROP',
    icon: Home,
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.35)',
    text: '#8b5cf6',
  },
  vehicle: {
    label: 'VEHICLE',
    shortLabel: 'VEH',
    icon: Car,
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    text: '#f59e0b',
  },
  none: {
    label: 'NO TAX',
    shortLabel: 'NONE',
    icon: MinusCircle,
    bg: 'rgba(148, 163, 184, 0.08)',
    border: 'rgba(148, 163, 184, 0.25)',
    text: '#94a3b8',
  },
};

export const TaxBadge: React.FC<TaxBadgeProps> = ({
  domain = 'none',
  size = 'sm',
  showIcon = true,
  className = '',
  style = {},
}) => {
  const safeDomain: TaxDomain =
    domain && domain in DOMAIN_CONFIG ? (domain as TaxDomain) : 'none';
  const config = DOMAIN_CONFIG[safeDomain];
  const IconComponent = config.icon;

  const sizeStyles = {
    xs: {
      padding: '1px 5px',
      fontSize: '0.62rem',
      iconSize: 10,
      gap: 3,
    },
    sm: {
      padding: '2px 7px',
      fontSize: '0.68rem',
      iconSize: 11,
      gap: 4,
    },
    md: {
      padding: '3px 10px',
      fontSize: '0.75rem',
      iconSize: 13,
      gap: 5,
    },
  }[size];

  return (
    <span
      className={`tax-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sizeStyles.gap,
        padding: sizeStyles.padding,
        fontSize: sizeStyles.fontSize,
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: 700,
        letterSpacing: '0.04em',
        borderRadius: 3,
        background: config.bg,
        border: `1px solid ${config.border}`,
        color: config.text,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...style,
      }}
      title={`Tax Domain: ${config.label}`}
    >
      {showIcon && <IconComponent size={sizeStyles.iconSize} />}
      <span>{config.label}</span>
    </span>
  );
};

export default TaxBadge;

