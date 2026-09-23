// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("deployment configuration",()=>{
  it("provides a production start command",async()=>{
    const packageJson=JSON.parse(await readFile("package.json","utf8"));
    expect(packageJson.scripts.start).toBe("next start");
  });
});
