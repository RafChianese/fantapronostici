import type { LeagueRules, LeagueSettings, RankingCriterion } from "./api";

export type RegolamentoSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type RegolamentoDoc = {
  title: string;
  intro: string[];
  sections: RegolamentoSection[];
};

function criterionLabel(c: RankingCriterion): string {
  if (c === "EXACT") return "Risultati esatti";
  if (c === "OUTCOME") return "Esiti 1X2";
  if (c === "UNDER_OVER") return "Under/Over 2.5 indovinati";
  return "Somma gol";
}

export function formatDateTimeIt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

type DecodedLockConfig = {
  mode: "LEGACY_MANUAL" | "AUTO";
  predictionMode: "TOURNAMENT_PRE" | "MATCHDAY_BY_MATCHDAY";
  lockOffsetMinutes: number;
};

/**
 * Deploy-safe decoding: the backend encodes AUTO settings into lockUntil using a sentinel year (2099).
 * - year !== 2099 => legacy/manual date stored as-is
 * - year === 2099 => AUTO, with:
 *    - day 1 => MATCHDAY_BY_MATCHDAY
 *    - day 2 => TOURNAMENT_PRE
 *    - hour/minute => lockOffsetMinutes (hour*60 + minute), clamped 0..120
 */
export function decodeLockConfigFromLockUntil(
  lockUntilIso: string,
): DecodedLockConfig {
  const d = new Date(lockUntilIso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() !== 2099) {
    return {
      mode: "LEGACY_MANUAL",
      predictionMode: "MATCHDAY_BY_MATCHDAY",
      lockOffsetMinutes: 30,
    };
  }
  const predictionMode =
    d.getUTCDate() === 2 ? "TOURNAMENT_PRE" : "MATCHDAY_BY_MATCHDAY";
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const lockOffsetMinutes = Math.max(0, Math.min(120, mins));
  return { mode: "AUTO", predictionMode, lockOffsetMinutes };
}

function lockOffsetLabel(mins: number): string {
  if (mins >= 60) return "1 ora";
  if (mins === 30) return "30 minuti";
  if (mins === 15) return "15 minuti";
  if (mins === 0) return "al momento del calcio d'inizio";
  return `${mins} minuti`;
}

function competitionTypeLabel(type?: LeagueRules["competitionType"]): string {
  return type === "KNOCKOUT_CUP"
    ? "Coppa a eliminazione diretta"
    : "Campionato / classifica generale";
}

function euroLabel(cents: number): string {
  return (Number(cents || 0) / 100).toFixed(2).replace(".00", "") + "€";
}

function mixedCombos(r: LeagueRules): string[] {
  const combos: string[] = [];
  if (r.allowOutcomeWithExact) combos.push("Risultato esatto + Esito 1X2");
  if (r.allowSumGoalsWithExact) combos.push("Risultato esatto + Somma gol");
  if (r.allowSumGoalsWithOutcome) combos.push("Esito 1X2 + Somma gol");
  if (
    r.allowOutcomeWithExact &&
    r.allowSumGoalsWithExact &&
    r.allowSumGoalsWithOutcome
  ) {
    combos.push("Risultato esatto + Esito 1X2 + Somma gol");
  }

  if (r.enableUnderOver25) {
    if (r.allowUnderOverWithExact)
      combos.push("Under/Over 2.5 + Risultato esatto");
    if (r.allowUnderOverWithOutcome) combos.push("Under/Over 2.5 + Esito 1X2");
    if (r.allowUnderOverWithSumGoals) combos.push("Under/Over 2.5 + Somma gol");
    if (
      !r.allowUnderOverWithExact &&
      !r.allowUnderOverWithOutcome &&
      !r.allowUnderOverWithSumGoals
    ) {
      combos.push(
        "Under/Over 2.5 attivo ma non cumulabile con le altre categorie nella modalità mista",
      );
    }
  }

  if (combos.length === 0) {
    combos.push(
      "Nessuna combinazione cumulabile: viene assegnato solo il punteggio migliore tra le categorie prese",
    );
  }
  return combos;
}

