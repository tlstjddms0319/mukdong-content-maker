export class TextAiHttpError extends Error {
  constructor(public readonly provider: string, public readonly status: number, message = `${provider} API 오류 (${status})`) {
    super(message);
    this.name = "TextAiHttpError";
  }
}
