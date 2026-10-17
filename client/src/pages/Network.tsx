import { Skeleton, Badge } from '../components/ui';
import { Share2 } from 'lucide-react';

/**
 * Network — Graph visualization & SCC analysis (Owned by Slice B).
 * Placeholder page with skeleton layout.
 */
export default function Network() {
  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Network Graph</h1>
            <Badge variant="primary">Slice B Placeholder</Badge>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Interactive debt closure visualizer, Tarjan strongly connected components (SCC), and ego networks.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Skeleton width={120} height={38} />
          <Skeleton width={100} height={38} />
        </div>
      </div>

      {/* Main Graph Canvas Skeleton */}
      <div
        className="card"
        style={{
          height: 520,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 24,
        }}
      >
        <div style={{ textAlign: 'center', zIndex: 2 }}>
          <Share2 size={48} color="var(--accent-light)" style={{ marginBottom: 16 }} />
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 8 }}>
            Interactive Force Graph Placeholder
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 460 }}>
            Slice B owners can replace this component with the force-directed graph with edge click-through.
          </p>
        </div>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.15, pointerEvents: 'none' }}>
          <Skeleton height="100%" width="100%" />
        </div>
      </div>

      {/* Analytics stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <Skeleton width="40%" height={16} style={{ marginBottom: 12 }} />
          <Skeleton width="70%" height={28} />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <Skeleton width="40%" height={16} style={{ marginBottom: 12 }} />
          <Skeleton width="70%" height={28} />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <Skeleton width="40%" height={16} style={{ marginBottom: 12 }} />
          <Skeleton width="70%" height={28} />
        </div>
      </div>
    </div>
  );
}
