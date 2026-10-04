// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isSessionRefresh, withoutSessionRefresh } from "@/features/auth/sessionCookie";

describe("proxy session cookie", () => {
  it("drops only session refreshes and keeps deletions and other cookies", () => {
    expect(isSessionRefresh("authjs.session-token=eyJ; Path=/; HttpOnly")).toBe(true);
    expect(isSessionRefresh("__Secure-authjs.session-token.0=abc; Path=/")).toBe(true);
    expect(isSessionRefresh("authjs.session-token=; Max-Age=0; Path=/")).toBe(false);
    expect(isSessionRefresh("authjs.csrf-token=abc; Path=/")).toBe(false);

    const headers=new Headers({"x-middleware-next":"1"});
    headers.append("set-cookie","authjs.session-token=eyJ; Path=/; HttpOnly");
    headers.append("set-cookie","authjs.callback-url=%2F; Path=/");
    const cleaned=withoutSessionRefresh(new Response(null,{status:200,headers}));
    expect(cleaned.headers.getSetCookie()).toEqual(["authjs.callback-url=%2F; Path=/"]);
    expect(cleaned.headers.get("x-middleware-next")).toBe("1");

    const untouched=new Response(null,{status:307,headers:{location:"/login"}});
    expect(withoutSessionRefresh(untouched)).toBe(untouched);
  });
});
