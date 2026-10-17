import type { RiskCategory, RiskLabel } from "../types";

export type AnyRiskCategory = RiskCategory | RiskLabel | string;

interface RiskBadgeProps {
  category?: AnyRiskCategory | null;
}

/**
 * RiskBadge — Color-coded risk category badge (FE-41).
 *
 * Displays the risk category (LOW/MEDIUM/HIGH/CRITICAL/UNKNOWN) with a
 * pulsing dot and appropriate color scheme.
 */
export default function RiskBadge({ category }: RiskBadgeProps) {
  const cat = (category || "UNKNOWN").toUpperCase();
  const safeCategory = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"].includes(cat)
    ? cat
    : "UNKNOWN";

  const className = `risk-badge risk-badge--${safeCategory.toLowerCase()}`;

  return (
    <span className={className}>
      <span className="risk-badge-dot" />
      {safeCategory}
    </span>
  );
}

/** Color map for risk categories (FE-41) */
export const RISK_COLOR_MAP: Record<string, string> = {
  LOW: "var(--risk-low)",
  MEDIUM: "var(--risk-medium)",
  HIGH: "var(--risk-high)",
  CRITICAL: "var(--risk-critical)",
  UNKNOWN: "var(--risk-unknown)",
};

export const RISK_BG_MAP: Record<string, string> = {
  LOW: "var(--risk-low-bg)",
  MEDIUM: "var(--risk-medium-bg)",
  HIGH: "var(--risk-high-bg)",
  CRITICAL: "var(--risk-critical-bg)",
  UNKNOWN: "var(--risk-unknown-bg)",
};
