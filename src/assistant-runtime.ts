import {
  WebWorkerMLCEngine,
  prebuiltAppConfig,
  deleteModelAllInfoInCache,
} from "@mlc-ai/web-llm";
import {
  containsUnsupportedForecast,
  assistantError,
  visibleAssistantText,
  type assistantMessages,
} from "./assistant-context";
import { assistantModels, type AssistantModel } from "./assistant-config";
export const modelConfig = {
  ...prebuiltAppConfig,
  model_list: prebuiltAppConfig.model_list.filter((m) =>
    assistantModels.some((choice) => choice.id === m.model_id),
  ),
};

type NavigatorGPU = Navigator & {
  gpu?: {
    requestAdapter(): Promise<{
      features: { has(feature: string): boolean };
    } | null>;
  };
};
export async function checkAssistantSupport() {
  if (!window.isSecureContext || !(navigator as NavigatorGPU).gpu) {
    throw new Error(
      "Dieser Browser unterstützt die lokale KI nicht. Verwende einen aktuellen Browser mit WebGPU, zum Beispiel Chrome oder Edge auf einem Computer.",
    );
  }
  const adapter = await (navigator as NavigatorGPU).gpu!.requestAdapter();
  if (!adapter)
    throw new Error(
      "Der Browser stellt keine passende Grafikkarte bereit. Prüfe die Hardwarebeschleunigung in den Browsereinstellungen.",
    );
  if (!adapter.features.has("shader-f16"))
    throw new Error(
      "Die Grafikkarte unterstützt dieses KI-Modell nicht (shader-f16 fehlt). Die regelbasierten Tipps kannst du weiterhin verwenden.",
    );
}

export class LocalAssistant {
  private worker: Worker;
  private engine: WebWorkerMLCEngine;
  private rejectFailure?: (error: Error) => void;
  private failure: Promise<never>;
  private closed = false;
  private interrupted = false;

  constructor(onProgress: (progress: number) => void) {
    this.worker = new Worker(
      new URL("./assistant.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.failure = new Promise((_, reject) => {
      this.rejectFailure = reject;
    });
    // A cancelled runtime may have no pending call to receive the rejection.
    void this.failure.catch(() => {});
    this.worker.onerror = () =>
      this.rejectFailure?.(
        new Error("Die lokale KI wurde unterbrochen. Starte sie erneut."),
      );
    this.engine = new WebWorkerMLCEngine(this.worker, {
      appConfig: modelConfig,
      logLevel: "WARN",
      initProgressCallback: ({ progress }) => {
        if (!this.closed) onProgress(Math.min(1, Math.max(0, progress)));
      },
    });
  }

  async load(model: AssistantModel) {
    for (let attempt = 0; ; attempt++) {
      try {
        await Promise.race([
          this.engine.reload(model, { context_window_size: 4096 }),
          this.failure,
        ]);
        return;
      } catch (error) {
        if (
          this.closed ||
          attempt === 2 ||
          !/NetworkError|Modell-Datei|Failed to fetch/i.test(
            assistantError(error),
          )
        )
          throw error;
        // Reload resumes already cached artifacts and also releases the GPU
        // state left by a failed initialization. Cancellation still wins.
        await Promise.race([
          new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1))),
          this.failure,
        ]);
      }
    }
  }

  async answer(
    messages: ReturnType<typeof assistantMessages>,
    onText: (text: string) => void,
  ) {
    this.interrupted = false;
    const task = async () => {
      const stream = await this.engine.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 420,
        repetition_penalty: 1.03,
        extra_body: { enable_thinking: false },
      });
      let answer = "";
      for await (const chunk of stream) {
        if (this.closed) break;
        answer += chunk.choices[0]?.delta.content ?? "";
        const visible = visibleAssistantText(answer);
        if (containsUnsupportedForecast(visible)) {
          this.stop();
          throw new Error(
            "Die KI-Antwort enthielt eine unbelegte Gewinnprognose und wurde verworfen. Vergangene Zahlen sagen die nächste Ziehung nicht voraus. Bitte starte die KI neu und frage nach den berechneten Daten oder Auswahlregeln.",
          );
        }
        onText(visible);
      }
      if (
        !visibleAssistantText(answer).trim() &&
        !this.closed &&
        !this.interrupted
      )
        throw new Error(
          "Das Modell hat keine Antwort geliefert. Formuliere die Frage kürzer und versuche es erneut.",
        );
    };
    await Promise.race([task(), this.failure]);
  }

  stop() {
    this.interrupted = true;
    this.engine.interruptGenerate();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    this.rejectFailure?.(new Error("KI gestoppt."));
  }
}

export async function removeAssistantCache() {
  for (const model of assistantModels)
    await deleteModelAllInfoInCache(model.id, modelConfig);
}
