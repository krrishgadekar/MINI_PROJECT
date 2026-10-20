import { useState, useEffect } from "react";
import { User, Mail, MapPin, Building2, Phone, Save, X, Loader, Edit3 } from "lucide-react";
import { useAuth } from "../state/AuthProvider";
import { api } from "../api";
import { useToast } from "../components/ui/Toast";

export default function Profile() {
  const { merchant, reload } = useAuth();
  const { success: showSuccess, error: showError } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(merchant?.name || "");
  const [phone, setPhone] = useState(merchant?.phone || "");
  const [businessName, setBusinessName] = useState(merchant?.businessName || "");
  const [saving, setSaving] = useState(false);

  // Sync state if merchant changes from context
  useEffect(() => {
    if (merchant) {
      setName(merchant.name || "");
      setPhone(merchant.phone || "");
      setBusinessName(merchant.businessName || "");
    }
  }, [merchant]);

  const initials = (name || merchant?.name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showError("Name cannot be empty.");
      return;
    }

    try {
      setSaving(true);
      await api.auth.updateMe({
        name: name.trim(),
        phone: phone.trim() || undefined,
        businessName: businessName.trim() || undefined,
      });
      await reload();
      showSuccess("Profile updated successfully!");
      setIsEditing(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Failed to update profile.";
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(merchant?.name || "");
    setPhone(merchant?.phone || "");
    setBusinessName(merchant?.businessName || "");
    setIsEditing(false);
  };

  return (
    <div className="animate-fade-in" style={{ padding: "var(--content-padding)", maxWidth: 900 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "var(--font-size-2xl)", fontWeight: 800, marginBottom: 4 }}>Your Profile</h1>
        <p style={{ color: "var(--text-muted)" }}>Manage your account information and business identity</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        {/* Profile Card */}
        <div className="glass-card" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{
            width: 84,
            height: 84,
            borderRadius: "50%",
            background: "var(--accent-gradient-vivid)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 800,
            fontSize: "var(--font-size-2xl)",
            margin: "0 auto 16px",
            boxShadow: "0 0 30px rgba(124, 58, 237, 0.3)",
          }}>
            {initials}
          </div>
          <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, marginBottom: 4 }}>
            {name || "Merchant"}
          </h2>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", marginBottom: 16 }}>
            {businessName || "Merchant Account"}
          </p>

          <div style={{ width: "100%", marginTop: "auto" }}>
            {!isEditing ? (
              <button
                id="edit-profile-btn"
                className="btn btn-secondary"
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={() => setIsEditing(true)}
              >
                <Edit3 size={15} /> Edit Profile
              </button>
            ) : (
              <button
                id="cancel-edit-profile-btn"
                className="btn btn-secondary"
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={handleCancel}
                disabled={saving}
              >
                <X size={15} /> Cancel Editing
              </button>
            )}
          </div>
        </div>

        {/* Details or Edit Form */}
        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}>
              {isEditing ? "Edit Account Details" : "Account Details"}
            </h2>
            {isEditing && (
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                Changes are saved to your account
              </span>
            )}
          </div>

          {!isEditing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { icon: User, label: "Full Name", value: name || "Not specified" },
                { icon: Mail, label: "Email Address", value: merchant?.email || "Not specified" },
                { icon: Phone, label: "Phone", value: phone || "Not specified" },
                { icon: Building2, label: "Business / Institution", value: businessName || "Not specified" },
                { icon: MapPin, label: "Location", value: "Mumbai, India" },
              ].map((item) => (
                <div key={item.label} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border-secondary)",
                }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "var(--accent-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <item.icon size={16} color="var(--accent-light)" />
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{item.label}</div>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label htmlFor="profile-name" style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: 600, marginBottom: 6 }}>
                  Full Name *
                </label>
                <input
                  id="profile-name"
                  type="text"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  style={{ width: "100%", padding: "9px 12px", fontSize: "var(--font-size-sm)" }}
                  required
                />
              </div>

              <div>
                <label htmlFor="profile-email" style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: 600, marginBottom: 6 }}>
                  Email Address (Read-only)
                </label>
                <input
                  id="profile-email"
                  type="email"
                  className="input-field"
                  value={merchant?.email || ""}
                  disabled
                  style={{ width: "100%", padding: "9px 12px", fontSize: "var(--font-size-sm)", opacity: 0.6, cursor: "not-allowed" }}
                />
              </div>

              <div>
                <label htmlFor="profile-phone" style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: 600, marginBottom: 6 }}>
                  Phone Number
                </label>
                <input
                  id="profile-phone"
                  type="tel"
                  className="input-field"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  style={{ width: "100%", padding: "9px 12px", fontSize: "var(--font-size-sm)" }}
                />
              </div>

              <div>
                <label htmlFor="profile-business" style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: 600, marginBottom: 6 }}>
                  Business / Institution Name
                </label>
                <input
                  id="profile-business"
                  type="text"
                  className="input-field"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Business or organization"
                  style={{ width: "100%", padding: "9px 12px", fontSize: "var(--font-size-sm)" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  id="save-profile-btn"
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {saving ? (
                    <><Loader size={15} className="spin" /> Saving...</>
                  ) : (
                    <><Save size={15} /> Save Changes</>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
