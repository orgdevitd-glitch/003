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

  await runTest("Corrupt JSON self-recovery", async () => {
    const projectsFile = path.join(TEST_DATA_DIR, "projects.json");
    // Write corrupted text
    await fs.writeFile(projectsFile, "{ corrupt_json: ");

    // Read and expect recovery
    const projects = await storage.getAllProjects();
    assert(Array.isArray(projects) && projects.length === 0, "Corrupted file should fall back to []");

    // File should be rewritten with valid json []
    const content = await fs.readFile(projectsFile, "utf8");
    assert(content.trim() === "[]", "File should have been rewritten with the default array []");
  });

  await runTest("Empty JSON file self-recovery", async () => {
    const projectsFile = path.join(TEST_DATA_DIR, "projects.json");
    // Write empty file
    await fs.writeFile(projectsFile, "   ");

    // Read and expect recovery
    const projects = await storage.getAllProjects();
    assert(Array.isArray(projects) && projects.length === 0, "Empty file should fall back to []");

    // File should be rewritten with valid json []
    const content = await fs.readFile(projectsFile, "utf8");
    assert(content.trim() === "[]", "Empty file should have been rewritten with the default array []");
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
    const projectsFile = path.join(TEST_DATA_DIR, "projects.json");
    // Write empty file to trigger recovery
    await fs.writeFile(projectsFile, "   ");

    try {
      // Mock writeJson to fail
      (fs as any).writeJson = async () => {
        throw new Error("Simulated Write Error during recovery");
      };

      let threw = false;
      try {
        await storage.getAllProjects();
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
