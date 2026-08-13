import { useState } from "react";
import { seedData } from "../data/seedData";
import DebtTable from "../components/DebtTable";
import { Plus, Search } from "lucide-react";

export default function Debts() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredDebts = seedData.debts.filter(
    (d) =>
      d.debtor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.creditor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2>Manage Debts</h2>
        <p>View and manage all debts in your merchant network</p>
      </div>

      <div className="glass-card">
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          gap: 16,
        }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              className="form-input"
              style={{ paddingLeft: 38 }}
              type="text"
              placeholder="Search by merchant name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button className="btn btn-primary">
            <Plus size={16} /> Add Debt
          </button>
        </div>

        <DebtTable debts={filteredDebts} />

        {filteredDebts.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "40px 0",
            color: "var(--text-muted)",
            fontSize: "var(--font-size-sm)",
          }}>
            No debts found matching "{searchTerm}"
          </div>
        )}
      </div>
    </div>
  );
}
