import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: string | number;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  width,
}: DrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="ui-drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="ui-drawer-panel"
        style={width ? { maxWidth: width } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <h3 className="ui-modal-title">{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: 4,
            }}
            aria-label="Close drawer"
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: 24, flex: 1, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

export default Drawer;
