import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Register — Account creation page.
 */
export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password || !confirm) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const fakeToken = btoa(JSON.stringify({ email, name, iat: Date.now() }));
    localStorage.setItem("creditflow_token", fakeToken);
    setLoading(false);
    navigate("/");
  };

  return (
    <div className="auth-page">
      <div style={{
        position: 'absolute',
        top: '60%',
        left: '20%',
        width: 350,
        height: 350,
        background: 'radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'floatOrb1 22s ease-in-out infinite reverse',
        zIndex: 0,
      }} />

      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <Sparkles size={24} />
          </div>
          <h1>Join CreditFlow</h1>
          <p>Create your account to get started</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              className="form-input"
              type="text"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email Address</label>
            <input
              id="reg-email"
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              className="form-input"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-confirm">Confirm Password</label>
            <input
              id="reg-confirm"
              className="form-input"
              type="password"
              placeholder="Re-enter your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && (
            <div style={{
              color: "var(--risk-critical)",
              fontSize: "var(--font-size-sm)",
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--risk-critical-bg)',
              borderRadius: 'var(--border-radius-sm)',
              border: '1px solid rgba(248, 113, 113, 0.2)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: "100%", marginTop: 4 }}
            disabled={loading}
          >
            {loading ? (
              "Creating account..."
            ) : (
              <>
                Create Account <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{" "}
          <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
