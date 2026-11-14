// Turns a zod schema into the plain JSON Schema that Gemini's structured output accepts.
import { z } from "zod";

// Gemini ignores the string-length keywords and does not document `pattern`, so they are dropped rather than risked.
const DROPPED = new Set(["$schema", "pattern", "minLength", "maxLength"]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (typeof node !== "object" || node === null) return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !DROPPED.has(key))
      .map(([key, child]) => [key, strip(child)]),
  );
}

export function wireSchema(schema: z.ZodType): unknown {
  return strip(z.toJSONSchema(schema));
}
