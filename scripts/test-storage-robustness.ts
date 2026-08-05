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

  await runTest("Full sync replaces only its source and preserves app-owned metadata", async () => {
    const projectsFile = path.join(TEST_DATA_DIR, "projects.json");
    const existingAnalysis = { summary: "Keep this analysis" };
    const otherSourceProject = {
      projectId: "bitrix-kept",
      projectName: "Bitrix project",
      source: "bitrix24",
      createdInAppAt: "2025-01-01T00:00:00.000Z",
      customValue: "must remain unchanged"
    };
    await fs.writeJson(projectsFile, [
      {
        projectId: "sheets-updated",
        projectName: "Old sheets name",
        source: "sheets",
        createdInAppAt: "2025-02-01T00:00:00.000Z",
        updatedInAppAt: "2025-02-02T00:00:00.000Z",
        lastSyncId: "sheets-sync-old",
        lastAnalysis: existingAnalysis
      },
      {
        projectId: "sheets-deleted",
        projectName: "Removed from sheets",
        source: "sheets"
      },
      {
        projectId: "legacy-sheets-deleted",
        projectName: "Legacy project without a source"
      },
      otherSourceProject
    ]);
    await fs.writeJson(path.join(TEST_DATA_DIR, "sync-logs.json"), []);

    const result = await storage.upsertProjects([
      {
        projectId: "sheets-updated",
        projectName: "New sheets name",
        createdInAppAt: "incoming-value-must-not-win",
        lastAnalysis: { summary: "Incoming analysis must not win" }
      } as any,
      {
        projectId: "sheets-created",
        projectName: "New sheets project"
      } as any,
      {
        projectId: "invalid-project-without-name"
      } as any
    ], "sheets-sync-full-regression", "full");

    assert(result.receivedProjects === 3, "Full sync should report every received row");
    assert(result.created === 1, "Full sync should report one created project");
    assert(result.updated === 1, "Full sync should report one updated project");
    assert(result.deleted === 2, "Full sync should delete omitted sheets and legacy sheets projects");
    assert(result.errors.length === 1, "Full sync should report the invalid incoming project");

    const storedProjects: any[] = await storage.getAllProjects();
    assert(storedProjects.length === 3, "Full sync should leave two sheets projects and one Bitrix project");
    assert(!storedProjects.some(project => project.projectId === "sheets-deleted"), "Omitted sheets project should be deleted");
    assert(!storedProjects.some(project => project.projectId === "legacy-sheets-deleted"), "Omitted legacy sheets project should be deleted");

    const updated = storedProjects.find(project => project.projectId === "sheets-updated");
    assert(updated?.projectName === "New sheets name", "Incoming business fields should update");
    assert(updated?.source === "sheets", "Updated project should be attributed to the sync source");
    assert(updated?.lastSyncId === "sheets-sync-full-regression", "Updated project should record the latest sync");
    assert(updated?.createdInAppAt === "2025-02-01T00:00:00.000Z", "Full sync must preserve the original creation timestamp");
    assert(updated?.lastAnalysis?.summary === existingAnalysis.summary, "Full sync must preserve the existing analysis");

    const created = storedProjects.find(project => project.projectId === "sheets-created");
    assert(created?.source === "sheets", "Created project should be attributed to sheets");
    assert(Boolean(created?.createdInAppAt), "Created project should receive an app creation timestamp");
    assert(created?.createdInAppAt === created?.updatedInAppAt, "New project timestamps should be initialized together");

    const preservedOtherSource = storedProjects.find(project => project.projectId === "bitrix-kept");
    assert(
      JSON.stringify(preservedOtherSource) === JSON.stringify(otherSourceProject),
      "A sheets full sync must not mutate or delete a Bitrix project"
    );
  });

  await runTest("Incremental sync updates supplied projects without deleting omitted projects", async () => {
    const projectsFile = path.join(TEST_DATA_DIR, "projects.json");
    await fs.writeJson(projectsFile, [
      {
        projectId: "bitrix-updated",
        projectName: "Old Bitrix name",
        source: "bitrix24",
        createdInAppAt: "2025-03-01T00:00:00.000Z",
        lastAnalysis: { summary: "Preserved incremental analysis" }
      },
      {
        projectId: "bitrix-omitted",
        projectName: "Not included in this batch",
        source: "bitrix24"
      },
      {
        projectId: "sheets-omitted",
        projectName: "Unrelated sheets project",
        source: "sheets"
      }
    ]);
    await fs.writeJson(path.join(TEST_DATA_DIR, "sync-logs.json"), []);

    const result = await storage.upsertProjects([
      {
        projectId: "bitrix-updated",
        projectName: "New Bitrix name"
      } as any
    ], "bitrix-sync-incremental-regression", "incremental");

    assert(result.created === 0, "Incremental sync should not report a creation");
    assert(result.updated === 1, "Incremental sync should report the supplied update");
    assert(result.deleted === 0, "Incremental sync must not report deletions");

    const storedProjects: any[] = await storage.getAllProjects();
    assert(storedProjects.length === 3, "Incremental sync must preserve omitted projects");
    assert(storedProjects.some(project => project.projectId === "bitrix-omitted"), "Omitted same-source project should remain");
    assert(storedProjects.some(project => project.projectId === "sheets-omitted"), "Omitted other-source project should remain");

    const updated = storedProjects.find(project => project.projectId === "bitrix-updated");
    assert(updated?.projectName === "New Bitrix name", "Incremental sync should update incoming business fields");
    assert(updated?.source === "bitrix24", "Incremental update should record the Bitrix source");
    assert(updated?.createdInAppAt === "2025-03-01T00:00:00.000Z", "Incremental sync must preserve the creation timestamp");
    assert(
      updated?.lastAnalysis?.summary === "Preserved incremental analysis",
      "Incremental sync must preserve the existing analysis"
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
