import { z } from "zod";

// Thrown only for the one shape strict providers cannot express; callers may fall back for this case alone.
export class OptionalFieldsError extends Error {
  constructor(fields: string[]) {
    super(`선택 필드가 있어 엄격한 JSON 스키마로 보낼 수 없습니다: ${fields.join(", ")}`);
    this.name = "OptionalFieldsError";
  }
}

// Groq strict mode and Cloudflare json_schema both want closed objects with every property required.
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return tighten(json) as Record<string, unknown>;
}

function tighten(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tighten);
  if (!node || typeof node !== "object") return node;
  const copy: Record<string, unknown> = { ...(node as Record<string, unknown>) };
  if (copy.type === "object" && copy.properties && typeof copy.properties === "object") {
    const keys = Object.keys(copy.properties as Record<string, unknown>);
    const required = new Set(Array.isArray(copy.required) ? (copy.required as string[]) : []);
    const optional = keys.filter((key) => !required.has(key));
    if (optional.length) throw new OptionalFieldsError(optional);
    copy.additionalProperties = false;
  }
  for (const key of Object.keys(copy)) copy[key] = tighten(copy[key]);
  return copy;
}
