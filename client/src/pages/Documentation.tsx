import { BookOpen, ExternalLink } from "lucide-react";

export default function Documentation() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2>Documentation</h2>
        <p>Learn how CreditFlow works and explore the API</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 20 }}>
        <div className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <BookOpen size={20} color="var(--accent-light)" />
            <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>API Reference</h3>
          </div>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 20 }}>
            Explore all available endpoints. The interactive Swagger UI lets you test every API call directly.
          </p>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Open API Docs <ExternalLink size={14} />
          </a>
        </div>

        <div className="glass-card">
          <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700, marginBottom: 14 }}>
            How It Works
          </h3>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", lineHeight: 1.8 }}>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "var(--text-primary)" }}>1. Add Merchants & Debts</strong><br />
              Enter who owes whom and how much.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "var(--text-primary)" }}>2. Find the Best Settlement</strong><br />
              Our algorithm calculates the minimum payments needed.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "var(--text-primary)" }}>3. Cancel Circular Debts</strong><br />
              Loops in the debt network are automatically detected and removed.
            </p>
            <p>
              <strong style={{ color: "var(--text-primary)" }}>4. Monitor Risk</strong><br />
              Track each merchant's payment reliability over time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
