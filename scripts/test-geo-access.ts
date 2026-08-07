import { GeoIpLiteDetector, getGeoAccessConfig, geoAccessMiddleware, testDetector, getUserIp, detectCountry, isIpInCidr, isIpTrusted } from "../server/services/geoAccessService";
import fs from "fs-extra";
import path from "path";

// Simple test runner
function runTest(name: string, fn: () => void) {
  console.log(`[GEO_ACCESS_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[GEO_ACCESS_TEST] ✓ Passed\n`);
  } catch (error: any) {
    console.error(`[GEO_ACCESS_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// Mock Request & Response creators
function createMockReq(headers: Record<string, string> = {}, path = "/api/projects", ip = "1.2.3.4") {
  return {
    headers: Object.keys(headers).reduce((acc: Record<string, string>, k) => {
      acc[k.toLowerCase()] = headers[k];
      return acc;
    }, {}),
    path,
    ip,
    socket: { remoteAddress: ip }
  } as any;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    jsonPayload: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.jsonPayload = data;
      return this;
    }
  } as any;
  return res;
}

const CONFIG_PATH = path.join(process.cwd(), "config", "access-control.json");
let originalConfigContent = "";

function backupConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    originalConfigContent = fs.readFileSync(CONFIG_PATH, "utf8");
  }
}

function restoreConfig() {
  if (originalConfigContent) {
    fs.mkdirpSync(path.dirname(CONFIG_PATH));
    fs.writeFileSync(CONFIG_PATH, originalConfigContent, "utf8");
  } else if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
}

function writeTestConfig(config: any) {
  fs.mkdirpSync(path.dirname(CONFIG_PATH));
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

// --- Run Tests ---
backupConfig();

try {
  // Scenario 1: trustProxyHeaders = false, client passes CF-IPCountry with allowed country, but country should be ignored
  runTest("1. trustProxyHeaders = false, headers are ignored", () => {
    writeTestConfig({
      geoAccess: {
        enabled: true,
        allowedCountries: ["US"],
        unknownCountryPolicy: "deny",
        logDeniedRequests: false,
        trustProxyHeaders: false,
        trustedProxyIps: []
      }
    });

    testDetector.setMockCountry(null); // Ensure test mock detector is not returning anything
    const config = getGeoAccessConfig();

    const req = createMockReq({
      "CF-Connecting-IP": "1.1.1.1",
      "CF-IPCountry": "DE"
    }, "/api/projects", "8.8.8.8");

    // Because trustProxyHeaders = false, the resolved user IP must be the direct connection IP.
    const resolvedIp = getUserIp(req, config);
    assert(resolvedIp === "8.8.8.8", `Expected user IP to be connection IP 8.8.8.8, got ${resolvedIp}`);

    // Country must come from the direct IP, not the spoofed DE proxy header.
    const resolvedCountry = detectCountry(resolvedIp, req, config);
    assert(resolvedCountry === "US", `Expected country "US" from direct IP lookup, got ${resolvedCountry}`);
  });

  // Scenario 2: trustProxyHeaders = true, request comes from trusted proxy, CF-IPCountry is accepted
  runTest("2. trustProxyHeaders = true, request from trusted proxy, headers are accepted", () => {
    writeTestConfig({
      geoAccess: {
        enabled: true,
        allowedCountries: ["US"],
        unknownCountryPolicy: "deny",
        logDeniedRequests: false,
        trustProxyHeaders: true,
        trustedProxyIps: ["192.168.1.0/24", "10.0.0.1"]
      }
    });

    testDetector.setMockCountry(null);
    const config = getGeoAccessConfig();

    // Connection IP is "10.0.0.1" which is in trustedProxyIps
    const req = createMockReq({
      "CF-Connecting-IP": "8.8.8.8",
      "CF-IPCountry": "US"
    }, "/api/projects", "10.0.0.1");

    const resolvedIp = getUserIp(req, config);
    assert(resolvedIp === "8.8.8.8", `Expected IP from trusted proxy CF-Connecting-IP "8.8.8.8", got ${resolvedIp}`);

    const resolvedCountry = detectCountry(resolvedIp, req, config);
    assert(resolvedCountry === "US", `Expected country "US" from trusted proxy header, got ${resolvedCountry}`);
  });

  // Scenario 3: trustProxyHeaders = true, request comes NOT from trusted proxy, CF-IPCountry is ignored
  runTest("3. trustProxyHeaders = true, request from untrusted IP, headers are ignored", () => {
    writeTestConfig({
      geoAccess: {
        enabled: true,
        allowedCountries: ["US"],
        unknownCountryPolicy: "deny",
        logDeniedRequests: false,
        trustProxyHeaders: true,
        trustedProxyIps: ["10.0.0.1"]
      }
    });

    testDetector.setMockCountry(null);
    const config = getGeoAccessConfig();

    // Connection IP is "8.8.8.8", which is not trusted
    const req = createMockReq({
      "CF-Connecting-IP": "1.1.1.1",
      "CF-IPCountry": "DE"
    }, "/api/projects", "8.8.8.8");

    const resolvedIp = getUserIp(req, config);
    assert(resolvedIp === "8.8.8.8", `Expected IP to fallback to connection IP "8.8.8.8", got ${resolvedIp}`);

    const resolvedCountry = detectCountry(resolvedIp, req, config);
    assert(resolvedCountry === "US", `Expected country "US" from direct IP lookup, got ${resolvedCountry}`);
  });

  // Scenario 4: X-Forwarded-For is not used if proxy is not trusted
  runTest("4. X-Forwarded-For is ignored if proxy is not trusted", () => {
    writeTestConfig({
      geoAccess: {
        enabled: true,
        allowedCountries: ["US"],
        unknownCountryPolicy: "deny",
        logDeniedRequests: false,
        trustProxyHeaders: true,
        trustedProxyIps: ["10.0.0.1"]
      }
    });

    testDetector.setMockCountry(null);
    const config = getGeoAccessConfig();

    // Connection IP "203.0.113.195" is not trusted
    const req = createMockReq({
      "X-Forwarded-For": "8.8.8.8, 10.0.0.1"
    }, "/api/projects", "203.0.113.195");

    const resolvedIp = getUserIp(req, config);
    assert(resolvedIp === "203.0.113.195", `Expected IP to be untrusted connection IP "203.0.113.195", got ${resolvedIp}`);
  });

  // Scenario 5: When geoAccess.enabled = false, behavior is as before (bypass completely)
  runTest("5. When geoAccess.enabled = false, bypass entirely", () => {
    writeTestConfig({
      geoAccess: {
        enabled: false,
        allowedCountries: ["US"],
        unknownCountryPolicy: "deny",
        logDeniedRequests: false,
        trustProxyHeaders: false,
        trustedProxyIps: []
      }
    });

    const req = createMockReq({}, "/api/projects", "12.34.56.78");
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    // Set mock country to something blocked to verify it's bypassed
    testDetector.setMockCountry("DE");
    geoAccessMiddleware(req, res, next);

    assert(nextCalled, "next() must be called when geoAccess is disabled");
    assert(res.statusCode === 200, "Status should be 200");
  });

  // Scenario 6: When allowedCountries is empty, access is allowed
  runTest("6. When allowedCountries is empty, access is allowed", () => {
    writeTestConfig({
      geoAccess: {
        enabled: true,
        allowedCountries: [],
        unknownCountryPolicy: "deny",
        logDeniedRequests: false,
        trustProxyHeaders: false,
        trustedProxyIps: []
      }
    });

    const req = createMockReq({}, "/api/projects", "12.34.56.78");
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    testDetector.setMockCountry("DE");
    geoAccessMiddleware(req, res, next);

    assert(nextCalled, "next() must be called when allowed countries is empty");
    assert(res.statusCode === 200, "Status should be 200");
  });

  // Scenario 7: Fallback on missing or invalid config file
  runTest("7. Fallback on missing config file", () => {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }

    const config = getGeoAccessConfig();
    assert(config.enabled === false, "Default config should have enabled = false when file is missing");
    assert(config.allowedCountries.length === 0, "Default config allowedCountries should be empty");
    assert(config.unknownCountryPolicy === "allow", "Default unknownCountryPolicy should be allow");
    assert(config.trustProxyHeaders === false, "Default trustProxyHeaders should be false");
  });

  // Scenario 8: CIDR block matching verification
  runTest("8. CIDR range matching checks", () => {
    assert(isIpInCidr("192.168.1.5", "192.168.1.0/24") === true, "192.168.1.5 should match 192.168.1.0/24");
    assert(isIpInCidr("192.168.2.5", "192.168.1.0/24") === false, "192.168.2.5 should NOT match 192.168.1.0/24");
    assert(isIpInCidr("10.0.0.1", "10.0.0.1/32") === true, "10.0.0.1 should match 10.0.0.1/32");
    assert(isIpInCidr("10.0.0.2", "10.0.0.1/32") === false, "10.0.0.2 should NOT match 10.0.0.1/32");
    
    // IP list checking
    assert(isIpTrusted("192.168.1.15", ["10.0.0.1", "192.168.1.0/24"]) === true, "192.168.1.15 should be trusted");
    assert(isIpTrusted("192.168.2.15", ["10.0.0.1", "192.168.1.0/24"]) === false, "192.168.2.15 should NOT be trusted");
  });

  runTest("9. Direct IP lookup has a bundled country database", () => {
    const detector = new GeoIpLiteDetector();
    assert(detector.detect("8.8.8.8") === "US", "8.8.8.8 should resolve to US without proxy headers");
  });

  console.log("\n-----------------------------------------------------------");
  console.log("All geoAccess test cases passed successfully!");
  console.log("-----------------------------------------------------------\n");

} finally {
  restoreConfig();
}