export function generateRegolamentoTemplate(
  rules: LeagueRules,
  settings: LeagueSettings,
): RegolamentoDoc {
  const decodedLock = decodeLockConfigFromLockUntil(settings.lockUntil);
  const lockUntil = formatDateTimeIt(settings.lockUntil);

  const competitionType = rules.competitionType || "LEAGUE";
  const isKnockoutCup = competitionType === "KNOCKOUT_CUP";

  const competitionTypeSection: RegolamentoSection = {
    title: "Tipologia competizione",
    paragraphs: [
      `Questa lega è configurata come: ${competitionTypeLabel(competitionType)}.`,
      isKnockoutCup
        ? "Sono quindi disponibili anche le opzioni legate alle fasi finali, se abilitate dall'admin: quarti, semifinaliste e finaliste."
        : "La competizione segue una classifica generale: sono disponibili i pronostici torneo base abilitati dall'admin, come vincitore e capocannoniere.",
    ],
  };

  const pointsBullets = [
    `Risultato esatto: +${rules.pointsExact} punti`,
    `Esito 1X2 (vittoria/pareggio/sconfitta): +${rules.pointsOutcome} punti`,
    `Somma gol (totale reti della partita): +${rules.pointsSumGoals} punti`,
  ];

  if (rules.enableUnderOver25) {
    pointsBullets.push(`Under/Over 2.5: +${rules.pointsUnderOver25} punti`);
  }

  const scoringModeSection: RegolamentoSection = {
    title: "Modalità di punteggio",
    paragraphs: [],
    bullets: [],
  };

  if (rules.scoringMode === "CUMULATIVE") {
    scoringModeSection.paragraphs!.push(
      "La lega usa la modalità Cumulativa: tutte le categorie attive si sommano tra loro per ogni partita.",
    );
    scoringModeSection.bullets!.push(
      "Esempio: Esatto + 1X2 + Somma gol (+ Under/Over se attivo)",
    );
  } else if (rules.scoringMode === "BEST_ONLY") {
    scoringModeSection.paragraphs!.push(
      "La lega usa la modalità Solo migliore: per ogni partita viene assegnato solo il punteggio più alto tra le categorie disponibili.",
    );
    scoringModeSection.bullets!.push(
      "Esempio: se prendi sia 1X2 che Somma gol, conta solo la categoria con più punti",
    );
  } else {
    scoringModeSection.paragraphs!.push(
      "La lega usa la modalità Mista: alcune categorie possono sommarsi tra loro, in base alle combinazioni abilitate dall'admin.",
    );
    scoringModeSection.paragraphs!.push(
      "Le combinazioni consentite in questa lega sono:",
    );
    scoringModeSection.bullets!.push(...mixedCombos(rules));
    if (rules.enableUnderOver25) {
      scoringModeSection.paragraphs!.push(
        "Per Under/Over 2.5 sono riportate sotto anche le combinazioni specifiche selezionate dall'admin.",
      );
    }
  }

  const underOverSection: RegolamentoSection = rules.enableUnderOver25
    ? {
        title: "Under/Over 2.5",
        paragraphs: [
          "È attivo il bonus Under/Over 2.5: indovina se la partita termina con meno di 3 gol (Under 2.5) o 3+ gol (Over 2.5).",
        ],
        bullets: [`Punteggio: +${rules.pointsUnderOver25} punti`],
      }
    : {
        title: "Under/Over 2.5",
        paragraphs: ["In questa lega l'opzione Under/Over 2.5 non è attiva."],
      };

  const awardsSection: RegolamentoSection = rules.enableMatchdayAwards
    ? {
        title: "Premio miglior giornata 🥇",
        paragraphs: [
          "È attivo il premio simbolico per la miglior giornata: a fine giornata viene registrato il partecipante con più punti in quella giornata.",
        ],
        bullets: [
          "Il premio è puramente celebrativo (badge/record) e non modifica il calcolo dei punti.",
        ],
      }
    : {
        title: "Premio miglior giornata 🥇",
        paragraphs: [
          "In questa lega il premio miglior giornata non è previsto.",
        ],
      };

  const jollySection: RegolamentoSection = (rules as any).enableJolly
    ? {
        title: "Partita Jolly ⭐",
        paragraphs: [
          "È attiva la Partita Jolly: per ogni giornata l’admin può selezionare una sola partita come Jolly.",
          `I punti ottenuti su quella partita vengono moltiplicati x${Number((rules as any).jollyMultiplier ?? 2) || 2}.`,
        ],
      }
    : {
        title: "Partita Jolly ⭐",
        paragraphs: ["In questa lega la Partita Jolly non è attiva."],
      };

  const scorerSection: RegolamentoSection = (rules as any).enableScorer
    ? {
        title: "Marcatore ⚽",
        paragraphs: [
          "È attivo il pronostico ‘Marcatore’: se è disponibile la lista giocatori del match, puoi selezionare un giocatore che segnerà almeno un gol.",
          "La selezione è modificabile solo finché la partita non è iniziata e la finestra di lock lo consente.",
        ],
        bullets: [
          `Punteggio bonus: +${Number((rules as any).pointsScorer ?? 3) || 3} punti`,
        ],
      }
    : {
        title: "Marcatore ⚽",
        paragraphs: ["In questa lega la regola ‘Marcatore’ non è attiva."],
      };

  const competitionPickBullets: string[] = [];
  if ((rules as any).enableCompetitionQuarterFinalist && isKnockoutCup) {
    competitionPickBullets.push(
      `Squadre qualificate ai quarti: +${Number((rules as any).pointsCompetitionQuarterFinalist ?? 8) || 8} punti per ogni scelta corretta`,
    );
  }
  if ((rules as any).enableCompetitionSemiFinalist && isKnockoutCup) {
    competitionPickBullets.push(
      `Squadre qualificate alle semifinali: +${Number((rules as any).pointsCompetitionSemiFinalist ?? 10) || 10} punti per ogni scelta corretta`,
    );
  }
  if ((rules as any).enableCompetitionFinalist && isKnockoutCup) {
    competitionPickBullets.push(
      `Squadre finaliste: +${Number((rules as any).pointsCompetitionFinalist ?? 12) || 12} punti per ogni scelta corretta`,
    );
  }
  if ((rules as any).enableCompetitionWinner) {
    competitionPickBullets.push(
      `Vincitore competizione: +${Number((rules as any).pointsCompetitionWinner ?? 15) || 15} punti`,
    );
  }
  if ((rules as any).enableCompetitionTopScorer) {
    competitionPickBullets.push(
      `Capocannoniere competizione: +${Number((rules as any).pointsCompetitionTopScorer ?? 12) || 12} punti`,
    );
  }

  const competitionSection: RegolamentoSection = competitionPickBullets.length
    ? {
        title: "Pronostici torneo 🏆",
        paragraphs: [
          "Sono attivi i pronostici extra sulla competizione. I punti vengono assegnati quando gli esiti ufficiali vengono valorizzati dal SuperAdmin/admin secondo le regole della lega.",
          (settings as any).competitionPredictionsDeadline
            ? `Le scelte sono modificabili fino a: ${formatDateTimeIt(String((settings as any).competitionPredictionsDeadline))}.`
            : "Le scelte sono modificabili fino alla deadline configurata o, in assenza di una deadline esplicita, fino al blocco previsto dall'applicativo.",
        ],
        bullets: competitionPickBullets,
      }
    : {
        title: "Pronostici torneo 🏆",
        paragraphs: [
          "In questa lega non sono attivi pronostici torneo extra.",
          isKnockoutCup
            ? "La competizione è una coppa a eliminazione, ma l'admin non ha abilitato punteggi extra per quarti, semifinali, finaliste, vincitore o capocannoniere."
            : "La competizione è configurata come campionato/classifica generale e l'admin non ha abilitato vincitore o capocannoniere.",
        ],
      };

  const monetizationSection: RegolamentoSection | null = (() => {
    const feeCents =
      typeof (rules as any).entryFeeCents === "number"
        ? (rules as any).entryFeeCents
        : null;
    const prizes = Array.isArray((rules as any).prizesJson)
      ? (rules as any).prizesJson
      : null;

    if (!feeCents && (!prizes || prizes.length === 0)) return null;

    const paragraphs: string[] = [];
    const bullets: string[] = [];

    if (feeCents) {
      paragraphs.push(
        `La quota di partecipazione è pari a ${euroLabel(feeCents)}.`,
      );
    } else {
      paragraphs.push("Non è prevista una quota di partecipazione.");
    }

    if (prizes && prizes.length > 0) {
      paragraphs.push("Premi previsti:");
      prizes
        .slice()
        .sort((a: any, b: any) => Number(a.position) - Number(b.position))
        .forEach((p: any) => {
          bullets.push(
            `${p.position}° posto: ${euroLabel(Number(p.amountCents || 0))}`,
          );
        });
    }

    return {
      title: "Quota e premi",
      paragraphs,
      ...(bullets.length ? { bullets } : {}),
    };
  })();

  const lockSection: RegolamentoSection = {
    title: "Lock pronostici",
    paragraphs: [
      decodedLock.mode === "LEGACY_MANUAL"
        ? `I pronostici sono modificabili fino al lock configurato dall'admin. In questa lega il lock è impostato su: ${lockUntil}.`
        : decodedLock.predictionMode === "TOURNAMENT_PRE"
          ? `I pronostici si bloccano automaticamente ${lockOffsetLabel(decodedLock.lockOffsetMinutes)} prima dell'inizio della prima partita della prima giornata pronosticabile.`
          : `Ogni giornata si blocca automaticamente ${lockOffsetLabel(decodedLock.lockOffsetMinutes)} prima dell'inizio del primo match della giornata. In caso di rinvii, si blocca solo la giornata interessata e le giornate successive restano pronosticabili fino al loro lock.`,

      settings.isForceLocked
        ? "Inoltre, l'admin ha attivato un lock forzato immediato: in questo momento i pronostici risultano bloccati anche se la data/ora non è ancora raggiunta."
        : "Il lock forzato immediato non è attivo.",
    ],
  };

  const tieBreakers = [
    settings.tieBreak1,
    settings.tieBreak2,
    settings.tieBreak3,
  ].map(criterionLabel);

  const rankingSection: RegolamentoSection = {
    title: "Classifica e spareggi",
    paragraphs: [
      "La classifica è ordinata per punti totali. In caso di parità, si applicano nell'ordine questi criteri di spareggio:",
    ],
    bullets: tieBreakers.map((x, idx) => `${idx + 1}) ${x}`),
  };

  return {
    title: "Regolamento della lega",
    intro: [
      "Questo regolamento è generato automaticamente in base alle regole configurate dall'admin.",
      "Se l'admin aggiorna punteggi o impostazioni, questa pagina si aggiorna di conseguenza.",
    ],
    sections: [
      competitionTypeSection,
      {
        title: "Come si fanno i punti",
        paragraphs: [
          "Per ogni partita puoi ottenere punti in base alle categorie attive:",
        ],
        bullets: pointsBullets,
      },
      scoringModeSection,
      underOverSection,
      awardsSection,
      jollySection,
      scorerSection,
      competitionSection,
      ...(monetizationSection ? [monetizationSection] : []),
      lockSection,
      rankingSection,
    ],
  };
}
