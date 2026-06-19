import React, { useEffect, useMemo, useState } from "react";
import { api, LeagueStatsResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoading } from "../lib/loading";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Skeleton,
} from "../components/ui";
import {
  Trophy,
  Target,
  CheckCircle2,
  Sigma,
  TrendingUp,
  BarChart3,
  Crown,
  Flame,
  Shield,
  Sparkles,
  HelpCircle,
  Info,
  Medal,
  Swords,
  Activity,
} from "lucide-react";

type FunWinner = {
  userId?: string;
  displayName: string;
  value: number;
};

type FunStat = {
  key: string;
  title: string;
  description?: string;
  formula?: string;
  examples?: string[];
  whyItMatters?: string;
  userId?: string;
  displayName?: string;
  value?: number;
  winners?: FunWinner[];
  tieCount?: number;
};

const FUN_STAT_INFO: Record<
  string,
  { formula: string; examples: string[]; whyItMatters: string; label: string }
> = {
  drawExact: {
    label: "pareggi esatti",
    formula:
      "Conta i pronostici in cui risultato previsto e risultato reale sono identici e terminano in pareggio.",
    examples: [
      "Pronostico 0-0 e risultato 0-0",
      "Pronostico 1-1 e risultato 1-1",
      "Pronostico 2-2 e risultato 2-2",
    ],
    whyItMatters:
      "Premia chi legge bene le partite bloccate e sa quando nessuno riuscirà a scappare.",
  },
  bigExact: {
    label: "esatti con goleada",
    formula:
      "Conta i risultati esatti presi in partite reali con almeno 4 gol totali.",
    examples: [
      "Pronostico 3-1 e risultato 3-1",
      "Pronostico 2-2 e risultato 2-2",
      "Pronostico 4-0 e risultato 4-0",
    ],
    whyItMatters:
      "È la statistica di chi non indovina solo lo 0-0, ma anche il caos totale.",
  },
  zeroZero: {
    label: "0-0 esatti",
    formula:
      "Conta quante volte l'utente ha previsto 0-0 e la partita è davvero finita 0-0.",
    examples: ["Pronostico 0-0 e risultato 0-0"],
    whyItMatters: "Pochi gol, tanta saggezza. O tanta paura.",
  },
  veggente: {
    label: "risultati esatti",
    formula:
      "Conta tutti i risultati esatti presi, indipendentemente dal tipo di partita.",
    examples: [
      "Pronostico 2-1 e risultato 2-1",
      "Pronostico 1-0 e risultato 1-0",
    ],
    whyItMatters:
      "È il titolo più pesante: chi vede il risultato prima degli altri.",
  },
  pragmatico: {
    label: "1X2 senza esatto",
    formula:
      "Conta i pronostici in cui l'utente prende l'esito 1X2 ma non il risultato esatto.",
    examples: [
      "Pronostico 2-1, risultato 1-0",
      "Pronostico 1-1, risultato 2-2",
    ],
    whyItMatters: "Non fa il fenomeno, però porta punti a casa.",
  },
  contabile: {
    label: "somme gol prese",
    formula:
      "Conta quante volte l'utente prende il bonus somma gol previsto dal regolamento della lega.",
    examples: [
      "Pronostico 2-1, risultato 1-2: somma gol 3",
      "Pronostico 0-2, risultato 1-1: somma gol 2",
    ],
    whyItMatters:
      "Per chi sbaglia i nomi delle squadre, ma non la calcolatrice.",
  },
  underOverOnly: {
    label: "salvataggi U/O",
    formula:
      "Conta le partite in cui l'utente fa punti solo con Under/Over 2.5, senza esatto, 1X2 o somma gol.",
    examples: [
      "Pronostico over, risultato over, ma risultato ed esito sbagliati",
    ],
    whyItMatters: "La statistica di chi cade, ma trova un paracadute.",
  },
  kamikaze: {
    label: "goleade previste",
    formula:
      "Conta i pronostici con almeno 5 gol totali previsti, anche se la partita non è ancora terminata.",
    examples: ["Pronostico 3-2", "Pronostico 4-1", "Pronostico 5-0"],
    whyItMatters: "Per chi apre l'app e sceglie sempre spettacolo.",
  },
  catenacciaro: {
    label: "pronostici difensivi",
    formula: "Conta i pronostici 0-0, 1-0 e 0-1.",
    examples: ["0-0", "1-0", "0-1"],
    whyItMatters: "Per chi parcheggia il bus anche nei pronostici.",
  },
  cuoreSpezzato: {
    label: "quasi esatti",
    formula:
      "Conta i risultati non esatti sbagliati di un solo gol complessivo rispetto al risultato reale.",
    examples: [
      "Pronostico 2-1, risultato 2-2",
      "Pronostico 1-1, risultato 0-1",
    ],
    whyItMatters:
      "Racconta tutte le volte in cui mancava davvero pochissimo alla gloria.",
  },
  gufatore: {
    label: "pronostici controcorrente",
    formula:
      "Per ogni partita confronta il pronostico dell'utente con la scelta vincente più pronosticata dagli altri. Conta quando va contro la maggioranza.",
    examples: ["Gli altri vedono casa vincente, lui mette trasferta vincente"],
    whyItMatters: "Per chi non segue il gregge. O per chi porta sfortuna.",
  },
  bomberMancato: {
    label: "goleade fantasma",
    formula:
      "Conta le partite in cui l'utente prevede almeno 4 gol totali ma il risultato reale ha massimo 1 gol.",
    examples: [
      "Pronostico 3-1, risultato 0-0",
      "Pronostico 2-2, risultato 1-0",
    ],
    whyItMatters:
      "Il premio per chi vede calcio champagne anche quando finisce a camomilla.",
  },
  conservatore: {
    label: "pareggi pronosticati",
    formula: "Conta tutti i pronostici in pareggio inseriti dall'utente.",
    examples: ["0-0", "1-1", "2-2"],
    whyItMatters: "Per chi ama la stabilità, anche in classifica.",
  },
  folle: {
    label: "media gol prevista",
    formula:
      "Media dei gol totali pronosticati dall'utente: somma di tutti i gol previsti divisa per il numero di pronostici.",
    examples: ["(2-1 + 3-2 + 1-1) = 10 gol previsti / 3 pronostici"],
    whyItMatters: "Misura quanto un utente crede nello spettacolo.",
  },
  prudente: {
    label: "media gol prevista",
    formula:
      "Come 'Il folle', ma vince chi ha la media gol pronosticata più bassa. Sono considerati solo utenti con almeno 3 pronostici.",
    examples: ["0-0, 1-0, 1-1: media molto bassa"],
    whyItMatters: "La coppa di chi non si sbilancia mai troppo.",
  },
};

