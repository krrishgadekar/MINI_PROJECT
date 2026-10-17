import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`ui-empty-state ${className}`}>
      <div className="ui-empty-state-icon">
        {icon || <Inbox size={28} />}
      </div>
      <h3 className="ui-empty-state-title">{title}</h3>
      {description && <p className="ui-empty-state-desc">{description}</p>}
      {action && <div className="ui-empty-state-action">{action}</div>}
    </div>
  );
}

export default EmptyState;
