import { Skeleton, Badge } from '../components/ui';
import { Users } from 'lucide-react';

/**
 * Groups — Tenancy, membership, and market coalitions (Owned by Slice A).
 * Placeholder page with skeleton layout.
 */
export default function Groups() {
  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Tenant Groups</h1>
            <Badge variant="primary">Slice A Placeholder</Badge>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Switch between merchant markets, manage tenant memberships, and share invite codes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Skeleton width={130} height={38} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: 'var(--accent-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users size={20} color="var(--accent-light)" />
              </div>
              <div style={{ flex: 1 }}>
                <Skeleton width="70%" height={20} style={{ marginBottom: 6 }} />
                <Skeleton width="40%" height={14} />
              </div>
            </div>
            <Skeleton height={14} style={{ marginBottom: 8 }} />
            <Skeleton width="80%" height={14} style={{ marginBottom: 20 }} />
            <Skeleton height={36} />
          </div>
        ))}
      </div>
    </div>
  );
}
