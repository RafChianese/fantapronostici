import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { LoadingProvider } from "./lib/loading";
import { FullScreenLoaderOverlay } from "./components/FullScreenLoaderOverlay";
import { Layout } from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AccountPage from "./pages/AccountPage";
import OnboardingPage from "./pages/OnboardingPage";
import DashboardPage from "./pages/DashboardPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import UserSummaryPage from "./pages/UserSummaryPage";
import RulesPage from "./pages/RulesPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import SuperAdminPage from "./pages/SuperAdminPage";

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
        <Layout>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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
            path="/leaderboard"
            element={
              <RequireLeague>
                <LeaderboardPage />
              </RequireLeague>
            }
          />

          <Route
            path="/rules"
            element={
              <RequireLeague>
                <RulesPage />
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
      </LoadingProvider>
    </AuthProvider>
  );
}
