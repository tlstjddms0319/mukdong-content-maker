// 결과물 점검 스크립트 전용 로더 훅: 로그인 검사를 대역(guard-stub.ts)으로 바꾸고, ESM에서 확장자 없이 못 찾는
// next 하위 경로(next/server 등)를 .js로 찾는다.
import { pathToFileURL } from "node:url";
import path from "node:path";
const stub = pathToFileURL(path.join(process.cwd(), "scripts", "eval", "guard-stub.ts")).href;
export async function resolve(specifier, context, next) {
  if (specifier === "@/features/auth/guard") return { url: stub, shortCircuit: true };
  if (/^next\/[a-z-]+$/.test(specifier)) {
    try { return await next(specifier, context); } catch { return next(`${specifier}.js`, context); }
  }
  return next(specifier, context);
}
