import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FlaskConical,
  Grid2X2,
  History,
  Info,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  type Game,
  type Draw,
  type Tip,
  type Filters,
  type BacktestResult,
  games,
  statistics,
  cooccurrences,
  defaultFilters,
  generateTips,
  sum,
  evenCount,
  longestRun,
} from "./domain";
import {
  initialize,
  readDraws,
  readTips,
  saveTip,
  removeTip,
  exportJson,
  exportCsv,
  exportSqlite,
  importData,
  persistenceError,
  type Manifest,
} from "./storage";

type View =
  | "overview"
  | "history"
  | "statistics"
  | "oracle"
  | "patterns"
  | "waves"
  | "backtest"
  | "data";
const navigation: [View, string, typeof Grid2X2][] = [
  ["overview", "Übersicht", Grid2X2],
  ["history", "Ziehungen", History],
  ["statistics", "Statistiken", BarChart3],
  ["oracle", "Orakel & Tipps", Sparkles],
  ["patterns", "Muster erkennen", Layers3],
  ["waves", "Wellentheorie", Activity],
  ["backtest", "Schon Millionär?", FlaskConical],
  ["data", "Daten & Quellen", Database],
];
const titles: Record<View, [string, string]> = {
  overview: ["Dein Lotto-Labor.", "Zahlen verstehen. Bewusst auswählen."],
  history: [
    "Jede Ziehung. Ein Blick zurück.",
    "Das offizielle Archiv, durchsuchbar bis zur ersten Ziehung.",
  ],
  statistics: [
    "Was die Zahlen erzählen.",
    "Häufigkeiten und Verteilungen im ausgewählten Zeitraum.",
  ],
  oracle: [
    "Deine Regeln. Deine Zahlen.",
    "Zufällige Tipps, passend zu deiner Auswahl.",
  ],
  patterns: [
    "Muster unter der Lupe.",
    "Gemeinsame Zahlen und auffällige Kombinationen.",
  ],
  waves: [
    "Bewegung in den Zahlen.",
    "Vergangene Häufigkeit in rollierenden Zeitfenstern.",
  ],
  backtest: [
    "Wäre ich schon Millionär?",
    "Teste deine Auswahlregeln gegen eine Zufallsstrategie.",
  ],
  data: [
    "Dein Archiv. Unter deiner Kontrolle.",
    "Offizielle Daten und persönliche Sicherungen.",
  ],
};
const nf = new Intl.NumberFormat("de-DE");
const money = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});
function dateLabel(value: string, long = false) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: long ? "long" : "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(new Date(value + "T12:00:00Z"));
}
function download(content: string | Uint8Array, name: string, type: string) {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Balls({
  numbers,
  extras = [],
  small = false,
}: {
  numbers: number[];
  extras?: number[];
  small?: boolean;
}) {
  return (
    <div
      className={`balls ${small ? "small" : ""}`}
      aria-label={`Zahlen ${numbers.join(", ")}${extras.length ? "; Zusatzzahlen " + extras.join(", ") : ""}`}
    >
      {numbers.map((n) => (
        <span className="ball" key={n}>
          {String(n).padStart(2, "0")}
        </span>
      ))}
      {extras.length > 0 && (
        <span className="ball-separator" aria-hidden="true">
          +
        </span>
      )}
      {extras.map((n) => (
        <span className="ball extra" key={`e${n}`}>
          {String(n).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}
function Panel({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <Info size={18} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
function Bars({
  values,
  labels,
  color = "lime",
}: {
  values: number[];
  labels: string[];
  color?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div
      className={`bar-chart ${color}`}
      role="img"
      aria-label={labels.map((l, i) => `${l}: ${values[i]}`).join("; ")}
    >
      {values.map((v, i) => (
        <div className="bar-column" key={i}>
          <span className="bar-value">{nf.format(v)}</span>
          <div className="bar-track">
            <div className="bar" style={{ height: `${(v / max) * 100}%` }} />
          </div>
          <span className="bar-label">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
function LineChart({
  series,
  labels,
}: {
  series: { name: string; color: string; values: number[] }[];
  labels?: string[];
}) {
  const values = series.flatMap((s) => s.values);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const path = (v: number[]) =>
    v
      .map(
        (y, i) =>
          `${i ? "L" : "M"}${40 + (i / Math.max(1, v.length - 1)) * 720},${180 - ((y - min) / (max - min)) * 150}`,
      )
      .join(" ");
  return (
    <div className="line-chart">
      <svg
        viewBox="0 0 800 220"
        role="img"
        aria-label={series
          .map(
            (s) => `${s.name}: ${s.values.map((v) => v.toFixed(1)).join(", ")}`,
          )
          .join("; ")}
      >
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="40"
              y1={30 + i * 50}
              x2="760"
              y2={30 + i * 50}
              stroke="#e7ebe8"
            />
            <text x="5" y={35 + i * 50} fill="#747d77" fontSize="11">
              {Math.round(max - (i / 3) * (max - min))}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path
            key={s.name}
            d={path(s.values)}
            stroke={s.color}
            strokeWidth="3"
            fill="none"
            strokeLinejoin="round"
          />
        ))}
        {labels && (
          <>
            <text x="40" y="210" fill="#747d77" fontSize="12">
              {labels[0]}
            </text>
            <text x="760" y="210" textAnchor="end" fill="#747d77" fontSize="12">
              {labels.at(-1)}
            </text>
          </>
        )}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState<Game>(() => {
    try {
      return localStorage.getItem("lotto-game") === "euro" ? "euro" : "lotto";
    } catch {
      return "lotto";
    }
  });
  const [view, setView] = useState<View>(() =>
    navigation.some((n) => n[0] === location.hash.slice(1))
      ? (location.hash.slice(1) as View)
      : "overview",
  );
  const [draws, setDraws] = useState<Draw[]>([]),
    [saved, setSaved] = useState<Tip[]>([]),
    [manifest, setManifest] = useState<Manifest>();
  const [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(""),
    [toast, setToast] = useState(""),
    [period, setPeriod] = useState("104"),
    [selected, setSelected] = useState<number>();
  const [filters, setFilters] = useState<Record<Game, Filters>>({
    lotto: defaultFilters("lotto"),
    euro: defaultFilters("euro"),
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  };
  const reload = () => {
    setLoading(true);
    setFatal("");
    initialize()
      .then((m) => {
        setManifest(m);
        setDraws(readDraws());
        setSaved(readTips());
      })
      .catch((e) => setFatal(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    reload();
    const onHash = () => {
      const hash = location.hash.slice(1);
      if (navigation.some((n) => n[0] === hash)) setView(hash as View);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      clearTimeout(toastTimer.current);
    };
  }, []);
  const navigate = (next: View) => {
    location.hash = next;
    setView(next);
    setSelected(undefined);
    window.scrollTo({ top: 0 });
  };
  const switchGame = (next: Game) => {
    setGame(next);
    setSelected(undefined);
    try {
      localStorage.setItem("lotto-game", next);
    } catch {}
  };
  const all = useMemo(
    () => draws.filter((d) => d.game === game),
    [draws, game],
  );
  const ranged = useMemo(
    () => (period === "all" ? all : all.slice(-Number(period))),
    [all, period],
  );
  const stats = useMemo(() => statistics(ranged, game), [ranged, game]);
  const latest = all.at(-1);
  const currentFilters = filters[game];
  const updateFilters = (f: Filters) =>
    setFilters((old) => ({ ...old, [game]: f }));
  const handleSave = async (t: {
    numbers: number[];
    extras: number[];
    explanation: string;
  }) => {
    try {
      if (
        saved.some(
          (s) =>
            s.game === game &&
            s.numbers.join() === t.numbers.join() &&
            s.extras.join() === t.extras.join(),
        )
      ) {
        notify("Dieser Tipp ist bereits gespeichert.");
        return;
      }
      await saveTip({
        ...t,
        id: crypto.randomUUID(),
        game,
        created: new Date().toISOString(),
      });
      setSaved(readTips());
      notify("Tipp auf diesem Gerät gespeichert.");
    } catch (e) {
      notify((e as Error).message);
    }
  };

  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: unknown,
          ) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context?.registerTool || loading || fatal) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: "read_lottery_statistics",
      description:
        "Read historical lottery frequencies. No prediction of future draws.",
      inputSchema: {
        type: "object",
        properties: { game: { enum: ["lotto", "euro"] } },
        required: ["game"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input: { game: Game }) => {
        if (!games[input.game]) throw new Error("Invalid game");
        const data = draws.filter((d) => d.game === input.game);
        return {
          draws: data.length,
          last: data.at(-1)?.date,
          frequencies: statistics(data, input.game).counts,
        };
      },
    });
    register({
      name: "navigate_lottery_module",
      description: "Open a module in the visible lottery lab.",
      inputSchema: {
        type: "object",
        properties: { view: { enum: navigation.map((n) => n[0]) } },
        required: ["view"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: { view: View }) => {
        if (!navigation.some((n) => n[0] === input.view))
          throw new Error("Invalid module");
        navigate(input.view);
        return { view: input.view };
      },
    });
    return () => lifecycle.abort();
  }, [draws, loading, fatal]);

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Zum Inhalt
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#overview"
          onClick={() => navigate("overview")}
        >
          <span className="brand-mark">m.</span>
          <span>
            millionaire<small>DEIN LOTTO-LABOR</small>
          </span>
        </a>
        <div className="nav-label">DEIN WORKSPACE</div>
        <nav aria-label="Hauptnavigation">
          {navigation.map(([key, label, Icon]) => (
            <a
              key={key}
              href={`#${key}`}
              aria-current={view === key ? "page" : undefined}
              className={view === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {key === "oracle" && <small>LAB</small>}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={20} />
          <div>
            <strong>Dein persönliches Labor</strong>
            <p>Tipps bleiben auf deinem Gerät.</p>
          </div>
        </div>
        <div className="sidebar-footer">
          <span>v1.0</span>
          <span>Mit Verstand. Mit Glück.</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="game-switch" aria-label="Spielart">
            {(["lotto", "euro"] as const).map((g) => (
              <button
                key={g}
                className={g === game ? "selected" : ""}
                aria-pressed={game === g}
                onClick={() => switchGame(g)}
              >
                {g === "lotto" ? (
                  <span className="game-symbol">6</span>
                ) : (
                  <span className="game-symbol gold">€</span>
                )}
                {games[g].name}
              </button>
            ))}
          </div>
          <span className="local-badge">
            <Database size={14} />
            {persistenceError
              ? "Speicher eingeschränkt"
              : "Lokal auf deinem Gerät"}
          </span>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">MEHR WISSEN. BEWUSSTER TIPPEN.</div>
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            {view !== "data" && (
              <button
                className="button secondary"
                onClick={() => navigate("data")}
              >
                <Database size={16} />
                Daten & Quellen
              </button>
            )}
          </div>
          {loading ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              <h2>Dein Archiv wird geladen.</h2>
              <p>Offizielle Ziehungen werden lokal vorbereitet.</p>
            </div>
          ) : fatal ? (
            <div className="error-state" role="alert">
              <h2>Das Archiv ist gerade nicht erreichbar.</h2>
              <p>{fatal}</p>
              <button className="button" onClick={reload}>
                <RefreshCw size={16} />
                Erneut laden
              </button>
            </div>
          ) : (
            <>
              {persistenceError && <Notice>{persistenceError}</Notice>}
              {["overview", "statistics", "patterns", "waves"].includes(
                view,
              ) && (
                <div className="scope-bar">
                  <div>
                    <span className="status-tag">OFFIZIELLES ARCHIV</span>
                    <span>
                      {nf.format(all.length)} Ziehungen ·{" "}
                      {dateLabel(all[0].date)} – {dateLabel(latest!.date)}
                    </span>
                  </div>
                  <label>
                    Analysezeitraum
                    <select
                      value={period}
                      onChange={(e) => {
                        setPeriod(e.target.value);
                        setSelected(undefined);
                      }}
                    >
                      <option value="52">Letzte 52 Ziehungen</option>
                      <option value="104">Letzte 104 Ziehungen</option>
                      <option value="500">Letzte 500 Ziehungen</option>
                      <option value="all">Gesamtes Archiv</option>
                    </select>
                  </label>
                </div>
              )}
              {view === "overview" && (
                <>
                  <div className="overview-row">
                    <section className="latest-card">
                      <div className="latest-top">
                        <span className="eyebrow">DIE LETZTE ZIEHUNG</span>
                        <span className="dark-tag">{games[game].name}</span>
                      </div>
                      <div className="latest-date">
                        {dateLabel(latest!.date, true)}
                      </div>
                      <Balls
                        numbers={latest!.numbers}
                        extras={latest!.extras}
                      />
                      <div className="latest-footer">
                        <span>
                          Summe <strong>{sum(latest!.numbers)}</strong>
                          <b>·</b> Gerade / ungerade{" "}
                          <strong>
                            {evenCount(latest!.numbers)} :{" "}
                            {games[game].count - evenCount(latest!.numbers)}
                          </strong>
                        </span>
                        <button onClick={() => navigate("history")}>
                          Zum Archiv <ArrowUpRight size={16} />
                        </button>
                      </div>
                    </section>
                    <section className="quick-card">
                      <div className="mini-icon">
                        <Sparkles size={22} />
                      </div>
                      <span className="eyebrow">
                        EIN NEUER BLICK AUF DEINE ZAHLEN
                      </span>
                      <h2>
                        Dein nächster Tipp.
                        <br />
                        Nach deinen Regeln.
                      </h2>
                      <p>Setze deine Filter. Lass den Zufall wählen.</p>
                      <button
                        className="button"
                        onClick={() => navigate("oracle")}
                      >
                        <Sparkles size={16} />
                        Tipps generieren
                      </button>
                    </section>
                  </div>
                  <div className="metrics">
                    <Metric
                      label="Ziehungen im Zeitraum"
                      value={nf.format(ranged.length)}
                      detail={`${dateLabel(ranged[0].date)} – ${dateLabel(ranged.at(-1)!.date)}`}
                      icon={<History size={18} />}
                    />
                    <Metric
                      label="Häufigste Zahl"
                      value={String(stats.hot[0].number).padStart(2, "0")}
                      detail={`${stats.hot[0].count} Mal gezogen · ${((stats.hot[0].count / ranged.length) * 100).toFixed(1).replace(".", ",")} %`}
                      icon={<BarChart3 size={18} />}
                    />
                    <Metric
                      label="Längste aktuelle Pause"
                      value={String(stats.cold[0].number).padStart(2, "0")}
                      detail={`${stats.cold[0].gap} Ziehungen ohne diese Zahl`}
                      icon={<Activity size={18} />}
                    />
                  </div>
                  <div className="two-column">
                    <FrequencyPanel
                      stats={stats}
                      game={game}
                      draws={ranged}
                      selected={selected}
                      onSelect={setSelected}
                    />
                    <Panel
                      title="Im Fokus"
                      subtitle="Häufigkeit & aktuelle Abstände"
                    >
                      <RankList stats={stats} />
                      <button
                        className="text-button wide"
                        onClick={() => navigate("statistics")}
                      >
                        Alle Statistiken <ArrowUpRight size={16} />
                      </button>
                    </Panel>
                  </div>
                  <Notice>
                    Jede gültige Kombination hat dieselbe Gewinnchance.
                    Vergangene Häufigkeiten und Pausen sagen die nächste Ziehung
                    nicht voraus.
                  </Notice>
                </>
              )}
              {view === "history" && <HistoryView draws={all} game={game} />}
              {view === "statistics" && (
                <>
                  <FrequencyPanel
                    stats={stats}
                    game={game}
                    draws={ranged}
                    selected={selected}
                    onSelect={setSelected}
                  />
                  <div className="two-column equal">
                    <Panel
                      title="Die Summe deiner Zahlen"
                      subtitle={`Durchschnitt im Zeitraum: ${stats.averageSum.toFixed(1).replace(".", ",")}`}
                    >
                      <Bars
                        values={stats.sums.slice(2, 28)}
                        labels={stats.sums
                          .slice(2, 28)
                          .map((_, i) =>
                            i % 3 === 0 ? String((i + 2) * 10) : "",
                          )}
                      />
                      <p className="caption">
                        Summen in Zehnergruppen. Ein häufiges Intervall macht
                        einzelne Tipps darin nicht wahrscheinlicher.
                      </p>
                    </Panel>
                    <Panel
                      title="Gerade trifft ungerade"
                      subtitle="Wie häufig war jedes Verhältnis?"
                    >
                      <Bars
                        values={stats.parity}
                        labels={stats.parity.map(
                          (_, i) => `${i}:${games[game].count - i}`,
                        )}
                      />
                      <p className="caption">
                        Verhältnis gerade : ungerade, berechnet aus den
                        Hauptzahlen.
                      </p>
                    </Panel>
                  </div>
                  <Panel
                    title="Verteilung über Dekaden"
                    subtitle="Anzahl gezogener Hauptzahlen je Zahlenbereich"
                  >
                    <Bars
                      values={stats.decades}
                      labels={
                        game === "lotto"
                          ? ["1–9", "10–19", "20–29", "30–39", "40–49"]
                          : ["1–9", "10–19", "20–29", "30–39", "40–49", "50"]
                      }
                    />
                  </Panel>
                </>
              )}
              {view === "oracle" && (
                <OracleView
                  key={game}
                  game={game}
                  history={all}
                  filters={currentFilters}
                  setFilters={updateFilters}
                  saved={saved.filter((t) => t.game === game)}
                  save={handleSave}
                  remove={async (id) => {
                    try {
                      await removeTip(id);
                      setSaved(readTips());
                      notify("Tipp entfernt.");
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                  notify={notify}
                />
              )}
              {view === "patterns" && <PatternsView draws={ranged} />}
              {view === "waves" && (
                <WavesView key={game} game={game} draws={ranged} />
              )}
              {view === "backtest" && (
                <BacktestView
                  key={game}
                  game={game}
                  draws={draws}
                  filters={currentFilters}
                  notify={notify}
                />
              )}
              {view === "data" && (
                <DataView
                  manifest={manifest!}
                  draws={draws}
                  saved={saved}
                  notify={notify}
                  refresh={reload}
                  imported={() => {
                    setDraws(readDraws());
                    setSaved(readTips());
                  }}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="age">18+</span> Lotto bleibt Zufall. Keine
              Gewinngarantie.
            </span>
            <a
              href="https://www.check-dein-spiel.de/"
              target="_blank"
              rel="noreferrer"
            >
              Glücksspiel kann süchtig machen · Hilfe
            </a>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          <span>{toast}</span>
          <button aria-label="Meldung schließen" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <section className="metric">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}
function FrequencyPanel({
  stats,
  game,
  draws,
  selected,
  onSelect,
}: {
  stats: ReturnType<typeof statistics>;
  game: Game;
  draws: Draw[];
  selected?: number;
  onSelect: (n: number) => void;
}) {
  const max = Math.max(1, ...stats.counts.map((n) => n.count));
  const detail = selected ? stats.counts[selected - 1] : undefined;
  return (
    <Panel
      title="Die Zahlen im Überblick"
      subtitle={`${nf.format(draws.length)} Ziehungen · wähle eine Zahl für Details`}
      action={
        <span className="heat-legend">
          Seltener <i /> Häufiger
        </span>
      }
    >
      <div className={`number-grid ${game === "euro" ? "euro-grid" : ""}`}>
        {stats.counts.map((n) => (
          <button
            key={n.number}
            className={selected === n.number ? "chosen" : ""}
            style={{ background: `hsl(83 55% ${97 - (n.count / max) * 28}%)` }}
            aria-pressed={selected === n.number}
            aria-label={`Zahl ${n.number}, ${n.count} Mal gezogen, seit ${n.gap} Ziehungen nicht gezogen`}
            onClick={() => onSelect(n.number)}
          >
            <strong>{String(n.number).padStart(2, "0")}</strong>
            <span>{n.count}×</span>
          </button>
        ))}
      </div>
      {detail ? (
        <div className="number-detail">
          <span className="ball">{detail.number}</span>
          <div>
            <strong>{detail.count} Mal gezogen</strong>
            <p>
              {detail.lastDate
                ? `Zuletzt am ${dateLabel(detail.lastDate)} · ${detail.gap} Ziehungen Abstand`
                : "Im ausgewählten Zeitraum nicht gezogen"}
            </p>
          </div>
          <span>
            {((detail.count / draws.length) * 100).toFixed(1).replace(".", ",")}{" "}
            %
          </span>
        </div>
      ) : (
        <p className="caption">
          Die Farbe zeigt nur die vergangene Häufigkeit. Zahlen mit langen
          Pausen sind nicht „fällig“.
        </p>
      )}
    </Panel>
  );
}
function RankList({ stats }: { stats: ReturnType<typeof statistics> }) {
  return (
    <div className="rank-lists">
      <div>
        <h3>
          <span className="tag lime">HOT</span> Häufig gezogen
        </h3>
        {stats.hot.slice(0, 3).map((n, i) => (
          <div className="rank-row" key={n.number}>
            <span className="rank">0{i + 1}</span>
            <span className="ball small-ball">{n.number}</span>
            <strong>{n.count} Ziehungen</strong>
            <span>{n.lastDate ? dateLabel(n.lastDate) : "—"}</span>
          </div>
        ))}
      </div>
      <div>
        <h3>
          <span className="tag gray">COLD</span> Länger pausiert
        </h3>
        {stats.cold.slice(0, 3).map((n, i) => (
          <div className="rank-row" key={n.number}>
            <span className="rank">0{i + 1}</span>
            <span className="ball small-ball">{n.number}</span>
            <strong>{n.gap} Abstand</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
function HistoryView({ draws, game }: { draws: Draw[]; game: Game }) {
  const [query, setQuery] = useState(""),
    [year, setYear] = useState("all"),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState<Draw>();
  useEffect(() => {
    setPage(0);
    setDetail(undefined);
  }, [query, year, game]);
  const years = [...new Set(draws.map((d) => d.date.slice(0, 4)))].reverse();
  const filtered = [...draws]
    .reverse()
    .filter(
      (d) =>
        (year === "all" || d.date.startsWith(year)) &&
        (!query ||
          dateLabel(d.date).includes(query) ||
          d.date.includes(query) ||
          d.numbers.includes(Number(query))),
    );
  const pages = Math.ceil(filtered.length / 20);
  return (
    <Panel
      title="Ziehungsarchiv"
      subtitle={`${nf.format(filtered.length)} Ergebnisse`}
    >
      <div className="history-controls">
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="Nach Datum oder Zahl suchen"
            placeholder="Datum oder Zahl suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Jahr
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">Alle Jahre</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Ziehung</th>
              <th>Gewinnzahlen</th>
              <th>Summe</th>
              <th>Gerade / ungerade</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * 20, page * 20 + 20).map((d) => (
              <tr key={d.date + d.variant}>
                <td>
                  <strong>{dateLabel(d.date)}</strong>
                  <small>
                    {d.variant === "main"
                      ? new Intl.DateTimeFormat("de-DE", {
                          weekday: "long",
                        }).format(new Date(d.date + "T12:00:00"))
                      : d.variant === "special"
                        ? "Sonderziehung"
                        : `Mittwoch ${d.variant}`}
                  </small>
                </td>
                <td>
                  <Balls numbers={d.numbers} extras={d.extras} small />
                </td>
                <td>{sum(d.numbers)}</td>
                <td>
                  {evenCount(d.numbers)} :{" "}
                  {games[game].count - evenCount(d.numbers)}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Details zur Ziehung ${dateLabel(d.date)}`}
                    onClick={() => setDetail(d)}
                  >
                    <Info size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <div className="empty">Keine Ziehung passt zu deiner Suche.</div>
      )}
      <div className="pagination">
        <span>
          Seite {pages ? page + 1 : 0} von {pages}
        </span>
        <div>
          <button
            className="icon-button"
            disabled={page === 0}
            aria-label="Vorherige Seite"
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            disabled={page + 1 >= pages}
            aria-label="Nächste Seite"
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      {detail && (
        <div className="draw-detail">
          <div className="panel-head">
            <h3>{dateLabel(detail.date, true)}</h3>
            <button
              className="icon-button"
              aria-label="Ziehungsdetails schließen"
              onClick={() => setDetail(undefined)}
            >
              <X size={18} />
            </button>
          </div>
          <Balls numbers={detail.numbers} extras={detail.extras} />
          <p className="caption">
            Quelle: {detail.source}.{" "}
            {detail.extras.length === 0
              ? "Keine eindeutige historische Superzahl vorhanden."
              : ""}
          </p>
          {detail.quotas.length ? (
            <div className="quota-grid">
              {detail.quotas.map((q, i) => (
                <div key={i}>
                  <span>Klasse {i + 1}</span>
                  <strong>{q === null ? "Unbesetzt" : money.format(q)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <Notice>
              Für diese historische Ziehung sind keine standardisierten Quoten
              hinterlegt. Finanzielle Backtests verwenden Ziehungen ab 2022.
            </Notice>
          )}
        </div>
      )}
    </Panel>
  );
}

function OracleView({
  game,
  history,
  filters,
  setFilters,
  saved,
  save,
  remove,
  notify,
}: {
  game: Game;
  history: Draw[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  saved: Tip[];
  save: (t: {
    numbers: number[];
    extras: number[];
    explanation: string;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [count, setCount] = useState(3),
    [tips, setTips] = useState<ReturnType<typeof generateTips>>([]),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"new" | "saved">("new"),
    [busy, setBusy] = useState(false);
  const generate = () => {
    setError("");
    try {
      setTips(generateTips(game, filters, history, count));
      setTab("new");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const toggle = (key: keyof Filters) =>
    setFilters({ ...filters, [key]: !filters[key] });
  const rules: [keyof Filters, string, string][] = [
    ["sum", "Summenbereich", "Begrenze die Summe der Hauptzahlen."],
    [
      "parity",
      "Gerade & ungerade",
      "2–4 gerade bei Lotto, 2–3 bei Eurojackpot.",
    ],
    [
      "decades",
      "Breit über Dekaden",
      "Verteile Zahlen auf mehrere Zehnergruppen.",
    ],
    [
      "patterns",
      "Auffällige Reihen meiden",
      "Keine festen Schrittweiten, geometrischen Reihen oder 5er-Folgen.",
    ],
    [
      "historic",
      "Vergangene Kombinationen meiden",
      "Vergleiche die Hauptzahlen mit dem Archiv.",
    ],
    [
      "birthdays",
      "Geburtstagsmuster meiden",
      "Mindestens eine Hauptzahl über 31.",
    ],
  ];
  const briefing = () => {
    const stats = statistics(history, game);
    const text = `Analysiere diese ${games[game].name}-Tipps sachlich. Ziehungen sind unabhängig, jede gültige Kombination hat dieselbe Chance. Keine Vorhersagen, keine Aussagen, dass Zahlen fällig sind. Erkläre nur die Auswahlregeln; Popularität ist ohne Tippdaten nicht nachgewiesen.\nFilter: ${JSON.stringify(filters)}\nArchiv: ${history.length} Ziehungen bis ${history.at(-1)?.date}\nHäufigkeiten: ${JSON.stringify(stats.counts)}\nTipps: ${JSON.stringify(tips)}\nKeine Gewinngarantie. Glücksspiel kann süchtig machen.`;
    download(text, "ki-briefing.txt", "text/plain");
    notify(
      "KI-Briefing heruntergeladen. Es wurden keine Daten an einen KI-Dienst gesendet.",
    );
  };
  return (
    <>
      <div className="oracle-layout">
        <Panel
          title="Deine Auswahlregeln"
          subtitle="Filter formen Tipps, nicht Gewinnchancen."
          action={
            <button
              className="text-button"
              onClick={() => setFilters(defaultFilters(game))}
            >
              Zurücksetzen
            </button>
          }
        >
          <div className="filters">
            {rules.map(([key, title, description]) => (
              <div className="filter-row" key={key}>
                <div className="filter-heading">
                  <div>
                    <strong>{title}</strong>
                    <p>{description}</p>
                  </div>
                  <button
                    className={`toggle ${filters[key] ? "on" : ""}`}
                    role="switch"
                    aria-checked={Boolean(filters[key])}
                    aria-label={title}
                    onClick={() => toggle(key)}
                  >
                    <span />
                  </button>
                </div>
                {key === "sum" && filters.sum && (
                  <div className="filter-inputs">
                    <label>
                      Minimum
                      <input
                        type="number"
                        value={filters.minSum}
                        min="15"
                        max="279"
                        onChange={(e) =>
                          setFilters({
                            ...filters,
                            minSum: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <span>bis</span>
                    <label>
                      Maximum
                      <input
                        type="number"
                        value={filters.maxSum}
                        min="15"
                        max="279"
                        onChange={(e) =>
                          setFilters({
                            ...filters,
                            maxSum: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                {key === "decades" && filters.decades && (
                  <label className="inline-field">
                    Mindestens
                    <select
                      value={filters.minDecades}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          minDecades: Number(e.target.value),
                        })
                      }
                    >
                      {[2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} Dekaden
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>
        </Panel>
        <div>
          <section className="generate-card">
            <div className="mini-icon">
              <Sparkles size={24} />
            </div>
            <span className="eyebrow">DAS ORAKEL</span>
            <h2>
              Platz für den Zufall.
              <br />
              Mit deinen Regeln.
            </h2>
            <p>
              Jedes Feld wird zufällig erzeugt und gegen deine aktiven Filter
              geprüft.
            </p>
            <label>
              Anzahl Tippfelder
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {[1, 2, 3, 5, 8, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "Tippfeld" : "Tippfelder"}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" onClick={generate}>
              <Sparkles size={17} />
              Tipps generieren
            </button>
            <button
              className="text-button"
              onClick={() => {
                try {
                  setTips(
                    generateTips(
                      game,
                      {
                        ...filters,
                        sum: false,
                        parity: false,
                        decades: false,
                        patterns: false,
                        historic: false,
                        birthdays: false,
                      },
                      history,
                      count,
                    ),
                  );
                  setTab("new");
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Quicktipp ohne Filter
            </button>
            <p className="caption">Regelbasiert · keine KI-API verbunden</p>
          </section>
          <Notice>
            Eine lange Zahlenpause ist kein Signal. Auch frühere
            Gewinnkombinationen können erneut gezogen werden.
          </Notice>
        </div>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <Panel
        title={tab === "new" ? "Deine Tippfelder" : "Deine gespeicherten Tipps"}
        action={
          <div className="tabs">
            <button aria-pressed={tab === "new"} onClick={() => setTab("new")}>
              Neue Tipps ({tips.length})
            </button>
            <button
              aria-pressed={tab === "saved"}
              onClick={() => setTab("saved")}
            >
              Gespeichert ({saved.length})
            </button>
          </div>
        }
      >
        {(tab === "new" ? tips : saved).length === 0 ? (
          <div className="empty">
            <Sparkles size={28} />
            <h3>
              {tab === "new"
                ? "Deine Zahlen warten auf dich."
                : "Noch keine gespeicherten Tipps."}
            </h3>
            <p>
              {tab === "new"
                ? "Wähle deine Regeln und generiere dein erstes Feld."
                : "Speichere ein Tippfeld, um es später wiederzufinden."}
            </p>
          </div>
        ) : (
          <div className="tip-grid">
            {(tab === "new" ? tips : saved).map((t, i) => (
              <article className="tip-card" key={"id" in t ? t.id : i}>
                <div className="tip-head">
                  <span>FELD {String(i + 1).padStart(2, "0")}</span>
                  {"score" in t && (
                    <span className="tag lime">Regel-Score {t.score}/100</span>
                  )}
                </div>
                <Balls numbers={t.numbers} extras={t.extras} />
                <p>{t.explanation}</p>
                {"id" in t ? (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await remove(t.id);
                      setBusy(false);
                    }}
                  >
                    <Trash2 size={15} />
                    Entfernen
                  </button>
                ) : (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await save(t);
                      setBusy(false);
                    }}
                  >
                    <Bookmark size={16} />
                    Tipp speichern
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
        {tips.length > 0 && tab === "new" && (
          <div className="panel-actions">
            <button
              className="button secondary"
              onClick={() =>
                download(
                  tips
                    .map(
                      (t, i) =>
                        `Feld ${i + 1}: ${t.numbers.join(" · ")} + ${t.extras.join(" · ")}\n${t.explanation}`,
                    )
                    .join("\n\n"),
                  "meine-tipps.txt",
                  "text/plain",
                )
              }
            >
              <Download size={16} />
              Tipps exportieren
            </button>
            <button className="button secondary" onClick={briefing}>
              <Sparkles size={16} />
              KI-Briefing exportieren
            </button>
          </div>
        )}
      </Panel>
    </>
  );
}
function PatternsView({ draws }: { draws: Draw[] }) {
  const pairs = useMemo(() => cooccurrences(draws, 2), [draws]),
    triples = useMemo(() => cooccurrences(draws, 3), [draws]);
  const runs = draws.filter((d) => longestRun(d.numbers) >= 3);
  return (
    <>
      <div className="two-column equal">
        <Panel
          title="Zahlen, die sich begegnen"
          subtitle="Die zehn häufigsten Zahlenpaare"
        >
          <div className="pair-list">
            {pairs.map((p, i) => (
              <div className="pair-row" key={p.numbers.join()}>
                <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                <Balls numbers={p.numbers} small />
                <div className="pair-track">
                  <i
                    style={{ width: `${(p.count / pairs[0].count) * 100}%` }}
                  />
                </div>
                <strong>{p.count}×</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Die häufigsten Dreiergruppen"
          subtitle="Gezählte gemeinsame Auftritte"
        >
          <div className="triple-list">
            {triples.slice(0, 6).map((p) => (
              <div key={p.numbers.join()}>
                <Balls numbers={p.numbers} small />
                <span>{p.count} Ziehungen</span>
              </div>
            ))}
          </div>
          <Notice>
            Häufige Paare oder Tripel können zufällig entstehen. Diese Rangliste
            weist keinen Prognosevorteil nach.
          </Notice>
        </Panel>
      </div>
      <Panel
        title="Aufeinanderfolgende Zahlen"
        subtitle={`${runs.length} von ${draws.length} Ziehungen enthalten mindestens drei Zahlen in Folge.`}
      >
        <div className="recent-runs">
          {runs
            .slice(-6)
            .reverse()
            .map((d) => (
              <div key={d.date + d.variant}>
                <span>{dateLabel(d.date)}</span>
                <Balls numbers={d.numbers} small />
                <span className="tag gray">
                  {longestRun(d.numbers)} in Folge
                </span>
              </div>
            ))}
          {!runs.length && <p>Keine Dreierfolge im ausgewählten Zeitraum.</p>}
        </div>
      </Panel>
    </>
  );
}
function WavesView({ game, draws }: { game: Game; draws: Draw[] }) {
  const [number, setNumber] = useState(7),
    [windowSize, setWindowSize] = useState(20);
  const values = useMemo(() => {
    const slice = draws.slice(-Math.min(draws.length, 200));
    return slice.map((_, i) => {
      const group = slice.slice(Math.max(0, i - windowSize + 1), i + 1);
      return (
        (group.filter((d) => d.numbers.includes(number)).length /
          group.length) *
        100
      );
    });
  }, [draws, number, windowSize]);
  const expected = (games[game].count / games[game].max) * 100;
  return (
    <>
      <Panel
        title={`Häufigkeitsverlauf · Zahl ${number}`}
        subtitle={`Anteil in den jeweils letzten ${windowSize} Ziehungen`}
      >
        <div className="wave-controls">
          <label>
            Zahl
            <select
              value={number}
              onChange={(e) => setNumber(Number(e.target.value))}
            >
              {Array.from({ length: games[game].max }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rollierendes Fenster
            <select
              value={windowSize}
              onChange={(e) => setWindowSize(Number(e.target.value))}
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n} Ziehungen
                </option>
              ))}
            </select>
          </label>
        </div>
        <LineChart
          series={[
            { name: "Beobachteter Anteil (%)", color: "#648c32", values },
            {
              name: "Theoretischer Anteil (%)",
              color: "#adb5b0",
              values: values.map(() => expected),
            },
          ]}
          labels={[
            dateLabel(draws[Math.max(0, draws.length - 200)].date),
            dateLabel(draws.at(-1)!.date),
          ]}
        />
        <Notice>
          Die Kurve beschreibt Schwankungen in vergangenen Ziehungen. Weder
          Zyklen noch ein baldiger „Ausgleich“ sind daraus ableitbar. Am Anfang
          des Fensters werden die vorhandenen Ziehungen verwendet.
        </Notice>
      </Panel>
      <Panel
        title="Jede Ziehung beginnt neu."
        subtitle="Was du aus dem Verlauf ablesen kannst"
      >
        <div className="explanation-grid">
          <div>
            <strong>{expected.toFixed(2).replace(".", ",")} %</strong>
            <p>Theoretische Chance dieser Hauptzahl pro Ziehung.</p>
          </div>
          <div>
            <strong>{Math.min(draws.length, 200)}</strong>
            <p>Ziehungen werden im Verlauf angezeigt.</p>
          </div>
          <div>
            <strong>Unabhängig</strong>
            <p>Frühere Ziehungen verändern die Chance der nächsten nicht.</p>
          </div>
        </div>
      </Panel>
    </>
  );
}
function BacktestView({
  game,
  draws,
  filters,
  notify,
}: {
  game: Game;
  draws: Draw[];
  filters: Filters;
  notify: (s: string) => void;
}) {
  const [count, setCount] = useState(104),
    [fields, setFields] = useState(3),
    [seed, setSeed] = useState(2026),
    [result, setResult] = useState<BacktestResult>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const worker = useRef<Worker>(undefined);
  useEffect(() => () => worker.current?.terminate(), []);
  const run = () => {
    setError("");
    if (
      !Number.isInteger(fields) ||
      fields < 1 ||
      fields > 12 ||
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 4294967295
    ) {
      setError("Bitte 1–12 Felder und einen Seed von 0 bis 4294967295 wählen.");
      return;
    }
    setBusy(true);
    worker.current?.terminate();
    worker.current = new Worker(
      new URL("./backtest.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current.onmessage = (e) => {
      setBusy(false);
      if (e.data.error) setError(e.data.error);
      else {
        setResult(e.data.result);
        notify(
          "Backtest abgeschlossen. Auswahlregeln und Zufall wurden getrennt simuliert.",
        );
      }
      worker.current?.terminate();
    };
    worker.current.onerror = () => {
      setBusy(false);
      setError(
        "Der Test konnte nicht ausgeführt werden. Bitte erneut versuchen.",
      );
      worker.current?.terminate();
    };
    worker.current.postMessage({ draws, game, filters, count, fields, seed });
  };
  return (
    <>
      <Panel
        title="Dein Experiment"
        subtitle="Für jede Ziehung werden Tipps nur anhand vorheriger Daten erzeugt."
      >
        <div className="backtest-controls">
          <label>
            Testzeitraum
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={busy}
            >
              {[52, 104, 260, 520].map((n) => (
                <option key={n} value={n}>
                  Letzte {n} Ziehungen
                </option>
              ))}
            </select>
          </label>
          <label>
            Felder pro Ziehung
            <input
              type="number"
              min="1"
              max="12"
              value={fields}
              disabled={busy}
              onChange={(e) => setFields(Number(e.target.value))}
            />
          </label>
          <label>
            Zufalls-Seed
            <input
              type="number"
              min="0"
              max="4294967295"
              value={seed}
              disabled={busy}
              onChange={(e) => setSeed(Number(e.target.value))}
            />
          </label>
          <button className="button" disabled={busy} onClick={run}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <FlaskConical size={16} />
            )}{" "}
            {busy ? "Test läuft …" : "Backtest starten"}
          </button>
          {busy && (
            <button
              className="text-button"
              onClick={() => {
                worker.current?.terminate();
                setBusy(false);
              }}
            >
              Abbrechen
            </button>
          )}
        </div>
        <p className="caption">
          Verwendet deine aktiven Orakel-Filter. Gleicher Seed und gleiche Daten
          ergeben dasselbe Ergebnis. Quoten ab 2022; Einsatzannahme heute:{" "}
          {money.format(games[game].price)} pro Feld, ohne Scheingebühren.
        </p>
      </Panel>
      {error && (
        <div role="alert" className="inline-error">
          {error}
        </div>
      )}
      {!result ? (
        <div className="empty experiment-empty">
          <FlaskConical size={36} />
          <h2>Eine Strategie ist eine Hypothese.</h2>
          <p>
            Starte den Test und sieh, wie deine Regeln im Rückblick abschneiden.
          </p>
        </div>
      ) : (
        <>
          <div className="metrics">
            <Metric
              label="Simulierte Ziehungen"
              value={nf.format(result.draws)}
              detail={`${result.fields} Felder pro Ziehung · Seed ${result.seed}`}
              icon={<History size={18} />}
            />
            <Metric
              label="Angenommener Einsatz"
              value={money.format(result.cost)}
              detail="Je Strategie · ohne Scheingebühren"
              icon={<FlaskConical size={18} />}
            />
            <Metric
              label="Gewinnfelder mit Filtern"
              value={String(result.filtered.wins)}
              detail={`Zufallsstrategie: ${result.random.wins} Gewinnfelder`}
              icon={<Check size={18} />}
            />
          </div>
          <Panel
            title="Was wäre daraus geworden?"
            subtitle="Kumulierter Saldo aus historischen Quoten minus angenommenem Einsatz"
          >
            <LineChart
              series={[
                {
                  name: "Deine Filter",
                  color: "#648c32",
                  values: result.rows.map((r) => r.filtered),
                },
                {
                  name: "Zufall",
                  color: "#868da9",
                  values: result.rows.map((r) => r.random),
                },
              ]}
              labels={[
                dateLabel(result.rows[0].date),
                dateLabel(result.rows.at(-1)!.date),
              ]}
            />
            <div className="comparison-table">
              <table>
                <thead>
                  <tr>
                    <th>Auswertung</th>
                    <th>Deine Filter</th>
                    <th>Zufallsstrategie</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Historische Auszahlung</td>
                    <td>{money.format(result.filtered.revenue)}</td>
                    <td>{money.format(result.random.revenue)}</td>
                  </tr>
                  <tr>
                    <td>Saldo</td>
                    <td>
                      {money.format(result.filtered.revenue - result.cost)}
                    </td>
                    <td>{money.format(result.random.revenue - result.cost)}</td>
                  </tr>
                  <tr>
                    <td>ROI</td>
                    <td>
                      {((result.filtered.revenue / result.cost - 1) * 100)
                        .toFixed(1)
                        .replace(".", ",")}{" "}
                      %
                    </td>
                    <td>
                      {((result.random.revenue / result.cost - 1) * 100)
                        .toFixed(1)
                        .replace(".", ",")}{" "}
                      %
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {result.filtered.unknown + result.random.unknown > 0 && (
              <Notice>
                {result.filtered.unknown + result.random.unknown} Gewinnfelder
                haben keine belegte Quote. Auszahlung, Saldo und ROI sind daher
                unvollständig; diese Gewinne wurden nicht bewertet.
              </Notice>
            )}
            <Notice>
              Ein einzelner Rückblick weist keinen strategischen Vorteil nach.
              Historische Quoten sind eine Näherung: Zusätzliche Gewinner hätten
              die damalige Auszahlung verändern können. Aktuelle Feldpreise
              werden für den ganzen Zeitraum angenommen.
            </Notice>
          </Panel>
          <div className="two-column equal">
            {(["filtered", "random"] as const).map((k) => (
              <Panel
                key={k}
                title={
                  k === "filtered"
                    ? "Treffer mit deinen Filtern"
                    : "Treffer mit Zufall"
                }
                subtitle="Anzahl Hauptzahlen richtig · inklusive Nieten"
              >
                <Bars
                  values={result[k].hits}
                  labels={result[k].hits.map((_, i) => `${i}`)}
                  color={k === "random" ? "gray" : "lime"}
                />
              </Panel>
            ))}
          </div>
          <button
            className="button secondary"
            onClick={() =>
              download(
                JSON.stringify(result, null, 2),
                "backtest.json",
                "application/json",
              )
            }
          >
            <Download size={16} />
            Ergebnis exportieren
          </button>
        </>
      )}
    </>
  );
}
function DataView({
  manifest,
  draws,
  saved,
  notify,
  refresh,
  imported,
}: {
  manifest: Manifest;
  draws: Draw[];
  saved: Tip[];
  notify: (s: string) => void;
  refresh: () => void;
  imported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const handleImport = async (file?: File) => {
    if (!file) return;
    setError("");
    if (file.size > 10 * 1024 * 1024) {
      setError("Bitte eine Datei unter 10 MB wählen.");
      return;
    }
    setBusy(true);
    try {
      const r = await importData(
        await file.text(),
        file.name.toLowerCase().endsWith(".csv"),
      );
      imported();
      notify(
        `${r.added} Ziehungen importiert, ${r.skipped} identische Ziehungen übersprungen. Tipps aus der Sicherung übernommen.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <>
      <div className="two-column equal">
        <Panel title="Offizielles Ziehungsarchiv" subtitle="Quelle: WestLotto">
          <div className="source-games">
            {(["lotto", "euro"] as const).map((g) => (
              <div key={g}>
                <span className={`game-symbol ${g === "euro" ? "gold" : ""}`}>
                  {g === "lotto" ? "6" : "€"}
                </span>
                <div>
                  <strong>{games[g].name}</strong>
                  <p>
                    {nf.format(draws.filter((d) => d.game === g).length)}{" "}
                    Ziehungen · seit {dateLabel(manifest.games[g].first)}
                  </p>
                  <span>Stand: {dateLabel(manifest.games[g].last)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="caption">
            Archivsnapshot vom{" "}
            {new Intl.DateTimeFormat("de-DE", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/Berlin",
            }).format(new Date(manifest.generatedAt))}
            . Neue offizielle Snapshots kommen mit einem Deployment. „Archiv
            prüfen“ lädt den aktuell veröffentlichten Bestand erneut.
          </p>
          <div className="panel-actions">
            <button className="button secondary" onClick={refresh}>
              <RefreshCw size={16} />
              Archiv prüfen
            </button>
            <a
              className="button secondary"
              href="https://www.westlotto.de/service/downloads/downloads.html"
              target="_blank"
              rel="noreferrer"
            >
              Zur offiziellen Quelle <ArrowUpRight size={16} />
            </a>
          </div>
        </Panel>
        <Panel
          title="Deine lokale Sicherung"
          subtitle={`${saved.length} gespeicherte Tipps auf diesem Gerät`}
        >
          <div className="storage-illustration">
            <Database size={34} />
            <div>
              <strong>Dein Browser ist dein Speicher.</strong>
              <p>
                Persönliche Tipps und importierte Ziehungen werden in einer
                lokalen SQLite-Datenbank gespeichert. Sie werden nicht an einen
                Server übertragen.
              </p>
            </div>
          </div>
          <div className="export-options">
            <button
              className="button secondary"
              onClick={() =>
                download(
                  exportJson(),
                  "millionaire-backup.json",
                  "application/json",
                )
              }
            >
              <Download size={16} />
              JSON-Sicherung
            </button>
            <button
              className="button secondary"
              onClick={() =>
                download(exportCsv(), "ziehungen.csv", "text/csv;charset=utf-8")
              }
            >
              <Download size={16} />
              Ziehungen als CSV
            </button>
            <button
              className="button secondary"
              onClick={() =>
                download(
                  exportSqlite(),
                  "millionaire.sqlite",
                  "application/vnd.sqlite3",
                )
              }
            >
              <Download size={16} />
              SQLite-Datei
            </button>
          </div>
          <p className="caption">
            JSON enthält Ziehungen und Tipps und lässt sich wieder importieren.
            CSV enthält nur Ziehungen. Browserdaten können beim Löschen verloren
            gehen; Sicherungen bleiben bei dir.
          </p>
        </Panel>
      </div>
      <Panel
        title="Daten importieren"
        subtitle="Ergänze Ziehungen oder stelle eine JSON-Sicherung wieder her."
      >
        <input
          type="file"
          ref={fileRef}
          accept=".json,.csv"
          onChange={(e) => handleImport(e.target.files?.[0])}
          hidden
        />
        <div className="import-box">
          <Upload size={27} />
          <div>
            <strong>JSON- oder CSV-Datei auswählen</strong>
            <p>
              Maximal 10 MB. Der Import wird vollständig geprüft, bevor Daten
              gespeichert werden.
            </p>
          </div>
          <button
            className="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Upload size={16} />
            )}{" "}
            {busy ? "Import läuft …" : "Datei auswählen"}
          </button>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <details>
          <summary>Importformat und Validierung</summary>
          <p>
            CSV verwendet Semikolons und diese Spalten. Zahlen innerhalb eines
            Feldes sind durch Leerzeichen getrennt; Quoten bleiben optional
            leer.
          </p>
          <pre>
            game;date;variant;numbers;extras;quotas{"\n"}lotto;2026-09-30;main;6
            13 17 22 36 43;1;
          </pre>
          <p>
            Für Eurojackpot gilt <code>game=euro</code> mit fünf Hauptzahlen und
            zwei Eurozahlen. Die Zeile ist nur ein Formatbeispiel. Identische
            Ziehungen werden übersprungen. Abweichende Zahlen am selben Datum
            brechen den gesamten Import ab. Historische Varianten: main, A, B
            und special.
          </p>
          <button
            className="text-button"
            onClick={() =>
              download(
                "game;date;variant;numbers;extras;quotas\n",
                "import-vorlage.csv",
                "text/csv",
              )
            }
          >
            Leere CSV-Vorlage herunterladen
          </button>
        </details>
      </Panel>
      <Panel title="Was dieses Labor kann — und was die Daten bedeuten">
        <div className="method-grid">
          <div>
            <h3>Historische Spielregeln</h3>
            <p>
              Lotto seit 1955; Mittwoch A/B ab Juni 1986. Das frühere Spiel 7
              aus 38 ist ausgeschlossen. Sonderziehungen sind gekennzeichnet.
              Historische Superzahlen fehlen, wenn keine eindeutige Angabe
              vorhanden ist.
            </p>
          </div>
          <div>
            <h3>Keine Vorhersagen</h3>
            <p>
              Filter zeigen Auswahlpräferenzen. Keine Kombination wird dadurch
              wahrscheinlicher. Der Geburtstagfilter ist eine Heuristik; ohne
              Daten über tatsächlich abgegebene Tipps lässt sich ein
              Teilungsvorteil nicht beziffern.
            </p>
          </div>
          <div>
            <h3>Backtesting mit Quoten</h3>
            <p>
              Finanzielle Tests beginnen 2022. Früher galten andere
              Gewinnklassen und Spielregeln. Unbesetzte Gewinnklassen haben
              keine belegte Auszahlung. Eine Zufallsstrategie dient zum
              Vergleich, ohne Signifikanzbehauptung.
            </p>
          </div>
          <div>
            <h3>Orakel & KI</h3>
            <p>
              Das Orakel arbeitet lokal mit Regeln und Zufall. Es verwendet
              keine externe KI. Mit dem KI-Briefing kannst du Daten und Tipps
              für eine gesonderte KI-Auswertung exportieren.
            </p>
          </div>
        </div>
        <details>
          <summary>Quellen und Prüfsummen</summary>
          {manifest.sources.map((s) => (
            <div className="source-item" key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.url.includes("WL_InfoService")
                  ? `WestLotto CSV ab 2022 · ${s.url.includes("spielart=EJ") ? "Eurojackpot" : "Lotto"}`
                  : s.url.split("/").at(-1)}
              </a>
              <code>SHA-256: {s.sha256}</code>
            </div>
          ))}
        </details>
      </Panel>
    </>
  );
}
