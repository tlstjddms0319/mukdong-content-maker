// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clientAddress, recordOwnerLogin } from "@/features/auth/attempts";

describe("owner login lockout", () => {
  it("locks only the address that keeps failing, so others can still log in", () => {
    const now = 5_000_000;
    for (let i = 0; i < 4; i++) expect(recordOwnerLogin("203.0.113.9", false, now).blocked).toBe(false);
    expect(recordOwnerLogin("203.0.113.9", false, now).blocked).toBe(true);
    // 사장님(다른 주소)은 맞는 암호로 들어갈 수 있다(예전에는 모두 한 칸에 세어 함께 막혔다).
    expect(recordOwnerLogin("198.51.100.7", true, now).blocked).toBe(false);
    expect(recordOwnerLogin("203.0.113.9", true, now + 1).blocked).toBe(true);
  });
  it("reads the first forwarded address", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
