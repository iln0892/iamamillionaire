import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import {
  type Draw,
  validateDraw,
  statistics,
  generateTips,
  defaultFilters,
  passesFilters,
  seededRandom,
  prizeClass,
  backtest,
  cooccurrences,
} from "../src/domain";
const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync("public/data/lottery.sqlite"));
const draws: Draw[] = db
  .exec(
    "SELECT game,date,variant,numbers,extras,quotas,source FROM draws ORDER BY date,variant",
  )[0]
  .values.map((r) => ({
    game: r[0] as Draw["game"],
    date: r[1] as string,
    variant: r[2] as string,
    numbers: JSON.parse(r[3] as string),
    extras: JSON.parse(r[4] as string),
    quotas: JSON.parse(r[5] as string),
    source: r[6] as string,
  }));
test("entire official snapshot passes client validation and database integrity", () => {
  assert.equal(db.exec("PRAGMA integrity_check")[0].values[0][0], "ok");
  draws.forEach((d) => validateDraw(d));
  assert.deepEqual(
    draws.find((d) => d.game === "lotto")?.numbers,
    [3, 12, 13, 16, 23, 41],
  );
  assert.ok(draws.filter((d) => d.game === "lotto").length > 6500);
  assert.ok(draws.filter((d) => d.game === "euro").length > 990);
  assert.ok(!draws.some((d) => d.variant === "A" && d.date < "1986-06-04"));
  const modern = draws.filter(
    (d) => d.date >= "2022-01-01" && d.variant === "main",
  );
  modern.forEach((d) => {
    assert.equal(d.quotas.length, d.game === "lotto" ? 9 : 12);
    assert.ok(
      (d.quotas.at(-1) ?? 0) > 0,
      `Missing lowest-class payout on ${d.game} ${d.date}`,
    );
  });
});
test("dates, duplicates, supplementary numbers and Eurojackpot rule changes reject malformed imports", () => {
  const valid = draws.find((d) => d.game === "euro")!;
  assert.throws(() => validateDraw({ ...valid, date: "2024-02-30" }));
  assert.throws(() => validateDraw({ ...valid, numbers: [1, 1, 2, 3, 4] }));
  assert.throws(() => validateDraw({ ...valid, extras: [8, 9] }));
  assert.throws(() => validateDraw({ ...valid, extras: [1, 1] }));
  assert.throws(() => validateDraw({ ...valid, quotas: [1] }));
  assert.throws(() => validateDraw({ ...valid, date: "2099-01-01" }));
  assert.doesNotThrow(() =>
    validateDraw({ ...valid, date: "2022-03-25", extras: [11, 12] }),
  );
});
test("frequencies count each draw once and gaps measure draws since last occurrence", () => {
  const data: Draw[] = [
    { ...draws[0], numbers: [1, 2, 3, 4, 5, 6] },
    { ...draws[0], numbers: [1, 7, 8, 9, 10, 11] },
  ];
  const s = statistics(data, "lotto");
  assert.equal(s.counts[0].count, 2);
  assert.equal(s.counts[0].gap, 0);
  assert.equal(s.counts[1].gap, 1);
  assert.equal(s.counts[11].gap, 2);
  assert.equal(
    s.counts.reduce((a, c) => a + c.count, 0),
    12,
  );
  assert.equal(
    s.parity.reduce((a, c) => a + c, 0),
    2,
  );
  assert.equal(
    cooccurrences(data, 2).find((p) => p.numbers.join() === "1,2")?.count,
    1,
  );
});
test("generator obeys filters, has no repeated numbers or fields and replays a seed", () => {
  for (const game of ["lotto", "euro"] as const) {
    const history = draws.filter((d) => d.game === game),
      filters = defaultFilters(game);
    const tips = generateTips(game, filters, history, 12, seededRandom(42));
    assert.deepEqual(
      tips,
      generateTips(game, filters, history, 12, seededRandom(42)),
    );
    assert.equal(new Set(tips.map((t) => t.numbers.join())).size, 12);
    tips.forEach((t) => {
      assert.equal(new Set(t.numbers).size, t.numbers.length);
      assert.ok(
        passesFilters(
          t.numbers,
          filters,
          new Set(history.map((d) => d.numbers.join("-"))),
        ),
      );
    });
  }
  assert.throws(
    () =>
      generateTips(
        "lotto",
        { ...defaultFilters("lotto"), minSum: 21, maxSum: 21 },
        [],
        1,
        seededRandom(42),
      ),
    /Filter/,
  );
});
test("all current prize classes map correctly, including the lowest Eurojackpot wins", () => {
  assert.equal(prizeClass("lotto", 6, 1), 1);
  assert.equal(prizeClass("lotto", 2, 1), 9);
  assert.equal(prizeClass("lotto", 2, 0), null);
  assert.equal(prizeClass("euro", 5, 2), 1);
  assert.equal(prizeClass("euro", 1, 2), 11);
  assert.equal(prizeClass("euro", 2, 1), 12);
  assert.equal(prizeClass("euro", 1, 1), null);
});
test("backtest is reproducible, accounts for all fields and never uses the current draw in historic filters", () => {
  const f = defaultFilters("lotto");
  const result = backtest(draws, "lotto", f, 52, 3, 2026);
  assert.deepEqual(result, backtest(draws, "lotto", f, 52, 3, 2026));
  assert.equal(result.draws, 52);
  assert.equal(result.cost, 52 * 3 * 1.2);
  assert.equal(
    result.filtered.hits.reduce((a, n) => a + n, 0),
    156,
  );
  assert.equal(
    result.random.hits.reduce((a, n) => a + n, 0),
    156,
  );
  const historicOnly = {
    ...f,
    sum: false,
    parity: false,
    decades: false,
    patterns: false,
    birthdays: false,
  };
  const predicted = generateTips(
    "lotto",
    historicOnly,
    [],
    1,
    seededRandom(17),
  )[0];
  const current: Draw = {
    game: "lotto",
    date: "2026-01-01",
    variant: "main",
    ...predicted,
    quotas: Array(9).fill(10),
    source: "Test",
  };
  const testResult = backtest([current], "lotto", historicOnly, 1, 1, 17);
  assert.equal(testResult.filtered.hits[6], 1);
  assert.equal(testResult.filtered.revenue, 10);
});
