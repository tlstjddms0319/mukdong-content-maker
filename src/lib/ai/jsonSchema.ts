import { z } from "zod";

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
    if (optional.length) throw new Error(`선택 필드가 있어 엄격한 JSON 스키마로 보낼 수 없습니다: ${optional.join(", ")}`);
    copy.additionalProperties = false;
  }
  for (const key of Object.keys(copy)) copy[key] = tighten(copy[key]);
  return copy;
}
