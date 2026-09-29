// scripts/ts-alias-hooks.mjs
// Lets plain Node (24+, native type stripping) import the app's TypeScript modules:
// "@/x" -> src/x and extensionless relative imports -> .ts/.tsx/index.ts.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();
const candidates = (base) => [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, "index.ts")];

export async function resolve(specifier, context, next) {
  let target = null;
  if (specifier.startsWith("@/")) target = path.join(root, "src", specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  if (target) for (const file of candidates(target)) if (existsSync(file) && statSync(file).isFile()) return { url: pathToFileURL(file).href, shortCircuit: true };
  return next(specifier, context);
}
