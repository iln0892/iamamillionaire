export type Game = "lotto" | "euro";
export interface Draw {
  game: Game;
  date: string;
  variant: string;
  numbers: number[];
  extras: number[];
  quotas: (number | null)[];
  source: string;
}
export interface Tip {
  id: string;
  game: Game;
  created: string;
  numbers: number[];
  extras: number[];
  explanation: string;
}
export interface Filters {
  sum: boolean;
  minSum: number;
  maxSum: number;
  parity: boolean;
  decades: boolean;
  minDecades: number;
  patterns: boolean;
  historic: boolean;
  birthdays: boolean;
}
export const games = {
  lotto: {
    name: "LOTTO 6aus49",
    count: 6,
    max: 49,
    price: 1.2,
    extras: "Superzahl",
  },
  euro: {
    name: "Eurojackpot",
    count: 5,
    max: 50,
    price: 2,
    extras: "Eurozahlen",
  },
};
export const defaultFilters = (game: Game): Filters => ({
  sum: true,
  minSum: game === "lotto" ? 115 : 95,
  maxSum: game === "lotto" ? 185 : 165,
  parity: true,
  decades: true,
  minDecades: 3,
  patterns: true,
  historic: true,
  birthdays: true,
});
export const sum = (n: number[]) => n.reduce((s, x) => s + x, 0);
export const evenCount = (n: number[]) => n.filter((x) => x % 2 === 0).length;
export const decade = (n: number) => Math.floor(n / 10);
export const combinationKey = (n: number[]) =>
  [...n].sort((a, b) => a - b).join("-");
