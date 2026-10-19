import { User, Mail, MapPin, Building2, Phone } from "lucide-react";
import { useAuth } from "../state/AuthProvider";

export default function Profile() {
  const { merchant } = useAuth();

  const name = merchant?.name || "Parth Goggi";
  const email = merchant?.email || "parth@spit.ac.in";
  const phone = merchant?.phone || "+91 98765 43210";
  const business = merchant?.businessName || "SPIT Mumbai";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2>Your Profile</h2>
        <p>Manage your account information</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
        {/* Profile Card */}
        <div className="glass-card" style={{ textAlign: "center" }}>
          <div style={{
            width: 80,
            height: 80,
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
          <h3 style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, marginBottom: 4 }}>
            {name}
          </h3>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
            Merchant Account
          </p>
          <div style={{ marginTop: 20 }}>
            <button className="btn btn-secondary" style={{ width: "100%" }}>
              Edit Profile
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="glass-card">
          <h3 style={{ fontSize: "var(--font-size-md)", fontWeight: 700, marginBottom: 20 }}>
            Account Details
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { icon: User, label: "Full Name", value: name },
              { icon: Mail, label: "Email", value: email },
              { icon: Phone, label: "Phone", value: phone },
              { icon: Building2, label: "Business / Institution", value: business },
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
        </div>
      </div>
    </div>
  );
}
