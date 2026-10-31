import { useState, Fragment } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import type { TransactionItem } from "../types";

interface TransactionListProps {
  transactions: TransactionItem[];
  isTaxGroup?: boolean;
}

/**
 * TransactionList — Displays settlement transaction results in a table.
 * Includes expandable tax breakdown per row for tax-enabled groups (§2.2 D3-P).
 */
export default function TransactionList({ transactions, isTaxGroup = false }: TransactionListProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (transactions.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
        No settlement transactions computed yet. Click "Optimize Netting" above.
      </div>
    );
  }

  return (
    <div className="data-table-wrapper">
      <table className="data-table" data-testid="settlement-transactions-table">
        <thead>
          <tr>
            {isTaxGroup && <th style={{ width: 32 }} aria-label="Expand row"></th>}
            <th>#</th>
            <th>Payer (Debtor)</th>
            <th>Payee (Creditor)</th>
            <th>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, i) => {
            const isExpanded = expandedRows.has(i);
            return (
              <Fragment key={`${t.payer}-${t.payee}-${i}`}>
                <tr
                  onClick={() => isTaxGroup && toggleRow(i)}
                  style={{ cursor: isTaxGroup ? "pointer" : "default" }}
                >
                  {isTaxGroup && (
                    <td style={{ textAlign: "center", color: "var(--text-muted)", padding: "8px 4px" }}>
                      <button
                        type="button"
                        aria-label={`Toggle included tax for transfer ${i + 1}`}
                        data-testid={`expand-tax-row-${i}`}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                          display: "inline-flex",
                          padding: 2,
                        }}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                  )}
                  <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td>{t.payer.replace("_", " ")}</td>
                  <td>{t.payee.replace("_", " ")}</td>
                  <td style={{ fontWeight: 600, color: "var(--risk-low)", fontVariantNumeric: "tabular-nums" }}>
                    ₹{t.amount.toLocaleString("en-IN")}
                  </td>
                </tr>
                {isTaxGroup && isExpanded && (
                  <tr
                    data-testid={`included-tax-detail-${i}`}
                    style={{ background: "rgba(13, 34, 71, 0.02)" }}
                  >
                    <td colSpan={5} style={{ padding: "10px 18px", borderTop: "none" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        <Info size={14} color="#0d2247" />
                        <span>
                          <strong>Included tax:</strong> Obligation settled as net payable inclusive of applicable statutory taxes.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
