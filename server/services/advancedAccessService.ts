import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import express from "express";

export interface AdvancedAccessConfig {
  enabled: boolean;
  displayName: string;
  passwordHash: string;
  ttlMinutes: number;
  protectedActions: string[];
}

export type AnalysisAssessmentDateMode = "today" | "custom" | "server_fallback";

export interface AnalysisAssessmentDate {
  assessmentDate: Date;
  assessmentDateMode: AnalysisAssessmentDateMode;
}

const DEFAULT_ADVANCED_CONFIG: AdvancedAccessConfig = {
  enabled: true,
  displayName: "Код расширенного доступа",
  passwordHash: "",
  ttlMinutes: 60,
  protectedActions: [
    "assessmentDateChange",
    "syncData",
    "exportData",
    "exportPdf",
    "exportProjectCard",
    "exportProjectCardPdf"
  ]
};

const CONFIG_PATH = path.join(process.cwd(), "config", "access-control.json");

// In-memory advanced sessions store: sessionToken -> expiresAt timestamp
const activeAdvancedSessions = new Map<string, number>();

/**
 * Parses cookies from request headers.
 */
export function getCookie(req: express.Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").reduce((acc: Record<string, string>, c: string) => {
    const [coName, ...val] = c.trim().split("=");
    if (coName) {
      acc[coName] = val.join("=");
    }
    return acc;
  }, {});
  return cookies[name] || null;
}

/**
 * Loads the advanced access configuration.
 * Reads from config/access-control.json and merges/defaults properly.
 */
export function getAdvancedAccessConfig(): AdvancedAccessConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(content);
      if (parsed && parsed.advancedAccess) {
        return {
          enabled: typeof parsed.advancedAccess.enabled === "boolean" ? parsed.advancedAccess.enabled : DEFAULT_ADVANCED_CONFIG.enabled,
          displayName: typeof parsed.advancedAccess.displayName === "string" ? parsed.advancedAccess.displayName : DEFAULT_ADVANCED_CONFIG.displayName,
          passwordHash: typeof parsed.advancedAccess.passwordHash === "string" ? parsed.advancedAccess.passwordHash : DEFAULT_ADVANCED_CONFIG.passwordHash,
          ttlMinutes: typeof parsed.advancedAccess.ttlMinutes === "number" ? parsed.advancedAccess.ttlMinutes : DEFAULT_ADVANCED_CONFIG.ttlMinutes,
          protectedActions: Array.isArray(parsed.advancedAccess.protectedActions) ? parsed.advancedAccess.protectedActions : DEFAULT_ADVANCED_CONFIG.protectedActions
        };
      }
    }
  } catch (err) {
    console.error("[AdvancedAccess] Failed to read config, using defaults:", err);
  }
  return DEFAULT_ADVANCED_CONFIG;
}

/**
 * Computes SHA-256 hash of a password string.
 */
export function hashAdvancedPassword(pwd: string): string {
  return crypto.createHash("sha256").update(pwd.trim()).digest("hex");
}

/**
 * Verifies if the provided advanced access password matches the configured hash or environment secrets.
 */
export function verifyAdvancedAccessPassword(pwd: string): boolean {
  const cleanPwd = pwd ? String(pwd).trim() : "";
  const config = getAdvancedAccessConfig();

  // 1. Check environment variable hashes
  const envHash = process.env.ADVANCED_ACCESS_PASSWORD_HASH;
  if (envHash && envHash.trim() !== "") {
    return hashAdvancedPassword(cleanPwd) === envHash.trim();
  }

  // 2. Check plain text environment variables (for dev/convenience)
  const envPwd = process.env.ADVANCED_ACCESS_PASSWORD;
  if (envPwd && envPwd.trim() !== "") {
    return cleanPwd === envPwd.trim();
  }

  // 3. Check JSON config passwordHash
  if (config.passwordHash && config.passwordHash.trim() !== "") {
    return hashAdvancedPassword(cleanPwd) === config.passwordHash.trim();
  }

  return false;
}

/**
 * Checks if the advanced access session is active.
 * If config is disabled, it returns true (works as before).
 */
export function isAdvancedAccessActive(req: express.Request): boolean {
  const config = getAdvancedAccessConfig();
  if (!config.enabled) {
    return true;
  }
  const token = getCookie(req, "advanced_access_session");
  if (!token) return false;
  
  const expiresAt = activeAdvancedSessions.get(token);
  if (!expiresAt) return false;
  
  if (Date.now() > expiresAt) {
    activeAdvancedSessions.delete(token); // expired
    return false;
  }
  return true;
}

/**
 * Creates an advanced access session, stores it, and sets the cookie on response.
 */
export function createAdvancedAccessSession(res: express.Response): string {
  const config = getAdvancedAccessConfig();
  const token = crypto.randomBytes(32).toString("hex");
  const ttlSeconds = (config.ttlMinutes || 60) * 60;
  
  activeAdvancedSessions.set(token, Date.now() + ttlSeconds * 1000);
  
  res.setHeader(
    "Set-Cookie",
    `advanced_access_session=${token}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=${ttlSeconds}`
  );
  
  return token;
}

/**
 * Revokes an advanced access session and clears the cookie.
 */
export function revokeAdvancedAccessSession(req: express.Request, res: express.Response): void {
  const token = getCookie(req, "advanced_access_session");
  if (token) {
    activeAdvancedSessions.delete(token);
  }
  res.setHeader(
    "Set-Cookie",
    "advanced_access_session=; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0"
  );
}

export function resolveAnalysisAssessmentDate(
  rawAssessmentDate: unknown,
  rawAssessmentDateMode: unknown,
  now: Date = new Date()
): AnalysisAssessmentDate {
  if (rawAssessmentDateMode === "today") {
    return {
      assessmentDate: new Date(now.getTime()),
      assessmentDateMode: "today"
    };
  }

  if (typeof rawAssessmentDate === "string") {
    const parsed = new Date(rawAssessmentDate);
    if (!isNaN(parsed.getTime())) {
      return {
        assessmentDate: parsed,
        assessmentDateMode: "custom"
      };
    }
  }

  return {
    assessmentDate: new Date(now.getTime()),
    assessmentDateMode: "server_fallback"
  };
}
