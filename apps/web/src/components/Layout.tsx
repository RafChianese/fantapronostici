import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Home, Trophy, ListChecks, BookOpenText, UserCircle, Shield, Crown, BarChart3, CalendarDays } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useLoading } from "../lib/loading";
import { FullScreenLoaderOverlay } from "./FullScreenLoaderOverlay";
import { GuidedTour, TourStep } from "./GuidedTour";
import { Button, Spinner } from "./ui";
import { LockBanner } from "./LockBanner";
import { UserAvatar } from "./Avatar";

function Icon({
  name,
  active,
}: {
  name: "dashboard" | "leaderboard" | "predictions" | "leagues" | "menu" | "live" | "calendar";
  active?: boolean;
}) {
  const stroke = active ? (name === "menu" ? "#ffffff" : name === "live" ? "#34d399" : "#fb7185") : "#64748b"; // rose-400 / slate-500
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

  
  if (name === "dashboard") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M3 10.5L12 3l9 7.5" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </svg>
    );
  }


  if (name === "live") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M12 8v4l3 2" />
        <circle cx="12" cy="12" r="9" />
        <path d="M4.9 4.9l2.1 2.1" />
        <path d="M19.1 4.9l-2.1 2.1" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
      </svg>
    );
  }

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
  icon,
  onClick,
  tourId,
}: {
  to: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  tourId?: string;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      data-tour={tourId}
      className={({ isActive }) =>
        `block w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
          isActive ? "bg-rose-600 text-white" : "text-slate-200 hover:bg-slate-800/70"
        }`
      }
    >
      <span className="flex items-center gap-2">
        {icon ? <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden="true">{icon}</span> : null}
        <span>{children}</span>
      </span>
    </NavLink>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, memberships, activeLeagueId, setActiveLeague, logout } = useAuth();
  const { isLoading } = useLoading();
  const nav = useNavigate();

  const [switchingLeague, setSwitchingLeague] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);

  useEffect(() => {
    setDesktopMenuOpen(false);
  }, [location.pathname]);
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

  // --- Guided tutorial (versioned keys) ---
  const setupTutorialKey = "tm_tutorial_setup_v1_done";
  const userTutorialKey = "tm_tutorial_user_v1_done";
  const adminTutorialKey = "tm_tutorial_admin_v1_done";
  const [showTour, setShowTour] = useState<null | "setup" | "user" | "admin">(null);

  const setupSteps: TourStep[] = useMemo(
    () => [
      {
        id: "join",
        target: '[data-tour="join-league"]',
        title: "Unisciti a una lega",
        body: "Inserisci il codice invito che ti ha dato l'admin e invia la richiesta. Quando sarai approvato potrai inserire i pronostici.",
      },
      {
        id: "create",
        target: '[data-tour="toggle-create-league"]',
        title: "Crea la tua lega",
        body: "Se non hai un codice invito, puoi creare la tua lega. Tocca qui per aprire il form di creazione.",
      },
    ],
    []
  );

  const userSteps: TourStep[] = useMemo(
    () => [
      {
        id: "tabs",
        target: '[data-tour="bottom-tabs"]',
        title: "Navigazione principale",
        body: "Qui trovi le sezioni principali: Home, Classifica, Pronostici, Leghe e Live.",
      },
      {
        id: "predictions",
        target: '[data-tour="tab-predictions"]',
        title: "I miei pronostici",
        body: "Inserisci e modifica i pronostici finché la finestra è aperta.",
      },
      {
        id: "leaderboard",
        target: '[data-tour="tab-leaderboard"]',
        title: "Classifica",
        body: "Controlla i punti tuoi e degli altri partecipanti.",
      },
      {
        id: "leagues",
        target: '[data-tour="tab-leagues"]',
        title: "Leghe",
        body: "Crea una lega o unisciti con un codice invito. Puoi anche cambiare lega se ne hai più di una.",
      },
      {
        id: "invite",
        target: '[data-tour="invite-code"]',
        title: "Codice invito",
        body: "Condividi questo codice per far entrare altri partecipanti nella tua lega.",
      },
    ],
    []
  );

  const adminSteps: TourStep[] = useMemo(
    () => [
      {
        id: "admin-link",
        target: '[data-tour="admin-dashboard-link"]',
        title: "Dashboard admin lega",
        body: "Da qui gestisci la tua lega: partecipanti, regole e lock pronostici.",
      },
      {
        id: "admin-tabs",
        target: '[data-tour="admin-tabs"]',
        title: "Partecipanti e Regole & Lock",
        body: "• Partecipanti: approvi richieste e assegni ruoli.\n• Regole & Lock: punti e finestra di modifica dei pronostici.",
      },
    ],
    []
  );

  useEffect(() => {
    if (!user) {
      setShowTour(null);
      return;
    }

    const hasApprovedLeague = approved.length > 0;

    const setupDone = (() => {
      try {
        return localStorage.getItem(setupTutorialKey) === "true";
      } catch {
        return false;
      }
    })();

    // If the user is not in any approved league yet, show the setup tour first.
    if (!hasApprovedLeague && !setupDone) {
      setShowTour("setup");
      return;
    }

    // Start at first access after login (per versioned key).
    const userDone = (() => {
      try {
        return localStorage.getItem(userTutorialKey) === "true";
      } catch {
        return false;
      }
    })();
    const adminDone = (() => {
      try {
        return localStorage.getItem(adminTutorialKey) === "true";
      } catch {
        return false;
      }
    })();

    // Don't start the main navigation tour until the user is in a league.
    if (hasApprovedLeague && !userDone) {
      setShowTour("user");
      return;
    }

    const shouldSeeAdmin = isLeagueAdmin || isSuperAdmin;
    if (shouldSeeAdmin && !adminDone) {
      setShowTour("admin");
      return;
    }
  }, [user, approved.length, isLeagueAdmin, isSuperAdmin]);

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
    <div className="tm-app-bg min-h-screen text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 tm-glass-nav text-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {user ? (
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white shadow-sm md:hidden"
                onClick={() => setDrawerOpen((v) => !v)}
                aria-label="Apri menu"
              >
                <Icon name="menu" active />
              </button>
            ) : (
              <div className="hidden h-10 w-10 rounded-2xl bg-rose-600 md:block" />
            )}

            <Link to={user ? "/" : "/login"} className="min-w-0">
              <div className="truncate text-base font-extrabold leading-tight text-slate-100">{leagueTitle}</div>
              {inviteCode ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span data-tour="invite-code" className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-200">
                    Codice invito: <span className="font-semibold">{inviteCode}</span>
                  </span>
                  <button
                    type="button"
                    className="text-xs font-bold text-slate-100/95 hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      copyInviteCode();
                    }}
                  >
                    {copied ? "Copiato!" : "Copia"}
                  </button>
                </div>
              ) : (
                <div className="mt-1 text-xs text-slate-400">Fase a gironi</div>
              )}
            </Link>
          </div>

          {/* Desktop nav */}
        <nav className="hidden items-center gap-2 md:flex">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `rounded-2xl px-3 py-2 text-sm font-semibold transition-colors ${isActive ? "bg-white/10 text-slate-100" : "text-slate-200 hover:bg-white/5"}`
            }
          >
            Home
          </NavLink>

          {(isLeagueAdmin || isSuperAdmin) ? (
            <NavLink
              to="/admin"
              data-tour="admin-dashboard-link"
              className={({ isActive }) =>
                `rounded-2xl px-3 py-2 text-sm font-semibold transition-colors ${isActive ? "bg-white/10 text-slate-100" : "text-slate-200 hover:bg-white/5"}`
              }
            >
              Area admin
            </NavLink>
          ) : null}

          {isSuperAdmin ? (
            <NavLink
              to="/super"
              className={({ isActive }) =>
                `rounded-2xl px-3 py-2 text-sm font-semibold transition-colors ${isActive ? "bg-white/10 text-slate-100" : "text-slate-200 hover:bg-white/5"}`
              }
            >
              Area superAdmin
            </NavLink>
          ) : null}

          <div className="relative">
            <button
              type="button"
              onClick={() => setDesktopMenuOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"
              aria-haspopup="menu"
              aria-expanded={desktopMenuOpen ? "true" : "false"}
            >
              Menu
              <span className="text-slate-400">▾</span>
            </button>

            {desktopMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl tm-glass-sheet"
              >
                <div className="p-2">
                  <NavItem to="/leaderboard" onClick={() => setDesktopMenuOpen(false)}>
                    Classifica
                  </NavItem>
                  <NavItem to="/predictions" onClick={() => setDesktopMenuOpen(false)}>
                    Pronostici
                  </NavItem>
                  <NavItem to="/calendar" onClick={() => setDesktopMenuOpen(false)}>
                    Calendario
                  </NavItem>
                  <NavItem to="/onboarding" onClick={() => setDesktopMenuOpen(false)}>
                    Leghe
                  </NavItem>
                  {user && activeMembership ? (
                    <>
                      <NavItem to="/regolamento" onClick={() => setDesktopMenuOpen(false)}>
                        Regolamento
                      </NavItem>
                      <NavItem to="/league-stats" icon={<BarChart3 size={18} />} onClick={() => setDesktopMenuOpen(false)}>
                        Statistiche di lega
                      </NavItem>
                    </>
                  ) : null}
                  <div className="my-2 h-px bg-white/10" />
                  <NavItem to="/account" onClick={() => setDesktopMenuOpen(false)}>
                    Account
                  </NavItem>
                </div>
              </div>
            ) : null}
          </div>
        </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                {approved.length > 1 ? (
                  <div className="hidden md:flex items-center gap-2">
                    <select
                      className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
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
                <div className="hidden items-center gap-2 text-sm text-slate-200 md:flex">
                  <UserAvatar avatarId={(user as any).avatarId || null} mode="full" size={44} className="shadow-sm" />
                  <span>Ciao, {user.displayName}</span>
                </div>
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
                <Button variant="secondary" onClick={() => nav("/login")}>
                  Accedi
                </Button>
              </div>
            )}
          </div>
        </div>

        {/*
          Global lock status (league-scoped).
          TEMP: hidden (sticky lock bar) to reduce visual noise on mobile.
          Keep code commented for future re-enable.
        */}
        {/* {user && activeMembership ? <LockBanner /> : null} */}
      </header>

      {/* Mobile drawer (admin/super/leghe + switch lega) */}
      {user && drawerOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-sm tm-glass-sheet shadow-xl border-r border-white/10">
            <div className="border-b border-white/10 p-4">
              <div className="text-sm font-semibold text-slate-100">{user.displayName}</div>
              <div className="text-xs text-slate-400">{user.email}</div>

              {approved.length > 1 ? (
                <div className="mt-3">
                  <div className="text-xs text-slate-400">Cambia lega</div>
                  <select
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
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
                <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Principale</div>

                {/* Main sections (same as bottom tabs) */}
                <NavItem to="/" icon={<Home size={18} />} onClick={() => setDrawerOpen(false)}>
                  Home
                </NavItem>
                {activeMembership ? (
                  <>
                    <NavItem to="/leaderboard" icon={<Trophy size={18} />} onClick={() => setDrawerOpen(false)}>
                      Classifica
                    </NavItem>
                    <NavItem to="/predictions" icon={<ListChecks size={18} />} onClick={() => setDrawerOpen(false)}>
                      I miei pronostici
                    </NavItem>
                    <NavItem to="/calendar" icon={<CalendarDays size={18} />} onClick={() => setDrawerOpen(false)}>
                      Calendario
                    </NavItem>
                  </>
                ) : null}

                <div className="mt-1 px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Altro</div>
                {isLeagueAdmin || isSuperAdmin ? (
                  <NavItem to="/admin" icon={<Shield size={18} />} onClick={() => setDrawerOpen(false)}>
                    Area admin
                  </NavItem>
                ) : null}
                {isSuperAdmin ? (
                  <NavItem to="/super" icon={<Crown size={18} />} onClick={() => setDrawerOpen(false)}>
                    Area superAdmin
                  </NavItem>
                ) : null}

                <NavItem to="/account" icon={<UserCircle size={18} />} onClick={() => setDrawerOpen(false)}>
                  Account
                </NavItem>

                {activeMembership ? (
                  <>
                    <NavItem to="/regolamento" icon={<BookOpenText size={18} />} onClick={() => setDrawerOpen(false)}>
                      Regolamento
                    </NavItem>
                    <NavItem to="/league-stats" icon={<BarChart3 size={18} />} onClick={() => setDrawerOpen(false)}>
                      Statistiche di lega
                    </NavItem>
                  </>
                ) : null}

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-200 hover:bg-white/5"
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
          <div className="absolute inset-0 z-20 flex items-start justify-center bg-slate-950/60 pt-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 shadow-sm">
              <Spinner />
              <div className="text-sm font-medium text-slate-100">Aggiorno la lega…</div>
            </div>
          </div>
        ) : null}

        {children}
      </main>

      {/* Mobile bottom nav (main sections only) */}
      {mobileMainTabsVisible ? (
        <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 tm-glass-sheet md:hidden">
          <div
            data-tour="bottom-tabs"
            className="mx-auto flex max-w-6xl items-stretch gap-1 px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
          >
            
            {/* Order: Classifica · Pronostici · Home (center) · Leghe · Live */}
            <NavLink
              to="/leaderboard"
              data-tour="tab-leaderboard"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold ${
                  isActive ? "bg-rose-500/15 text-rose-200" : "text-slate-300 hover:bg-white/5"
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
              to="/predictions"
              data-tour="tab-predictions"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold ${
                  isActive ? "bg-rose-500/15 text-rose-200" : "text-slate-300 hover:bg-white/5"
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
              to="/"
              data-tour="tab-dashboard"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold ${
                  isActive ? "bg-rose-500/15 text-rose-200" : "text-slate-300 hover:bg-white/5"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name="dashboard" active={isActive} />
                  <span>Home</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/onboarding"
              data-tour="tab-leagues"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold ${
                  isActive ? "bg-rose-500/15 text-rose-200" : "text-slate-300 hover:bg-white/5"
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
            <NavLink
              to="/calendar"
              data-tour="tab-calendar"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold ${
                  isActive ? "bg-sky-500/15 text-sky-200" : "text-slate-300 hover:bg-white/5"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name="calendar" active={isActive} />
                  <span>Calendario</span>
                </>
              )}
            </NavLink>
            <NavLink
              to="/live"
              data-tour="tab-live"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold ${
                  isActive ? "bg-emerald-500/15 text-emerald-200" : "text-slate-300 hover:bg-white/5"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name="live" active={isActive} />
                  <span>Live</span>
                </>
              )}
            </NavLink>
          </div>
        </nav>
      ) : null}

      {isLoading ? <FullScreenLoaderOverlay /> : null}

      <GuidedTour
        open={showTour === "setup"}
        steps={setupSteps}
        storageKey={setupTutorialKey}
        onClose={() => setShowTour(null)}
      />

      <GuidedTour
        open={showTour === "user"}
        steps={userSteps}
        storageKey={userTutorialKey}
        onClose={() => setShowTour(null)}
      />
      <GuidedTour
        open={showTour === "admin"}
        steps={adminSteps}
        storageKey={adminTutorialKey}
        onClose={() => setShowTour(null)}
      />
    </div>
  );
}
