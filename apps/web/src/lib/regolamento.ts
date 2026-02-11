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

function mixedCombos(r: LeagueRules): string[] {
  const combos: string[] = [];
  // Base categories are always available.
  // MIXED decides which can stack with which.
  if (r.allowOutcomeWithExact) combos.push("Esatto + 1X2");
  if (r.allowSumGoalsWithExact) combos.push("Esatto + Somma gol");
  if (r.allowSumGoalsWithOutcome) combos.push("1X2 + Somma gol");
  // If all three are true, all can stack together.
  if (r.allowOutcomeWithExact && r.allowSumGoalsWithExact && r.allowSumGoalsWithOutcome) {
    combos.push("Esatto + 1X2 + Somma gol");
  }
  if (combos.length === 0) {
    combos.push("Nessuna combinazione: viene preso solo il punteggio migliore tra le categorie disponibili");
  }
  return combos;
}

export function generateRegolamentoTemplate(rules: LeagueRules, settings: LeagueSettings): RegolamentoDoc {
  const lockUntil = formatDateTimeIt(settings.lockUntil);

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
      "La lega usa la modalità Cumulativa: tutte le categorie attive si sommano tra loro per ogni partita."
    );
    scoringModeSection.bullets!.push(
      "Esempio: Esatto + 1X2 + Somma gol (+ Under/Over se attivo)"
    );
  } else if (rules.scoringMode === "BEST_ONLY") {
    scoringModeSection.paragraphs!.push(
      "La lega usa la modalità Solo migliore: per ogni partita viene assegnato solo il punteggio più alto tra le categorie disponibili."
    );
    scoringModeSection.bullets!.push(
      "Esempio: se prendi sia 1X2 che Somma gol, conta solo la categoria con più punti"
    );
  } else {
    scoringModeSection.paragraphs!.push(
      "La lega usa la modalità Mista: alcune categorie possono sommarsi tra loro, in base alle combinazioni abilitate dall'admin."
    );
    scoringModeSection.paragraphs!.push(
      "Le combinazioni consentite in questa lega sono:"
    );
    scoringModeSection.bullets!.push(...mixedCombos(rules));
    scoringModeSection.paragraphs!.push(
      "Nota: l'eventuale Under/Over 2.5 (se attivo) segue la stessa logica della modalità scelta per le categorie principali." 
    );
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
        bullets: ["Il premio è puramente celebrativo (badge/record) e non modifica il calcolo dei punti."],
      }
    : {
        title: "Premio miglior giornata 🥇",
        paragraphs: ["In questa lega il premio miglior giornata non è previsto."],
      };

  const lockMode = settings.lockMode ?? "MANUAL_UNTIL";

  const lockSection: RegolamentoSection = {
    title: "Lock pronostici",
    paragraphs: [
      lockMode === "AUTO_MATCHDAY_30MIN"
        ? "In questa lega è attivo il lock automatico: i pronostici vengono bloccati automaticamente 30 minuti prima dell'inizio della giornata (mezz'ora prima del primo match) e vengono riaperti al termine dell'ultima partita della giornata."
        : `I pronostici sono modificabili fino al lock configurato dall'admin. In questa lega il lock è impostato su: ${lockUntil}.`,
      settings.isForceLocked
        ? "Inoltre, l'admin ha attivato un lock forzato immediato: in questo momento i pronostici risultano bloccati anche se il lock automatico/manuale non sarebbe ancora scattato."
        : "Il lock forzato immediato non è attivo.",
    ],
  };

  const tieBreakers = [settings.tieBreak1, settings.tieBreak2, settings.tieBreak3].map(criterionLabel);

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
      {
        title: "Come si fanno i punti",
        paragraphs: ["Per ogni partita puoi ottenere punti in base alle categorie attive:"],
        bullets: pointsBullets,
      },
      scoringModeSection,
      underOverSection,
      awardsSection,
      lockSection,
      rankingSection,
    ],
  };
}
