import crypto from "crypto";
import express from "express";

const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const PUBLIC_API_ROUTES = new Set([
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

interface SessionAuthOptions {
  sessionTtlMs?: number;
  now?: () => number;
  createToken?: () => string;
}

function getSessionFromCookie(req: express.Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").reduce((acc: Record<string, string>, cookie) => {
    const [name, ...value] = cookie.trim().split("=");
    if (name) {
      acc[name] = value.join("=");
    }
    return acc;
  }, {});

  return cookies.session || null;
}

function getPasswordHash(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string): boolean {
  const cleanPassword = password ? String(password).trim() : "";
  const envHash = process.env.APP_ACCESS_PASSWORD_HASH;

  if (envHash && envHash.trim() !== "") {
    return getPasswordHash(cleanPassword) === envHash.trim();
  }

  const envPassword = process.env.APP_ACCESS_PASSWORD;
  if (envPassword && envPassword.trim() !== "") {
    return cleanPassword === envPassword.trim();
  }

  return false;
}

export function installSessionAuth(
  app: express.Express,
  options: SessionAuthOptions = {}
): void {
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const now = options.now ?? Date.now;
  const createToken = options.createToken ?? (() => crypto.randomBytes(32).toString("hex"));
  const activeSessions = new Map<string, number>();

  function isSessionValid(token: string | null): boolean {
    if (!token) return false;

    const currentTime = now();
    for (const [storedToken, expiresAt] of activeSessions.entries()) {
      if (expiresAt <= currentTime) {
        activeSessions.delete(storedToken);
      }
    }

    const expiresAt = activeSessions.get(token);
    return expiresAt !== undefined && expiresAt > currentTime;
  }

  app.use((req, res, next) => {
    if (PUBLIC_API_ROUTES.has(req.path)) {
      return next();
    }

    if (req.path.startsWith("/api")) {
      const token = getSessionFromCookie(req);
      if (isSessionValid(token)) {
        return next();
      }
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    return next();
  });

  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: "Пароль обязателен к заполнению" });
    }

    if (!verifyPassword(password)) {
      return res.status(401).json({ success: false, error: "Неверный пароль" });
    }

    const sessionToken = createToken();
    activeSessions.set(sessionToken, now() + sessionTtlMs);
    const maxAgeSeconds = sessionTtlMs / 1000;

    res.setHeader(
      "Set-Cookie",
      `session=${sessionToken}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=${maxAgeSeconds}`
    );
    return res.json({ success: true, authenticated: true });
  });

  app.get("/api/auth/check", (req, res) => {
    const token = getSessionFromCookie(req);
    return res.json({ authenticated: isSessionValid(token) });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = getSessionFromCookie(req);
    if (token) {
      activeSessions.delete(token);
    }
    res.setHeader("Set-Cookie", "session=; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0");
    return res.json({ success: true });
  });
}
