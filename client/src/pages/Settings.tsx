import { useState, useEffect } from "react";
import {
  Bell, Moon, Sun, Shield, Globe, Clock, Zap, LinkIcon,
  CheckCircle, Save, ToggleLeft, ToggleRight, Loader,
} from "lucide-react";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "../hooks/useNotifications";
import { useToast } from "../components/ui/Toast";
import { Skeleton } from "../components/ui";

// ─── Theme helpers ────────────────────────────────────────────────────────────
function getStoredTheme(): "dark" | "light" {
  return (localStorage.getItem("creditflow_theme") as "dark" | "light") || "dark";
}

function applyTheme(theme: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("creditflow_theme", theme);
}

// Apply theme on first paint (called in main.tsx too for SSR-safety)
applyTheme(getStoredTheme());

// ─── Main component ───────────────────────────────────────────────────────────
export default function Settings() {
  const { success: showSuccess, error: showError } = useToast();

  // ── Theme state ──────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<"dark" | "light">(getStoredTheme);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  // ── Notification Preferences ─────────────────────────────────────────────────
  const { data: prefData, isLoading: prefLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const prefs = prefData?.preferences;

  const [channels, setChannels] = useState({
    inApp: true, email: true, webhook: false,
  });
  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailAddr, setEmailAddr] = useState("");
  const [quietHours, setQuietHours] = useState({ enabled: false, startHour: 22, endHour: 8 });
  const [types, setTypes] = useState({
    debtRequested: true, debtConfirmed: true, debtRejected: true,
    debtDisputed: true, paymentRecorded: true, settlementReady: true,
    settlementConfirmed: true, cycleNetted: true, riskFlagged: true,
    debtOverdue: true, debtDueSoon: true, digest: true,
  });

  // Sync from API when loaded
  useEffect(() => {
    if (prefs) {
      setChannels(prefs.channels);
      setWebhookUrl(prefs.webhookUrl || "");
      setEmailAddr(prefs.email || "");
      setQuietHours(prefs.quietHours);
      setTypes(prefs.types);
    }
  }, [prefs]);

  const handleSavePrefs = async () => {
    try {
      await updatePrefs.mutateAsync({ channels, webhookUrl, email: emailAddr, quietHours, types });
      showSuccess("Notification preferences saved!");
    } catch {
      showError("Failed to save preferences.");
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: "var(--content-padding)", maxWidth: 760 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "var(--font-size-2xl)", fontWeight: 800, marginBottom: 4 }}>Settings</h1>
        <p style={{ color: "var(--text-muted)" }}>Customize your CreditFlow experience</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Appearance ──────────────────────────────────────────────────────── */}
        <section aria-labelledby="appearance-heading" className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            {theme === "dark"
              ? <Moon size={18} color="var(--accent-light)" aria-hidden="true" />
              : <Sun size={18} color="var(--risk-medium)" aria-hidden="true" />}
            <h2 id="appearance-heading" style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>Appearance</h2>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0" }}>
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                {theme === "dark" ? "Dark Mode" : "Light Mode"}
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                Preference is persisted across sessions
              </div>
            </div>
            <button
              id="theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-pressed={theme === "light"}
              style={{
                width: 52, height: 28, borderRadius: 14,
                background: theme === "light" ? "var(--risk-medium)" : "var(--accent)",
                border: "none", cursor: "pointer", position: "relative",
                transition: "background var(--transition-fast)",
              }}
            >
              <span style={{
                position: "absolute", top: 4,
                left: theme === "light" ? 28 : 4,
                width: 20, height: 20, borderRadius: "50%",
                background: "white", transition: "left var(--transition-fast)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {theme === "dark"
                  ? <Moon size={11} color="var(--accent)" />
                  : <Sun size={11} color="var(--risk-medium)" />}
              </span>
            </button>
          </div>
        </section>

        {/* ── Notification Preferences ──────────────────────────────────────── */}
        <section aria-labelledby="notif-heading" className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Bell size={18} color="var(--accent-light)" aria-hidden="true" />
            <h2 id="notif-heading" style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>Notification Preferences</h2>
          </div>

          {prefLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2, 3].map(i => <Skeleton key={i} height={44} />)}
            </div>
          ) : (
            <>
              {/* Channels */}
              <fieldset style={{ border: "none", padding: 0, marginBottom: 20 }}>
                <legend style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 12 }}>
                  Delivery Channels
                </legend>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <ChannelToggle
                    id="channel-inapp"
                    icon={<Bell size={15} />}
                    label="In-App Notifications"
                    description="Receive notifications in the inbox panel"
                    checked={channels.inApp}
                    onChange={() => setChannels(c => ({ ...c, inApp: !c.inApp }))}
                  />
                  <ChannelToggle
                    id="channel-email"
                    icon={<Globe size={15} />}
                    label="Email Notifications"
                    description="Get email summaries and alerts"
                    checked={channels.email}
                    onChange={() => setChannels(c => ({ ...c, email: !c.email }))}
                  />
                  {channels.email && (
                    <div style={{ paddingLeft: 32 }}>
                      <input
                        id="email-addr"
                        type="email"
                        placeholder="Override email address (optional)"
                        value={emailAddr}
                        onChange={e => setEmailAddr(e.target.value)}
                        aria-label="Override email address for notifications"
                        className="input"
                        style={{ width: "100%", maxWidth: 360, height: 36, fontSize: "var(--font-size-xs)", marginBottom: 4 }}
                      />
                    </div>
                  )}
                  <ChannelToggle
                    id="channel-webhook"
                    icon={<Zap size={15} />}
                    label="Webhook Push"
                    description="POST to your endpoint on every event"
                    checked={channels.webhook}
                    onChange={() => setChannels(c => ({ ...c, webhook: !c.webhook }))}
                  />
                  {channels.webhook && (
                    <div style={{ paddingLeft: 32 }}>
                      <input
                        id="webhook-url"
                        type="url"
                        placeholder="https://your-server.com/webhook"
                        value={webhookUrl}
                        onChange={e => setWebhookUrl(e.target.value)}
                        aria-label="Webhook URL for notification delivery"
                        className="input"
                        style={{ width: "100%", maxWidth: 400, height: 36, fontSize: "var(--font-size-xs)" }}
                      />
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Quiet Hours */}
              <fieldset style={{ border: "none", padding: 0, marginBottom: 20 }}>
                <legend style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 12 }}>
                  Quiet Hours
                </legend>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Clock size={15} color="var(--text-muted)" aria-hidden="true" />
                    <div>
                      <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>Do Not Disturb</div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                        Suppress notifications during off-hours
                      </div>
                    </div>
                  </div>
                  <Toggle
                    id="quiet-hours-toggle"
                    checked={quietHours.enabled}
                    onChange={() => setQuietHours(q => ({ ...q, enabled: !q.enabled }))}
                    label="Toggle quiet hours"
                  />
                </div>
                {quietHours.enabled && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 26, paddingBottom: 10, flexWrap: "wrap" }}>
                    <label htmlFor="quiet-start" style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>From</label>
                    <input
                      id="quiet-start"
                      type="number" min={0} max={23}
                      value={quietHours.startHour}
                      onChange={e => setQuietHours(q => ({ ...q, startHour: parseInt(e.target.value) || 0 }))}
                      aria-label="Quiet hours start (0–23)"
                      className="input"
                      style={{ width: 64, height: 34, fontSize: "var(--font-size-sm)", textAlign: "center" }}
                    />
                    <label htmlFor="quiet-end" style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>To</label>
                    <input
                      id="quiet-end"
                      type="number" min={0} max={23}
                      value={quietHours.endHour}
                      onChange={e => setQuietHours(q => ({ ...q, endHour: parseInt(e.target.value) || 0 }))}
                      aria-label="Quiet hours end (0–23)"
                      className="input"
                      style={{ width: 64, height: 34, fontSize: "var(--font-size-sm)", textAlign: "center" }}
                    />
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>h (24-hour)</span>
                  </div>
                )}
              </fieldset>

              {/* Notification Types */}
              <fieldset style={{ border: "none", padding: 0, marginBottom: 24 }}>
                <legend style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 12 }}>
                  Notification Types
                </legend>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                  {(Object.entries(types) as [keyof typeof types, boolean][]).map(([key, val]) => (
                    <TypeToggle
                      key={key}
                      id={`type-${key}`}
                      label={formatTypeLabel(key)}
                      checked={val}
                      onChange={() => setTypes(t => ({ ...t, [key]: !t[key] }))}
                    />
                  ))}
                </div>
              </fieldset>

              <button
                id="save-preferences-btn"
                onClick={handleSavePrefs}
                disabled={updatePrefs.isPending}
                className="btn btn--primary"
                aria-label="Save notification preferences"
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {updatePrefs.isPending
                  ? <><Loader size={15} className="spin" /> Saving...</>
                  : <><Save size={15} /> Save Preferences</>}
              </button>
            </>
          )}
        </section>

        {/* ── Connected Sessions ───────────────────────────────────────────── */}
        <section aria-labelledby="sessions-heading" className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <LinkIcon size={18} color="var(--accent-light)" aria-hidden="true" />
            <h2 id="sessions-heading" style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>Connected Sessions</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--border-secondary)" }}>
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>Active Sessions</div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Manage devices with access to your account</div>
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", padding: "4px 10px", background: "var(--bg-elevated)", borderRadius: 6, border: "1px solid var(--border-secondary)" }}>
              Coming soon
            </span>
          </div>
          <div style={{ padding: "16px 0 4px", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            Session management will be available when Chetan's tenancy API exposes the sessions endpoint.
          </div>
        </section>

        {/* ── Security ────────────────────────────────────────────────────── */}
        <section aria-labelledby="security-heading" className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Shield size={18} color="var(--accent-light)" aria-hidden="true" />
            <h2 id="security-heading" style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>Security</h2>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border-secondary)" }}>
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>Change Password</div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 2 }}>Update your account password</div>
            </div>
            <button id="change-password-btn" className="btn btn-secondary btn-sm" aria-label="Change password">Change</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0" }}>
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--risk-critical)" }}>Delete Account</div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 2 }}>Permanently remove your account and all data</div>
            </div>
            <button id="delete-account-btn" className="btn btn-danger btn-sm" aria-label="Delete account permanently">Delete</button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: checked ? "var(--accent)" : "var(--bg-tertiary)",
        border: `1px solid ${checked ? "var(--accent)" : "var(--border-secondary)"}`,
        cursor: "pointer", position: "relative",
        transition: "all var(--transition-fast)",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: "50%", background: "white",
        position: "absolute", top: 2,
        left: checked ? 22 : 2,
        transition: "left var(--transition-fast)",
        boxShadow: "var(--shadow-sm)",
      }} />
    </button>
  );
}

