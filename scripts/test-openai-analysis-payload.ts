import assert from "node:assert/strict";
import { buildOpenAIProjectData } from "../server/services/openaiAnalysisService";

const privateValue = "must-not-leave-the-application";
const input = {
  assessmentDate: "2026-10-01",
  analysisPayload: {
    assistantEvidenceBrief: "Curated evidence"
  },
  project: {
    projectId: "project-1",
    privateNotes: privateValue,
    integrationCredential: privateValue
  }
} as any;

const projectData = buildOpenAIProjectData(input);
const serialized = JSON.stringify(projectData);

assert.deepEqual(
  Object.keys(projectData).sort(),
  ["analysisPayload", "assessmentDate", "assistantEvidenceBrief"].sort(),
  "Only curated analysis fields may be sent to OpenAI"
);
assert.equal(
  Object.prototype.hasOwnProperty.call(projectData, "project"),
  false,
  "The stored project object must not cross the OpenAI boundary"
);
assert.equal(
  serialized.includes(privateValue),
  false,
  "Unknown fields accepted from project ingest must not be serialized to OpenAI"
);
assert.equal(
  projectData.assistantEvidenceBrief,
  input.analysisPayload.assistantEvidenceBrief,
  "The curated evidence brief should remain available to the assistant"
);

console.log("OpenAI analysis payload excludes uncurated project fields.");
