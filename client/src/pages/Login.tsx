import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogIn } from "lucide-react";

/**
 * Login — JWT login page.
 *
 * Currently uses mock auth (stores a fake token in localStorage).
 * Will be wired to Chetan's POST /api/auth/login when available.
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

    // --- Mock auth (replace with Chetan's API later) ---
    // Simulate a network request
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Accept any credentials for now
    const fakeToken = btoa(JSON.stringify({ email, iat: Date.now() }));
    localStorage.setItem("creditflow_token", fakeToken);
    setLoading(false);
    navigate("/");
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-in-up">
        <div className="auth-brand">
          <div className="auth-brand-icon">C</div>
          <h1>CreditFlow</h1>
          <p>Graph-Theoretic Debt Settlement Engine</p>
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
              placeholder="parth@spit.ac.in"
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
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div
              style={{
                color: "var(--risk-critical)",
                fontSize: "var(--font-size-sm)",
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: "100%" }}
            disabled={loading}
          >
            <LogIn size={18} />
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account?{" "}
          <Link to="/register">Create one</Link>
        </div>
      </div>
    </div>
  );
}
