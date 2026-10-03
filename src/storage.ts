import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { type Draw, type Tip, validateDraw, games } from "./domain";
const base = import.meta.env?.BASE_URL ?? "/iamamillionaire/";
let sqlReady: Promise<SqlJsStatic> | undefined;
function loadSql() {
  return (sqlReady ??= fetch(`${base}sql-wasm.wasm`).then(async response => {
    if (!response.ok) throw new Error("Die lokale SQLite-Engine konnte nicht geladen werden.");
    return initSqlJs({ wasmBinary: await response.arrayBuffer() });
  }));
}
export interface Manifest {
  generatedAt: string;
  games: Record<
    "lotto" | "euro",
    { count: number; first: string; last: string; quotasFrom: string }
  >;
  sources: { url: string; sha256: string }[];
  notes: string[];
}
let db: Database;
let local: IDBDatabase | undefined;
export let persistenceError = "";
function idbRequest<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function persistDatabase(database: Database) {
  if (!local)
    throw new Error(
      "Lokaler Speicher ist nicht verfügbar. Exportiere deine Daten als Sicherung.",
    );
  const bytes = database.export();
  const tx = local.transaction("files", "readwrite");
  tx.objectStore("files").put(bytes, "database");
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
export async function initialize() {
  const SQL = await loadSql();
  persistenceError = "";
  const [dataResponse, manifestResponse] = await Promise.all([
    fetch(`${base}data/lottery.sqlite`, { cache: "no-cache" }),
    fetch(`${base}data/manifest.json`, { cache: "no-cache" }),
  ]);
  if (!dataResponse.ok || !manifestResponse.ok)
    throw new Error(
      "Das Ziehungsarchiv konnte nicht geladen werden. Bitte die Verbindung prüfen und erneut laden.",
    );
  const seedBytes = new Uint8Array(await dataResponse.arrayBuffer());
  const manifest = (await manifestResponse.json()) as Manifest;
  try {
    const request = indexedDB.open("millionaire-lotto-lab", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    local = await idbRequest(request);
    const saved = await idbRequest(
      local.transaction("files").objectStore("files").get("database"),
    );
    db = saved ? new SQL.Database(saved) : new SQL.Database(seedBytes);
    if (db.exec("PRAGMA user_version")[0]?.values[0][0] !== 1)
      throw new Error("Nicht unterstützte lokale Datenbankversion.");
    const snapshot = db.exec(
      "SELECT value FROM metadata WHERE key='snapshot'",
    )[0]?.values[0][0];
    if (saved && snapshot !== manifest.generatedAt) {
      const seed = new SQL.Database(seedBytes);
      const rows = seed.exec("SELECT * FROM draws")[0].values;
      db.run("BEGIN");
      const insert = db.prepare(
        "INSERT INTO draws VALUES (?,?,?,?,?,?,?) ON CONFLICT(game,date,variant) DO UPDATE SET numbers=excluded.numbers,extras=excluded.extras,quotas=excluded.quotas WHERE draws.source='WestLotto'",
      );
      rows.forEach((row) => insert.run(row));
      insert.free();
      db.run("INSERT OR REPLACE INTO metadata VALUES ('snapshot',?)", [
        manifest.generatedAt,
      ]);
      db.run("COMMIT");
      seed.close();
    }
    await persistDatabase(db);
  } catch {
    if (!db) db = new SQL.Database(seedBytes);
    persistenceError =
      "Dein Browser kann Änderungen gerade nicht dauerhaft speichern. Nutze den Export zur Sicherung.";
  }
  return manifest;
}
export function readDraws(): Draw[] {
  const rows =
    db.exec(
      "SELECT game,date,variant,numbers,extras,quotas,source FROM draws ORDER BY date,variant",
    )[0]?.values ?? [];
  return rows.map((r) => ({
    game: r[0] as Draw["game"],
    date: r[1] as string,
    variant: r[2] as string,
    numbers: JSON.parse(r[3] as string),
    extras: JSON.parse(r[4] as string),
    quotas: JSON.parse(r[5] as string),
    source: r[6] as string,
  }));
}
export function readTips(): Tip[] {
  return (
    db.exec("SELECT * FROM tips ORDER BY created DESC")[0]?.values ?? []
  ).map((r) => ({
    id: r[0] as string,
    game: r[1] as Tip["game"],
    created: r[2] as string,
    numbers: JSON.parse(r[3] as string),
    extras: JSON.parse(r[4] as string),
    explanation: r[5] as string,
  }));
}
async function mutate(action: () => void) {
  const backup = db.export();
  db.run("BEGIN");
  try {
    action();
    db.run("COMMIT");
    await persistDatabase(db);
  } catch (error) {
    const SQL = await loadSql();
    db.close();
    db = new SQL.Database(backup);
    throw error;
  }
}
export async function saveTip(tip: Tip) {
  await mutate(() =>
    db.run("INSERT INTO tips VALUES (?,?,?,?,?,?)", [
      tip.id,
      tip.game,
      tip.created,
      JSON.stringify(tip.numbers),
      JSON.stringify(tip.extras),
      tip.explanation,
    ]),
  );
}
export async function removeTip(id: string) {
  await mutate(() => db.run("DELETE FROM tips WHERE id=?", [id]));
}
export function exportJson() {
  return JSON.stringify(
    { version: 1, draws: readDraws(), tips: readTips() },
    null,
    2,
  );
}
export function exportSqlite() {
  return db.export();
}
export function exportCsv() {
  return (
    "game;date;variant;numbers;extras;quotas\n" +
    readDraws()
      .map((d) =>
        [
          d.game,
          d.date,
          d.variant,
          d.numbers.join(" "),
          d.extras.join(" "),
          d.quotas.map((q) => q ?? "").join("|"),
        ].join(";"),
      )
      .join("\n")
  );
}
export async function importData(text: string, isCsv: boolean) {
  let raw: unknown[];
  let rawTips: unknown[] = [];
  if (isCsv) {
    const lines = text
      .replace(/^\uFEFF/, "")
      .trim()
      .split(/\r?\n/);
    if (lines.shift() !== "game;date;variant;numbers;extras;quotas")
      throw new Error(
        "CSV-Spalten: game;date;variant;numbers;extras;quotas. Ein Beispiel findest du unter Daten & Quellen.",
      );
    raw = lines.filter(Boolean).map((line) => {
      const [game, date, variant, numbers, extras, quotas] = line.split(";");
      return {
        game,
        date,
        variant,
        numbers: numbers?.trim().split(/\s+/).map(Number),
        extras: extras?.trim() ? extras.trim().split(/\s+/).map(Number) : [],
        quotas: quotas
          ? quotas.split("|").map((q) => (q === "" ? null : Number(q)))
          : [],
      };
    });
  } else {
    const data = JSON.parse(text);
    raw = Array.isArray(data) ? data : data.draws;
    rawTips = Array.isArray(data.tips) ? data.tips : [];
  }
  if (!Array.isArray(raw) || raw.length > 30000 || rawTips.length > 1000)
    throw new Error(
      "Erwartet wird eine Liste mit höchstens 30.000 Ziehungen und 1.000 Tipps.",
    );
  const incoming = raw.map((d, i) => {
    try {
      return validateDraw(d);
    } catch (e) {
      throw new Error(`Zeile ${i + 1}: ${(e as Error).message}`);
    }
  });
  const tips = rawTips.map((value) => {
    const t = value as Tip;
    if (
      !t ||
      !games[t.game] ||
      typeof t.id !== "string" ||
      t.id.length > 100 ||
      typeof t.created !== "string" ||
      !Number.isFinite(Date.parse(t.created)) ||
      typeof t.explanation !== "string" ||
      t.explanation.length > 2000
    )
      throw new Error("Ungültiger gespeicherter Tipp.");
    validateDraw({ ...t, date: "2026-01-01", variant: "main", quotas: [] });
    if (t.extras.length !== (t.game === "lotto" ? 1 : 2))
      throw new Error("Im Tipp fehlen Zusatzzahlen.");
    return t;
  });
  let added = 0;
  let skipped = 0;
  await mutate(() => {
    const find = db.prepare(
      "SELECT numbers,extras FROM draws WHERE game=? AND date=? AND variant=?",
    );
    const insert = db.prepare("INSERT INTO draws VALUES (?,?,?,?,?,?,?)");
    try {
      for (const d of incoming) {
        find.bind([d.game, d.date, d.variant]);
        if (find.step()) {
          const existing = find.get();
          find.reset();
          if (
            JSON.stringify(JSON.parse(existing[0] as string)) !==
              JSON.stringify(d.numbers) ||
            JSON.stringify(JSON.parse(existing[1] as string)) !==
              JSON.stringify(d.extras)
          )
            throw new Error(
              `Konflikt am ${d.date}: Die vorhandene Ziehung wird nicht überschrieben.`,
            );
          skipped++;
          continue;
        }
        find.reset();
        insert.run([
          d.game,
          d.date,
          d.variant,
          JSON.stringify(d.numbers),
          JSON.stringify(d.extras),
          JSON.stringify(d.quotas),
          d.source,
        ]);
        added++;
      }
    } finally {
      find.free();
      insert.free();
    }
    for (const t of tips)
      db.run("INSERT OR IGNORE INTO tips VALUES (?,?,?,?,?,?)", [
        t.id,
        t.game,
        t.created,
        JSON.stringify(t.numbers),
        JSON.stringify(t.extras),
        t.explanation,
      ]);
  });
  return { added, skipped, tips: tips.length };
}
