import { useState } from "react";
import type { DebtEdge } from "../types";

interface DebtTableProps {
  debts: DebtEdge[];
}

type SortField = "debtor" | "creditor" | "amount";
type SortDir = "asc" | "desc";

/**
 * DebtTable — Sortable, filterable debt table component.
 *
 * Displays all debts with sort-on-click column headers
 * and a search filter for merchant names.
 */
export default function DebtTable({ debts }: DebtTableProps) {
  const [sortField, setSortField] = useState<SortField>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState("");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const filtered = debts.filter(
    (d) =>
      d.debtor.toLowerCase().includes(filter.toLowerCase()) ||
      d.creditor.toLowerCase().includes(filter.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let cmp: number;
    if (sortField === "amount") {
      cmp = a.amount - b.amount;
    } else {
      cmp = a[sortField].localeCompare(b[sortField]);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <input
          className="form-input"
          type="text"
          placeholder="Search by merchant name..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("debtor")}>
                Debtor{sortIndicator("debtor")}
              </th>
              <th onClick={() => handleSort("creditor")}>
                Creditor{sortIndicator("creditor")}
              </th>
              <th onClick={() => handleSort("amount")}>
                Amount (₹){sortIndicator("amount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((debt, i) => (
              <tr key={`${debt.debtor}-${debt.creditor}-${i}`}>
                <td>{debt.debtor.replace("_", " ")}</td>
                <td>{debt.creditor.replace("_", " ")}</td>
                <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  ₹{debt.amount.toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No debts match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
