import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Risk from "./pages/Risk";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Documentation from "./pages/Documentation";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import { ToastProvider, ErrorBoundary, Skeleton } from "./components/ui";

// Lazy-loaded placeholder pages for modular slice development (FE-01)
const Network = lazy(() => import("./pages/Network"));
const Ledger = lazy(() => import("./pages/Ledger"));
const TransactionDetail = lazy(() => import("./pages/TransactionDetail"));
const Settle = lazy(() => import("./pages/Settle"));
const Groups = lazy(() => import("./pages/Groups"));
const Inbox = lazy(() => import("./pages/Inbox"));
const Activity = lazy(() => import("./pages/Activity"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageFallback() {
  return (
    <div style={{ padding: "var(--content-padding)" }}>
      <Skeleton width="30%" height={32} style={{ marginBottom: 16 }} />
      <Skeleton height={180} style={{ marginBottom: 20 }} />
      <Skeleton height={280} />
    </div>
  );
}

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
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ErrorBoundary>
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

              {/* Protected app routes with layout shell */}
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                {/* FE-01 Information Architecture */}
                <Route index element={<Dashboard />} />
                <Route
                  path="network"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <Network />
                    </Suspense>
                  }
                />
                <Route
                  path="ledger"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <Ledger />
                    </Suspense>
                  }
                />
                <Route
                  path="ledger/:debtId"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <TransactionDetail />
                    </Suspense>
                  }
                />
                <Route
                  path="settle"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <Settle />
                    </Suspense>
                  }
                />
                <Route path="risk" element={<Risk />} />
                <Route
                  path="groups"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <Groups />
                    </Suspense>
                  }
                />
                <Route
                  path="inbox"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <Inbox />
                    </Suspense>
                  }
                />
                <Route
                  path="activity"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <Activity />
                    </Suspense>
                  }
                />
                <Route path="settings" element={<Settings />} />
                <Route path="profile" element={<Profile />} />

                {/* Backwards-compatible route aliases */}
                <Route path="debts" element={<Navigate to="/ledger" replace />} />
                <Route path="settlement" element={<Navigate to="/settle" replace />} />
                <Route path="docs" element={<Documentation />} />
                <Route path="privacy-policy" element={<PrivacyPolicy />} />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </ToastProvider>
    </QueryClientProvider>
  );
}
