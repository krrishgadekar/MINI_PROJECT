import { Volume2, Bell, Shield, CircleHelp, Monitor, Smartphone, Laptop } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const navigate = useNavigate();

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Settings</h2>
        <p>Configure application preferences and behavior.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: 600 }}>
        
        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text-primary)' }}>
            <Volume2 size={20} style={{ color: 'var(--accent)' }}/>
            Sound & Media
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', color: 'var(--text-secondary)' }}>
            <span>Enable sound effects</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <span>Volume level</span>
            <input type="range" min="0" max="100" defaultValue="80" />
          </div>
        </div>

        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text-primary)' }}>
            <Bell size={20} style={{ color: 'var(--accent)' }}/>
            Notifications
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', color: 'var(--text-secondary)' }}>
            <span>Push notifications</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <span>Email alerts for high risk</span>
            <input type="checkbox" defaultChecked />
          </div>
        </div>

        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text-primary)' }}>
            <Monitor size={20} style={{ color: 'var(--accent)' }}/>
            Connected Devices
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Manage the active sessions and devices connected to your account.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Laptop size={24} style={{ color: 'var(--text-secondary)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Windows PC - Chrome</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mumbai, India • Active Now</div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--risk-low)', fontWeight: 600 }}>Current Session</div>
            </div>
            
            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Smartphone size={24} style={{ color: 'var(--text-secondary)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>iPhone 14 Pro - Safari</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pune, India • Last active 2 hours ago</div>
              </div>
              <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Revoke</button>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text-primary)' }}>
            <CircleHelp size={20} style={{ color: 'var(--accent)' }}/>
            Help & Support
          </h3>
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', marginBottom: '16px' }}
            onClick={() => navigate('/docs')}
          >
            View Documentation
          </button>
          
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            For contact support, you can reach us at:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-secondary)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '4px' }}>Parth Goggi</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>📞 +91 9820652605</span>
                <span>✉️ parth.goggi24@spit.ac.in</span>
              </div>
            </div>
            
            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-secondary)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '4px' }}>Krrish Gadekar</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>📞 +91 9136829079</span>
                <span>✉️ krrish.gadekar24@spit.ac.in</span>
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-secondary)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '4px' }}>Chetan Chavan</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>📞 +91 9373675465</span>
                <span>✉️ chetan.chavan24@spit.ac.in</span>
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
