import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Debts from "./pages/Debts";
import Settlement from "./pages/Settlement";
import Risk from "./pages/Risk";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Documentation from "./pages/Documentation";
import PrivacyPolicy from "./pages/PrivacyPolicy";

/**
 * App — Root component with routing.
 *
 * Routes:
 *  /login     → Login page (public)
 *  /register  → Register page (public)
 *  /          → Dashboard (requires auth)
 *  /debts     → Debt Management (requires auth)
 *  /settlement → Settlement (requires auth)
 *  /risk      → Risk Analysis (requires auth)
 */

function isAuthenticated(): boolean {
  return !!localStorage.getItem("creditflow_token");
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        {/* Protected routes with Layout */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="debts" element={<Debts />} />
          <Route path="settlement" element={<Settlement />} />
          <Route path="risk" element={<Risk />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="docs" element={<Documentation />} />
          <Route path="privacy-policy" element={<PrivacyPolicy />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
