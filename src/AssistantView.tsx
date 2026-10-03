import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bot, Check, Info, LoaderCircle, Send, ShieldCheck, Square } from "lucide-react";
import { games, statistics, type Draw, type Filters, type Game, type Tip } from "./domain";
import { assistantError, describeFilters, type ChatMessage, type GeneratedSelection } from "./assistant-context";
import { assistantRequest } from "./assistant-request";
import { CloudAssistant } from "./assistant-runtime";

const prompts = [
  ["Meine Filter erklären", "Erkläre meine aktiven Auswahlregeln einfach. Was bewirken sie?"],
  ["Statistik verstehen", "Welche Zahlen waren in meinem Analysezeitraum am häufigsten? Was bedeutet das für die nächste Ziehung?"],
  ["Meine Tipps besprechen", "Erkläre die zuletzt erzeugten Tippfelder anhand ihrer Summe, Parität und Dekaden. Falls keine vorhanden sind, sage mir, wie ich welche erstelle."],
] as const;
const cloudAvailable = import.meta.env.DEV || import.meta.env.BASE_URL === "/";

export default function AssistantView({ active, game, ranged, filters, generated, saved, onOracle }: {
  active: boolean; game: Game; history: Draw[]; ranged: Draw[]; filters: Filters;
  generated?: GeneratedSelection; saved: Tip[]; onOracle: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stopNote, setStopNote] = useState("");
  const runtime = useRef<CloudAssistant | null>(null);
  const version = useRef(0);
  const pending = useRef(false);
  const previousGame = useRef(game);
  const log = useRef<HTMLDivElement>(null);
  const official = useMemo(() => ranged.filter(d => d.source === "WestLotto"), [ranged]);
  const verifiedStats = useMemo(() => statistics(official, game), [official, game]);

  useEffect(() => () => { version.current++; runtime.current?.stop(); }, []);
  useEffect(() => {
    if (previousGame.current === game) return;
    previousGame.current = game;
    version.current++;
    runtime.current?.stop();
    pending.current = false;
    setMessages([]); setInput(""); setBusy(false); setError(""); setStopNote("");
  }, [game]);
  useEffect(() => {
    if (active && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, active]);

  const ask = async (question = input) => {
    const content = question.trim().slice(0, 1000);
    if (!content || pending.current || !cloudAvailable) return;
    pending.current = true;
    const attempt = ++version.current;
    const user: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const replyId = crypto.randomUUID();
    const request = [...messages, user];
    setMessages([...request, { id: replyId, role: "assistant", content: "", tools: [] }]);
    setInput(""); setError(""); setStopNote(""); setBusy(true);
    runtime.current ??= new CloudAssistant();
    try {
      await runtime.current.answer(
        assistantRequest({ game, ranged: official, filters, generated, saved, messages: request }),
        (text) => {
          if (attempt === version.current) setMessages(old => old.map(m => m.id === replyId ? { ...m, content: text } : m));
        },
        (label) => {
          if (attempt === version.current) setMessages(old => old.map(m => m.id === replyId
            ? { ...m, tools: [...new Set([...(m.tools ?? []), label])] } : m));
        },
      );
    } catch (e) {
      if (attempt !== version.current) return;
      setMessages(request.slice(0, -1)); setInput(content); setError(assistantError(e));
    } finally {
      if (attempt === version.current) { pending.current = false; setBusy(false); }
    }
  };

  return (
    <div hidden={!active} className="assistant-layout">
      <section className="panel assistant-chat">
        <div className="panel-head">
          <div><h2><Bot size={21} aria-hidden="true" /> Dein KI-Assistent</h2><p>Fragen stellen. Zahlen und Regeln verstehen.</p></div>
          <span className="tag lime">CLOUD-KI</span>
        </div>
        {!cloudAvailable ? (
          <div className="assistant-setup">
            <div className="mini-icon"><Bot size={25} /></div>
            <h3>Dein Assistent ist auf Vercel.</h3>
            <p>Öffne die Production-App für den Cloud-Chat. Deine auf diesem Gerät gespeicherten Tipps kannst du dort über eine JSON-Sicherung importieren.</p>
            <a className="button" href="https://iamamillionaire.vercel.app/">Production-App öffnen <ArrowUpRight size={17} /></a>
          </div>
        ) : (
          <>
            <div className="assistant-toolbar">
              <span><Check size={15} /> Vercel AI Gateway · {games[game].name}</span>
              <button className="text-button" disabled={busy} onClick={() => { setMessages([]); setError(""); setStopNote(""); }}>Neues Gespräch</button>
            </div>
            <div className="assistant-log" ref={log} role="log" aria-label="Gespräch mit dem KI-Assistenten" aria-live="polite" aria-busy={busy}>
              {messages.length === 0 ? (
                <div className="assistant-welcome"><h3>Was möchtest du verstehen?</h3><p>Ich lese deine Auswahlregeln und die offiziellen Statistiken. Vorhandene Tippfelder kann ich dir erklären.</p></div>
              ) : messages.map(m => (
                <article className={`assistant-message ${m.role}`} key={m.id}>
                  <strong>{m.role === "user" ? "Du" : "KI-Assistent"}</strong>
                  {!!m.tools?.length && <div className="assistant-tools">{m.tools.map(label => <span key={label}><Check size={12} /> {label}</span>)}</div>}
                  {m.content ? <p>{m.content}</p> : <p className="assistant-thinking"><LoaderCircle size={16} className="spin" /> Antwort entsteht …</p>}
                  {m.interrupted && <small>Antwort gestoppt</small>}
                </article>
              ))}
            </div>
            <div className="assistant-prompts">{prompts.map(([label, question]) => <button className="assistant-prompt" key={label} disabled={busy} onClick={() => void ask(question)}>{label}</button>)}</div>
            <form className="assistant-form" onSubmit={e => { e.preventDefault(); void ask(); }}>
              <label htmlFor="assistant-question">Deine Frage</label>
              <textarea id="assistant-question" rows={3} maxLength={1000} value={input} disabled={busy} onChange={e => setInput(e.target.value)} placeholder="Zum Beispiel: Was bewirkt mein Summenfilter?" />
              <div className="assistant-form-footer">
                <span>{input.length}/1000 · Enter für eine neue Zeile</span>
                {busy ? <button type="button" className="button secondary" onClick={() => {
                  version.current++; runtime.current?.stop(); pending.current = false; setBusy(false);
                  setMessages(old => old.at(-1)?.content ? old.map((m, i) => i === old.length - 1 ? { ...m, interrupted: true } : m) : old.slice(0, -2));
                  setStopNote("Antwort gestoppt. Du kannst eine neue Frage stellen.");
                }}><Square size={15} /> Antwort stoppen</button>
                  : <button type="submit" className="button" disabled={!input.trim()}><Send size={16} /> Frage senden</button>}
              </div>
            </form>
          </>
        )}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {stopNote && <p className="caption" role="status">{stopNote}</p>}
        <div className="assistant-disclaimer"><Info size={17} /><p>KI-Antworten können Fehler enthalten. Die Tipps entstehen im Regelgenerator. KI und Filter erhöhen die Gewinnchance pro Feld nicht.</p></div>
      </section>
      <aside className="assistant-side">
        <section className="panel">
          <div className="panel-head"><div><h2>Dein aktueller Kontext</h2><p>{games[game].name} · {official.length.toLocaleString("de-DE")} offizielle Ziehungen im Analysezeitraum</p></div></div>
          <ul className="assistant-rules">{describeFilters(game, filters).map(rule => <li key={rule}>{rule}</li>)}</ul>
          <div className="assistant-facts">
            <h3>Berechnete Häufigkeiten</h3><p>{official[0]?.date} – {official.at(-1)?.date}</p>
            <div>{official.length > 0 && verifiedStats.hot.slice(0, 5).map(n => <span key={n.number}><strong>{n.number}</strong> {n.count} Mal</span>)}</div>
            <p>Vergangene Ziehungen. Kein Vorteil für die nächste Ziehung.</p>
          </div>
          <p className="caption">Zuletzt erzeugt: {generated?.tips.length ?? 0} Felder. Die KI sieht davon und von deinen gespeicherten Tipps jeweils die ersten drei. Aktuelle Regeln können von den Regeln bei der Erzeugung abweichen.</p>
          {official.length < ranged.length && <p className="caption">Lokale Import-Ziehungen werden nicht an die KI übertragen und sind in ihrem Analysekontext nicht enthalten.</p>}
          <button className="text-button wide" onClick={onOracle}>Regeln ändern & Tipps erzeugen <ArrowUpRight size={16} /></button>
        </section>
        <section className="panel assistant-privacy">
          <ShieldCheck size={23} /><h3>KI über Vercel. Tipps auf deinem Gerät.</h3>
          <p>Beim Senden werden deine Frage, bis zu zwei vorherige Frage-Antwort-Paare, die Filter und bis zu drei erzeugte und drei gespeicherte Tippfelder über Vercel AI Gateway an Google Gemini übermittelt. Statistiken liest der Assistent aus dem offiziellen Archiv auf dem Server.</p>
          <p>Sicherungsdateien, freie Importtexte und andere gespeicherte Tipps werden nicht übertragen. Der Chat wird von der App nur für diese Sitzung gehalten. Beim Spielwechsel startet ein neues Gespräch.</p>
        </section>
      </aside>
    </div>
  );
}
