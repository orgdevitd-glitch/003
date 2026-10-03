import assert from "node:assert/strict";
import { parseBitrixImportRequest } from "../server/services/bitrixImportService";

assert.equal(
  parseBitrixImportRequest(undefined),
  null,
  "A request without a parsed JSON body must be rejected without throwing"
);
assert.equal(
  parseBitrixImportRequest(null),
  null,
  "A null request body must be rejected without throwing"
);
assert.equal(
  parseBitrixImportRequest("not-json"),
  null,
  "A non-object request body must be rejected"
);
assert.equal(
  parseBitrixImportRequest({}),
  null,
  "A request without a projects array must be rejected"
);

const projects = [{ projectId: "1", projectName: "Project" }];
const parsed = parseBitrixImportRequest({
  projects,
  syncId: "bitrix-sync-1",
  mode: "full"
});

assert(parsed, "A valid import body must be accepted");
assert.equal(parsed.projects, projects, "The validated projects array must be preserved");
assert.equal(parsed.syncId, "bitrix-sync-1", "A string sync ID must be preserved");
assert.equal(parsed.mode, "full", "A string import mode must be preserved");

const defaults = parseBitrixImportRequest({ projects, syncId: 42, mode: null });
assert(defaults, "Optional malformed metadata must not invalidate a valid projects array");
assert.equal(defaults.syncId, null, "A non-string sync ID must use the route-generated fallback");
assert.equal(defaults.mode, "full", "A non-string mode must default safely");

console.log("Bitrix import boundary rejects missing and malformed request bodies.");
