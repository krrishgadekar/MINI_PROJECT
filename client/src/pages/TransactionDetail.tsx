import { useParams, Link } from 'react-router-dom';
import { Skeleton, Badge } from '../components/ui';
import { ArrowLeft, CreditCard } from 'lucide-react';

/**
 * TransactionDetail — Detailed view of an individual debt and its payment history (Slice A).
 * Placeholder page with skeleton layout.
 */
export default function TransactionDetail() {
  const { debtId } = useParams();

  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      <div style={{ marginBottom: 20 }}>
        <Link
          to="/ledger"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text-accent)',
            fontSize: 'var(--font-size-sm)',
            textDecoration: 'none',
            marginBottom: 12,
          }}
        >
          <ArrowLeft size={16} />
          Back to Ledger
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>
            Debt #{debtId || 'Detail'}
          </h1>
          <Badge variant="primary">Slice A Placeholder</Badge>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <CreditCard size={20} color="var(--accent-light)" />
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>Payment History & Version Log</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius-sm)' }}>
                <Skeleton width="30%" height={16} style={{ marginBottom: 8 }} />
                <Skeleton width="60%" height={22} style={{ marginBottom: 6 }} />
                <Skeleton width="40%" height={14} />
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 24, height: 'fit-content' }}>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 16 }}>Metadata & Actions</h3>
          <Skeleton height={20} style={{ marginBottom: 12 }} />
          <Skeleton height={20} style={{ marginBottom: 12 }} />
          <Skeleton height={20} style={{ marginBottom: 20 }} />
          <Skeleton height={40} />
        </div>
      </div>
    </div>
  );
}
