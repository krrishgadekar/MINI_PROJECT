import { Phone, Mail, Building2, MapPin } from "lucide-react";

export default function Profile() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h2>My Profile</h2>
        <p>Manage your account information and preferences.</p>
      </div>

      <div className="glass-card" style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px' }}>
          <div className="sidebar-avatar" style={{ width: 80, height: 80, fontSize: '2rem' }}>PG</div>
          <div>
            <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Parth Goggi</h3>
            <p style={{ color: 'var(--text-muted)' }}>Software Developer</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <Phone size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Phone Number</div>
              <div style={{ color: 'var(--text-primary)' }}>9820652605</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <Mail size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Email Address</div>
              <div style={{ color: 'var(--text-primary)' }}>parth.goggi@spit.ac.in</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <Building2 size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Institution</div>
              <div style={{ color: 'var(--text-primary)' }}>Sardar Patel Institute of Technology (SPIT)</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <MapPin size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Location</div>
              <div style={{ color: 'var(--text-primary)' }}>Mumbai, India</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
