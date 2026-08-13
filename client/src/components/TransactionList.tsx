import type { TransactionItem } from "../types";

interface TransactionListProps {
  transactions: TransactionItem[];
}

/**
 * TransactionList — Displays settlement transaction results in a table.
 */
export default function TransactionList({ transactions }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
        No settlement transactions computed yet. Click "Compute Settlement" above.
      </div>
    );
  }

  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Payer (Debtor)</th>
            <th>Payee (Creditor)</th>
            <th>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, i) => (
            <tr key={`${t.payer}-${t.payee}-${i}`}>
              <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
              <td>{t.payer.replace("_", " ")}</td>
              <td>{t.payee.replace("_", " ")}</td>
              <td style={{ fontWeight: 600, color: "var(--risk-low)", fontVariantNumeric: "tabular-nums" }}>
                ₹{t.amount.toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
