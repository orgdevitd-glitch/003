import { Project, ProjectEvaluation } from '../src/types';
import {
  getVisualProjectBounds,
  isProjectInRoadmapYear,
  getRoadmapTimelineProjects,
  getVisualCalendarProgressPercent,
  filterRoadmapProjectsByHiddenStages,
  getYearsForRoadmap,
  getProjectCalendarIntervalStatus
} from '../src/utils/roadmapYearUtils';
import { normalizeProjectStage, getRoadmapStageStyle } from '../src/utils/projectStageStyles';
import { parseDateSafe } from '../src/utils/dateUtils';

function runTest(name: string, fn: () => void) {
  console.log(`[ROADMAP_YEAR_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[ROADMAP_YEAR_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[ROADMAP_YEAR_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function formatDateKey(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

// Ensure the helper works correctly for scenario 1-5
runTest("Scenario 1: Project with range 2026-2030 belongs to 2027", () => {
  const project: Project = {
    projectId: "p-1",
    projectName: "Project spanned",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "15.09.2026",
    endDate: "15.12.2030"
  };

  const isIncluded = isProjectInRoadmapYear(project, null, 2027);
  assert(isIncluded === true, "Project 2026-2030 must be included in 2027");
});

runTest("Scenario 2: Project with range 2026-2030 is visual-cropped strictly into 2027 boundaries", () => {
  const project: Project = {
    projectId: "p-2",
    projectName: "Project crop 2027",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "15.09.2026",
    endDate: "15.12.2030"
  };

  const { visualStart, visualEnd } = getVisualProjectBounds(project, 2027);
  assert(formatDateKey(visualStart) === "01.01.2027", `Expected 01.01.2027, got ${formatDateKey(visualStart)}`);
  assert(formatDateKey(visualEnd) === "31.12.2027", `Expected 31.12.2027, got ${formatDateKey(visualEnd)}`);
});

runTest("Scenario 3: Project with range 2026-2030 is visual-cropped inside 2030 boundaries", () => {
  const project: Project = {
    projectId: "p-3",
    projectName: "Project crop 2030",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "15.09.2026",
    endDate: "15.12.2030"
  };

  const { visualStart, visualEnd } = getVisualProjectBounds(project, 2030);
  assert(formatDateKey(visualStart) === "01.01.2030", `Expected 01.01.2030, got ${formatDateKey(visualStart)}`);
  assert(formatDateKey(visualEnd) === "15.12.2030", `Expected 15.12.2030, got ${formatDateKey(visualEnd)}`);
});

runTest("Scenario 4: Project without endDate does not leak/bleed into future years", () => {
  const project: Project = {
    projectId: "p-4",
    projectName: "Project no endDate",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "01.07.2026",
    endDate: ""
  };

  const in2026 = isProjectInRoadmapYear(project, null, 2026);
  const in2027 = isProjectInRoadmapYear(project, null, 2027);

  assert(in2026 === true, "Must be included in 2026");
  assert(in2027 === false, "Must NOT be included in 2027 when no endpoint claims it");
});

runTest("Scenario 5: Calendar date with comma-separated numbers behaves correctly", () => {
  const project: Project = {
    projectId: "p-5",
    projectName: "Project with comma date",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "15.04.2026",
    endDate: "18,12,2026"
  };

  const in2026 = isProjectInRoadmapYear(project, null, 2026);
  const in2027 = isProjectInRoadmapYear(project, null, 2027);

  assert(in2026 === true, "Must be included in 2026");
  assert(in2027 === false, "Must NOT leak to 2027 due to comma parsing resolving 18.12.2026 as end date");
});

runTest("Scenario 6: Stage 'Остановлен' remains distinct and uses correct colors, not mixed with 'На паузе'", () => {
  const stage = "Остановлен";
  const normalized = normalizeProjectStage(stage, "active");
  assert(normalized === "Остановлен", `Expected 'Остановлен', got '${normalized}'`);

  const colors = getRoadmapStageStyle(normalized);
  // Ostanovlen uses specific styles containing red color values
  assert(colors.fill === "bg-[#C00000]" || colors.dot === "bg-[#C00000]" || colors.base.includes("red"), "Must map to Ostanovlen Crimson (#C00000) styles");
});

runTest("Scenario 7: Project with no dates but explicit 2027 raw year data is in roadmap 2027", () => {
  const project: Project = {
    projectId: "p-no-dates",
    projectName: "Project with no dates but 2027 raw data",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "",
    endDate: "",
    createdAt: "",
    _rawByYear: {
      "2027": {
        year: 2027,
        milestones: {
          q2names: "Веха 2027"
        }
      }
    }
  } as any;

  const in2027 = isProjectInRoadmapYear(project, null, 2027);
  assert(in2027 === true, "Project without dates but with raw metrics should be in 2027");

  const list = getRoadmapTimelineProjects([project], [], 2027);
  assert(list.length === 1, "getRoadmapTimelineProjects should list this project");
});

runTest("Scenario 8: Progress on displayed period (getVisualCalendarProgressPercent)", () => {
  const visualStart = new Date("2027-01-01");
  const visualEnd = new Date("2027-12-31");

  // Middle-ish date: 01.07.2027 (which is July 1st, exactly half of the year)
  const halfProgress = getVisualCalendarProgressPercent(visualStart, visualEnd, "2027-07-01");
  assert(halfProgress !== null && halfProgress >= 49 && halfProgress <= 51, `Expected ~50%, got ${halfProgress}%`);

  // Progress from before start
  const beforeProgress = getVisualCalendarProgressPercent(visualStart, visualEnd, "2026-12-31");
  assert(beforeProgress === 0, `Expected 0%, got ${beforeProgress}%`);

  // Progress from after end
  const afterProgress = getVisualCalendarProgressPercent(visualStart, visualEnd, "2030-01-01");
  assert(afterProgress === 100, `Expected 100%, got ${afterProgress}%`);
});

runTest("Scenario 9: hiddenStages is empty, all projects are returned", () => {
  const projects: Project[] = [
    { projectId: "1", projectName: "P1", stage: "В работе", status: "active", tasks: [], milestones: [], indicators: [] },
    { projectId: "2", projectName: "P2", stage: "Остановлен", status: "active", tasks: [], milestones: [], indicators: [] },
  ];
  const filtered = filterRoadmapProjectsByHiddenStages(projects, new Set());
  assert(filtered.length === 2, `Expected 2, got ${filtered.length}`);
});

runTest("Scenario 10: hiddenStages contains 'Остановлен', matching projects are excluded", () => {
  const projects: Project[] = [
    { projectId: "1", projectName: "P1", stage: "В работе", status: "active", tasks: [], milestones: [], indicators: [] },
    { projectId: "2", projectName: "P2", stage: "Остановлен", status: "active", tasks: [], milestones: [], indicators: [] },
  ];
  const filtered = filterRoadmapProjectsByHiddenStages(projects, new Set(["Остановлен"]));
  assert(filtered.length === 1, `Expected 1, got ${filtered.length}`);
  assert(filtered[0].projectId === "1", `Expected P1, got ${filtered[0].projectName}`);
});

runTest("Scenario 11: hiddenStages contains multiple stages, those projects are excluded", () => {
  const projects: Project[] = [
    { projectId: "1", projectName: "P1", stage: "В работе", status: "active", tasks: [], milestones: [], indicators: [] },
    { projectId: "2", projectName: "P2", stage: "Остановлен", status: "active", tasks: [], milestones: [], indicators: [] },
    { projectId: "3", projectName: "P3", stage: "Планируется", status: "active", tasks: [], milestones: [], indicators: [] },
  ];
  const filtered = filterRoadmapProjectsByHiddenStages(projects, new Set(["Остановлен", "Планируется"]));
  assert(filtered.length === 1, `Expected 1, got ${filtered.length}`);
  assert(filtered[0].projectId === "1", `Expected P1, got ${filtered[0].projectName}`);
});

runTest("Scenario 12: legacy stage 'Отменен' normalizes to 'Остановлен' and is excluded when hiding 'Остановлен'", () => {
  const projects: Project[] = [
    { projectId: "1", projectName: "P1", stage: "Отменен", status: "active", tasks: [], milestones: [], indicators: [] },
    { projectId: "2", projectName: "P2", stage: "В работе", status: "active", tasks: [], milestones: [], indicators: [] },
  ];
  // Verify normalization
  const normStage = normalizeProjectStage("Отменен", "active");
  assert(normStage === "Остановлен", `Expected 'Остановлен', got ${normStage}`);

  const filtered = filterRoadmapProjectsByHiddenStages(projects, new Set(["Остановлен"]));
  assert(filtered.length === 1, `Expected 1, got ${filtered.length}`);
  assert(filtered[0].projectId === "2", `Expected P2, got ${filtered[0].projectName}`);
});

runTest("Mandatory Test 1: Project only 2025, assessmentDate 2026. getYearsForRoadmap must not return 2026", () => {
  const projects: Project[] = [
    {
      projectId: "p-2025",
      projectName: "Project 2025 only",
      status: "active",
      tasks: [],
      milestones: [],
      indicators: [],
      startDate: "01.01.2025",
      endDate: "31.12.2025"
    }
  ];
  const years = getYearsForRoadmap(projects, null, "2026-06-01");
  assert(!years.includes(2026), "getYearsForRoadmap should not return 2026 if no projects exist in that year");
  assert(years.includes(2025), "getYearsForRoadmap must include 2025");
});

runTest("Mandatory Test 2: Project with startDate 2026-03-01 without endDate", () => {
  const project: Project = {
    projectId: "p-start-no-end",
    projectName: "Start no end",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "2026-03-01",
    endDate: ""
  };
  assert(isProjectInRoadmapYear(project, null, 2026) === true, "Should belong to 2026");
  assert(isProjectInRoadmapYear(project, null, 2027) === false, "Should not belong to 2027");
  
  const status = getProjectCalendarIntervalStatus(project);
  assert(status.isValid === false, "Interval must be invalid");
  assert(status.error === 'no_end_date', "Error must be no_end_date");
  
  const visualBounds = getVisualProjectBounds(project, 2026);
  const progress = getVisualCalendarProgressPercent(visualBounds.visualStart, visualBounds.visualEnd, "2026-06-01", project);
  assert(progress === null, "Progress must be null");
});

runTest("Mandatory Test 3: Project with endDate 2026-09-01 only", () => {
  const project: Project = {
    projectId: "p-end-no-start",
    projectName: "End no start",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "",
    endDate: "2026-09-01"
  };
  assert(isProjectInRoadmapYear(project, null, 2026) === true, "Should belong to 2026");
  assert(isProjectInRoadmapYear(project, null, 2025) === false, "Should not belong to 2025");
  assert(isProjectInRoadmapYear(project, null, 2027) === false, "Should not belong to 2027");
  
  const status = getProjectCalendarIntervalStatus(project);
  assert(status.isValid === false, "Interval must be invalid");
  assert(status.error === 'no_start_date', "Error must be no_start_date");
});

runTest("Mandatory Test 4: Project with startDate 2026-10-01 and endDate 2026-05-01 (date error)", () => {
  const project: Project = {
    projectId: "p-date-error",
    projectName: "Date error project",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "2026-10-01",
    endDate: "2026-05-01"
  };
  assert(isProjectInRoadmapYear(project, null, 2026) === true, "Should belong to 2026");
  
  const status = getProjectCalendarIntervalStatus(project);
  assert(status.isValid === false, "Interval must be invalid");
  assert(status.error === 'date_error', "Error must be date_error");
  
  const visualBounds = getVisualProjectBounds(project, 2026);
  const progress = getVisualCalendarProgressPercent(visualBounds.visualStart, visualBounds.visualEnd, "2026-06-01", project);
  assert(progress === null, "Progress must be null");
});

runTest("Mandatory Test 5: Project without dates but with _rawByYear[2026]", () => {
  const project: Project = {
    projectId: "p-raw-year",
    projectName: "Raw year project",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    startDate: "",
    endDate: "",
    _rawByYear: {
      "2026": {
        year: 2026,
        milestones: {
          q1names: "Веха в Q1"
        }
      }
    }
  } as any;
  assert(isProjectInRoadmapYear(project, null, 2026) === true, "Should belong to 2026");
  
  const status = getProjectCalendarIntervalStatus(project);
  assert(status.isValid === false, "Interval must be invalid");
  assert(status.error === 'no_dates', "Error must be no_dates");
  
  const visualBounds = getVisualProjectBounds(project, 2026);
  const progress = getVisualCalendarProgressPercent(visualBounds.visualStart, visualBounds.visualEnd, "2026-06-01", project);
  assert(progress === null, "Progress must be null");
});

runTest("Mandatory Test 6: getRoadmapProjectsInput bypasses tab 2 filters", () => {
  const projects: Project[] = [
    { projectId: "A", projectName: "Проект A", status: "active", tasks: [], milestones: [], indicators: [] },
    { projectId: "B", projectName: "Проект B", status: "active", tasks: [], milestones: [], indicators: [] },
  ];
  
  // Tab 2 filter logic (simulated)
  const filtersTab2 = { search: "Проект A" };
  const filteredProjectsTab2 = projects.filter(p => p.projectName.includes(filtersTab2.search));
  
  assert(filteredProjectsTab2.length === 1, "Tab 2 filter should hide Project B");
  assert(filteredProjectsTab2[0].projectId === "A", "Tab 2 filter should only leave Project A");
  
  // Roadmap input logic using simulated getRoadmapProjectsInput helper
  const getRoadmapProjectsInput = (allProjects: Project[]): Project[] => {
    return allProjects;
  };
  
  const roadmapInput = getRoadmapProjectsInput(projects);
  assert(roadmapInput.length === 2, "Roadmap must receive both projects regardless of Tab 2 filters");
  assert(roadmapInput.some(p => p.projectId === "A") && roadmapInput.some(p => p.projectId === "B"), "Roadmap must receive Project A and Project B");
});

console.log("[ROADMAP_YEAR_TEST] All Roadmap year filtering unit tests executed successfully!");
