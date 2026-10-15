import { 
  getAdvancedAccessConfig, 
  verifyAdvancedAccessPassword, 
  hashAdvancedPassword,
  isAdvancedAccessActive,
  createAdvancedAccessSession,
  revokeAdvancedAccessSession,
  resolveAnalysisAssessmentDate
} from "../server/services/advancedAccessService";
import fs from "fs-extra";
import path from "path";
import express from "express";
import http from "http";
import { AddressInfo } from "net";

function runTest(name: string, fn: () => void) {
  console.log(`[ADVANCED_ACCESS_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[ADVANCED_ACCESS_TEST] ✓ Passed\n`);
  } catch (error: any) {
    console.error(`[ADVANCED_ACCESS_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

async function runTestAsync(name: string, fn: () => Promise<void>) {
  console.log(`[ADVANCED_ACCESS_TEST] Running: ${name}...`);
  try {
    await fn();
    console.log(`[ADVANCED_ACCESS_TEST] ✓ Passed\n`);
  } catch (error: any) {
    console.error(`[ADVANCED_ACCESS_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
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

// Ensure clean environment for testing env vars
const origEnvHash = process.env.ADVANCED_ACCESS_PASSWORD_HASH;
const origEnvPwd = process.env.ADVANCED_ACCESS_PASSWORD;

function clearEnv() {
  delete process.env.ADVANCED_ACCESS_PASSWORD_HASH;
  delete process.env.ADVANCED_ACCESS_PASSWORD;
}

function restoreEnv() {
  if (origEnvHash !== undefined) process.env.ADVANCED_ACCESS_PASSWORD_HASH = origEnvHash;
  if (origEnvPwd !== undefined) process.env.ADVANCED_ACCESS_PASSWORD = origEnvPwd;
}

// Main Runner Function to allow async execution
async function main() {
  backupConfig();
  clearEnv();

  try {
    // Test Case 1: Config loading with empty file
    runTest("1. Empty or missing config loads default settings", () => {
      if (fs.existsSync(CONFIG_PATH)) {
        fs.unlinkSync(CONFIG_PATH);
      }
      const config = getAdvancedAccessConfig();
      assert(config.enabled === true, "Default should be enabled");
      assert(config.displayName === "Код расширенного доступа", "Default display name must match");
      assert(config.protectedActions.includes("assessmentDateChange"), "Should include default protected actions");
      assert(config.protectedActions.includes("syncData"), "Should include default protected actions");
    });

    // Test Case 2: Config loading with valid JSON fields
    runTest("2. Loads valid advanced access properties from JSON", () => {
      writeTestConfig({
        advancedAccess: {
          enabled: true,
          displayName: "Пароль суперадмина",
          passwordHash: hashAdvancedPassword("my-secret-token"),
          ttlMinutes: 15,
          protectedActions: ["syncData", "exportPdf"]
        }
      });

      const config = getAdvancedAccessConfig();
      assert(config.enabled === true, "Should load enabled state");
      assert(config.displayName === "Пароль суперадмина", "Should load custom displayName");
      assert(config.ttlMinutes === 15, "Should load custom ttlMinutes");
      assert(config.protectedActions.length === 2, "Should load custom protectedActions list");
      assert(config.protectedActions.includes("exportPdf"), "Should contain exportPdf");
    });

    // Test Case 3: Verify password hash from config file
    runTest("3. Correct password matches config passwordHash", () => {
      writeTestConfig({
        advancedAccess: {
          enabled: true,
          displayName: "Код расширенного доступа",
          passwordHash: hashAdvancedPassword("secret-123"),
          ttlMinutes: 60,
          protectedActions: ["syncData"]
        }
      });

      assert(verifyAdvancedAccessPassword("secret-123") === true, "Correct password must verify successfully");
      assert(verifyAdvancedAccessPassword("secret-123 ") === true, "Trimming should allow same word with spaces");
      assert(verifyAdvancedAccessPassword("wrong-secret") === false, "Incorrect password must fail");
    });

    // Test Case 4: Verify plaintext env variable priority
    runTest("4. Plaintext environment variable overrides config file password", () => {
      writeTestConfig({
        advancedAccess: {
          enabled: true,
          displayName: "Код",
          passwordHash: hashAdvancedPassword("file-secret"),
          ttlMinutes: 60,
          protectedActions: ["syncData"]
        }
      });

      process.env.ADVANCED_ACCESS_PASSWORD = "env-secret";

      assert(verifyAdvancedAccessPassword("env-secret") === true, "Should verify using environment plaintext secret");
      assert(verifyAdvancedAccessPassword("file-secret") === false, "Config file password should be overridden by env variable");
      
      delete process.env.ADVANCED_ACCESS_PASSWORD;
    });

    // Test Case 5: Verify hashed env variable priority
    runTest("5. Hashed environment variable takes top priority", () => {
      writeTestConfig({
        advancedAccess: {
          enabled: true,
          displayName: "Код",
          passwordHash: hashAdvancedPassword("file-secret"),
          ttlMinutes: 60,
          protectedActions: ["syncData"]
        }
      });

      process.env.ADVANCED_ACCESS_PASSWORD = "env-secret-plain";
      process.env.ADVANCED_ACCESS_PASSWORD_HASH = hashAdvancedPassword("env-secret-hash");

      assert(verifyAdvancedAccessPassword("env-secret-hash") === true, "Hashed env variable must take highest priority");
      assert(verifyAdvancedAccessPassword("env-secret-plain") === false, "Plaintext env should be bypassed when hashed env is provided");
      assert(verifyAdvancedAccessPassword("file-secret") === false, "Config file password should be ignored");

      delete process.env.ADVANCED_ACCESS_PASSWORD;
      delete process.env.ADVANCED_ACCESS_PASSWORD_HASH;
    });

    runTest("6. Today analysis mode ignores a supplied arbitrary date", () => {
      const now = new Date("2026-08-06T11:00:00.000Z");
      const result = resolveAnalysisAssessmentDate(
        "2020-01-01T00:00:00.000Z",
        "today",
        now
      );

      assert(result.assessmentDateMode === "today", "Today mode must remain explicit");
      assert(
        result.assessmentDate.toISOString() === now.toISOString(),
        "Today mode must use the server date instead of a client-supplied date"
      );
    });

    runTest("7. Custom analysis dates remain subject to advanced access", () => {
      const result = resolveAnalysisAssessmentDate(
        "2020-01-01T00:00:00.000Z",
        "custom",
        new Date("2026-08-06T11:00:00.000Z")
      );

      assert(result.assessmentDateMode === "custom", "A valid custom date must be marked custom");
      assert(
        result.assessmentDate.toISOString() === "2020-01-01T00:00:00.000Z",
        "Custom mode must preserve its requested date for the authorization gate"
      );
    });

    // --- Server-Side Integration Tests ---
    console.log("-----------------------------------------------------------");
    console.log("Starting Server-Side Integration Tests...");
    console.log("-----------------------------------------------------------\n");

    // Enable advanced access config for integration tests
    writeTestConfig({
      advancedAccess: {
        enabled: true,
        displayName: "Код расширенного доступа",
        passwordHash: hashAdvancedPassword("correct-password"),
        ttlMinutes: 60,
        protectedActions: ["syncData", "assessmentDateChange"]
      }
    });

    const testApp = express();
    testApp.use(express.json());

    // Define endpoints exactly mimicking server.ts logic
    testApp.post("/api/advanced-access/verify", (req, res) => {
      try {
        const { password } = req.body;
        if (!password) {
          return res.status(400).json({ success: false, error: "Код обязателен к заполнению" });
        }
        if (verifyAdvancedAccessPassword(password)) {
          createAdvancedAccessSession(res);
          return res.json({ success: true });
        } else {
          return res.status(401).json({ success: false, error: "Неверный код доступа" });
        }
      } catch (error: any) {
        return res.status(500).json({ success: false, error: "Внутренняя ошибка сервера" });
      }
    });

    testApp.get("/api/advanced-access/status", (req, res) => {
      try {
        const active = isAdvancedAccessActive(req);
        return res.json({ success: true, active });
      } catch (error: any) {
        return res.status(401).json({ success: false, error: "Ошибка при получении статуса" });
      }
    });

    testApp.post("/api/advanced-access/revoke", (req, res) => {
      try {
        revokeAdvancedAccessSession(req, res);
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(401).json({ success: false, error: "Ошибка при отзыве сессии" });
      }
    });

    testApp.get("/api/projects", (req, res) => {
      const assessmentModeQuery = req.query.assessmentMode;

      if (assessmentModeQuery === 'custom') {
        if (!isAdvancedAccessActive(req)) {
          return res.status(403).json({ success: false, error: "Требуется код расширенного доступа для выбора произвольной даты оценки" });
        }
      } else if (assessmentModeQuery === 'today') {
        // Safe, ignore
      } else {
        // Backward compatibility fallback
        if (req.query.assessmentDate && typeof req.query.assessmentDate === 'string') {
          const reqDateStr = req.query.assessmentDate.trim();
          const serverToday = new Date().toISOString().split("T")[0];
          
          const localD = new Date();
          const localYear = localD.getFullYear();
          const localMonth = String(localD.getMonth() + 1).padStart(2, '0');
          const localDay = String(localD.getDate()).padStart(2, '0');
          const localTodayStr = `${localYear}-${localMonth}-${localDay}`;
          
          const isToday = reqDateStr === serverToday || reqDateStr === localTodayStr;
          if (!isToday) {
            if (!isAdvancedAccessActive(req)) {
              return res.status(403).json({ success: false, error: "Требуется код расширенного доступа для выбора произвольной даты оценки" });
            }
          }
        }
      }

      const isSyncRequested = req.query.sync === "true";
      if (isSyncRequested && !isAdvancedAccessActive(req)) {
        return res.status(403).json({ success: false, error: "Требуется код расширенного доступа для ручной синхронизации" });
      }

      return res.json({ success: true, projects: [] });
    });

    // Start server on an ephemeral random port
    const testServer = http.createServer(testApp);
    await new Promise<void>((resolve) => testServer.listen(0, resolve));
    const address = testServer.address() as AddressInfo;
    const port = address.port;
    const baseUrl = `http://localhost:${port}`;
    console.log(`[ADVANCED_ACCESS_TEST] Temporary integration test server started on port ${port}\n`);

    try {
      let savedCookie = "";

      // 1. POST /api/advanced-access/verify с правильным паролем создает httpOnly cookie advanced_access_session
      await runTestAsync("Server 1. POST /api/advanced-access/verify with correct password sets cookie", async () => {
        const res = await fetch(`${baseUrl}/api/advanced-access/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "correct-password" })
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const data = await res.json();
        assert(data.success === true, "Verification should succeed");

        const setCookie = res.headers.get("set-cookie");
        assert(!!setCookie, "Set-Cookie header should be present");
        assert(setCookie.includes("advanced_access_session="), "Cookie should contain advanced_access_session");
        assert(setCookie.includes("HttpOnly"), "Cookie should be HttpOnly");
        savedCookie = setCookie;
      });

      // 2. GET /api/advanced-access/status без cookie возвращает active false
      await runTestAsync("Server 2. GET /api/advanced-access/status without cookie returns active false", async () => {
        const res = await fetch(`${baseUrl}/api/advanced-access/status`);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const data = await res.json();
        assert(data.success === true, "Request should succeed");
        assert(data.active === false, "Status should be inactive");
      });

      // 3. GET /api/advanced-access/status с валидной cookie возвращает active true
      await runTestAsync("Server 3. GET /api/advanced-access/status with valid cookie returns active true", async () => {
        const res = await fetch(`${baseUrl}/api/advanced-access/status`, {
          headers: { "Cookie": savedCookie }
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const data = await res.json();
        assert(data.success === true, "Request should succeed");
        assert(data.active === true, "Status should be active");
      });

      // 4. POST /api/advanced-access/revoke сбрасывает сессию и очищает cookie
      await runTestAsync("Server 4. POST /api/advanced-access/revoke resets session and clears cookie", async () => {
        const revokeRes = await fetch(`${baseUrl}/api/advanced-access/revoke`, {
          method: "POST",
          headers: { "Cookie": savedCookie }
        });
        assert(revokeRes.status === 200, `Expected 200, got ${revokeRes.status}`);
        const revokeData = await revokeRes.json();
        assert(revokeData.success === true, "Revocation should succeed");

        const setCookie = revokeRes.headers.get("set-cookie");
        assert(!!setCookie, "Set-Cookie header should be returned");
        assert(setCookie.includes("Max-Age=0"), "Cookie should be cleared with Max-Age=0");

        // Check status again with the revoked cookie
        const statusRes = await fetch(`${baseUrl}/api/advanced-access/status`, {
          headers: { "Cookie": savedCookie }
        });
        const statusData = await statusRes.json();
        assert(statusData.active === false, "Status should be inactive after revocation");
      });

      // 5. После истечения TTL status возвращает active false
      await runTestAsync("Server 5. After TTL expires, status returns active false", async () => {
        // Re-login to get a new cookie
        const verifyRes = await fetch(`${baseUrl}/api/advanced-access/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "correct-password" })
        });
        const cookie = verifyRes.headers.get("set-cookie") || "";
        assert(!!cookie, "Cookie must be set on re-login");

        // Verify currently active
        const statusRes1 = await fetch(`${baseUrl}/api/advanced-access/status`, {
          headers: { "Cookie": cookie }
        });
        const statusData1 = await statusRes1.json();
        assert(statusData1.active === true, "Should be active initially");

        // Mock Date.now to simulate time passing (e.g., 2 hours later)
        const originalDateNow = Date.now;
        Date.now = () => originalDateNow() + (120 * 60 * 1000);

        try {
          const statusRes2 = await fetch(`${baseUrl}/api/advanced-access/status`, {
            headers: { "Cookie": cookie }
          });
          const statusData2 = await statusRes2.json();
          assert(statusData2.active === false, "Should be inactive after TTL expiration");
        } finally {
          Date.now = originalDateNow;
        }
      });

      // 6. GET /api/projects без sync=true работает без advanced access
      await runTestAsync("Server 6. GET /api/projects without sync=true works without advanced access", async () => {
        const res = await fetch(`${baseUrl}/api/projects`);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const data = await res.json();
        assert(data.success === true, "Projects list should load");
      });

      // 7. GET /api/projects?sync=true без advanced access возвращает 403
      await runTestAsync("Server 7. GET /api/projects?sync=true without advanced access returns 403", async () => {
        const res = await fetch(`${baseUrl}/api/projects?sync=true`);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
        const data = await res.json();
        assert(data.success === false, "Should fail");
        assert(data.error.includes("расширенного доступа"), "Error message should mention advanced access");
      });

      // 8. GET /api/projects?sync=true с active advanced access выполняется
      await runTestAsync("Server 8. GET /api/projects?sync=true with active advanced access executes", async () => {
        const verifyRes = await fetch(`${baseUrl}/api/advanced-access/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "correct-password" })
        });
        const cookie = verifyRes.headers.get("set-cookie") || "";

        const res = await fetch(`${baseUrl}/api/projects?sync=true`, {
          headers: { "Cookie": cookie }
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const data = await res.json();
        assert(data.success === true, "Sync with advanced access should execute");
      });

      // 9. GET /api/projects с custom assessmentDate без advanced access возвращает 403
      await runTestAsync("Server 9. GET /api/projects with custom assessmentDate without advanced access returns 403", async () => {
        const res = await fetch(`${baseUrl}/api/projects?assessmentDate=2025-12-31`);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
        const data = await res.json();
        assert(data.success === false, "Should fail");
        assert(data.error.includes("произвольной даты"), "Error message should mention arbitrary date");
      });

      // 10. GET /api/projects с custom assessmentDate с active advanced access выполняется
      await runTestAsync("Server 10. GET /api/projects with custom assessmentDate with active advanced access executes", async () => {
        const verifyRes = await fetch(`${baseUrl}/api/advanced-access/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "correct-password" })
        });
        const cookie = verifyRes.headers.get("set-cookie") || "";

        const res = await fetch(`${baseUrl}/api/projects?assessmentDate=2025-12-31`, {
          headers: { "Cookie": cookie }
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const data = await res.json();
        assert(data.success === true, "Custom date assessment should execute");
      });

      // 10b. GET /api/projects?assessmentMode=custom&assessmentDate=... без advanced access возвращает 403
      await runTestAsync("Server 10b. GET /api/projects?assessmentMode=custom&assessmentDate=2025-12-31 without advanced access returns 403", async () => {
        const res = await fetch(`${baseUrl}/api/projects?assessmentMode=custom&assessmentDate=2025-12-31`);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
        const data = await res.json();
        assert(data.success === false, "Should fail");
      });

      // 10c. GET /api/projects?assessmentMode=today&assessmentDate=... без advanced access возвращает 200 (игнорирует assessmentDate)
      await runTestAsync("Server 10c. GET /api/projects?assessmentMode=today&assessmentDate=2025-12-31 without advanced access returns 200", async () => {
        const res = await fetch(`${baseUrl}/api/projects?assessmentMode=today&assessmentDate=2025-12-31`);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const data = await res.json();
        assert(data.success === true, "Should succeed as assessmentDate is ignored under mode today");
      });

      // 11. localStorage не должен давать серверный advanced access
      await runTestAsync("Server 11. localStorage should not bypass server-side security", async () => {
        // Simulating a request where local storage was verified, but no cookie is sent
        // The server should reject the sync request because localStorage doesn't exist on the server
        const res = await fetch(`${baseUrl}/api/projects?sync=true`, {
          headers: {
            "X-LocalStorage-Bypass": "true" // completely ignored by server
          }
        });
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      });

      // 12. ADVANCED_ACCESS_PASSWORD=321 должен работать только через env, без записи 321 в код или config
      await runTestAsync("Server 12. ADVANCED_ACCESS_PASSWORD=321 works only via env and is not hardcoded", async () => {
        // First, confirm that 321 is not hardcoded anywhere in the codebase
        const serviceFileContent = fs.readFileSync(path.join(process.cwd(), "server", "services", "advancedAccessService.ts"), "utf8");
        const serverFileContent = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
        
        assert(!serviceFileContent.includes('"321"'), "advancedAccessService.ts must not contain 321 password");
        assert(!serverFileContent.includes('"321"'), "server.ts must not contain 321 password");
        
        if (originalConfigContent) {
          assert(!originalConfigContent.includes("321"), "original config must not contain 321 password");
        }

        // Now test the env variable override functionality
        process.env.ADVANCED_ACCESS_PASSWORD = "321";
        
        try {
          const verifyRes = await fetch(`${baseUrl}/api/advanced-access/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "321" })
          });
          assert(verifyRes.status === 200, `Expected 200 for 321 verification, got ${verifyRes.status}`);
          const data = await verifyRes.json();
          assert(data.success === true, "321 should verify successfully through environment variable");
          
          // Also verify that previous password now fails since env has top priority
          const verifyOldRes = await fetch(`${baseUrl}/api/advanced-access/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "correct-password" })
          });
          assert(verifyOldRes.status === 401, `Expected 401 for old password, got ${verifyOldRes.status}`);
        } finally {
          delete process.env.ADVANCED_ACCESS_PASSWORD;
        }
      });

    } finally {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
      console.log(`[ADVANCED_ACCESS_TEST] Temporary test server stopped.`);
    }

    console.log("\n-----------------------------------------------------------");
    console.log("All advancedAccess test cases passed successfully!");
    console.log("-----------------------------------------------------------\n");

  } finally {
    restoreConfig();
    restoreEnv();
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
