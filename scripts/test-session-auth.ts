import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { AddressInfo } from "node:net";
import express from "express";
import { installSessionAuth } from "../server/services/sessionAuthService";

const originalPassword = process.env.APP_ACCESS_PASSWORD;
const originalPasswordHash = process.env.APP_ACCESS_PASSWORD_HASH;

function restoreEnvironment(): void {
  if (originalPassword === undefined) {
    delete process.env.APP_ACCESS_PASSWORD;
  } else {
    process.env.APP_ACCESS_PASSWORD = originalPassword;
  }

  if (originalPasswordHash === undefined) {
    delete process.env.APP_ACCESS_PASSWORD_HASH;
  } else {
    process.env.APP_ACCESS_PASSWORD_HASH = originalPasswordHash;
  }
}

async function main(): Promise<void> {
  process.env.APP_ACCESS_PASSWORD = "test-password";
  delete process.env.APP_ACCESS_PASSWORD_HASH;

  let now = 100_000;
  const sessionToken = "a".repeat(64);
  const app = express();
  app.use(express.json());
  installSessionAuth(app, {
    sessionTtlMs: 6_000,
    now: () => now,
    createToken: () => sessionToken
  });

  app.get("/api/protected", (_req, res) => {
    res.json({ success: true });
  });
  app.get("/api/health", (_req, res) => {
    res.sendStatus(204);
  });
  app.post("/api/bitrix/projects/import", (_req, res) => {
    res.sendStatus(202);
  });
  app.get("/api/auth/login/extra", (_req, res) => {
    res.json({ shouldNotBeReached: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    let response = await fetch(`${baseUrl}/api/auth/check`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: false });

    response = await fetch(`${baseUrl}/api/protected`);
    assert.equal(response.status, 401, "protected API routes must reject anonymous requests");
    assert.deepEqual(await response.json(), { success: false, error: "Unauthorized" });

    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 400, "an empty password must be rejected");
    assert.equal(response.headers.get("set-cookie"), null);

    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" })
    });
    assert.equal(response.status, 401, "an incorrect password must be rejected");
    assert.equal(response.headers.get("set-cookie"), null);

    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "  test-password  " })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, authenticated: true });

    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie, "successful login must set a session cookie");
    assert.match(setCookie, new RegExp(`^session=${sessionToken};`));
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=None/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /Max-Age=6(?:;|$)/);
    const cookie = setCookie.split(";")[0];

    response = await fetch(`${baseUrl}/api/auth/check`, {
      headers: { Cookie: cookie }
    });
    assert.deepEqual(await response.json(), { authenticated: true });

    response = await fetch(`${baseUrl}/api/protected`, {
      headers: { Cookie: cookie }
    });
    assert.equal(response.status, 200, "a valid session must unlock protected API routes");

    response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 204, "health checks must remain public");
    response = await fetch(`${baseUrl}/api/bitrix/projects/import`, { method: "POST" });
    assert.equal(response.status, 202, "the ingest route must reach its own authentication");
    response = await fetch(`${baseUrl}/api/auth/login/extra`);
    assert.equal(response.status, 401, "public-route matching must not allow path-prefix bypasses");

    now += 6_000;
    response = await fetch(`${baseUrl}/api/auth/check`, {
      headers: { Cookie: cookie }
    });
    assert.deepEqual(
      await response.json(),
      { authenticated: false },
      "a session must expire exactly at its TTL boundary"
    );
    response = await fetch(`${baseUrl}/api/protected`, {
      headers: { Cookie: cookie }
    });
    assert.equal(response.status, 401, "expired sessions must not authorize API access");

    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-password" })
    });
    assert.equal(response.status, 200);
    response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
    response = await fetch(`${baseUrl}/api/protected`, {
      headers: { Cookie: cookie }
    });
    assert.equal(response.status, 401, "logout must revoke the server-side session");

    process.env.APP_ACCESS_PASSWORD_HASH = crypto
      .createHash("sha256")
      .update("hash-password")
      .digest("hex");
    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-password" })
    });
    assert.equal(response.status, 401, "the configured hash must take priority over plaintext");
    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "hash-password" })
    });
    assert.equal(response.status, 200, "the hash-backed password must authenticate");

    console.log("[SESSION_AUTH_TEST] All session authentication tests passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    restoreEnvironment();
  }
}

main().catch((error) => {
  restoreEnvironment();
  console.error("[SESSION_AUTH_TEST] FAILED");
  console.error(error);
  process.exit(1);
});
