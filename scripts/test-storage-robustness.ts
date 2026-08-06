import path from "path";
import fs from "fs-extra";

const TEST_DATA_DIR = path.join(process.cwd(), "data-test-temp");
process.env.DATA_DIR = TEST_DATA_DIR;

async function runTest(name: string, fn: () => Promise<void>) {
  console.log(`[STORAGE_TEST] Running: ${name}...`);
  try {
    await fn();
    console.log(`[STORAGE_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[STORAGE_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function main() {
  // Ensure we start with a clean test directory
  await fs.remove(TEST_DATA_DIR);

  // Dynamically import to ensure process.env.DATA_DIR is set beforehand
  const { JsonProjectStorage } = await import("../server/storage/jsonProjectStorage");
  const storage = new JsonProjectStorage();

  await runTest("Initial file creation works and defaults are correct", async () => {
    const projects = await storage.getAllProjects();
    assert(Array.isArray(projects) && projects.length === 0, "Projects should default to []");

    const logs = await storage.getSyncLogs();
    assert(Array.isArray(logs) && logs.length === 0, "Logs should default to []");

    const projectsFileExists = await fs.pathExists(path.join(TEST_DATA_DIR, "projects.json"));
    assert(projectsFileExists, "projects.json should exist");
  });

  await runTest("Corrupt project JSON is preserved for recovery", async () => {
    const projectsFile = path.join(TEST_DATA_DIR, "projects.json");
    const corruptedContent = "{ corrupt_json: ";
    await fs.writeFile(projectsFile, corruptedContent);

    let threw = false;
    try {
      await storage.getAllProjects();
    } catch {
      threw = true;
    }
    assert(threw, "Corrupted authoritative project data should fail closed");

    const content = await fs.readFile(projectsFile, "utf8");
    assert(content === corruptedContent, "Corrupted project data must remain available for recovery");
  });

  await runTest("Empty project JSON is preserved for recovery", async () => {
    const projectsFile = path.join(TEST_DATA_DIR, "projects.json");
    await fs.writeFile(projectsFile, "   ");

    let threw = false;
    try {
      await storage.getAllProjects();
    } catch {
      threw = true;
    }
    assert(threw, "Empty authoritative project data should fail closed");

    const content = await fs.readFile(projectsFile, "utf8");
    assert(content === "   ", "Empty project data must not be replaced with an empty dataset");
  });

  await runTest("Missing JSON file auto-creation on read", async () => {
    const projectsFile = path.join(TEST_DATA_DIR, "projects.json");
    await fs.remove(projectsFile);

    // Read and expect recovery
    const projects = await storage.getAllProjects();
    assert(Array.isArray(projects) && projects.length === 0, "Deleted file should fall back to []");

    const projectsFileExists = await fs.pathExists(projectsFile);
    assert(projectsFileExists, "projects.json should have been recreated");
  });

  await runTest("Concurrent incremental imports preserve both updates", async () => {
    const buildProject = (projectId: string, projectName: string) => ({
      projectId,
      projectName,
      status: "active" as const,
      tasks: [],
      milestones: [],
      indicators: []
    });

    await Promise.all([
      storage.upsertProjects([buildProject("concurrent-a", "Concurrent A")], "bitrix-a", "incremental"),
      storage.upsertProjects([buildProject("concurrent-b", "Concurrent B")], "bitrix-b", "incremental")
    ]);

    const projects = await storage.getAllProjects();
    assert(
      projects.some(project => project.projectId === "concurrent-a"),
      "The first concurrent import must not be overwritten"
    );
    assert(
      projects.some(project => project.projectId === "concurrent-b"),
      "The second concurrent import must not be overwritten"
    );
  });

  await runTest("Write error propagation in safeWriteJson", async () => {
    const originalWriteJson = fs.writeJson;
    try {
      (fs as any).writeJson = async () => {
        throw new Error("Simulated Disk Full / Write Error");
      };

      let threw = false;
      try {
        await storage.saveSheetsSyncMeta({ test: "data" });
      } catch (e: any) {
        if (e.message === "Simulated Disk Full / Write Error") {
          threw = true;
        }
      }
      assert(threw, "Expected saveSheetsSyncMeta to throw write error when fs.writeJson fails");
    } finally {
      (fs as any).writeJson = originalWriteJson;
    }
  });

  await runTest("Atomic replacement failure preserves last-known-good data", async () => {
    const metaFile = path.join(TEST_DATA_DIR, "sheets-sync-meta.json");
    const originalRename = fs.rename;
    const previousMeta = { marker: "last-known-good" };
    await storage.saveSheetsSyncMeta(previousMeta);

    try {
      (fs as any).rename = async () => {
        throw new Error("Simulated interrupted atomic replacement");
      };

      let threw = false;
      try {
        await storage.saveSheetsSyncMeta({ marker: "new-data" });
      } catch (e: any) {
        if (e.message === "Simulated interrupted atomic replacement") {
          threw = true;
        }
      }
      assert(threw, "Expected atomic replacement failure to propagate");

      const persistedMeta = await fs.readJson(metaFile);
      assert(
        persistedMeta.marker === previousMeta.marker,
        "Interrupted replacement must preserve the previous complete file"
      );
    } finally {
      (fs as any).rename = originalRename;
    }
  });

  await runTest("Initialization error propagation in ensureDataDir", async () => {
    const originalEnsureDir = fs.ensureDir;
    try {
      (fs as any).ensureDir = async () => {
        throw new Error("Simulated Dir Creation Failure");
      };

      // Create a new instance, which will call ensureDataDir
      const badStorage = new JsonProjectStorage();
      let threw = false;
      try {
        // Any read should wait on initPromise which is rejected
        await badStorage.getAllProjects();
      } catch (e: any) {
        if (e.message === "Simulated Dir Creation Failure") {
          threw = true;
        }
      }
      assert(threw, "Expected getAllProjects to throw when ensureDataDir failed");
    } finally {
      (fs as any).ensureDir = originalEnsureDir;
    }
  });

  await runTest("Recovery write failure in safeReadJson is propagated", async () => {
    const originalWriteJson = fs.writeJson;
    const syncLogsFile = path.join(TEST_DATA_DIR, "sync-logs.json");
    // Non-authoritative diagnostics may reset, but reset failures must propagate.
    await fs.writeFile(syncLogsFile, "   ");

    try {
      // Mock writeJson to fail
      (fs as any).writeJson = async () => {
        throw new Error("Simulated Write Error during recovery");
      };

      let threw = false;
      try {
        await storage.getSyncLogs();
      } catch (e: any) {
        if (e.message === "Simulated Write Error during recovery") {
          threw = true;
        }
      }
      assert(threw, "Expected getAllProjects to propagate the error when write of default value fails");
    } finally {
      (fs as any).writeJson = originalWriteJson;
    }
  });

  // Clean up test directory at the end
  try {
    await fs.remove(TEST_DATA_DIR);
    console.log("Cleanup of test-data-dir completed successfully.");
  } catch (err) {
    console.error("Cleanup error:", err);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
