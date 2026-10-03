import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Check,
  Download,
  Info,
  LoaderCircle,
  Send,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import type { Draw, Filters, Game, Tip } from "./domain";
import { games, statistics } from "./domain";
import {
  assistantContext,
  assistantError,
  assistantMessages,
  describeFilters,
  type ChatMessage,
  type GeneratedSelection,
} from "./assistant-context";
import type { LocalAssistant } from "./assistant-runtime";
import {
  assistantModels as choices,
  type AssistantModel,
} from "./assistant-config";
const prompts = [
  [
    "Meine Filter erklären",
    "Erkläre meine aktiven Auswahlregeln einfach. Was bewirken sie?",
  ],
  [
    "Statistik verstehen",
    "Welche Zahlen waren in meinem Analysezeitraum am häufigsten? Was bedeutet das für die nächste Ziehung?",
  ],
  [
    "Meine Tipps besprechen",
    "Erkläre die zuletzt erzeugten Tippfelder anhand ihrer Summe, Parität und Dekaden. Falls keine vorhanden sind, sage mir, wie ich welche erstelle.",
  ],
] as const;

export default function AssistantView({
  active,
  game,
  history,
  ranged,
  filters,
  generated,
  saved,
  onOracle,
}: {
  active: boolean;
  game: Game;
  history: Draw[];
  ranged: Draw[];
  filters: Filters;
  generated?: GeneratedSelection;
  saved: Tip[];
  onOracle: () => void;
}) {
  const [model, setModel] = useState<AssistantModel>(choices[0].id);
  const [state, setState] = useState<"idle" | "loading" | "ready">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stopNote, setStopNote] = useState("");
  const runtime = useRef<LocalAssistant | null>(null);
  const version = useRef(0);
  const previousGame = useRef(game);
  const log = useRef<HTMLDivElement>(null);
  const stopping = useRef(false);
  const context = useMemo(
    () =>
      assistantContext({ game, history, ranged, filters, generated, saved }),
    [game, history, ranged, filters, generated, saved],
  );
  const choice = choices.find((m) => m.id === model)!;
  const verifiedStats = useMemo(() => statistics(ranged, game), [ranged, game]);

  useEffect(
    () => () => {
      version.current++;
      runtime.current?.close();
    },
    [],
  );
  useEffect(() => {
    if (previousGame.current === game) return;
    previousGame.current = game;
    version.current++;
    runtime.current?.stop();
    if (state === "loading" || busy) {
      runtime.current?.close();
      runtime.current = null;
      setState("idle");
    }
    setMessages([]);
    setInput("");
    setBusy(false);
    setError("");
    setStopNote("");
  }, [game, state, busy]);
  useEffect(() => {
    if (active && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, active]);

  const reset = () => {
    version.current++;
    runtime.current?.close();
    runtime.current = null;
    setState("idle");
    setBusy(false);
    setProgress(0);
    setStopNote("");
  };
  const start = async () => {
    const attempt = ++version.current;
    setError("");
    setStopNote("");
    setState("loading");
    setProgress(0);
    try {
      const api = await import("./assistant-runtime");
      if (attempt !== version.current) return;
      await api.checkAssistantSupport();
      if (attempt !== version.current) return;
      const instance = new api.LocalAssistant((value) => {
        if (attempt === version.current) setProgress(value);
      });
      runtime.current = instance;
      await instance.load(model);
      if (attempt !== version.current) return;
      setState("ready");
      setProgress(1);
    } catch (e) {
      if (attempt !== version.current) return;
      runtime.current?.close();
      runtime.current = null;
      setState("idle");
      setError(
        `${assistantError(e)} Falls der Download scheitert, prüfe Internetzugang und freien Speicher oder wähle das kompakte Modell.`,
      );
    }
  };

  const ask = async (question = input) => {
    const content = question.trim().slice(0, 1000);
    if (!content || !runtime.current || state !== "ready" || busy) return;
    const attempt = ++version.current;
    const user: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const replyId = crypto.randomUUID();
    const request = [...messages, user];
    setMessages([...request, { id: replyId, role: "assistant", content: "" }]);
    setInput("");
    setError("");
    setStopNote("");
    setBusy(true);
    stopping.current = false;
    try {
      await runtime.current.answer(
        assistantMessages(context, request),
        (text) => {
          if (attempt === version.current)
            setMessages((old) =>
              old.map((m) => (m.id === replyId ? { ...m, content: text } : m)),
            );
        },
      );
      if (attempt === version.current && stopping.current) {
        setMessages((old) =>
          old.find((m) => m.id === replyId)?.content
            ? old.map((m) =>
                m.id === replyId ? { ...m, interrupted: true } : m,
              )
            : request.slice(0, -1),
        );
        setStopNote("Antwort gestoppt. Du kannst eine neue Frage stellen.");
      }
    } catch (e) {
      if (attempt !== version.current) return;
      setMessages(request.slice(0, -1));
      setInput(content);
      setError(assistantError(e));
      reset();
    } finally {
      if (attempt === version.current) setBusy(false);
    }
  };

  return (
    <div hidden={!active} className="assistant-layout">
      <section className="panel assistant-chat">
        <div className="panel-head">
          <div>
            <h2>
              <Bot size={21} aria-hidden="true" /> Dein KI-Assistent
            </h2>
            <p>Fragen stellen. Zahlen und Regeln verstehen.</p>
          </div>
          <span className={`tag ${state === "ready" ? "lime" : "gray"}`}>
            {state === "ready"
              ? "BEREIT"
              : state === "loading"
                ? "LÄDT"
                : "LOKALE KI"}
          </span>
        </div>

        {state !== "ready" && (
          <div className="assistant-setup">
            <div className="mini-icon">
              <Bot size={25} />
            </div>
            <h3>Ein Sprachmodell. Auf deinem Gerät.</h3>
            <p>
              Die KI erklärt dein Lotto-Labor auf Deutsch. Deine Fragen und
              Tippfelder werden auf diesem Gerät verarbeitet.
            </p>
            <label>
              Modell
              <select
                value={model}
                disabled={state === "loading" || deleting}
                onChange={(e) => {
                  setModel(e.target.value as AssistantModel);
                  setError("");
                }}
              >
                {choices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="caption">
              Erster Download: {choice.download} von Hugging Face und MLC.
              Danach nutzt die App den Browser-Cache. Benötigt WebGPU und{" "}
              {choice.memory}. Das kompakte Modell antwortet einfacher.
            </p>
            {state === "loading" ? (
              <>
                <progress
                  aria-label="KI-Modell laden"
                  value={progress}
                  max={1}
                />
                <div className="assistant-loading" role="status">
                  <LoaderCircle size={17} className="spin" /> Modell wird
                  geladen · {Math.round(progress * 100)} %
                </div>
                <button className="text-button" onClick={reset}>
                  Laden abbrechen
                </button>
              </>
            ) : (
              <button className="button" disabled={deleting} onClick={start}>
                <Download size={17} /> KI laden & starten
              </button>
            )}
          </div>
        )}

        {state === "ready" && (
          <>
            <div className="assistant-toolbar">
              <span>
                <Check size={15} /> {choice.label} · {games[game].name}
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setMessages([]);
                  setError("");
                  setStopNote("");
                }}
              >
                Neues Gespräch
              </button>
            </div>
            <div
              className="assistant-log"
              ref={log}
              role="log"
              aria-label="Gespräch mit dem KI-Assistenten"
              aria-live="polite"
              aria-busy={busy}
            >
              {messages.length === 0 ? (
                <div className="assistant-welcome">
                  <h3>Was möchtest du verstehen?</h3>
                  <p>
                    Ich habe deine aktuellen Regeln, Statistiken und die ersten
                    drei zuletzt erzeugten Felder als Kontext.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <article className={`assistant-message ${m.role}`} key={m.id}>
                    <strong>{m.role === "user" ? "Du" : "KI-Assistent"}</strong>
                    {m.content ? (
                      <p>{m.content}</p>
                    ) : (
                      <p className="assistant-thinking">
                        <LoaderCircle size={16} className="spin" /> Antwort
                        entsteht …
                      </p>
                    )}
                    {m.interrupted && <small>Antwort gestoppt</small>}
                  </article>
                ))
              )}
            </div>
            <div className="assistant-prompts">
              {prompts.map(([label, question]) => (
                <button
                  className="assistant-prompt"
                  key={label}
                  disabled={busy}
                  onClick={() => void ask(question)}
                >
                  {label}
                </button>
              ))}
            </div>
            <form
              className="assistant-form"
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
            >
              <label htmlFor="assistant-question">Deine Frage</label>
              <textarea
                id="assistant-question"
                rows={3}
                maxLength={1000}
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Zum Beispiel: Was bewirkt mein Summenfilter?"
              />
              <div className="assistant-form-footer">
                <span>{input.length}/1000 · Enter für eine neue Zeile</span>
                {busy ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      stopping.current = true;
                      runtime.current?.stop();
                    }}
                  >
                    <Square size={15} /> Antwort stoppen
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="button"
                    disabled={!input.trim()}
                  >
                    <Send size={16} /> Frage senden
                  </button>
                )}
              </div>
            </form>
          </>
        )}
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        {stopNote && (
          <p className="caption" role="status">
            {stopNote}
          </p>
        )}
        <div className="assistant-disclaimer">
          <Info size={17} />
          <p>
            KI-Antworten können Fehler enthalten. Die Tipps entstehen im
            Regelgenerator. KI und Filter erhöhen die Gewinnchance pro Feld
            nicht.
          </p>
        </div>
      </section>

      <aside className="assistant-side">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Dein aktueller Kontext</h2>
              <p>
                {games[game].name} · {ranged.length.toLocaleString("de-DE")}{" "}
                Ziehungen im Analysezeitraum
              </p>
            </div>
          </div>
          <ul className="assistant-rules">
            {describeFilters(game, filters).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <div className="assistant-facts">
            <h3>Berechnete Häufigkeiten</h3>
            <p>
              {ranged[0]?.date} – {ranged.at(-1)?.date}
            </p>
            <div>
              {verifiedStats.hot.slice(0, 5).map((n) => (
                <span key={n.number}>
                  <strong>{n.number}</strong> {n.count} Mal
                </span>
              ))}
            </div>
            <p>Vergangene Ziehungen. Kein Vorteil für die nächste Ziehung.</p>
          </div>
          <p className="caption">
            Zuletzt erzeugt: {generated?.tips.length ?? 0} Felder. Die KI sieht
            davon die ersten drei. Aktuelle Regeln können von den Regeln bei der
            Erzeugung abweichen.
          </p>
          <button className="text-button wide" onClick={onOracle}>
            Regeln ändern & Tipps erzeugen <ArrowUpRight size={16} />
          </button>
        </section>
        <section className="panel assistant-privacy">
          <ShieldCheck size={23} />
          <h3>Dein Gespräch bleibt lokal.</h3>
          <p>
            Kein API-Schlüssel und keine KI-API-Kosten. Der Chat bleibt für
            diese Sitzung geöffnet. Beim Spielwechsel startet ein neues
            Gespräch.
          </p>
          <p>
            Nur das Modell wird heruntergeladen. Zum Laden werden Verbindungen
            zu den Modellanbietern aufgebaut; deine Fragen werden nicht dorthin
            gesendet.
          </p>
          <div className="assistant-cache-actions">
            {state === "ready" && (
              <button className="text-button" onClick={reset}>
                KI beenden / Modell wechseln
              </button>
            )}
            <button
              className="text-button"
              disabled={state === "loading" || busy || deleting}
              onClick={async () => {
                reset();
                setDeleting(true);
                setError("");
                try {
                  const api = await import("./assistant-runtime");
                  await api.removeAssistantCache();
                  setStopNote(
                    "KI-Modellcache gelöscht. Beim nächsten Start wird das Modell neu geladen.",
                  );
                } catch (e) {
                  setError(
                    `Modellcache konnte nicht vollständig gelöscht werden: ${assistantError(e)}`,
                  );
                } finally {
                  setDeleting(false);
                }
              }}
            >
              <Trash2 size={15} />{" "}
              {deleting ? "Cache wird gelöscht …" : "KI-Modellcache löschen"}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
