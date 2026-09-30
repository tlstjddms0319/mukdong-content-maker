export function safeReturnPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") && !/[\\\s]/.test(value) ? value : "/";
}

export function isPublicException(pathname: string): boolean {
  return pathname === "/api/instagram/callback" || pathname === "/api/instagram/scheduler" || /^\/api\/media\/public\/[^/]+$/.test(pathname);
}
