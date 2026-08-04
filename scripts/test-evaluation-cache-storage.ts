import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-cache-storage-"));
process.env.DATA_DIR = dataDir;

try {
  const savedAnalysis = {
    projectId: "project-1",
    analysis: "Persisted AI analysis",
    createdAt: "2026-08-04T10:00:00.000Z"
  };
  const storedProject = {
    projectId: "project-1",
    projectName: "Critical project",
    lastAnalysis: savedAnalysis
  };
  const derivedProject = {
    projectId: "project-1",
    projectName: "Critical project"
  };

  await fs.writeJson(path.join(dataDir, "projects.json"), [storedProject]);

  const { saveEvaluationsToDisk } = await import("../server/services/googleSheetsService");
  await saveEvaluationsToDisk([derivedProject] as any, new Date("2026-08-04T00:00:00.000Z"));

  const projects = await fs.readJson(path.join(dataDir, "projects.json"));
  assert.deepEqual(
    projects,
    [storedProject],
    "Evaluation cache writes must not overwrite authoritative projects or remove lastAnalysis"
  );

  console.log("Evaluation cache storage regression test passed.");
} finally {
  await fs.remove(dataDir);
}
