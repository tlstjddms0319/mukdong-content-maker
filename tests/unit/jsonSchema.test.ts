// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OptionalFieldsError, toStrictJsonSchema } from "@/lib/ai/jsonSchema";
import { TextAiHttpError } from "@/lib/ai/errors";
import { GeneratedCopyContentSchema } from "@/features/copy/schema";
import { topicGenerationSchema } from "@/features/topics/prompt";
import { topicDirectionsForRound } from "@/features/topics/service";
import { CarouselPlanSchema } from "@/features/images/carousel";

describe("toStrictJsonSchema", () => {
  it("marks every object closed with all properties required", () => {
    const json = toStrictJsonSchema(z.object({ title: z.string(), tags: z.array(z.string()) }));
    expect(json).toMatchObject({ type: "object", additionalProperties: false, required: ["title", "tags"] });
    expect(json).not.toHaveProperty("$schema");
  });

  it("converts the three app schemas without optional fields", () => {
    for (const schema of [GeneratedCopyContentSchema, topicGenerationSchema(topicDirectionsForRound(0)), CarouselPlanSchema]) {
      expect(() => toStrictJsonSchema(schema as z.ZodType)).not.toThrow();
    }
  });

  it("refuses optional fields because strict providers would reject them", () => {
    expect(() => toStrictJsonSchema(z.object({ title: z.string(), note: z.string().optional() }))).toThrow(/note/);
  });

  it("keeps provider and status on HTTP errors", () => {
    const error = new TextAiHttpError("Gemini", 429);
    expect(error.message).toBe("Gemini API 오류 (429)");
    expect(error.status).toBe(429);
    expect(error.provider).toBe("Gemini");
  });

  it("throws a dedicated error for optional fields so callers can fall back only for that case", () => {
    expect(() => toStrictJsonSchema(z.object({ note: z.string().optional() }))).toThrow(OptionalFieldsError);
  });

});
