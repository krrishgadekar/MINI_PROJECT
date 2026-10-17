import { Skeleton, Badge } from '../components/ui';
import { Activity as ActivityIcon } from 'lucide-react';

/**
 * Activity — Audit trails, history, and tenant log explorer (Owned by Slice A).
 * Placeholder page with skeleton layout.
 */
export default function Activity() {
  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Audit Activity</h1>
            <Badge variant="primary">Slice A Placeholder</Badge>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Immutable event log of all debt proposals, payment receipts, disputes, and risk recalculations.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <ActivityIcon size={20} color="var(--accent-light)" />
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>Recent Ledger Audit Events</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--border-radius-sm)',
              }}
            >
              <div style={{ width: '60%' }}>
                <Skeleton height={16} style={{ marginBottom: 6 }} />
                <Skeleton width="40%" height={12} />
              </div>
              <Skeleton width={80} height={20} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
