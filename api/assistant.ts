import { isStepCount, streamText } from "ai";
import { assistantMessages, containsUnsupportedForecast } from "../src/assistant-context.js";
import { games } from "../src/domain.js";
import { parseAssistantRequest } from "../server/assistant-input.js";
import { officialDraws } from "../server/assistant-data.js";
import { assistantTools, toolLabels } from "../server/assistant-tools.js";

export const assistantModel = "google/gemini-2.5-flash";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });

async function boundedJson(request: Request) {
  if (!request.body) throw new Error("empty");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 32_768) { await reader.cancel(); throw new Error("too-large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function assistantFetch(request: Request): Promise<Response> {
  if (request.method !== "POST") return failure("Hier sind nur KI-Fragen per POST möglich.", 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return failure("Bitte öffne den Assistenten direkt in der App.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("Die Anfrage muss JSON enthalten.", 415);
  let input;
  try { input = parseAssistantRequest(await boundedJson(request)); }
  catch (error) {
    return error instanceof Error && error.message === "too-large"
      ? failure("Die Anfrage ist zu groß.", 413)
      : failure("Der Kontext ist ungültig. Starte ein neues Gespräch und prüfe deine Filter.", 400);
  }
  let draws;
  try { draws = await officialDraws(); }
  catch { return failure("Das offizielle Archiv ist gerade nicht verfügbar.", 503); }

  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(55_000)]);
  const context = JSON.stringify({ spiel: games[input.game].name, analysezeitraum: input.period });
  const messages = assistantMessages(context, input.messages);
  const result = streamText({
    model: assistantModel,
    system: messages[0].content,
    messages: messages.slice(1) as { role: "user" | "assistant"; content: string }[],
    tools: assistantTools(input, draws),
    prepareStep: ({ stepNumber }) => ({ toolChoice: stepNumber === 0 ? "required" : stepNumber === 2 ? "none" : "auto" }),
    stopWhen: isStepCount(3),
    maxOutputTokens: 700,
    maxRetries: 0,
    temperature: 0.2,
    abortSignal: signal,
    timeout: { totalMs: 55_000 },
    providerOptions: {
      google: { thinkingConfig: { thinkingBudget: 0 } },
      gateway: { disallowPromptTraining: true },
    },
    telemetry: { isEnabled: false },
    onError: () => {}, // Do not log questions, tip fields or gateway credentials.
  });
  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => { if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
      let answer = "";
      let completed = false;
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            answer += part.text;
            send({ type: "text", text: part.text });
          } else if (part.type === "tool-result") send({ type: "tool", label: toolLabels[part.toolName] || "Kontext gelesen" });
          else if (part.type === "error" || part.type === "tool-error") throw part.error;
          else if (part.type === "finish") completed = part.finishReason === "stop";
        }
        if (!completed || !answer.trim()) throw new Error("empty-answer");
        if (containsUnsupportedForecast(answer)) {
          send({ type: "error", message: "Die KI-Antwort enthielt eine unbelegte Gewinnprognose und wurde verworfen. Vergangene Zahlen sagen die nächste Ziehung nicht voraus. Bitte frage nach den berechneten Daten." });
        } else send({ type: "done" });
      } catch {
        send({ type: "error", message: "Der KI-Dienst konnte nicht antworten. Bitte versuche es erneut. Falls das Gateway-Guthaben aufgebraucht ist, muss der Betreiber es erneuern." });
      } finally { if (!cancelled) controller.close(); }
    },
    cancel() { cancelled = true; abort.abort(); },
  });
  return new Response(body, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8" } });
}

export default { fetch: assistantFetch };
