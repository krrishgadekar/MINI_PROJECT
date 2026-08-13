export default function PrivacyPolicy() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Privacy & Policy</h2>
        <p>Understanding how CreditFlow handles your data.</p>
      </div>

      <div className="glass-card" style={{ maxWidth: 800, lineHeight: 1.6 }}>
        <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>Data Collection</h3>
        <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
          CreditFlow acts as a modeling platform for informal merchant debt networks. 
          We collect and store graph node data (merchants) and edge data (debt amounts)
          to calculate debt settlements and risk probabilities accurately.
        </p>

        <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>Data Usage</h3>
        <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
          Your data is solely used to compute Warshall's transitive closures, netting cycles,
          and Poisson risk scores. We do not sell or distribute your financial network graphs
          to third parties.
        </p>

        <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>Security Measures</h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          All requests processed through the Node.js integration layer are protected by JWT Authentication,
          and sensitive data is securely stored within MongoDB.
        </p>
      </div>
    </div>
  );
}
