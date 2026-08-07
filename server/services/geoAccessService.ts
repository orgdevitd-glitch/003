import express from "express";
import fs from "fs-extra";
import path from "path";
import * as geoip from "geoip-lite";

export interface GeoAccessConfig {
  enabled: boolean;
  allowedCountries: string[];
  unknownCountryPolicy: "allow" | "deny";
  logDeniedRequests: boolean;
  trustProxyHeaders: boolean;
  trustedProxyIps: string[];
}

// Default config matching config/access-control.json
const DEFAULT_CONFIG: GeoAccessConfig = {
  enabled: false,
  allowedCountries: [],
  unknownCountryPolicy: "allow",
  logDeniedRequests: true,
  trustProxyHeaders: false,
  trustedProxyIps: []
};

const CONFIG_PATH = path.join(process.cwd(), "config", "access-control.json");

/**
 * Loads the current access control configuration from config/access-control.json.
 * Falls back to default config if file is missing or invalid.
 */
export function getGeoAccessConfig(): GeoAccessConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(content);
      if (parsed && parsed.geoAccess) {
        return {
          enabled: typeof parsed.geoAccess.enabled === "boolean" ? parsed.geoAccess.enabled : DEFAULT_CONFIG.enabled,
          allowedCountries: Array.isArray(parsed.geoAccess.allowedCountries) ? parsed.geoAccess.allowedCountries : DEFAULT_CONFIG.allowedCountries,
          unknownCountryPolicy: parsed.geoAccess.unknownCountryPolicy === "deny" ? "deny" : "allow",
          logDeniedRequests: typeof parsed.geoAccess.logDeniedRequests === "boolean" ? parsed.geoAccess.logDeniedRequests : DEFAULT_CONFIG.logDeniedRequests,
          trustProxyHeaders: typeof parsed.geoAccess.trustProxyHeaders === "boolean" ? parsed.geoAccess.trustProxyHeaders : DEFAULT_CONFIG.trustProxyHeaders,
          trustedProxyIps: Array.isArray(parsed.geoAccess.trustedProxyIps) ? parsed.geoAccess.trustedProxyIps : DEFAULT_CONFIG.trustedProxyIps
        };
      }
    }
  } catch (error) {
    console.error("[GeoAccess] Failed to read config file, falling back to defaults:", error);
  }
  return DEFAULT_CONFIG;
}

/**
 * Converts IPv4 string to integer representation.
 */
function ipToInt(ip: string): number {
  return ip.split(".").reduce((int, octet) => (int * 256) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Checks if an IP is within a CIDR block.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    if (!ip.includes(".") || !cidr.includes(".")) {
      // Direct string comparison fallback for IPv6
      return ip === cidr;
    }
    const [range, bitsStr] = cidr.split("/");
    if (!bitsStr) {
      return ip === range;
    }
    const bits = parseInt(bitsStr, 10);
    if (isNaN(bits) || bits < 0 || bits > 32) {
      return false;
    }
    const ipInt = ipToInt(ip);
    const rangeInt = ipToInt(range);
    
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
  } catch (e) {
    return false;
  }
}

/**
 * Checks if a given connection IP matches the trusted list of IPs or CIDRs.
 */
