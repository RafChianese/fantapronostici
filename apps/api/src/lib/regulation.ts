import type { Rule, Setting, RankingCriterion, ScoringMode } from "@prisma/client";

function fmtCriterion(c: RankingCriterion) {
  if (c === "EXACT") return "Numero di risultati esatti";
  if (c === "OUTCOME") return "Numero di esiti corretti (1X2)";
  return "Numero di somme gol corrette";
}

function fmtMode(m: ScoringMode) {
  if (m === "CUMULATIVE") return "Cumulativa";
  if (m === "BEST_ONLY") return "Solo migliore";
  return "Mista";
}

export type RegulationPayload = {
  markdown: string;
  meta: {
    scoringMode: ScoringMode;
    features: { underOver25: boolean; matchdayAwards: boolean };
    tieBreakers?: { tieBreak1: RankingCriterion; tieBreak2: RankingCriterion; tieBreak3: RankingCriterion };
  };
};

/**
 * Generates a league regulation text in Italian from Rule + Setting rows.
 * Output is Markdown-ish plain text (safe to render in <pre> / whitespace-pre-wrap).
 */
export function generateRegulationIt(rules: Rule, settings?: Setting | null): RegulationPayload {
  const lines: string[] = [];

  lines.push("# Regolamento – Fanta Pronostici");
  lines.push("");
  lines.push("Questo regolamento descrive come vengono assegnati i punti ai pronostici nella lega.");
  lines.push("I valori indicati dipendono dalle regole impostate dall’amministratore e possono variare da una lega all’altra.");
  lines.push("");

  // --- Scoring ---
  lines.push("## Come si calcolano i punti");
  lines.push("");
  lines.push("Per ogni partita inserisci un pronostico indicando i gol della squadra di casa e della squadra ospite.");
  lines.push("");
  lines.push(`- **Risultato esatto**: +${rules.pointsExact} punti`);
  lines.push(`- **Esito corretto (1X2)**: +${rules.pointsOutcome} punti`);
  lines.push(`- **Somma gol corretta**: +${rules.pointsSumGoals} punti`);

  if (rules.enableUnderOver25) {
    lines.push(`- **Under/Over 2.5**: +${rules.pointsUnderOver25} punti`);
  }
  lines.push("");

  // --- Mode ---
  lines.push("## Modalità di punteggio");
  lines.push("");
  lines.push(`Modalità attiva: **${fmtMode(rules.scoringMode)}**.`);
  lines.push("");

  if (rules.scoringMode === "CUMULATIVE") {
    lines.push("In modalità *Cumulativa* i punti ottenuti dalle singole categorie si sommano.");
  } else if (rules.scoringMode === "BEST_ONLY") {
    lines.push("In modalità *Solo migliore* viene conteggiata soltanto la categoria più favorevole tra quelle verificate.");
  } else {
    lines.push("In modalità *Mista* alcune categorie possono sommarsi, altre no, in base alle compatibilità indicate sotto.");
  }
  lines.push("");

  // --- Compatibility ---
  lines.push("## Compatibilità dei punteggi");
  lines.push("");
  lines.push("Le seguenti regole determinano se alcune categorie possono sommarsi tra loro:");
  lines.push("");
  lines.push(`- Esito con Risultato esatto: **${rules.allowOutcomeWithExact ? "Sì" : "No"}**`);
  lines.push(`- Somma gol con Risultato esatto: **${rules.allowSumGoalsWithExact ? "Sì" : "No"}**`);
  lines.push(`- Somma gol con Esito corretto: **${rules.allowSumGoalsWithOutcome ? "Sì" : "No"}**`);
  if (rules.enableUnderOver25) {
    lines.push("- Under/Over 2.5: viene conteggiato secondo la modalità di punteggio e le verifiche del match.");
  }
  lines.push("");

  // --- Features ---
  if (rules.enableMatchdayAwards) {
    lines.push("## Premi di giornata");
    lines.push("");
    lines.push("Questa lega prevede un **premio di giornata**: viene registrato il miglior punteggio della giornata per ciascuna giornata." );
    lines.push("");
  }

  // --- Lock window ---
  if (settings?.lockUntil) {
    lines.push("## Scadenza inserimento pronostici");
    lines.push("");
    lines.push("I pronostici sono modificabili fino alla finestra di lock impostata dall’admin.");
    lines.push(`Lock attuale: **${settings.lockUntil.toISOString()}**`);
    if (settings.isForceLocked) {
      lines.push("⚠️ La lega è attualmente in lock forzato: non è possibile modificare i pronostici.");
    }
    lines.push("");
  }

  // --- Tie breakers ---
  if (settings) {
    lines.push("## Spareggi in classifica");
    lines.push("");
    lines.push("In caso di parità di punti totali, l’ordine in classifica viene determinato da questi criteri (in ordine):");
    lines.push("");
    lines.push(`1. ${fmtCriterion(settings.tieBreak1)}`);
    lines.push(`2. ${fmtCriterion(settings.tieBreak2)}`);
    lines.push(`3. ${fmtCriterion(settings.tieBreak3)}`);
    lines.push("");
  }

  // --- Examples (generic but consistent) ---
  lines.push("## Esempi pratici");
  lines.push("");
  lines.push("Esempio A:");
  lines.push("- Risultato reale: 2–1");
  lines.push("- Pronostico: 2–1");
  lines.push(`- Punti: Risultato esatto (+${rules.pointsExact})`);
  if (rules.allowOutcomeWithExact) lines.push(`  + Esito corretto (+${rules.pointsOutcome})`);
  if (rules.allowSumGoalsWithExact) lines.push(`  + Somma gol corretta (+${rules.pointsSumGoals})`);
  lines.push("");

  lines.push("Esempio B:");
  lines.push("- Risultato reale: 2–0");
  lines.push("- Pronostico: 1–0");
  lines.push(`- Punti: Esito corretto (+${rules.pointsOutcome})`);
  if (rules.allowSumGoalsWithOutcome) {
    lines.push(`  + Somma gol corretta (se verificata) (+${rules.pointsSumGoals})`);
  }
  lines.push("");

  return {
    markdown: lines.join("\n"),
    meta: {
      scoringMode: rules.scoringMode,
      features: { underOver25: rules.enableUnderOver25, matchdayAwards: rules.enableMatchdayAwards },
      ...(settings
        ? {
            tieBreakers: {
              tieBreak1: settings.tieBreak1,
              tieBreak2: settings.tieBreak2,
              tieBreak3: settings.tieBreak3,
            },
          }
        : {}),
    },
  };
}