function ChannelToggle({ id, icon, label, description, checked, onChange }: {
  id: string; icon: React.ReactNode; label: string; description: string;
  checked: boolean; onChange: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 14px", borderRadius: 10,
      background: checked ? "var(--accent-subtle)" : "var(--bg-elevated)",
      border: `1px solid ${checked ? "var(--border-primary)" : "var(--border-secondary)"}`,
      transition: "all var(--transition-fast)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: checked ? "var(--accent-light)" : "var(--text-muted)" }} aria-hidden="true">{icon}</span>
        <div>
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{description}</div>
        </div>
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} label={`Toggle ${label}`} />
    </div>
  );
}

function TypeToggle({ id, label, checked, onChange }: {
  id: string; label: string; checked: boolean; onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", borderRadius: 8, cursor: "pointer",
        background: "var(--bg-elevated)", border: "1px solid var(--border-secondary)",
        fontSize: "var(--font-size-xs)", fontWeight: 500,
        transition: "background var(--transition-fast)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {checked
          ? <CheckCircle size={14} color="var(--risk-low)" aria-hidden="true" />
          : <div style={{ width: 14, height: 14, borderRadius: "50%", border: "1px solid var(--border-secondary)" }} aria-hidden="true" />}
        {label}
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        aria-label={`Toggle ${label} notifications`}
      />
    </label>
  );
}

function formatTypeLabel(key: string): string {
  const labels: Record<string, string> = {
    debtRequested: "Debt Requested",
    debtConfirmed: "Debt Confirmed",
    debtRejected: "Debt Rejected",
    debtDisputed: "Debt Disputed",
    paymentRecorded: "Payment Recorded",
    settlementReady: "Settlement Ready",
    settlementConfirmed: "Settlement Confirmed",
    cycleNetted: "Cycle Netted",
    riskFlagged: "Risk Flagged",
    debtOverdue: "Debt Overdue",
    debtDueSoon: "Debt Due Soon",
    digest: "Daily Digest",
  };
  return labels[key] || key;
}
