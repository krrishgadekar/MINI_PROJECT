interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  subtitle?: string;
}

export default function StatCard({ label, value, icon, iconBg, subtitle }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-icon" style={{ background: iconBg }}>
          {icon}
        </div>
      </div>
      <div className="stat-card-value">{value}</div>
      {subtitle && <div className="stat-card-change">{subtitle}</div>}
    </div>
  );
}
