// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyOpenAIImageError } from "@/features/images/openaiError";

describe("OpenAI image error messages", () => {
  it("explains exhausted credits without exposing provider details", () => {
    expect(classifyOpenAIImageError({ status:429, code:"credit_balance_exhausted" })).toEqual({
      message:"OpenAI API 크레딧이 부족합니다. 결제 잔액을 확인하거나 직접 사진을 넣어 주세요.", retryable:false,
    });
  });

  it("explains an invalid key", () => {
    expect(classifyOpenAIImageError({ status:401 })).toMatchObject({ message:expect.stringContaining("API 키"), retryable:false });
  });
});
