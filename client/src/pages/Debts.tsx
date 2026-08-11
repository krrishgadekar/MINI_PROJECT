import { useState } from "react";
import { Plus } from "lucide-react";
import DebtTable from "../components/DebtTable";
import { seedData } from "../data/seedData";
import type { DebtEdge } from "../types";

/**
 * Debts — Debt Management page.
 *
 * Displays all debts in a sortable/filterable table and provides
 * an "Add Debt" form. Uses seed_data.json until Chetan's API is ready.
 */
export default function Debts() {
  const [debts, setDebts] = useState<DebtEdge[]>(seedData.debts);
  const [showForm, setShowForm] = useState(false);
  const [newDebtor, setNewDebtor] = useState("");
  const [newCreditor, setNewCreditor] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [formError, setFormError] = useState("");

  const handleAddDebt = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!newDebtor || !newCreditor || !newAmount) {
      setFormError("Please fill in all fields.");
      return;
    }

    if (newDebtor === newCreditor) {
      setFormError("Debtor and creditor must be different.");
      return;
    }

    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) {
      setFormError("Amount must be a positive number.");
      return;
    }

    setDebts((prev) => [
      ...prev,
      { debtor: newDebtor, creditor: newCreditor, amount },
    ]);

    // Reset form
    setNewDebtor("");
    setNewCreditor("");
    setNewAmount("");
    setShowForm(false);
  };

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="section-header">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h2>Debt Management</h2>
          <p>
            {debts.length} active debts across {seedData.merchants.length}{" "}
            merchants
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={16} />
          Add Debt
        </button>
      </div>

      {/* Add Debt Form */}
      {showForm && (
        <div className="glass-card animate-fade-in-up" style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Record a New Debt
          </h3>
          <form
            onSubmit={handleAddDebt}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr auto",
              gap: 14,
              alignItems: "end",
            }}
          >
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Debtor</label>
              <select
                className="form-input form-select"
                value={newDebtor}
                onChange={(e) => setNewDebtor(e.target.value)}
              >
                <option value="">Select debtor...</option>
                {seedData.merchants.map((m) => (
                  <option key={m} value={m}>
                    {m.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Creditor</label>
              <select
                className="form-input form-select"
                value={newCreditor}
                onChange={(e) => setNewCreditor(e.target.value)}
              >
                <option value="">Select creditor...</option>
                {seedData.merchants
                  .filter((m) => m !== newDebtor)
                  .map((m) => (
                    <option key={m} value={m}>
                      {m.replace("_", " ")}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Amount (₹)</label>
              <input
                className="form-input"
                type="number"
                min="1"
                step="0.01"
                placeholder="e.g. 25000"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </form>
          {formError && (
            <div
              style={{
                color: "var(--risk-critical)",
                fontSize: "var(--font-size-sm)",
                marginTop: 10,
              }}
            >
              {formError}
            </div>
          )}
        </div>
      )}

      {/* Debt Table */}
      <div className="glass-card">
        <DebtTable debts={debts} />
      </div>
    </div>
  );
}
