import type { ReactNode } from "react";
import Modal from "./Modal";
import { AlertCircle } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
}: ConfirmDialogProps) {
  const isDanger = variant === "danger";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isDanger && <AlertCircle size={20} color="var(--risk-critical)" />}
          <span>{title}</span>
        </div>
      }
      footer={
        <>
          <button
            onClick={onClose}
            className="btn btn--secondary"
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
            }}
            className={`btn ${isDanger ? "btn--danger" : "btn--primary"}`}
            disabled={isLoading}
            style={
              isDanger
                ? {
                    background: "var(--risk-critical)",
                    borderColor: "var(--risk-critical)",
                    color: "#ffffff",
                  }
                : undefined
            }
          >
            {isLoading ? "Processing..." : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: "var(--font-size-base)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        {message}
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
