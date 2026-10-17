import { Skeleton, Badge } from '../components/ui';
import { GitCommit } from 'lucide-react';

/**
 * Settle — Multi-party Settlement Optimizer & Cycle Netting (Owned by Slice B).
 * Placeholder page with skeleton layout.
 */
export default function Settle() {
  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Settlement Optimizer</h1>
            <Badge variant="primary">Slice B Placeholder</Badge>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Continuous cycle netting, greedy cash flow reduction, and exact optimal settlement solver.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Skeleton width={130} height={38} />
          <Skeleton width={140} height={38} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <Skeleton width="40%" height={14} style={{ marginBottom: 10 }} />
            <Skeleton width="60%" height={26} />
          </div>
        ))}
      </div>

      {/* Execution plans */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <GitCommit size={20} color="var(--accent-light)" />
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>Computed Clearing Transactions</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--border-radius-sm)',
              }}
            >
              <div style={{ width: '40%' }}>
                <Skeleton height={18} style={{ marginBottom: 6 }} />
                <Skeleton width="60%" height={14} />
              </div>
              <Skeleton width={100} height={24} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
