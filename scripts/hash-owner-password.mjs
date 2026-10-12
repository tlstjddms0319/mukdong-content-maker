import { randomBytes, scryptSync } from "node:crypto";

let source = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) source += chunk;

// Windows PowerShell 5.1 can prefix piped input with a byte order mark when the console is UTF-8; it is not part of the password.
const password = source.replace(/^﻿/, "").replace(/\r?\n$/, "");
const salt = randomBytes(32);
const digest = scryptSync(password, salt, 64);

console.log(`OWNER_PASSWORD_HASH=scrypt:${salt.toString("base64url")}:${digest.toString("base64url")}`);
console.log(`AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
