import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

async function getAvailablePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForServer(url: string, output: () => string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Development server did not start.\n${output()}`);
}

async function main() {
  const port = await getAvailablePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "dev-server-data-isolation-"));
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  let output = "";
  const child = spawn(tsxPath, ["server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "development",
      DATA_DIR: dataDir,
      GOOGLE_SHEETS_INDICATOR_DICTIONARY_CSV_URL: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", chunk => { output += chunk.toString(); });
  child.stderr.on("data", chunk => { output += chunk.toString(); });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl, () => output);

    for (const requestPath of [
      "/data/normalized-projects.json",
      "/data/project-evaluations.json",
      "/data/analysis-results.json",
      "/@fs/" + path.join(process.cwd(), "data", "normalized-projects.json").replace(/^\/+/, "")
    ]) {
      const response = await fetch(baseUrl + requestPath);
      assert.equal(response.status, 403, `${requestPath} must not expose repository data`);
    }

    assert.equal((await fetch(baseUrl)).status, 200, "Vite application must remain available");
    assert.equal((await fetch(`${baseUrl}/api/projects`)).status, 401, "API authentication must remain enforced");
    console.log("✅ Development server blocks unauthenticated repository data files");
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => undefined);
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
