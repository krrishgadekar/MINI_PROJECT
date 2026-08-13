import { useState } from "react";
import { Bell, Monitor, Moon, Shield } from "lucide-react";

export default function Settings() {
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [sounds, setSounds] = useState(false);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2>Settings</h2>
        <p>Customize your CreditFlow experience</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 680 }}>
        {/* Appearance */}
        <div className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Moon size={18} color="var(--accent-light)" />
            <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>Appearance</h3>
          </div>
          <SettingToggle
            label="Dark Mode"
            description="Use dark theme throughout the app"
            checked={darkMode}
            onChange={() => setDarkMode(!darkMode)}
          />
        </div>

        {/* Notifications */}
        <div className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Bell size={18} color="var(--accent-light)" />
            <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>Notifications</h3>
          </div>
          <SettingToggle
            label="Push Notifications"
            description="Get notified about settlement updates"
            checked={notifications}
            onChange={() => setNotifications(!notifications)}
          />
          <SettingToggle
            label="Sound Effects"
            description="Play sounds on important actions"
            checked={sounds}
            onChange={() => setSounds(!sounds)}
          />
        </div>

        {/* Security */}
        <div className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Shield size={18} color="var(--accent-light)" />
            <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>Security</h3>
          </div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 0",
            borderBottom: "1px solid var(--border-secondary)",
          }}>
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>Change Password</div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                Update your account password
              </div>
            </div>
            <button className="btn btn-secondary btn-sm">Change</button>
          </div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 0",
          }}>
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--risk-critical)" }}>
                Delete Account
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                Permanently remove your account and all data
              </div>
            </div>
            <button className="btn btn-danger btn-sm">Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingToggle({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "14px 0",
      borderBottom: "1px solid var(--border-secondary)",
    }}>
      <div>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 2 }}>
          {description}
        </div>
      </div>
      <button
        onClick={onChange}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          background: checked ? "var(--accent)" : "var(--bg-tertiary)",
          border: `1px solid ${checked ? "var(--accent)" : "var(--border-secondary)"}`,
          cursor: "pointer",
          position: "relative",
          transition: "all var(--transition-fast)",
        }}
      >
        <div style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "white",
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          transition: "left var(--transition-fast)",
          boxShadow: "var(--shadow-sm)",
        }} />
      </button>
    </div>
  );
}
