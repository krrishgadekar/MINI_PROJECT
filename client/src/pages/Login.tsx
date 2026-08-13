import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Login — Beautiful auth page with animated gradient orbs.
 */
export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const fakeToken = btoa(JSON.stringify({ email, iat: Date.now() }));
    localStorage.setItem("creditflow_token", fakeToken);
    setLoading(false);
    navigate("/");
  };

  return (
    <div className="auth-page">
      {/* Extra floating orb */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '60%',
        width: 300,
        height: 300,
        background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'floatOrb2 20s ease-in-out infinite reverse',
        zIndex: 0,
      }} />

      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <Sparkles size={24} />
          </div>
          <h1>CreditFlow</h1>
          <p>Smart debt settlement for merchant networks</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email Address
            </label>
            <input
              id="login-email"
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              "Signing in..."
            ) : (
              <>
                Get Started <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          New here?{" "}
          <Link to="/register">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
