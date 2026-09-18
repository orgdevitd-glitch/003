import fs from "fs-extra";
import path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const appPath = path.join(process.cwd(), "src", "App.tsx");
const source = fs.readFileSync(appPath, "utf8");
const effectStart = source.indexOf("// 2. Fetch Projects only when Authenticated");
const effectEnd = source.indexOf("const handleLogout", effectStart);

assert(effectStart >= 0 && effectEnd > effectStart, "projects-fetch effect must exist");

const fetchEffect = source.slice(effectStart, effectEnd);
const parseResponse = fetchEffect.indexOf("const data = await response.json();");
const cancelledAfterParse = fetchEffect.indexOf("if (cancelled) return;", parseResponse);
const applyResponse = fetchEffect.indexOf("if (data.success)", parseResponse);

assert(
  fetchEffect.includes("const controller = new AbortController();"),
  "each projects fetch must have an abort controller"
);
assert(
  fetchEffect.includes("signal: controller.signal"),
  "the projects request must use the abort signal"
);
assert(
  parseResponse >= 0 && cancelledAfterParse > parseResponse && cancelledAfterParse < applyResponse,
  "a superseded response must be rejected before it updates dashboard state"
);
assert(
  fetchEffect.includes("cancelled = true;") && fetchEffect.includes("controller.abort();"),
  "effect cleanup must invalidate and abort the superseded request"
);
assert(
  fetchEffect.includes("if (!cancelled) {"),
  "a superseded request must not clear the current request's loading state"
);

console.log("App projects-fetch race regression test passed.");
