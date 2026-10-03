import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// Retry transient CDN/download errors inside this model worker. The SDK uses
// Cache.add for model artifacts and would otherwise abort the entire load.
const originalCacheAdd = Cache.prototype.add;
Cache.prototype.add = async function (request: RequestInfo | URL) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await originalCacheAdd.call(this, request as RequestInfo);
    } catch (error) {
      // Some model CDNs cache expired redirect responses. On failure, obtain
      // a fresh response and store it under the SDK's original cache key.
      try {
        const response = await fetch(request, {
          cache: "reload",
          credentials: "omit",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await this.put(request as RequestInfo, response);
        return;
      } catch (retryError) {
        if (attempt === 2)
          throw new Error(
            `Eine KI-Modell-Datei konnte nicht geladen werden. Bitte versuche den Start erneut. (${String(retryError)})`,
          );
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
};

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event: MessageEvent) => handler.onmessage(event);
