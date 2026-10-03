import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// Retry transient CDN/download errors inside this model worker. The SDK uses
// Cache.add for model artifacts and would otherwise abort the entire load.
const originalCacheAdd = Cache.prototype.add;
Cache.prototype.add = async function (request: RequestInfo | URL) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await originalCacheAdd.call(this, request as RequestInfo);
    } catch (error) {
      if (attempt === 2)
        throw new Error(
          `Eine KI-Modell-Datei konnte nicht geladen werden. Bitte versuche den Start erneut. (${String(error)})`,
        );
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
};

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event: MessageEvent) => handler.onmessage(event);
