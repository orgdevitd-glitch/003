import { getNormalizedStageForFiltering, matchProjectStage } from "../src/utils/projectTableFilters.js";
import { Project } from "../src/types";

function runTest(name: string, fn: () => void) {
  console.log(`[PROJECT_TABLE_FILTERS_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[PROJECT_TABLE_FILTERS_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[PROJECT_TABLE_FILTERS_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

runTest("Scenario 1: project.stage = 'active' matches 'В работе'", () => {
  const p1: Project = { stage: "active", status: "" } as any;
  assert(matchProjectStage(p1, ["В работе"]), "p1 with stage active should match 'В работе'");
  assert(getNormalizedStageForFiltering(p1) === "В работе", "p1 with stage active should normalize to 'В работе'");
});

runTest("Scenario 2: empty stage with status='active' → Стадия не указана", () => {
  const p2: Project = { stage: "", status: "active" } as any;
  assert(matchProjectStage(p2, ["Стадия не указана"]), "p2 with empty stage should match 'Стадия не указана'");
  assert(getNormalizedStageForFiltering(p2) === "Стадия не указана", "p2 empty stage must not restore from status");
});

runTest("Scenario 3: project.stage = 'completed' matches 'Завершен'", () => {
  const p3: Project = { stage: "completed", status: "" } as any;
  assert(matchProjectStage(p3, ["Завершен"]), "p3 with stage completed should match 'Завершен'");
  assert(getNormalizedStageForFiltering(p3) === "Завершен", "p3 with stage completed should normalize to 'Завершен'");
});

runTest("Scenario 4: empty stage with status='completed' → Стадия не указана", () => {
  const p4: Project = { stage: "", status: "completed" } as any;
  assert(matchProjectStage(p4, ["Стадия не указана"]), "p4 with empty stage should match 'Стадия не указана'");
  assert(getNormalizedStageForFiltering(p4) === "Стадия не указана", "p4 empty stage must not restore from status");
});

runTest("Scenario 5: project.stage = 'paused' matches 'Остановлен'", () => {
  const p5: Project = { stage: "paused", status: "" } as any;
  assert(matchProjectStage(p5, ["Остановлен"]), "p5 with stage paused should match 'Остановлен'");
  assert(getNormalizedStageForFiltering(p5) === "Остановлен", "p5 with stage paused should normalize to 'Остановлен'");
});

runTest("Scenario 6: project.stage = 'В работе' matches 'В работе'", () => {
  const p6: Project = { stage: "В работе", status: "" } as any;
  assert(matchProjectStage(p6, ["В работе"]), "p6 with stage 'В работе' should match 'В работе'");
  assert(getNormalizedStageForFiltering(p6) === "В работе", "p6 with stage 'В работе' should normalize to 'В работе'");
});

runTest("Scenario 7: filter 'Завершен' does NOT match project 'active'", () => {
  const p7: Project = { stage: "active", status: "" } as any;
  assert(!matchProjectStage(p7, ["Завершен"]), "p7 with stage active should NOT match 'Завершен'");
});

runTest("Scenario 8: filter options build does not contain raw values", () => {
  const pList: Project[] = [
    { stage: "active", status: "" },
    { stage: "", status: "completed" },
    { stage: "paused", status: "" }
  ] as any[];

  const normalizedSet = new Set<string>();
  pList.forEach(p => {
    normalizedSet.add(getNormalizedStageForFiltering(p));
  });

  const options = Array.from(normalizedSet);
  assert(!options.includes("active"), "Options must not contain 'active'");
  assert(!options.includes("completed"), "Options must not contain 'completed'");
  assert(!options.includes("paused"), "Options must not contain 'paused'");
  assert(options.includes("В работе"), "Options must contain 'В работе'");
  assert(options.includes("Стадия не указана"), "Empty stage must appear as 'Стадия не указана'");
  assert(options.includes("Остановлен"), "Options must contain 'Остановлен'");
});

console.log("[PROJECT_TABLE_FILTERS_TEST] ALL TESTS IN SUITE PASSED SUCCESSFULLY!\n");
