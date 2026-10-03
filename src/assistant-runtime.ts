import type { AssistantRequest } from "./assistant-request";

export async function readAssistantStream(
  response: Response,
  onText: (text: string) => void,
  onTool: (label: string) => void,
) {
  if (!response.ok) {
    const message = response.status === 429
      ? "Zu viele Fragen in kurzer Zeit. Bitte warte eine Minute."
      : "Der KI-Dienst ist gerade nicht erreichbar. Bitte versuche es erneut.";
    let details: unknown;
    try { details = await response.json(); } catch { /* HTML firewall errors use the fallback. */ }
    throw new Error(details && typeof details === "object" && "error" in details &&
      typeof details.error === "string" ? details.error : message);
  }
  if (!response.body) throw new Error("Der KI-Dienst hat keine Antwort geliefert.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let text = "";
  let complete = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); }
    catch { throw new Error("Der KI-Dienst hat eine ungültige Antwort geliefert. Bitte versuche es erneut."); }
    if (!event || typeof event !== "object") throw new Error("Der KI-Dienst hat eine ungültige Antwort geliefert.");
    if (event.type === "error") throw new Error(event.message || "Die KI-Antwort wurde unterbrochen.");
    if (event.type === "text" && typeof event.text === "string") {
      text += event.text;
      onText(text);
    } else if (event.type === "tool" && typeof event.label === "string") onTool(event.label);
    else if (event.type === "done") complete = true;
  };
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) consume(line);
      if (done) {
        if (pending.trim()) consume(pending);
        break;
      }
    }
    if (!complete || !text.trim()) throw new Error("Die KI-Antwort wurde unterbrochen. Bitte versuche es erneut.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class CloudAssistant {
  private controller?: AbortController;
  async answer(request: AssistantRequest, onText: (text: string) => void, onTool: (label: string) => void) {
    this.stop();
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(new Error("Die Antwort dauert zu lange. Bitte versuche es erneut.")), 65_000);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request), signal: controller.signal,
      });
      await readAssistantStream(response, onText, onTool);
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = undefined;
    }
  }
  stop() { this.controller?.abort(); }
}
