import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button, Spinner } from "./ui";

function Icon({
  name,
  active,
}: {
  name: "leaderboard" | "predictions" | "leagues" | "menu";
  active?: boolean;
}) {
  const stroke = active ? "#2EC4B6" : "#64748b"; // slate-500
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "menu") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </svg>
    );
  }

  if (name === "predictions") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    );
  }

  if (name === "leagues") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z" />
        <path d="M8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3z" />
        <path d="M8 13c-2.76 0-5 1.79-5 4v1" />
        <path d="M16 13c-2.76 0-5 1.79-5 4v1" />
      </svg>
    );
  }

  // leaderboard
  return (
    <svg {...common} aria-hidden="true">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-8" />
      <path d="M22 20v-14" />
    </svg>
  );
}

function NavItem({
  to,
  children,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `block w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${
          isActive ? "bg-[#2EC4B6] text-white" : "text-slate-700 hover:bg-slate-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, memberships, activeLeagueId, setActiveLeague, logout } = useAuth();
  const nav = useNavigate();

  const [switchingLeague, setSwitchingLeague] = useState(false);

  const [tourStep, setTourStep] = useState<number>(() => {
    // One-time guided tour on first access (per device)
    try {
      return localStorage.getItem("tm_tour_done") === "1" ? -1 : 0;
    } catch {
      return -1;
    }
  });

  useEffect(() => {
    // If user logs out, don't show tour.
    if (!user) setTourStep(-1);
  }, [user]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const approved = useMemo(() => memberships.filter((m) => m.status === "APPROVED"), [memberships]);
  const activeMembership = useMemo(
    () => approved.find((m) => m.league.id === activeLeagueId) || approved[0] || null,
    [approved, activeLeagueId]
  );

  const isLeagueAdmin = !!activeMembership && activeMembership.role === "ADMIN";
  const isSuperAdmin = user?.globalRole === "SUPER_ADMIN";

  const mobileMainTabsVisible = !!user && !!activeMembership;
  const leagueTitle = activeMembership?.league?.name || "Fanta Pronostici";
  const inviteCode = activeMembership?.league?.code || "";

  async function copyInviteCode() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  function doSwitchLeague(id: string) {
    setSwitchingLeague(true);
    setActiveLeague(id);
    setTimeout(() => setSwitchingLeague(false), 600);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {user ? (
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm md:hidden"
                onClick={() => setDrawerOpen((v) => !v)}
                aria-label="Apri menu"
              >
                <Icon name="menu" active />
              </button>
            ) : (
              <div className="hidden h-10 w-10 rounded-2xl bg-[#2EC4B6] md:block" />
            )}

            <Link to={user ? "/" : "/login"} className="min-w-0">
              <div className="truncate text-base font-semibold leading-tight text-slate-900">{leagueTitle}</div>
              {inviteCode ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                    Codice invito: <span className="font-semibold">{inviteCode}</span>
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-[#2EC4B6] hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      copyInviteCode();
                    }}
                  >
                    {copied ? "Copiato!" : "Copia"}
                  </button>
                </div>
              ) : (
                <div className="mt-1 text-xs text-slate-500">Fase a gironi</div>
              )}
            </Link>
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-2 md:flex">
            <NavItem to="/leaderboard">Classifica</NavItem>
            {user && activeMembership ? <NavItem to="/">I miei pronostici</NavItem> : null}
            {user ? <NavItem to="/onboarding">Leghe</NavItem> : null}
            {user && (isLeagueAdmin || isSuperAdmin) ? (
              <NavItem to="/admin">Dashboard amministratore di lega</NavItem>
            ) : null}
            {user && isSuperAdmin ? <NavItem to="/super">Dashboard Superadmin</NavItem> : null}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                {approved.length > 1 ? (
                  <div className="hidden md:flex items-center gap-2">
                    <select
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={activeMembership?.league.id || ""}
                      onChange={(e) => doSwitchLeague(e.target.value)}
                    >
                      {approved.map((m) => (
                        <option key={m.league.id} value={m.league.id}>
                          {m.league.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="hidden text-sm text-slate-700 md:block">Ciao, {user.displayName}</div>
                <Button
                  onClick={() => {
                    logout();
                    nav("/login");
                  }}
                  variant="ghost"
                >
                  Esci
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button onClick={() => nav("/register")}>Registrati</Button>
                <Button variant="secondary" onClick={() => nav("/login")}>
                  Accedi
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer (admin/super/leghe + switch lega) */}
      {user && drawerOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-sm bg-white shadow-xl">
            <div className="border-b border-slate-100 p-4">
              <div className="text-sm font-semibold text-slate-900">{user.displayName}</div>
              <div className="text-xs text-slate-600">{user.email}</div>

              {approved.length > 1 ? (
                <div className="mt-3">
                  <div className="text-xs text-slate-600">Cambia lega</div>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={activeMembership?.league.id || ""}
                    onChange={(e) => {
                      doSwitchLeague(e.target.value);
                      setDrawerOpen(false);
                    }}
                  >
                    {approved.map((m) => (
                      <option key={m.league.id} value={m.league.id}>
                        {m.league.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="p-3">
              <div className="flex flex-col gap-2">
                <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Menu
                </div>
                {isLeagueAdmin || isSuperAdmin ? (
                  <NavItem to="/admin" onClick={() => setDrawerOpen(false)}>
                    Dashboard amministratore di lega
                  </NavItem>
                ) : null}
                {isSuperAdmin ? (
                  <NavItem to="/super" onClick={() => setDrawerOpen(false)}>
                    Dashboard Superadmin
                  </NavItem>
                ) : null}

                <NavItem to="/account" onClick={() => setDrawerOpen(false)}>
                  Account
                </NavItem>

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                    onClick={() => {
                      logout();
                      setDrawerOpen(false);
                      nav("/login");
                    }}
                  >
                    Esci
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Page body */}
      <main className={`relative mx-auto max-w-6xl px-4 py-6 ${mobileMainTabsVisible ? "pb-24 md:pb-6" : ""}`}>
        {switchingLeague ? (
          <div className="absolute inset-0 z-20 flex items-start justify-center bg-white/60 pt-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <Spinner />
              <div className="text-sm font-medium text-slate-700">Aggiorno la lega…</div>
            </div>
          </div>
        ) : null}

        {children}
      </main>

      {/* Mobile bottom nav (main sections only) */}
      {mobileMainTabsVisible ? (
        <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-100 bg-white md:hidden">
          <div className="mx-auto flex max-w-6xl items-stretch gap-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            <NavLink
              to="/leaderboard"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold ${
                  isActive ? "bg-[#E9FBF9] text-[#0F766E]" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name="leaderboard" active={isActive} />
                  <span>Classifica</span>
                </>
              )}
            </NavLink>
            <NavLink
              to="/"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold ${
                  isActive ? "bg-[#E9FBF9] text-[#0F766E]" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name="predictions" active={isActive} />
                  <span>Pronostici</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/onboarding"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold ${
                  isActive ? "bg-[#E9FBF9] text-[#0F766E]" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name="leagues" active={isActive} />
                  <span>Leghe</span>
                </>
              )}
            </NavLink>
          </div>
        </nav>
      ) : null}
    
      {/* One-time guided tour */}
      {tourStep >= 0 ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Mini guida</div>
                <div className="mt-1 text-sm text-slate-600">
                  {tourStep === 0
                    ? "Qui trovi il menu e puoi cambiare lega o uscire."
                    : tourStep === 1
                    ? "In basso hai le sezioni principali: Classifica, Pronostici e Leghe."
                    : "Apri una giornata, inserisci i pronostici e controlla lo stato delle partite."}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700"
                onClick={() => {
                  try { localStorage.setItem("tm_tour_done", "1"); } catch {}
                  setTourStep(-1);
                }}
                aria-label="Chiudi guida"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-sm font-medium text-slate-600 hover:underline"
                onClick={() => {
                  try { localStorage.setItem("tm_tour_done", "1"); } catch {}
                  setTourStep(-1);
                }}
              >
                Salta
              </button>

              <div className="flex items-center gap-2">
                <div className="text-xs text-slate-500">{tourStep + 1}/3</div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl bg-[#2EC4B6] px-4 py-2 text-sm font-medium text-white"
                  onClick={() => {
                    if (tourStep >= 2) {
                      try { localStorage.setItem("tm_tour_done", "1"); } catch {}
                      setTourStep(-1);
                    } else {
                      setTourStep((v) => v + 1);
                    }
                  }}
                >
                  {tourStep >= 2 ? "Fine" : "Avanti"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
</div>
  );
}
