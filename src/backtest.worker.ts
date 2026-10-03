import { backtest } from "./domain";
self.onmessage = (event) => {
  try {
    self.postMessage({
      result: backtest(
        event.data.draws,
        event.data.game,
        event.data.filters,
        event.data.count,
        event.data.fields,
        event.data.seed,
      ),
    });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
