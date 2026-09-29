// scripts/register-ts.mjs
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register(new URL("./ts-alias-hooks.mjs", import.meta.url), pathToFileURL("./"));
