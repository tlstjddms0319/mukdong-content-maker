export function isOwnerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OWNER_PASSWORD_HASH?.trim() && env.AUTH_SECRET?.trim());
}
