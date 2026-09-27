import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  NormalizedProject,
  toPublicNormalizedProject
} from "../server/services/projectNormalizer";

const internalProject = {
  id: "project-1",
  projectId: "project-1",
  source: {
    detectedYears: [2026],
    rawRow: {
      ID: "project-1",
      Название: "Visible project",
      "Private helper column": "must-not-cross-api-boundary"
    }
  }
} as unknown as NormalizedProject;

const publicProject = toPublicNormalizedProject(internalProject);

assert.equal(
  Object.prototype.hasOwnProperty.call(publicProject.source, "rawRow"),
  false,
  "public normalized projects must omit the raw spreadsheet row"
);
assert.equal(
  JSON.stringify(publicProject).includes("must-not-cross-api-boundary"),
  false,
  "unknown spreadsheet values must not be serialized into API responses"
);
assert.equal(
  internalProject.source.rawRow["Private helper column"],
  "must-not-cross-api-boundary",
  "the projection must not mutate server-side import provenance"
);

const serverSource = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
assert.match(
  serverSource,
  /normalizedProjects:\s*[^,\n]*\.map\(toPublicNormalizedProject\)/,
  "the projects endpoint must apply the public projection before serialization"
);

console.log("Project API projection excludes raw spreadsheet columns.");
