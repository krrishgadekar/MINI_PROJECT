import type { RiskCategory } from "../types";

interface RiskBadgeProps {
  category: RiskCategory;
}

/**
 * RiskBadge — Color-coded risk category badge.
 *
 * Displays the risk category (LOW/MEDIUM/HIGH/CRITICAL) with a
 * pulsing dot and appropriate color scheme.
 */
export default function RiskBadge({ category }: RiskBadgeProps) {
  const className = `risk-badge risk-badge--${category.toLowerCase()}`;

  return (
    <span className={className}>
      <span className="risk-badge-dot" />
      {category}
    </span>
  );
}
