import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { LoadingProvider } from "./lib/loading";
import { ToastProvider } from "./lib/toast";
import { LockProvider } from "./lib/lock";
import { FullScreenLoaderOverlay } from "./components/FullScreenLoaderOverlay";
import { Layout } from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import AccountPage from "./pages/AccountPage";
import OnboardingPage from "./pages/OnboardingPage";
import DashboardPage from "./pages/DashboardPage";
import PredictionsPage from "./pages/PredictionsPage";
import LeagueStatsPage from "./pages/LeagueStatsPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import UserSummaryPage from "./pages/UserSummaryPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import RegolamentoPage from "./pages/RegolamentoPage";
import { setToken } from "./lib/api";

function HashTokenBootstrapper() {
  const loc = useLocation();
  useEffect(() => {
    // Robustness: if a host redirects to /index.html#token=... (or any route), still accept it.
    const hash = window.location.hash || "";
    if (!hash) return;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const token = params.get("token");
    if (!token) return;
    // Avoid double-handling on the dedicated callback route.
    if (loc.pathname === "/oauth/callback") return;
    setToken(token);
    // Clean hash + reload to let AuthProvider pick it up.
    window.location.replace("/");
  }, [loc.pathname]);
  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullScreenLoaderOverlay label="Caricamento…" />;
  // Default landing for unauthenticated users is Login.
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

function RequireLeague({ children }: { children: React.ReactNode }) {
  const { user, loading, memberships, activeLeagueId } = useAuth();
  const loc = useLocation();
  if (loading) return <FullScreenLoaderOverlay label="Caricamento…" />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;

  const approved = memberships.filter((m) => m.status === "APPROVED");
  const hasActive = approved.some((m) => m.league.id === activeLeagueId) || approved.length > 0;
  if (!hasActive) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function RequireLeagueAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, memberships, activeLeagueId } = useAuth();
  const loc = useLocation();
  if (loading) return <FullScreenLoaderOverlay label="Caricamento…" />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;

  if (user.globalRole === "SUPER_ADMIN") return <>{children}</>;

  const m = memberships.find((x) => x.status === "APPROVED" && x.league.id === activeLeagueId);
  if (!m || m.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullScreenLoaderOverlay label="Caricamento…" />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (user.globalRole !== "SUPER_ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <LoadingProvider>
        <ToastProvider>
          <LockProvider>
            <Layout>
            <HashTokenBootstrapper />
            <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

          {/* Email verification / password reset are temporarily disabled */}
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />

          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <OnboardingPage />
              </RequireAuth>
            }
          />

          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />

          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />

          <Route
            path="/"
            element={
              <RequireLeague>
                <DashboardPage />
              </RequireLeague>
            }
          />

          

          <Route
            path="/predictions"
            element={
              <RequireLeague>
                <PredictionsPage />
              </RequireLeague>
            }
          />

<Route
            path="/leaderboard"
            element={
              <RequireLeague>
                <LeaderboardPage />
              </RequireLeague>
            }
          />

          <Route
            path="/regolamento"
            element={
              <RequireLeague>
                <RegolamentoPage />
              </RequireLeague>
            }
          />

          <Route
            path="/league-stats"
            element={
              <RequireLeague>
                <LeagueStatsPage />
              </RequireLeague>
            }
          />

          <Route
            path="/users/:id"
            element={
              <RequireLeague>
                <UserSummaryPage />
              </RequireLeague>
            }
          />

          <Route
            path="/admin"
            element={
              <RequireLeagueAdmin>
                <AdminDashboardPage />
              </RequireLeagueAdmin>
            }
          />

          <Route
            path="/super"
            element={
              <RequireSuperAdmin>
                <SuperAdminPage />
              </RequireSuperAdmin>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Layout>
          </LockProvider>
        </ToastProvider>
      </LoadingProvider>
    </AuthProvider>
  );
}
