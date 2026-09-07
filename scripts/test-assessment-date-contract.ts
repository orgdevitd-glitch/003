import fs from "fs";
import path from "path";
import { resolveAssessmentDateForDisplay } from "../src/utils/dateUtils";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const serverDate = "2025-12-31";
const localDate = "2026-01-01";

assert(
  resolveAssessmentDateForDisplay("today", localDate, localDate, serverDate) === serverDate,
  "Today mode must display the server date used to calculate evaluations"
);
assert(
  resolveAssessmentDateForDisplay("custom", localDate, "2024-06-15", serverDate) === "2024-06-15",
  "Custom mode must continue to display the selected custom date"
);
assert(
  resolveAssessmentDateForDisplay("today", localDate, localDate, "invalid") === localDate,
  "Today mode must use local today only until a valid server date is available"
);

const serverSource = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
assert(
  serverSource.includes('assessmentDate: assessmentDate.toISOString().split("T")[0],'),
  "Projects API must expose the exact calendar date used for server evaluations"
);

console.log("Assessment-date contract tests passed.");
