// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildImageRequest } from "@/features/images/openaiRequest";

describe("OpenAI image request", () => {
  it("omits the unsupported response_format parameter", () => {
    const request = buildImageRequest({ topic:"홍어 삼합", count:1, aspectRatio:"4:5" });
    expect(request).not.toHaveProperty("response_format");
    expect(request).toMatchObject({ model:"gpt-image-1", size:"1024x1536", n:1 });
  });
});
