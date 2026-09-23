import { randomBytes, scryptSync } from "node:crypto";

let source = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) source += chunk;

const password = source.replace(/\r?\n$/, "");
const salt = randomBytes(32);
const digest = scryptSync(password, salt, 64);

console.log(`OWNER_PASSWORD_HASH=scrypt:${salt.toString("base64url")}:${digest.toString("base64url")}`);
console.log(`AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