export function validateDraw(value: unknown): Draw {
  if (!value || typeof value !== "object")
    throw new Error("Eine Ziehung muss ein Objekt sein.");
  const d = value as Draw;
  if (d.game !== "lotto" && d.game !== "euro")
    throw new Error("Spielart muss lotto oder euro sein.");
  if (
    typeof d.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.date) ||
    !Number.isFinite(Date.parse(d.date)) ||
    new Date(d.date).toISOString().slice(0, 10) !== d.date
  )
    throw new Error("Ungültiges Datum. Erwartet wird JJJJ-MM-TT.");
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
  if (
    d.date > today ||
    d.date < (d.game === "lotto" ? "1955-10-09" : "2012-03-23")
  )
    throw new Error("Ziehungsdatum liegt außerhalb des zulässigen Zeitraums.");
  const config = games[d.game];
  if (
    !Array.isArray(d.numbers) ||
    d.numbers.length !== config.count ||
    new Set(d.numbers).size !== config.count ||
    d.numbers.some((n) => !Number.isInteger(n) || n < 1 || n > config.max)
  )
    throw new Error(
      `Erwartet werden ${config.count} verschiedene Zahlen von 1 bis ${config.max}.`,
    );
  if (!Array.isArray(d.extras))
    throw new Error("extras muss ein Zahlenarray sein.");
  const extraMax =
    d.game === "lotto"
      ? 9
      : d.date < "2014-10-10"
        ? 8
        : d.date < "2022-03-25"
          ? 10
          : 12;
  if (
    d.extras.length !== (d.game === "euro" ? 2 : d.extras.length ? 1 : 0) ||
    new Set(d.extras).size !== d.extras.length ||
    d.extras.some(
      (n) =>
        !Number.isInteger(n) ||
        n < (d.game === "lotto" ? 0 : 1) ||
        n > extraMax,
    )
  )
    throw new Error("Ungültige Zusatz-/Eurozahlen für dieses Ziehungsdatum.");
  const quotas = d.quotas ?? [];
  if (
    !Array.isArray(quotas) ||
    (quotas.length !== 0 && quotas.length !== (d.game === "lotto" ? 9 : 12)) ||
    quotas.some((q) => q !== null && (!Number.isFinite(q) || q < 0))
  )
    throw new Error("Ungültige Gewinnquoten.");
  const variant = d.variant ?? "main";
  if (!["main", "A", "B", "special"].includes(variant))
    throw new Error("Unbekannte Ziehungsvariante.");
  return {
    game: d.game,
    date: d.date,
    numbers: [...d.numbers].sort((a, b) => a - b),
    extras: [...d.extras].sort((a, b) => a - b),
    variant,
    quotas,
    source: "Import",
  };
}
export function statistics(draws: Draw[], game: Game) {
  const counts = Array.from({ length: games[game].max }, (_, i) => ({
    number: i + 1,
    count: 0,
    gap: draws.length,
    lastDate: "",
  }));
  const parity = Array(games[game].count + 1).fill(0) as number[];
  const sums = Array(30).fill(0) as number[];
  const decades = Array(game === "lotto" ? 5 : 6).fill(0) as number[];
  draws.forEach((d, index) => {
    d.numbers.forEach((n) => {
      const c = counts[n - 1];
      c.count++;
      c.gap = draws.length - index - 1;
      c.lastDate = d.date;
      decades[decade(n)]++;
    });
    parity[evenCount(d.numbers)]++;
    sums[Math.floor(sum(d.numbers) / 10)]++;
  });
  return {
    counts,
    parity,
    sums,
    decades,
    averageSum: draws.length
      ? draws.reduce((s, d) => s + sum(d.numbers), 0) / draws.length
      : 0,
    hot: [...counts].sort((a, b) => b.count - a.count || a.number - b.number),
    cold: [...counts].sort((a, b) => b.gap - a.gap || a.number - b.number),
  };
}
export function cooccurrences(draws: Draw[], size: 2 | 3) {
  const counts = new Map<string, number>();
  for (const d of draws)
    for (let i = 0; i < d.numbers.length; i++)
      for (let j = i + 1; j < d.numbers.length; j++) {
        if (size === 2) {
          const key = `${d.numbers[i]}-${d.numbers[j]}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        } else
          for (let k = j + 1; k < d.numbers.length; k++) {
            const key = `${d.numbers[i]}-${d.numbers[j]}-${d.numbers[k]}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
      }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([key, count]) => ({ numbers: key.split("-").map(Number), count }));
}
export function longestRun(numbers: number[]) {
  let longest = 1,
    current = 1;
  numbers.forEach((n, i) => {
    if (!i) return;
    current = n === numbers[i - 1] + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  });
  return longest;
}
export function passesFilters(
  numbers: number[],
  f: Filters,
  historic: Set<string>,
) {
  if (f.sum && (sum(numbers) < f.minSum || sum(numbers) > f.maxSum))
    return false;
  if (
    f.parity &&
    (evenCount(numbers) < 2 || evenCount(numbers) > numbers.length - 2)
  )
    return false;
  if (f.decades && new Set(numbers.map(decade)).size < f.minDecades)
    return false;
  if (
    f.patterns &&
    (longestRun(numbers) >= 5 ||
      numbers
        .slice(2)
        .every((n, i) => n - numbers[i + 1] === numbers[1] - numbers[0]) ||
      numbers.slice(2).every((n, i) => n * numbers[i] === numbers[i + 1] ** 2))
  )
    return false;
  if (f.historic && historic.has(combinationKey(numbers))) return false;
  if (f.birthdays && numbers.every((n) => n <= 31)) return false;
  return true;
}
export function secureRandom() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 4294967296;
}
export function seededRandom(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sample(count: number, max: number, rng: () => number, min = 1) {
  const pool = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
export function generateTips(
  game: Game,
  filters: Filters,
  history: Draw[],
  count: number,
  rng = secureRandom,
  extraMax = 12,
) {
  if (!Number.isInteger(count) || count < 1 || count > 12)
    throw new Error("Bitte 1 bis 12 Tippfelder wählen.");
  if (
    !Number.isFinite(filters.minSum) ||
    !Number.isFinite(filters.maxSum) ||
    filters.minSum > filters.maxSum ||
    !Number.isInteger(filters.minDecades) ||
    filters.minDecades < 1 ||
    filters.minDecades > 5
  )
    throw new Error("Bitte die Filtergrenzen prüfen.");
  const historic = new Set(history.map((d) => combinationKey(d.numbers)));
  const result: {
    numbers: number[];
    extras: number[];
    explanation: string;
    score: number;
  }[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (result.length < count && attempts++ < 20000) {
    const numbers = sample(games[game].count, games[game].max, rng);
    if (
      !passesFilters(numbers, filters, historic) ||
      seen.has(combinationKey(numbers))
    )
      continue;
    seen.add(combinationKey(numbers));
    const extras =
      game === "lotto" ? sample(1, 9, rng, 0) : sample(2, extraMax, rng);
    const dc = new Set(numbers.map(decade)).size;
    const score = Math.round(
      100 *
        (0.4 *
          (1 -
            Math.min(
              1,
              Math.abs(sum(numbers) - (filters.minSum + filters.maxSum) / 2) /
                100,
            )) +
          0.3 *
            (1 -
              Math.abs(evenCount(numbers) - numbers.length / 2) /
                numbers.length) +
          (0.3 * dc) / 5),
    );
    result.push({
      numbers,
      extras,
      score,
      explanation: `Summe ${sum(numbers)} · ${evenCount(numbers)} gerade / ${numbers.length - evenCount(numbers)} ungerade · ${dc} Dekaden. ${filters.birthdays ? "Mindestens eine Zahl über 31. " : ""}Zufällig innerhalb deiner Regeln gewählt. Der Regel-Score ist keine Gewinnwahrscheinlichkeit.`,
    });
  }
  if (result.length < count)
    throw new Error(
      "Die Filter lassen zu wenige Tipps zu. Erweitere den Summenbereich oder deaktiviere einen Filter.",
    );
  return result;
}
export function prizeClass(
  game: Game,
  matches: number,
  extraMatches: number,
): number | null {
  const table: Record<string, number> =
    game === "lotto"
      ? {
          "6-1": 1,
          "6-0": 2,
          "5-1": 3,
          "5-0": 4,
          "4-1": 5,
          "4-0": 6,
          "3-1": 7,
          "3-0": 8,
          "2-1": 9,
        }
      : {
          "5-2": 1,
          "5-1": 2,
          "5-0": 3,
          "4-2": 4,
          "4-1": 5,
          "3-2": 6,
          "4-0": 7,
          "2-2": 8,
          "3-1": 9,
          "3-0": 10,
          "1-2": 11,
          "2-1": 12,
        };
  return table[`${matches}-${extraMatches}`] ?? null;
}
export interface BacktestResult {
  draws: number;
  fields: number;
  cost: number;
  filtered: { hits: number[]; wins: number; revenue: number; unknown: number };
  random: { hits: number[]; wins: number; revenue: number; unknown: number };
  rows: { date: string; filtered: number; random: number }[];
  seed: number;
}
export function backtest(
  all: Draw[],
  game: Game,
  filters: Filters,
  drawsCount: number,
  fields: number,
  seed: number,
): BacktestResult {
  const eligible = all.filter(
    (d) => d.game === game && d.date >= "2022-01-01" && d.variant === "main",
  );
  const test = eligible.slice(-drawsCount);
  if (!test.length)
    throw new Error(
      "Für diesen Test fehlen Ziehungen ab 2022 mit Gewinnquoten.",
    );
  const rngFiltered = seededRandom(seed),
    rngRandom = seededRandom(seed ^ 0x9e3779b9);
  const empty = () => ({
    hits: Array(games[game].count + 1).fill(0) as number[],
    wins: 0,
    revenue: 0,
    unknown: 0,
  });
  const result: BacktestResult = {
    draws: test.length,
    fields,
    cost: test.length * fields * games[game].price,
    filtered: empty(),
    random: empty(),
    rows: [],
    seed,
  };
  const history = all.filter((d) => d.game === game && d.date < test[0].date);
  for (const draw of test) {
    const extraMax = draw.date < "2022-03-25" ? 10 : 12;
    const filtered = generateTips(
      game,
      filters,
      history,
      fields,
      rngFiltered,
      extraMax,
    );
    const random = Array.from({ length: fields }, () => ({
      numbers: sample(games[game].count, games[game].max, rngRandom),
      extras:
        game === "lotto"
          ? sample(1, 9, rngRandom, 0)
          : sample(2, extraMax, rngRandom),
    }));
    for (const [name, tips] of [
      ["filtered", filtered],
      ["random", random],
    ] as const)
      for (const tip of tips) {
        const matches = tip.numbers.filter((n) =>
          draw.numbers.includes(n),
        ).length;
        const extraMatches = tip.extras.filter((n) =>
          draw.extras.includes(n),
        ).length;
        const rank = prizeClass(game, matches, extraMatches);
        result[name].hits[matches]++;
        if (rank) {
          result[name].wins++;
          const payout = draw.quotas[rank - 1];
          if (payout == null) result[name].unknown++;
          else result[name].revenue += payout;
        }
      }
    result.rows.push({
      date: draw.date,
      filtered:
        result.filtered.revenue -
        result.rows.length * fields * games[game].price -
        fields * games[game].price,
      random:
        result.random.revenue -
        (result.rows.length + 1) * fields * games[game].price,
    });
    history.push(draw); // only past draws enter the next selection; no look-ahead
  }
  return result;
}
