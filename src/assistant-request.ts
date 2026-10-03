import type { Draw, Filters, Game, Tip } from "./domain";
import type { ChatMessage, GeneratedSelection } from "./assistant-context";

export interface TipNumbers {
  numbers: number[];
  extras: number[];
}
export interface AssistantRequest {
  game: Game;
  period: { from: string | null; to: string | null };
  filters: Filters;
  generated: { total: number; filters: Filters; tips: TipNumbers[] } | null;
  saved: TipNumbers[];
  messages: { role: "user" | "assistant"; content: string }[];
}
export function assistantRequest({
  game, ranged, filters, generated, saved, messages,
}: {
  game: Game;
  ranged: Draw[];
  filters: Filters;
  generated?: GeneratedSelection;
  saved: Tip[];
  messages: ChatMessage[];
}): AssistantRequest {
  const numbersOnly = ({ numbers, extras }: TipNumbers) => ({ numbers, extras });
  return {
    game,
    period: { from: ranged[0]?.date ?? null, to: ranged.at(-1)?.date ?? null },
    filters,
    generated: generated ? {
      total: generated.tips.length,
      filters: generated.filters,
      tips: generated.tips.slice(0, 3).map(numbersOnly),
    } : null,
    saved: saved.filter(tip => tip.game === game).slice(0, 3).map(numbersOnly),
    messages: messages.filter(m => m.content.trim()).slice(-5).map(m => ({
      role: m.role,
      content: m.content.slice(0, m.role === "user" ? 1000 : 2500),
    })),
  };
}
