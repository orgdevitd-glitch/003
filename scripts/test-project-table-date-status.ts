import { Project } from '../src/types';
import { isProjectDeadlineOverdue } from '../src/utils/projectTableDateStatus';

function runTest(name: string, fn: () => void) {
  console.log(`[PROJECT_TABLE_DATE_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[PROJECT_TABLE_DATE_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[PROJECT_TABLE_DATE_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

runTest("Scenario 1: deadlineAt = 2026-06-10 and assessmentDate = 2026-06-20 -> true", () => {
  const project: Project = {
    projectId: "1",
    projectName: "Test 1",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    deadlineAt: "2026-06-10",
    endDate: ""
  };
  const result = isProjectDeadlineOverdue(project, "2026-06-20");
  assert(result === true, "Should be overdue because deadlineAt < assessmentDate");
});

runTest("Scenario 2: deadlineAt = 2026-06-25 and assessmentDate = 2026-06-20 -> false", () => {
  const project: Project = {
    projectId: "2",
    projectName: "Test 2",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    deadlineAt: "2026-06-25",
    endDate: ""
  };
  const result = isProjectDeadlineOverdue(project, "2026-06-20");
  assert(result === false, "Should not be overdue because deadlineAt > assessmentDate");
});

runTest("Scenario 3: deadlineAt empty, endDate = 2026-06-10 and assessmentDate = 2026-06-20 -> true", () => {
  const project: Project = {
    projectId: "3",
    projectName: "Test 3",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    deadlineAt: "",
    endDate: "2026-06-10"
  };
  const result = isProjectDeadlineOverdue(project, "2026-06-20");
  assert(result === true, "Should be overdue because endDate < assessmentDate when deadlineAt is empty");
});

runTest("Scenario 4: deadlineAt empty, endDate empty -> false", () => {
  const project: Project = {
    projectId: "4",
    projectName: "Test 4",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    deadlineAt: "",
    endDate: ""
  };
  const result = isProjectDeadlineOverdue(project, "2026-06-20");
  assert(result === false, "Should not be overdue when both dates are empty");
});

runTest("Scenario 5: status is completed -> false even if deadline is past", () => {
  const project: Project = {
    projectId: "5",
    projectName: "Test 5",
    status: "completed",
    tasks: [],
    milestones: [],
    indicators: [],
    deadlineAt: "2026-06-10",
    endDate: ""
  };
  const result = isProjectDeadlineOverdue(project, "2026-06-20");
  assert(result === false, "Completed projects should never be highlighted as overdue");
});

runTest("Scenario 6: Verify system date is not used", () => {
  // If we don't pass an assessment date or it's invalid, it shouldn't assume today or return true randomly
  const project: Project = {
    projectId: "6",
    projectName: "Test 6",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    deadlineAt: "2026-06-10",
    endDate: ""
  };
  const result1 = isProjectDeadlineOverdue(project, undefined);
  assert(result1 === false, "Should return false if assessmentDate is undefined");

  const result2 = isProjectDeadlineOverdue(project, "invalid-date-string");
  assert(result2 === false, "Should return false if assessmentDate is invalid");
});

console.log("[PROJECT_TABLE_DATE_TEST] All Project Table Date Status tests completed successfully!");
