import { Link } from 'react-router-dom';
import { Phone } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-col">
          <div className="footer-brand">
            <div className="sidebar-brand-icon">C</div>
            <div className="sidebar-brand-text">
              <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>CreditFlow</h1>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Debt Settlement Engine</p>
            </div>
          </div>
          <p className="footer-desc">
            Graph-theoretic debt settlement and credit-risk analysis platform designed to model informal merchant debt networks.
          </p>
          <div className="footer-made-in">
            Made with <span style={{ fontSize: '1.5rem', color: '#ef4444', margin: '0 4px' }}>❤️</span> in India
          </div>
        </div>

        <div className="footer-col">
          <h4 className="footer-heading">QUICK LINKS</h4>
          <ul className="footer-links">
            <li><Link to="/privacy-policy">Privacy & Policy</Link></li>
            <li><Link to="/settings">Settings</Link></li>
            <li><Link to="/docs">Documentation</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4 className="footer-heading">CONTACT US</h4>
          
          <div className="contact-card">
            <div className="contact-icon-wrapper">
              <Phone size={14} className="contact-icon" />
            </div>
            <div>
              <div className="contact-number">+91 9820652605</div>
              <div className="contact-sub">Parth Goggi</div>
            </div>
          </div>
          
          <div className="contact-card">
            <div className="contact-icon-wrapper">
              <Phone size={14} className="contact-icon" />
            </div>
            <div>
              <div className="contact-number">+91 9136829079</div>
              <div className="contact-sub">Krrish Gadekar</div>
            </div>
          </div>
          
          <div className="contact-card">
            <div className="contact-icon-wrapper">
              <Phone size={14} className="contact-icon" />
            </div>
            <div>
              <div className="contact-number">+91 9373675465</div>
              <div className="contact-sub">Chetan Chavan</div>
            </div>
          </div>
          
          <div className="developed-by-card">
            <div className="developed-label">DEVELOPED BY</div>
            <div className="developed-names">Parth Goggi, Krrish Gadekar & Chetan Chavan</div>
            <div className="developed-sub">SPIT Mumbai • 2026</div>
          </div>
        </div>
      </div>
      
      <div className="footer-bottom">
        <div>© 2026 CreditFlow. All rights reserved.</div>
        <div className="status-indicator">
          <div className="status-dot"></div>
          All systems operational
        </div>
      </div>
    </footer>
  );
}
