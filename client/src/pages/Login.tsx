import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { authAPI } from "../api/client";
import Logo from "../components/Logo";
import { useAuth } from "../state/AuthProvider";

/**
 * Login — Clean auth page with CreditFlow branding.
 */
export default function Login() {
  const navigate = useNavigate();
  const { reload } = useAuth();
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
    try {
      const res = await authAPI.login(email, password);
      if (res.data?.accessToken) {
        localStorage.setItem("creditflow_token", res.data.accessToken);
        if (res.data.refreshToken) {
          localStorage.setItem("creditflow_refresh_token", res.data.refreshToken);
        }
        if (res.data.merchant) {
          localStorage.setItem("creditflow_user", JSON.stringify(res.data.merchant));
        }
        await reload();
        navigate("/");
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { message?: string } } };
      setError(errorObj.response?.data?.message || "Failed to sign in. Please check your credentials.");
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
          <h1>CreditFlow</h1>
          <p>Simple debt settlement for merchant groups</p>
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
              "Signing in..."
            ) : (
              <>
                Sign In <ArrowRight size={18} />
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
