import express from "express";
import http from "http";
import type { AddressInfo } from "net";
import { installBitrixIngestRoute } from "../server/routes/bitrixIngestRoute";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`[BITRIX_INGEST_TEST] Running: ${name}...`);
  await fn();
  console.log("[BITRIX_INGEST_TEST] ✓ Passed\n");
}

class FakeStorage {
  calls: Array<{ projects: any[]; syncId: string; mode: string }> = [];
  failure: Error | null = null;

  async upsertProjects(projects: any[], syncId: string, mode: string) {
    if (this.failure) throw this.failure;
    this.calls.push({ projects, syncId, mode });
    return {
      success: true,
      syncId,
      receivedProjects: projects.length,
      created: projects.length,
      updated: 0,
      deleted: 0,
      errors: []
    };
  }
}

async function main(): Promise<void> {
  const originalToken = process.env.APP_INGEST_TOKEN;
  const storage = new FakeStorage();
  const app = express();
  app.use(express.json());
  installBitrixIngestRoute(app, storage);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}/api/bitrix/projects/import`;

  const post = async (
    body: unknown,
    authorization?: string
  ): Promise<{ status: number; data: any }> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authorization !== undefined) headers.Authorization = authorization;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  };

  try {
    await runTest("disabled endpoint rejects requests before storage access", async () => {
      delete process.env.APP_INGEST_TOKEN;
      const response = await post({ projects: [] }, "Bearer any-token");
      assert(response.status === 503, `expected 503, got ${response.status}`);
      assert(response.data.error === "Ingest endpoint is not configured", "expected configuration error");
      assert(storage.calls.length === 0, "storage must not be called");
    });

    process.env.APP_INGEST_TOKEN = "ingest-token";

    await runTest("missing and malformed credentials are unauthorized", async () => {
      const missing = await post({ projects: [] });
      assert(missing.status === 401, `expected missing token to return 401, got ${missing.status}`);

      const wrongScheme = await post({ projects: [] }, "Basic ingest-token");
      assert(wrongScheme.status === 401, `expected Basic scheme to return 401, got ${wrongScheme.status}`);

      const emptyBearer = await post({ projects: [] }, 'Bearer ""');
      assert(emptyBearer.status === 401, `expected empty bearer token to return 401, got ${emptyBearer.status}`);
      assert(storage.calls.length === 0, "storage must not be called for malformed credentials");
    });

    await runTest("wrong bearer token is forbidden", async () => {
      const response = await post({ projects: [] }, "Bearer wrong-token");
      assert(response.status === 403, `expected 403, got ${response.status}`);
      assert(response.data.error === "Forbidden", "expected forbidden error");
      assert(storage.calls.length === 0, "storage must not be called for a wrong token");
    });

    await runTest("authorized request validates the projects collection", async () => {
      const response = await post({ projects: "not-an-array" }, "Bearer ingest-token");
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(response.data.error === "projects must be an array", "expected payload validation error");
      assert(storage.calls.length === 0, "storage must not be called for an invalid payload");
    });

    await runTest("quoted environment token permits an authorized incremental write", async () => {
      process.env.APP_INGEST_TOKEN = ' "ingest-token" ';
      const projects = [{ projectId: "B-1", projectName: "Bitrix project" }];
      const response = await post(
        { projects, syncId: "bitrix-regression", mode: "incremental" },
        "Bearer ingest-token"
      );

      assert(response.status === 200, `expected 200, got ${response.status}`);
      assert(response.data.success === true, "expected successful response");
      assert(storage.calls.length === 1, "storage must be called once");
      assert(storage.calls[0].projects[0].projectId === "B-1", "projects must reach storage");
      assert(storage.calls[0].syncId === "bitrix-regression", "sync ID must reach storage");
      assert(storage.calls[0].mode === "incremental", "sync mode must reach storage");
    });

    await runTest("omitted sync fields retain full-sync defaults", async () => {
      process.env.APP_INGEST_TOKEN = "ingest-token";
      const response = await post({ projects: [] }, "bearer ingest-token");

      assert(response.status === 200, `expected 200, got ${response.status}`);
      assert(storage.calls.length === 2, "storage must be called for authorized request");
      assert(storage.calls[1].mode === "full", "default mode must remain full");
      assert(/^sync-\d+$/.test(storage.calls[1].syncId), "default sync ID must be generated");
    });

    await runTest("storage failures return a server error", async () => {
      storage.failure = new Error("write failed");
      const response = await post({ projects: [] }, "Bearer ingest-token");

      assert(response.status === 500, `expected 500, got ${response.status}`);
      assert(response.data.success === false, "failure response must not report success");
      assert(response.data.error === "write failed", "storage error must be returned");
    });
  } finally {
    if (originalToken === undefined) delete process.env.APP_INGEST_TOKEN;
    else process.env.APP_INGEST_TOKEN = originalToken;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  console.log("[BITRIX_INGEST_TEST] All tests passed.");
}

main().catch((error) => {
  console.error("[BITRIX_INGEST_TEST] FAILED");
  console.error(error);
  process.exit(1);
});
