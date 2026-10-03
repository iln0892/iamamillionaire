import { z } from "zod";
import { games } from "../src/domain.js";
import type { AssistantRequest } from "../src/assistant-request.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const filters = z.object({
  sum: z.boolean(), minSum: z.number().int().min(0).max(300), maxSum: z.number().int().min(0).max(300),
  parity: z.boolean(), decades: z.boolean(), minDecades: z.number().int().min(1).max(6),
  patterns: z.boolean(), historic: z.boolean(), birthdays: z.boolean(),
}).strict().refine(value => value.minSum <= value.maxSum);
const tip = z.object({
  numbers: z.array(z.number().int().min(1).max(50)).min(5).max(6),
  extras: z.array(z.number().int().min(0).max(12)).min(1).max(2),
}).strict();
const schema = z.object({
  game: z.enum(["lotto", "euro"]),
  period: z.object({ from: date.nullable(), to: date.nullable() }).strict(),
  filters,
  generated: z.object({
    total: z.number().int().min(0).max(20000), filters, tips: z.array(tip).max(3),
  }).strict().nullable(),
  saved: z.array(tip).max(3),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2500),
  }).strict()).min(1).max(5),
}).strict();

export function parseAssistantRequest(raw: unknown): AssistantRequest {
  const value = schema.parse(raw);
  if ((value.period.from === null) !== (value.period.to === null) ||
      (value.period.from && value.period.to && value.period.from > value.period.to))
    throw new Error("Ungültiger Analysezeitraum.");
  if (value.messages.length % 2 !== 1 || value.messages.some((message, i) =>
    message.role !== (i % 2 ? "assistant" : "user") ||
    (message.role === "user" && message.content.length > 1000)))
    throw new Error("Ungültiger Gesprächsverlauf.");
  const config = games[value.game];
  for (const field of [...(value.generated?.tips ?? []), ...value.saved]) {
    if (field.numbers.length !== config.count || new Set(field.numbers).size !== config.count ||
        field.numbers.some(n => n > config.max) ||
        field.extras.length !== (value.game === "lotto" ? 1 : 2) ||
        new Set(field.extras).size !== field.extras.length ||
        field.extras.some(n => value.game === "lotto" ? n > 9 : n < 1 || n > 12))
      throw new Error("Ungültige Tippfelder.");
  }
  if (value.generated && value.generated.tips.length !== Math.min(3, value.generated.total))
    throw new Error("Ungültige Anzahl erzeugter Tippfelder.");
  return value;
}