function formatStatValue(stat: FunStat) {
  const value = Number(stat.value || 0);
  if (["folle", "prudente"].includes(stat.key)) return value.toFixed(2);
  return String(value);
}

function podiumMedal(index: number) {
  return index === 0
    ? "🥇"
    : index === 1
      ? "🥈"
      : index === 2
        ? "🥉"
        : `${index + 1}.`;
}

function FunStatInfoButton({ stat }: { stat: FunStat }) {
  const [open, setOpen] = useState(false);
  const info = FUN_STAT_INFO[stat.key];
  const winners = Array.isArray(stat.winners) ? stat.winners.slice(0, 5) : [];

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`Info statistica ${stat.title}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-200/25 bg-black/25 text-amber-100 transition hover:bg-amber-200/15"
      >
        <HelpCircle size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(82vw,22rem)] rounded-2xl border border-amber-200/25 bg-slate-950/98 p-4 text-left shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex items-start gap-2">
            <Info
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-200"
              aria-hidden="true"
            />
            <div>
              <div className="text-sm font-black text-white">{stat.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-cyan-50/70">
                {info?.whyItMatters ||
                  stat.description ||
                  "Statistica calcolata sui pronostici della lega."}
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-cyan-100/10 bg-white/[0.04] p-3">
            <div className="text-[11px] font-black uppercase tracking-wide text-cyan-100/60">
              Come nasce
            </div>
            <div className="mt-1 text-xs leading-relaxed text-cyan-50/80">
              {info?.formula || stat.formula || stat.description}
            </div>
          </div>
          {info?.examples?.length ? (
            <div className="mt-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-cyan-100/60">
                Esempi
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {info.examples.map((example) => (
                  <span
                    key={example}
                    className="rounded-full border border-cyan-100/10 bg-cyan-100/5 px-2 py-1 text-[11px] text-cyan-50/75"
                  >
                    {example}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {winners.length ? (
            <div className="mt-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-cyan-100/60">
                Podio statistica
              </div>
              <div className="mt-1 space-y-1.5">
                {winners.map((winner, idx) => (
                  <div
                    key={`${winner.userId || winner.displayName}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-2.5 py-2 text-xs"
                  >
                    <span className="min-w-0 truncate text-cyan-50/85">
                      {podiumMedal(idx)} {winner.displayName}
                    </span>
                    <span className="shrink-0 font-black text-amber-100">
                      {winner.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FunStatCard({ stat, icon }: { stat: FunStat; icon: React.ReactNode }) {
  const info = FUN_STAT_INFO[stat.key];
  const valueLabel = info?.label || "punti statistica";
  return (
    <div className="group rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 shadow-[0_0_26px_rgba(251,191,36,0.06)] transition hover:border-amber-200/40 hover:bg-amber-300/[0.13]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-100">
          {icon}
          <span className="truncate">{stat.title}</span>
        </div>
        <FunStatInfoButton stat={stat} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-base font-extrabold text-white">
              {stat.displayName || "—"}
            </div>
            {Number(stat.tieCount || 0) > 1 ? (
              <Badge tone="amber">ex aequo</Badge>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-cyan-50/70">{stat.description}</div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-100/10 bg-black/20 px-2 py-1 text-[11px] font-semibold text-cyan-50/65">
            <Medal size={12} aria-hidden="true" />
            {valueLabel}
          </div>
        </div>
        <div className="shrink-0 rounded-xl bg-black/25 px-2.5 py-1 text-sm font-black text-amber-100 ring-1 ring-amber-200/20">
          {formatStatValue(stat)}
        </div>
      </div>
    </div>
  );
}

function ExperienceIdea({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-cyan-100/15 bg-cyan-950/30 p-4">
      <div className="flex items-center gap-2 text-sm font-black text-white">
        {icon}
        {title}
      </div>
      <div className="mt-1 text-xs leading-relaxed text-cyan-50/65">{text}</div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-cyan-100/15 bg-cyan-950/35 p-4">
      <div className="text-xs text-cyan-100/60">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function LeaderTile({
  icon,
  title,
  name,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  name: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-cyan-100/15 bg-cyan-950/35 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-cyan-50/70">
        {icon}
        {title}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0 truncate text-base font-extrabold text-white">
          {name}
        </div>
        <div className="shrink-0 rounded-xl bg-cyan-100/5 px-2 py-1 text-sm font-extrabold text-white ring-1 ring-slate-800">
          {value}
        </div>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { activeLeagueId } = useAuth();
  const { show, hide } = useLoading();
  const [data, setData] = useState<LeagueStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"top" | "fun" | "distribution">("top");

  const refetch = () => {
    setLoading(true);
    setError(null);
    show();
    api
      .leagueStats()
      .then((d) => setData(d))
      .catch((e: any) =>
        setError(e?.message || "Errore nel caricamento delle statistiche"),
      )
      .finally(() => {
        setLoading(false);
        hide();
      });
  };

  useEffect(() => {
    if (!activeLeagueId) {
      setLoading(false);
      setData(null);
      return;
    }
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeagueId]);

  const headline = useMemo(() => {
    if (!data) return "";
    const best = data.bestMatchday
      ? ` · Migliore: ${data.bestMatchday.matchday}`
      : "";
    const worst = data.worstMatchday
      ? ` · Peggiore: ${data.worstMatchday.matchday}`
      : "";
    return `Media punti/giornata: ${data.avgPointsPerMatchday.toFixed(2)}${best}${worst}`;
  }, [data]);

  if (!activeLeagueId) {
    return <Alert>Seleziona una lega per vedere le statistiche.</Alert>;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title="Statistiche lega" subtitle="Caricamento…" />
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Alert>Nessun dato.</Alert>;

  const topTotal = data.topTotalPoints ?? data.bestAttack;
  const topExact = data.topExactHits ?? data.bestDefense;
  const topOutcome = data.topOutcomeHits ?? null;
  const topSumGoals = data.topSumGoalsHits ?? null;
  const topUnderOver = data.topUnderOverHits ?? null;
  const underOverOn = Boolean((data as any)?.features?.underOver25);
  const funStats = Array.isArray((data as any)?.funStats)
    ? (data as any).funStats
    : [];
  const funIcon = (key: string) => {
    if (key === "drawExact") return <Crown size={16} aria-hidden="true" />;
    if (["bigExact", "kamikaze", "folle"].includes(key))
      return <Flame size={16} aria-hidden="true" />;
    if (["zeroZero", "catenacciaro", "prudente"].includes(key))
      return <Shield size={16} aria-hidden="true" />;
    return <Sparkles size={16} aria-hidden="true" />;
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-cyan-100/15 shadow-sm">
        <div
          className="text-white"
          style={{
            backgroundImage:
              "radial-gradient(1200px 520px at 50% -10%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(900px 420px at 15% 35%, rgba(46,196,182,0.16), transparent 60%), radial-gradient(900px 420px at 85% 35%, rgba(239,68,68,0.16), transparent 60%), linear-gradient(180deg, #020617 0%, #0b1220 45%, #020617 100%)",
          }}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-cyan-50/70">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  Statistiche
                </div>
                <div className="mt-1 text-2xl font-extrabold tracking-tight">
                  Statistiche lega
                </div>
                <div className="mt-1 text-sm text-cyan-50/70">{headline}</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-rose-400/50 bg-black/40 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-black/55"
                onClick={refetch}
              >
                Aggiorna
              </button>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Statistiche lega"
          subtitle={headline}
          right={
            <Button variant="secondary" onClick={refetch}>
              Aggiorna
            </Button>
          }
        />
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant={section === "top" ? "primary" : "ghost"}
              onClick={() => setSection("top")}
            >
              Top performance
            </Button>
            <Button
              variant={section === "fun" ? "primary" : "ghost"}
              onClick={() => setSection("fun")}
            >
              Statistiche fun
            </Button>
            <Button
              variant={section === "distribution" ? "primary" : "ghost"}
              onClick={() => setSection("distribution")}
            >
              Distribuzione
            </Button>
          </div>
          {section === "top" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {topTotal ? (
                  <LeaderTile
                    icon={<Trophy size={16} aria-hidden="true" />}
                    title="Più punti"
                    name={topTotal.displayName}
                    value={topTotal.value}
                  />
                ) : (
                  <LeaderTile
                    icon={<Trophy size={16} aria-hidden="true" />}
                    title="Più punti"
                    name="—"
                    value={0}
                  />
                )}
                {topExact ? (
                  <LeaderTile
                    icon={<Target size={16} aria-hidden="true" />}
                    title="Più esatti"
                    name={topExact.displayName}
                    value={topExact.value}
                  />
                ) : (
                  <LeaderTile
                    icon={<Target size={16} aria-hidden="true" />}
                    title="Più esatti"
                    name="—"
                    value={0}
                  />
                )}
                {topOutcome ? (
                  <LeaderTile
                    icon={<CheckCircle2 size={16} aria-hidden="true" />}
                    title="Più 1X2"
                    name={topOutcome.displayName}
                    value={topOutcome.value}
                  />
                ) : (
                  <LeaderTile
                    icon={<CheckCircle2 size={16} aria-hidden="true" />}
                    title="Più 1X2"
                    name="—"
                    value={0}
                  />
                )}
                {topSumGoals ? (
                  <LeaderTile
                    icon={<Sigma size={16} aria-hidden="true" />}
                    title="Più somma gol"
                    name={topSumGoals.displayName}
                    value={topSumGoals.value}
                  />
                ) : (
                  <LeaderTile
                    icon={<Sigma size={16} aria-hidden="true" />}
                    title="Più somma gol"
                    name="—"
                    value={0}
                  />
                )}
                {underOverOn ? (
                  topUnderOver ? (
                    <LeaderTile
                      icon={<TrendingUp size={16} aria-hidden="true" />}
                      title="Più U/O 2.5"
                      name={topUnderOver.displayName}
                      value={topUnderOver.value}
                    />
                  ) : (
                    <LeaderTile
                      icon={<TrendingUp size={16} aria-hidden="true" />}
                      title="Più U/O 2.5"
                      name="—"
                      value={0}
                    />
                  )
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <StatTile
                  label="Media punti per giornata"
                  value={data.avgPointsPerMatchday.toFixed(2)}
                />
                <StatTile
                  label="Esatti totali (lega)"
                  value={data.exactTotal}
                />
              </div>
            </>
          ) : null}
          {section === "fun" && funStats.length ? (
            <div>
              <div className="mb-2 text-sm font-extrabold text-white">
                Statistiche da spogliatoio
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {funStats.map((stat: FunStat) => (
                  <FunStatCard
                    key={stat.key}
                    stat={stat}
                    icon={funIcon(String(stat.key))}
                  />
                ))}
              </div>
            </div>
          ) : section === "fun" ? (
            <div className="rounded-2xl border border-cyan-100/15 bg-cyan-950/35 p-4 text-sm text-cyan-50/70">
              Le statistiche da spogliatoio compariranno appena ci saranno
              abbastanza pronostici e risultati.
            </div>
          ) : null}

          {section === "top" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.bestMatchday ? (
                <Badge tone="green">
                  Migliore giornata: {data.bestMatchday.matchday} ·{" "}
                  {data.bestMatchday.avgPoints.toFixed(2)} pt medi
                </Badge>
              ) : (
                <Badge>Migliore giornata: —</Badge>
              )}
              {data.worstMatchday ? (
                <Badge tone="rose">
                  Peggiore giornata: {data.worstMatchday.matchday} ·{" "}
                  {data.worstMatchday.avgPoints.toFixed(2)} pt medi
                </Badge>
              ) : (
                <Badge>Peggiore giornata: —</Badge>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Idee per rendere la lega più viva"
          subtitle="Piccoli innesti di gamification che aumentano sfottò, rivalità e voglia di rientrare nell'app."
        />
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <ExperienceIdea
              icon={
                <Medal
                  size={16}
                  className="text-amber-200"
                  aria-hidden="true"
                />
              }
              title="Badge stagionali"
              text="Sblocchi automatici come Primo esatto, Re dei pareggi, Catenacciaro, Rimonta della giornata e Striscia positiva."
            />
            <ExperienceIdea
              icon={
                <Swords
                  size={16}
                  className="text-rose-200"
                  aria-hidden="true"
                />
              }
              title="Rivalità 1vs1"
              text="Mostra la nemesi dell'utente: chi gli sta davanti di pochi punti, chi lo supera spesso o chi ha più risultati esatti."
            />
            <ExperienceIdea
              icon={
                <Activity
                  size={16}
                  className="text-cyan-200"
                  aria-hidden="true"
                />
              }
              title="Timeline lega"
              text="Feed leggero con eventi tipo Raffaele entra in top 3, Antonio prende un esatto, Nicola perde il podio."
            />
          </div>
        </CardContent>
      </Card>

      {section === "distribution" ? (
        <Card>
          <CardHeader
            title="Distribuzione"
            subtitle="Quanti utenti rientrano in ciascuna fascia punti (per giornata)"
            right={
              <BarChart3
                size={18}
                className="text-cyan-100/60"
                aria-hidden="true"
              />
            }
          />
          <CardContent>
            {data.distribution?.length ? (
              <div className="space-y-2">
                {data.distribution.map((b) => (
                  <div
                    key={b.label}
                    className="flex items-center justify-between rounded-xl border border-cyan-100/15 bg-cyan-950/35 px-3 py-2"
                  >
                    <div className="text-sm font-semibold text-white">
                      {b.label}
                    </div>
                    <Badge>{b.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-cyan-50/70">Nessun dato.</div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
