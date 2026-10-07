export class TextAiHttpError extends Error {
  constructor(public readonly provider: string, public readonly status: number, message = `${provider} API 오류 (${status})`) {
    super(message);
    this.name = "TextAiHttpError";
  }
}

// 문안 AI 한 번 호출에 기다리는 최대 시간. 멈춘 요청을 서버 기본값(약 5분)까지 기다리지 않고 다음 AI로 넘어가게 한다.
export const TEXT_AI_TIMEOUT_MS = 45_000;

// fetch가 시간 초과·네트워크 오류로 던지면 상태 0의 TextAiHttpError로 바꾼다.
// textClient는 HTTP 오류면 같은 AI를 다시 부르지 않고 바로 다음 AI로 넘어가므로, 멈춘 AI를 두 번 기다리지 않는다.
export async function guardedFetch(provider: string, run: () => Promise<Response>): Promise<Response> {
  try { return await run(); }
  catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new TextAiHttpError(provider, 0, timeout ? `${provider} 응답이 ${Math.round(TEXT_AI_TIMEOUT_MS / 1000)}초 안에 오지 않았어요.` : `${provider}에 연결하지 못했어요.`);
  }
}
