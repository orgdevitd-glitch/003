import { Project } from '../src/types';
import { getProjectDateSortValue, compareNullableDates } from '../src/utils/projectTableSorting';

function runTest(name: string, fn: () => void) {
  console.log(`[SORTING_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[SORTING_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[SORTING_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

runTest("Scenario 1: 15.01.2026 should be before 01.12.2026 under ascending sort", () => {
  const d1 = getProjectDateSortValue({ startDate: "15.01.2026" } as Project, "startDate");
  const d2 = getProjectDateSortValue({ startDate: "01.12.2026" } as Project, "startDate");

  assert(d1 !== null && d2 !== null, "Dates must be correctly parsed");
  
  const result = compareNullableDates(d1, d2, "asc");
  assert(result < 0, "15.01.2026 should come before 01.12.2026 in ascending order");
});

runTest("Scenario 2: 2026-01-15 should be before 2026-12-01 under ascending sort", () => {
  const d1 = getProjectDateSortValue({ startDate: "2026-01-15" } as Project, "startDate");
  const d2 = getProjectDateSortValue({ startDate: "2026-12-01" } as Project, "startDate");

  assert(d1 !== null && d2 !== null, "Dates must be correctly parsed");

  const result = compareNullableDates(d1, d2, "asc");
  assert(result < 0, "2026-01-15 should come before 2026-12-01 in ascending order");
});

runTest("Scenario 3: For deadlineAt column, if deadlineAt is empty, endDate is used", () => {
  const projectNoDeadline: Project = {
    projectId: "1",
    projectName: "No Deadline",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    deadlineAt: "",
    endDate: "15.01.2026"
  };
  
  const d1 = getProjectDateSortValue(projectNoDeadline, "deadlineAt");
  assert(d1 !== null, "Should fallback to endDate if deadlineAt is empty");
  assert(d1!.getDate() === 15 && d1!.getMonth() === 0 && d1!.getFullYear() === 2026, "Fallback date should match 15.01.2026");
});

runTest("Scenario 4: Empty/null date goes to the end of the list in ASC", () => {
  const dValid = getProjectDateSortValue({ startDate: "15.01.2026" } as Project, "startDate");
  const dEmpty = getProjectDateSortValue({ startDate: "" } as Project, "startDate");

  // Comparing (valid, empty) under asc:
  const result1 = compareNullableDates(dValid, dEmpty, "asc");
  assert(result1 < 0, "Valid date should come before empty date in ascending order (empty date goes to the end)");

  // Comparing (empty, valid) under asc:
  const result2 = compareNullableDates(dEmpty, dValid, "asc");
  assert(result2 > 0, "Empty date should come after valid date in ascending order (empty date goes to the end)");
});

runTest("Scenario 5: Empty/null date remains at the end of the list in DESC", () => {
  const dValid = getProjectDateSortValue({ startDate: "15.01.2026" } as Project, "startDate");
  const dEmpty = getProjectDateSortValue({ startDate: "" } as Project, "startDate");

  // Comparing (valid, empty) under desc:
  const result1 = compareNullableDates(dValid, dEmpty, "desc");
  assert(result1 < 0, "Valid date should come before empty date in descending order (empty date remains at the end)");

  // Comparing (empty, valid) under desc:
  const result2 = compareNullableDates(dEmpty, dValid, "desc");
  assert(result2 > 0, "Empty date should come after valid date in descending order (empty date remains at the end)");
});

runTest("Scenario 6: Both dates empty/null are equal", () => {
  const dEmpty1 = getProjectDateSortValue({ startDate: "" } as Project, "startDate");
  const dEmpty2 = getProjectDateSortValue({ startDate: "" } as Project, "startDate");

  const result1 = compareNullableDates(dEmpty1, dEmpty2, "asc");
  assert(result1 === 0, "Empty dates should be equal");

  const result2 = compareNullableDates(dEmpty1, dEmpty2, "desc");
  assert(result2 === 0, "Empty dates should be equal in descending order too");
});

console.log("[SORTING_TEST] All sorting tests passed successfully!");
