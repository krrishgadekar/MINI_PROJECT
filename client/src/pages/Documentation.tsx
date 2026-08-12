export default function Documentation() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h2>CreditFlow Documentation</h2>
        <p>Overview of the debt settlement and risk analysis engine.</p>
      </div>

      <div className="glass-card" style={{ maxWidth: 800, lineHeight: 1.6 }}>
        <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>Project Overview</h3>
        <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
          CreditFlow is a graph-theoretic debt settlement and credit-risk analysis platform
          designed to model informal merchant debt networks. It helps to track, optimize, 
          and settle complex webs of debt efficiently.
        </p>

        <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>Core Features</h3>
        <ul style={{ paddingLeft: '20px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Graph Analysis:</strong> Utilizes Warshall's transitive closure to identify indirect debt paths and cyclic risks across the network.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Debt Settlement:</strong> Employs greedy algorithms (O(N log N)) to calculate the minimum number of transactions needed to settle all outstanding debts.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Cycle Netting:</strong> Detects circular debt cycles (e.g., A owes B, B owes C, C owes A) and cancels them out automatically.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Risk Assessment:</strong> Calculates credit default probabilities using a statistical Poisson-distribution model.
          </li>
        </ul>

        <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>Technology Stack</h3>
        <ul style={{ paddingLeft: '20px', color: 'var(--text-secondary)' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Frontend:</strong> React 19, TypeScript, Vite, Recharts, React Force Graph 2D.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Algorithmic Engine:</strong> Python (FastAPI) for advanced graph theory and risk modeling.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>API Gateway:</strong> Node.js / Express for Authentication and MongoDB persistence.
          </li>
        </ul>
      </div>
    </div>
  );
}
