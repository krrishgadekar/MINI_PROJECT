import { Skeleton, Badge } from '../components/ui';
import { Receipt } from 'lucide-react';

/**
 * Ledger — Invoicing, Debts & CAS Payments (Owned by Slice A).
 * Placeholder page with skeleton layout.
 */
export default function Ledger() {
  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Debt Ledger</h1>
            <Badge variant="primary">Slice A Placeholder</Badge>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Peer-to-peer receivables and payables, optimistic version locking, and dispute workflows.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Skeleton width={140} height={38} />
        </div>
      </div>

      {/* Filter and stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <Skeleton width="45%" height={14} style={{ marginBottom: 10 }} />
            <Skeleton width="60%" height={26} />
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Receipt size={20} color="var(--accent-light)" />
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>Active Receivables & Payables</h3>
          </div>
          <Skeleton width={200} height={32} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr',
                gap: 16,
                padding: '12px 0',
                borderBottom: '1px solid var(--border-secondary)',
              }}
            >
              <Skeleton height={18} />
              <Skeleton height={18} />
              <Skeleton height={18} />
              <Skeleton height={18} />
              <Skeleton height={18} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
