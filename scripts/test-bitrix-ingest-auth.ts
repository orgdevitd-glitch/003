import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "fs-extra";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bitrix-ingest-auth-"));

async function reservePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

const port = await reservePort();
const serverProcess = spawn(
  process.execPath,
  [path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs"), "server.ts"],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      DATA_DIR: dataDir,
      APP_INGEST_TOKEN: "integration-test-token",
      GOOGLE_SHEETS_CSV_URL: "",
      GOOGLE_SHEET_CSV_URL: "",
      GOOGLE_SHEETS_INDICATOR_DICTIONARY_CSV_URL: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let serverOutput = "";
serverProcess.stdout.on("data", chunk => {
  serverOutput += chunk.toString();
});
serverProcess.stderr.on("data", chunk => {
  serverOutput += chunk.toString();
});

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!serverOutput.includes("Server running")) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Server exited before startup:\n${serverOutput}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for server startup:\n${serverOutput}`);
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function requestWithoutSendingLargeBody(): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let response = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Unauthenticated ingest waited for the declared body instead of rejecting immediately"));
    }, 1_000);

    socket.on("connect", () => {
      socket.write([
        "POST /api/bitrix/projects/import HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        "Content-Type: application/json",
        `Content-Length: ${45 * 1024 * 1024}`,
        "Connection: close",
        "",
        ""
      ].join("\r\n"));
    });

    socket.on("data", chunk => {
      response += chunk.toString();
      if (response.includes("\r\n\r\n")) {
        clearTimeout(timeout);
        socket.destroy();
        resolve(response);
      }
    });
    socket.on("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

try {
  await waitForServer();
  const response = await requestWithoutSendingLargeBody();
  assert.match(response, /^HTTP\/1\.1 401 /, "Missing ingest credentials must be rejected before body parsing");

  const authorizedResponse = await fetch(`http://127.0.0.1:${port}/api/bitrix/projects/import`, {
    method: "POST",
    headers: {
      "Authorization": "Bearer integration-test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      mode: "incremental",
      projects: [{ projectId: "auth-test", projectName: "Authorized import" }]
    })
  });
  const authorizedBody = await authorizedResponse.json() as { success?: boolean };
  assert.equal(authorizedResponse.status, 200, "Valid ingest credentials must still reach the JSON route");
  assert.equal(authorizedBody.success, true, "Valid ingest payload must still be imported");

  console.log("Bitrix ingest rejects unauthorized large requests before reading their bodies.");
} finally {
  serverProcess.kill("SIGTERM");
  await new Promise<void>(resolve => {
    if (serverProcess.exitCode !== null) return resolve();
    serverProcess.once("exit", () => resolve());
  });
  await fs.remove(dataDir);
}
