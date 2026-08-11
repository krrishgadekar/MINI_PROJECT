import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  iconBg: string;
  subtitle?: string;
}

/**
 * StatCard — Glassmorphic metric display card.
 *
 * Used on the Dashboard and other pages to display key statistics
 * with an icon, value, and optional subtitle.
 */
export default function StatCard({
  label,
  value,
  icon,
  iconBg,
  subtitle,
}: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-card-label">{label}</span>
        <div className="stat-card-icon" style={{ background: iconBg }}>
          {icon}
        </div>
      </div>
      <div className="stat-card-value">{value}</div>
      {subtitle && <div className="stat-card-change">{subtitle}</div>}
    </div>
  );
}