export function isIpTrusted(ip: string, trustedList: string[]): boolean {
  if (!trustedList || trustedList.length === 0) {
    return false;
  }
  
  // Clean ip (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
  let cleanIp = ip.trim();
  if (cleanIp.startsWith("::ffff:")) {
    cleanIp = cleanIp.substring(7);
  }

  for (const item of trustedList) {
    const cleanItem = item.trim();
    if (cleanIp === cleanItem) {
      return true;
    }
    // Check CIDR
    if (cleanItem.includes("/")) {
      if (isIpInCidr(cleanIp, cleanItem)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Interface for country detection strategies.
 */
export interface ICountryDetector {
  name: string;
  detect(ip: string, req: express.Request): string | null;
}

/**
 * Header-based country detector (e.g. Cloudflare, AWS, GCP, etc.).
 */
export class HeaderCountryDetector implements ICountryDetector {
  name = "Headers";
  detect(ip: string, req: express.Request): string | null {
    const headersToCheck = [
      "cf-ipcountry",          // Cloudflare
      "x-country-code",        // General proxy
      "cloudfront-viewer-country", // Cloudfront
      "x-appengine-country"    // Google App Engine / Cloud Run (if populated)
    ];

    for (const header of headersToCheck) {
      const val = req.headers[header];
      if (val && typeof val === "string" && val.trim().length === 2) {
        return val.trim().toUpperCase();
      }
    }
    return null;
  }
}

/**
 * Local GeoIP database detector.
 */
export class GeoIpLiteDetector implements ICountryDetector {
  name = "geoip-lite";

  detect(ip: string): string | null {
    if (!ip) return null;
    try {
      const lookup = geoip.lookup(ip);
      if (lookup && lookup.country) {
        return lookup.country.toUpperCase();
      }
    } catch (err) {
      // Fail silently if IP format is invalid or lookup throws
    }
    return null;
  }
}

/**
 * Test/mock detector for programmatic testing.
 */
export class TestCountryDetector implements ICountryDetector {
  name = "TestMock";
  private mockCountry: string | null = null;

  setMockCountry(country: string | null) {
    this.mockCountry = country;
  }

  detect(): string | null {
    return this.mockCountry ? this.mockCountry.toUpperCase() : null;
  }
}

// Active detectors chain
const detectors: ICountryDetector[] = [
  new HeaderCountryDetector(),
  new GeoIpLiteDetector()
];

// Reference to test detector to inject in unit tests
export const testDetector = new TestCountryDetector();
detectors.push(testDetector);

/**
 * Resolves the user's direct connection IP address (physical connection).
 */
export function getDirectConnectionIp(req: express.Request): string {
  let ip = req.socket?.remoteAddress || "127.0.0.1";
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }
  return ip;
}

/**
 * Checks if the request comes from a trusted proxy connection.
 */
export function isProxyConnectionTrusted(req: express.Request, config: GeoAccessConfig): boolean {
  if (!config.trustProxyHeaders) {
    return false;
  }

  const isProd = process.env.NODE_ENV === "production";
  const connectionIp = getDirectConnectionIp(req);

  // If trustedProxyIps is empty:
  // - In production, we cannot trust headers (must be false).
  // - In development/testing, we can allow fallback to trust if no specific proxy is configured,
  //   or we can be strict. Let's make it strict unless it's loopback, or follow the rule:
  //   "Если trustedProxyIps пустой, нельзя безусловно доверять proxy-заголовкам в production-режиме."
  if (config.trustedProxyIps.length === 0) {
    return !isProd; // trusted if not in production
  }

  return isIpTrusted(connectionIp, config.trustedProxyIps);
}

/**
 * Resolves the user's IP address from headers, proxy, or socket connection.
 */
export function getUserIp(req: express.Request, config: GeoAccessConfig): string {
  const connectionIp = getDirectConnectionIp(req);

  if (isProxyConnectionTrusted(req, config)) {
    // Use Cloudflare connecting IP if present
    const cfIp = req.headers["cf-connecting-ip"];
    if (cfIp && typeof cfIp === "string") {
      return cfIp.trim();
    }

    // Use X-Forwarded-For if present (safely taking the first, i.e. client's IP)
    const xForwardedFor = req.headers["x-forwarded-for"];
    if (xForwardedFor && typeof xForwardedFor === "string") {
      const parts = xForwardedFor.split(",");
      const firstIp = parts[0]?.trim();
      if (firstIp) {
        return firstIp;
      }
    }
  }

  return connectionIp;
}

/**
 * Resolves the country code of the requester.
 */
export function detectCountry(ip: string, req: express.Request, config: GeoAccessConfig): string | null {
  const isTrusted = isProxyConnectionTrusted(req, config);

  for (const detector of detectors) {
    if (detector instanceof HeaderCountryDetector) {
      if (!isTrusted) {
        // Skip header detection if connection is not trusted
        continue;
      }
    }
    const country = detector.detect(ip, req);
    if (country) {
      return country;
    }
  }
  return null;
}

/**
 * Express middleware for geo-access control.
 */
export function geoAccessMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const config = getGeoAccessConfig();

  // 1. If geo restriction is disabled, bypass completely
  if (!config.enabled) {
    return next();
  }

  // 2. If allowedCountries is empty, allow access to everyone as per requirement
  if (!config.allowedCountries || config.allowedCountries.length === 0) {
    return next();
  }

  const ip = getUserIp(req, config);
  const detectedCountry = detectCountry(ip, req, config);

  let allowed = false;
  let reason = "";

  if (detectedCountry) {
    const isAllowed = config.allowedCountries.map(c => c.toUpperCase()).includes(detectedCountry);
    if (isAllowed) {
      allowed = true;
    } else {
      reason = `Country ${detectedCountry} is not in the allowed list`;
    }
  } else {
    // Country could not be determined
    if (config.unknownCountryPolicy === "allow") {
      allowed = true;
    } else {
      reason = "Country could not be determined and unknownCountryPolicy is deny";
    }
  }

  if (allowed) {
    return next();
  }

  // Log denied request if enabled
  if (config.logDeniedRequests) {
    const connectionIp = getDirectConnectionIp(req);
    console.warn(`[GeoAccess Denied] ConnectionIP: ${connectionIp}, ResolvedIP: ${ip}, Detected Country: ${detectedCountry || "Unknown"}, Path: ${req.path}, Reason: ${reason}`);
  }

  // Return standard, polite, clean 403 response without leaking too much internal details
  res.status(403).json({
    success: false,
    error: "Доступ ограничен в соответствии с правилами геолокационной безопасности вашей страны."
  });
}
