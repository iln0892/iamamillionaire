import { tool } from "ai";
import { z } from "zod";
import { decade, evenCount, games, statistics, sum, type Draw } from "../src/domain.js";
import { describeFilters } from "../src/assistant-context.js";
import type { AssistantRequest, TipNumbers } from "../src/assistant-request.js";

export const toolLabels: Record<string, string> = {
  statistik: "Statistik berechnet", filter: "Filter gelesen",
  tippfelder: "Tippfelder ausgewertet", letzte_ziehung: "Letzte Ziehung gelesen",
};
export function summarizeField(field: TipNumbers) {
  return {
    hauptzahlen: field.numbers, zusatzzahlen: field.extras,
    summe: sum(field.numbers), gerade: evenCount(field.numbers),
    ungerade: field.numbers.length - evenCount(field.numbers),
    dekaden: new Set(field.numbers.map(decade)).size,
  };
}
export function selectedDraws(request: AssistantRequest, draws: Draw[]) {
  return draws.filter(draw => draw.game === request.game &&
    request.period.from !== null && request.period.to !== null &&
    draw.date >= request.period.from && draw.date <= request.period.to);
}
export function statisticsResult(draws: Draw[], request: AssistantRequest, number?: number) {
  const stats = statistics(draws, request.game);
  const entry = number ? stats.counts.find(value => value.number === number) : undefined;
  return {
    quelle: "Offizielles WestLotto-Archiv; keine lokalen Import-Ziehungen",
    spiel: games[request.game].name, ziehungen: draws.length,
    von: draws[0]?.date ?? null, bis: draws.at(-1)?.date ?? null,
    durchschnittlicheSumme: Number(stats.averageSum.toFixed(1)),
    haeufigste: draws.length ? stats.hot.slice(0, 5).map(n => ({ zahl: n.number, anzahl: n.count })) : [],
    laengstePause: draws.length ? stats.cold.slice(0, 5).map(n => ({ zahl: n.number, ziehungenOhne: n.gap })) : [],
    ...(number ? { zahl: entry ? { zahl: entry.number, anzahl: entry.count, ziehungenOhne: entry.gap, zuletzt: entry.lastDate || null } : { fehler: "Zahl liegt außerhalb dieses Spiels." } } : {}),
  };
}
export function assistantTools(request: AssistantRequest, draws: Draw[]) {
  const archive = draws.filter(draw => draw.game === request.game);
  return {
    statistik: tool({
      description: "Berechne Häufigkeiten, Pausen und Summen aus dem offiziellen Archiv. Nutze auswahl für den aktuellen Analysezeitraum; alternativ das gesamte Archiv oder die letzten 52/104/500 Ziehungen. Optional eine bestimmte Hauptzahl untersuchen.",
      inputSchema: z.object({
        zeitraum: z.enum(["auswahl", "archiv", "letzte52", "letzte104", "letzte500"]),
        zahl: z.number().int().min(1).max(50).optional(),
      }).strict(),
      execute: async ({ zeitraum, zahl }) => statisticsResult(
        zeitraum === "auswahl" ? selectedDraws(request, archive) :
        zeitraum === "archiv" ? archive : archive.slice(-Number(zeitraum.replace("letzte", ""))), request, zahl),
    }),
    filter: tool({
      description: "Lies die aktiven, vom Nutzer gewählten Auswahlregeln mit ihren genauen Grenzen. Ändert keine Filter.",
      inputSchema: z.object({}).strict(),
      execute: async () => ({ spiel: games[request.game].name, regeln: describeFilters(request.game, request.filters) }),
    }),
    tippfelder: tool({
      description: "Berechne Summe, gerade/ungerade Hauptzahlen und Dekaden der ersten drei vorhandenen erzeugten oder gespeicherten Tippfelder. Erzeugt und speichert keine neuen Tipps.",
      inputSchema: z.object({ quelle: z.enum(["erzeugt", "gespeichert"]) }).strict(),
      execute: async ({ quelle }) => ({
        quelle, felderInsgesamt: quelle === "erzeugt" ? request.generated?.total ?? 0 : request.saved.length,
        ...(quelle === "erzeugt" && request.generated ? { regelnBeiErzeugung: describeFilters(request.game, request.generated.filters) } : {}),
        ersteDreiFelder: (quelle === "erzeugt" ? request.generated?.tips ?? [] : request.saved).map(summarizeField),
        ...(quelle === "gespeichert" ? { hinweis: "Nur die ersten drei gespeicherten Felder wurden übermittelt." } : {}),
      }),
    }),
    letzte_ziehung: tool({
      description: "Lies Datum und Zahlen der letzten offiziellen Ziehung des aktuellen Spiels.",
      inputSchema: z.object({}).strict(),
      execute: async () => {
        const latest = archive.at(-1);
        return latest ? { datum: latest.date, ...summarizeField(latest) } : { hinweis: "Keine offizielle Ziehung vorhanden." };
      },
    }),
  };
}
