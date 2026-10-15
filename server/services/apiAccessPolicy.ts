const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/check",
  "/api/auth/logout",
  "/api/health",
  "/api/bitrix/health",
  "/api/bitrix/projects/import",
  "/api/indicator-dictionary/status",
  "/api/advanced-access/config",
  "/api/advanced-access/verify",
  "/api/advanced-access/status",
  "/api/advanced-access/revoke"
]);

function normalizePath(path: string): string {
  const normalized = String(path || "").toLowerCase();
  return normalized.length > 1 && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
}

export function isApiPath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized === "/api" || normalized.startsWith("/api/");
}

export function isPublicApiPath(path: string): boolean {
  return PUBLIC_API_PATHS.has(normalizePath(path));
}
