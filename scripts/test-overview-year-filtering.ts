import { Project, ProjectEvaluation } from "../src/types";
import { isProjectInYear, getYearsForProject } from "../src/utils/overviewYearFiltering";
import { parseDateSafe } from "../src/utils/dateUtils";

function runTest(name: string, fn: () => void) {
  console.log(`[YEAR_FILTER_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[YEAR_FILTER_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[YEAR_FILTER_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// Average function helper we implemented in Overview
function averageOrNull(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

runTest("Scenario 1: Project with start date but no end date doesn't bleed into future years", () => {
  const project: Project = {
    projectId: "scen-1",
    projectName: "Project scenario 1",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "01.07.2026",
    endDate: "",
  };

  assert(isProjectInYear(project, null, 2026) === true, "Should be in 2026");
  assert(isProjectInYear(project, null, 2027) === false, "Should NOT bleed into 2027");
});

runTest("Scenario 2: Project with valid range 2026-2030 is matched in all range years", () => {
  const project: Project = {
    projectId: "scen-2",
    projectName: "Project scenario 2",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "15.09.2026",
    endDate: "15.12.2030"
  };

  assert(isProjectInYear(project, null, 2026) === true, "Should be in 2026");
  assert(isProjectInYear(project, null, 2027) === true, "Should be in 2027");
  assert(isProjectInYear(project, null, 2028) === true, "Should be in 2028");
  assert(isProjectInYear(project, null, 2029) === true, "Should be in 2029");
  assert(isProjectInYear(project, null, 2030) === true, "Should be in 2030");
  assert(isProjectInYear(project, null, 2031) === false, "Should NOT bleed into 2031");
});

runTest("Scenario 3: Comma separated date parsing works", () => {
  const dateStr = "18,12,2026";
  const parsed = parseDateSafe(dateStr);
  assert(parsed !== null, "Should parse correctly");
  assert(parsed!.getFullYear() === 2026, "Year should be 2026");
  assert(parsed!.getMonth() === 11, "Month should be December (11)");
  assert(parsed!.getDate() === 18, "Day should be 18");

  const project: Project = {
    projectId: "scen-3",
    projectName: "Project scenario 3",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "15.04.2026",
    endDate: "18,12,2026"
  };

  assert(isProjectInYear(project, null, 2026) === true, "Should be in 2026 where it ends");
  assert(isProjectInYear(project, null, 2027) === false, "Should NOT bleed into 2027 because of comma deadline");
});

runTest("Scenario 4: Explicit future year raw data forces project inclusion", () => {
  const project: Project = {
    projectId: "scen-4",
    projectName: "Project scenario 4",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "01.07.2026",
    endDate: "",
    _rawByYear: {
      2027: {
        milestones: {
          q2names: "Веха в 2027"
        },
        indicators: {}
      }
    }
  };

  assert(isProjectInYear(project, null, 2026) === true, "Should be in 2026");
  assert(isProjectInYear(project, null, 2027) === true, "Should be in 2027 due to explicit raw 2027 milestones");
});

runTest("Scenario 5: No data does not equal 0% progression", () => {
  assert(averageOrNull([]) === null, "Empty array returns null representing No Data");
  assert(averageOrNull([0]) === 0, "Array [0] returns 0 representing 0.0% completion");
  assert(averageOrNull([10, 30]) === 20, "Array [10, 30] returns 20 representing 20.0% completion");
});

console.log("[YEAR_FILTER_TEST] All year filtering unit tests executed successfully!");
