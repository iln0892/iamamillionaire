import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { validateDraw, type Draw } from "../src/domain.js";

let snapshot: Promise<Draw[]> | undefined;
export function officialDraws() {
  return snapshot ??= loadSnapshot().catch(error => {
    snapshot = undefined;
    throw error;
  });
}
async function loadSnapshot(): Promise<Draw[]> {
  const [bytes, wasm] = await Promise.all([
    readFile(new URL("../public/data/lottery.sqlite", import.meta.url)),
    readFile(new URL("../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url)),
  ]);
  const SQL = await initSqlJs({ wasmBinary: Uint8Array.from(wasm).buffer });
  const db = new SQL.Database(bytes);
  try {
    const rows = db.exec("SELECT game,date,variant,numbers,extras,quotas FROM draws ORDER BY date,variant")[0]?.values ?? [];
    return rows.map(row => ({
      ...validateDraw({
        game: row[0], date: row[1], variant: row[2],
        numbers: JSON.parse(String(row[3])),
        extras: JSON.parse(String(row[4])),
        quotas: JSON.parse(String(row[5])),
      }),
      source: "WestLotto",
    }));
  } finally {
    db.close();
  }
}
