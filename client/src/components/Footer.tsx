import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-brand">
          <h3>CreditFlow</h3>
          <p>
            A graph-theoretic debt settlement engine built for the SPIT Mumbai Sem V Mini Project.
          </p>
        </div>

        <div className="footer-links">
          <div className="footer-column">
            <h4>Product</h4>
            <Link to="/">Dashboard</Link>
            <Link to="/settlement">Settlement</Link>
            <Link to="/risk">Risk Analysis</Link>
          </div>
          <div className="footer-column">
            <h4>Resources</h4>
            <Link to="/docs">Documentation</Link>
            <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer">
              API Reference
            </a>
          </div>
          <div className="footer-column">
            <h4>Team</h4>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Krrish · Parth · Chetan</span>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        © {new Date().getFullYear()} CreditFlow — SPIT Mumbai. Built with React, FastAPI & Graph Theory.
      </div>
    </footer>
  );
}
