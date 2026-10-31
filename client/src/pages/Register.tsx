import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { authAPI } from "../api/client";
import Logo from "../components/Logo";

/**
 * Register — Clean account creation page.
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
    try {
      const res = await authAPI.register(name, email, password);
      if (res.data?.accessToken) {
        localStorage.setItem("creditflow_token", res.data.accessToken);
        if (res.data.refreshToken) {
          localStorage.setItem("creditflow_refresh_token", res.data.refreshToken);
        }
        if (res.data.merchant) {
          localStorage.setItem("creditflow_user", JSON.stringify(res.data.merchant));
        }
        navigate("/");
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { message?: string } } };
      setError(errorObj.response?.data?.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <Logo size={52} />
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
              color: "var(--color-critical)",
              fontSize: "var(--font-size-sm)",
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--color-critical-bg)',
              borderRadius: 'var(--border-radius-sm)',
              border: '1px solid rgba(184, 58, 44, 0.15)',
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
