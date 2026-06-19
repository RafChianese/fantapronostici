import type { RankingCriterion, Rule, ScoringMode, Setting } from "@prisma/client";

export type RegolamentoSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type RegolamentoPayload = {
  title: string;
  generatedAtISO: string;
  sections: RegolamentoSection[];
};

function criterionLabel(c: RankingCriterion): string {
  switch (c) {
    case "EXACT":
      return "Numero di risultati esatti";
    case "OUTCOME":
      return "Numero di esiti (1X2) indovinati";
    case "SUM_GOALS":
      return "Numero di somme gol indovinate";
    case "UNDER_OVER":
      return "Numero di Under/Over 2.5 indovinati";
    default:
      return String(c);
  }
}

function scoringModeLabel(m: ScoringMode): string {
  switch (m) {
    case "CUMULATIVE":
      return "Cumulativa";
    case "BEST_ONLY":
      return "Miglior categoria";
    case "MIXED":
      return "Mista";
    default:
      return String(m);
  }
}

function formatDateTimeIt(value?: Date | null): string {
  if (!value) return "—";
  try {
    // Ensure consistent rendering for Italian users.
    return new Date(value).toLocaleString("it-IT", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(value).toISOString();
  }
}

function mixedBullets(rules: Rule): string[] {
  const bullets: string[] = [];
  bullets.push("Base: il risultato esatto vale sempre come categoria autonoma.");

  // Allowed combos
  const allowOE = !!rules.allowOutcomeWithExact;
  const allowSE = !!rules.allowSumGoalsWithExact;
  const allowSO = !!rules.allowSumGoalsWithOutcome;

  const combos: string[] = [];
  if (allowOE) combos.push("Esatto + Esito (1X2)");
  if (allowSE) combos.push("Esatto + Somma gol");
  if (allowSO) combos.push("Esito (1X2) + Somma gol");
  if (combos.length === 0) {
    bullets.push(
      "In questa lega non sono abilitate combinazioni tra categorie: viene applicata una sola categoria per partita (come 'Miglior categoria')."
    );
  } else {
    bullets.push(`Combinazioni abilitate: ${combos.join("; ")}.`);
    bullets.push(
      "Se più combinazioni risultano applicabili, il sistema assegna il totale massimo consentito dalle combinazioni abilitate."
    );
  }
  return bullets;
}

export function generateRegolamentoTemplate(params: {
  leagueName: string;
  rules: Rule;
  settings: Setting;
}): RegolamentoPayload {
  const { leagueName, rules, settings } = params;

  const scoringMode = rules.scoringMode;
  const underOverEnabled = !!rules.enableUnderOver25;
  const awardsEnabled = !!rules.enableMatchdayAwards;
  const lockUntilLabel = formatDateTimeIt(settings.lockUntil);

  const pointsBullets = [
    `Risultato esatto: ${rules.pointsExact} punti.`,
    `Esito (1X2): ${rules.pointsOutcome} punti.`,
    `Somma gol (gol casa + gol trasferta): ${rules.pointsSumGoals} punti.`,
  ];
  if (underOverEnabled) pointsBullets.push(`Under/Over 2.5: ${rules.pointsUnderOver25} punti.`);

  const modeSection: RegolamentoSection = {
    title: "Modalità di assegnazione punti",
    paragraphs: [
      `Modalità attiva: ${scoringModeLabel(scoringMode)}.`,
      scoringMode === "CUMULATIVE"
        ? "In modalità Cumulativa le categorie di punteggio si sommano (Esatto + Esito + Somma gol + eventuale Under/Over)."
        : scoringMode === "BEST_ONLY"
        ? "In modalità Miglior categoria, per ogni partita viene assegnato solo il punteggio più alto tra le categorie disponibili."
        : "In modalità Mista, alcune categorie possono combinarsi tra loro in base alle opzioni abilitate dall’admin lega.",
    ],
    bullets: scoringMode === "MIXED" ? mixedBullets(rules) : undefined,
  };

  const underOverSection: RegolamentoSection = underOverEnabled
    ? {
        title: "Under/Over 2.5",
        paragraphs: [
          "Questa lega include il bonus Under/Over 2.5.",
          `Se indovini correttamente se la partita termina con Under 2.5 o Over 2.5 (sulla base dei gol totali), ottieni ${rules.pointsUnderOver25} punti.`,
        ],
      }
    : {
        title: "Under/Over 2.5",
        paragraphs: ["In questa lega la regola Under/Over 2.5 non è attiva."],
      };

  const awardsSection: RegolamentoSection = awardsEnabled
    ? {
        title: "Premio miglior giornata 🥇",
        paragraphs: [
          "Questa lega prevede il premio simbolico per la miglior giornata.",
          "A fine giornata viene evidenziato chi ha totalizzato il punteggio più alto in quella giornata (record giornata).",
        ],
      }
    : {
        title: "Premio miglior giornata 🥇",
        paragraphs: ["In questa lega non è previsto un premio miglior giornata."],
      };

  const jollyEnabled = !!(rules as any).enableJolly;
  const jollyMultiplier = Number((rules as any).jollyMultiplier ?? 2) || 2;

  const jollySection: RegolamentoSection = jollyEnabled
    ? {
        title: "Partita Jolly ⭐",
        paragraphs: [
          "Questa lega include la Partita Jolly (bonus punti).",
          "Per ogni giornata l’admin può selezionare una sola partita come ‘Jolly’.",
          `I punti ottenuti su quella partita vengono moltiplicati x${jollyMultiplier}.`,
        ],
      }
    : {
        title: "Partita Jolly ⭐",
        paragraphs: ["In questa lega la Partita Jolly non è attiva."],
      };

  const scorerEnabled = !!(rules as any).enableScorer;
  const scorerPoints = Number((rules as any).pointsScorer ?? 3) || 3;

  const scorerSection: RegolamentoSection = scorerEnabled
    ? {
        title: "Marcatore ⚽",
        paragraphs: [
          "Questa lega include il pronostico ‘Marcatore’.",
          "Se è disponibile la lista giocatori del match, puoi selezionare un giocatore che segnerà almeno un gol.",
          "La selezione è modificabile solo finché la partita non è iniziata e la finestra di lock lo consente.",
          `Se il giocatore selezionato segna (anche su rigore), ottieni ${scorerPoints} punti bonus su quella partita.`,
        ],
      }
    : {
        title: "Marcatore ⚽",
        paragraphs: ["In questa lega la regola ‘Marcatore’ non è attiva."],
      };

  const lockSection: RegolamentoSection = {
    title: "Finestra di modifica pronostici (Lock)",
    paragraphs: [
      "I pronostici sono modificabili solo quando la finestra è aperta.",
      `Lock temporale impostato fino al: ${lockUntilLabel}.`,
      settings.isForceLocked
        ? "Lock forzato: ATTIVO. I pronostici risultano bloccati immediatamente finché l’admin non disattiva il blocco."
        : "Lock forzato: non attivo.",
    ],
  };

  const tieSection: RegolamentoSection = {
    title: "Criteri di classifica e spareggi",
    paragraphs: [
      "La classifica è ordinata per punti totali.",
      "In caso di parità, si applicano nell’ordine i seguenti criteri di spareggio:",
    ],
    bullets: [
      `1) ${criterionLabel(settings.tieBreak1)}`,
      `2) ${criterionLabel(settings.tieBreak2)}`,
      `3) ${criterionLabel(settings.tieBreak3)}`,
    ],
  };

  return {
    title: `Regolamento — ${leagueName}`,
    generatedAtISO: new Date().toISOString(),
    sections: [
      {
        title: "Punteggi",
        paragraphs: [
          "Il punteggio di ogni pronostico dipende dalle regole impostate dall’admin di lega.",
          "Di seguito i punteggi attivi per questa lega:",
        ],
        bullets: pointsBullets,
      },
      modeSection,
      underOverSection,
      awardsSection,
      jollySection,
      scorerSection,
      lockSection,
      tieSection,
    ],
  };
}
