import "server-only";
import OpenAI from "openai";

export class AiConfigurationError extends Error {
  constructor(message = "OpenAI API 키가 연결되지 않았습니다.") {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiConfigurationError();
  return new OpenAI({ apiKey });
}
