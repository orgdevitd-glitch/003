/**
 * Unit checks for Overview department exclusion filter
 * (HAFF 51 / Производство / Партнеры. Производство.).
 *
 * Uses the shared list OVERVIEW_EXCLUDED_DEPARTMENT_NAMES — same source as Overview UI and portfolio PDF.
 */
import {
  OVERVIEW_EXCLUDED_DEPARTMENT_NAMES,
  isOverviewExcludedDepartmentName,
  shouldExcludeProjectFromOverviewDepartmentCharts,
  parseProjectDepartmentList
} from "../src/utils/overviewDepartmentFilters.js";
import { buildOverviewPdfReportData } from "../src/utils/overviewReportData.js";
import type { Project } from "../src/types.js";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// Centralized list must contain all three exact names (single source for UI + PDF)
assert(
  (OVERVIEW_EXCLUDED_DEPARTMENT_NAMES as readonly string[]).includes("HAFF 51"),
  "list must include HAFF 51"
);
assert(
  (OVERVIEW_EXCLUDED_DEPARTMENT_NAMES as readonly string[]).includes("Производство"),
  "list must include Производство"
);
assert(
  (OVERVIEW_EXCLUDED_DEPARTMENT_NAMES as readonly string[]).includes("Партнеры. Производство."),
  "list must include Партнеры. Производство."
);

assert(isOverviewExcludedDepartmentName("HAFF 51"), "HAFF 51 excluded");
assert(isOverviewExcludedDepartmentName("  производство "), "Производство case-insensitive");
assert(isOverviewExcludedDepartmentName("Партнеры. Производство."), "Партнеры. Производство. excluded");
assert(isOverviewExcludedDepartmentName("  партнеры. производство. "), "Партнеры. Производство. trim+case");
assert(!isOverviewExcludedDepartmentName("Департамент IT"), "IT not excluded");
assert(
  !isOverviewExcludedDepartmentName("Партнеры Производство"),
  "similar name without dots must NOT be excluded (exact match only)"
);
assert(
  !isOverviewExcludedDepartmentName("Отдел Производство"),
  "partial / similar name must NOT be excluded"
);

assert(shouldExcludeProjectFromOverviewDepartmentCharts("HAFF 51"), "single HAFF");
assert(shouldExcludeProjectFromOverviewDepartmentCharts("Производство"), "single Производство");
assert(
  shouldExcludeProjectFromOverviewDepartmentCharts("Партнеры. Производство."),
  "single Партнеры. Производство. excluded from department charts"
);
assert(
  shouldExcludeProjectFromOverviewDepartmentCharts("Департамент IT ; Партнеры. Производство."),
  "multi-dept with Партнеры. Производство. excludes whole project"
);
assert(shouldExcludeProjectFromOverviewDepartmentCharts("Департамент IT ; HAFF 51"), "multi with HAFF excludes whole project");
assert(!shouldExcludeProjectFromOverviewDepartmentCharts("Департамент IT ; Финансы"), "normal multi kept");
assert(!shouldExcludeProjectFromOverviewDepartmentCharts(""), "empty not excluded");

assert(parseProjectDepartmentList("A ; B").join("|") === "A|B", "parse departments");

// Overview and PDF share the same exclusion list (no duplicated names in PDF logic)
const base: Project = {
  projectId: "base",
  projectName: "Base",
  status: "active",
  stage: "В работе",
  department: "Департамент IT",
  priority: 0,
  startDate: "2026-01-01",
  deadlineAt: "2026-12-31",
  tasks: [],
  milestones: [],
  indicators: []
};

const partnersOnly: Project = {
  ...base,
  projectId: "partners-prod",
  department: "Партнеры. Производство.",
  priority: 1
};
const partnersMixed: Project = {
  ...base,
  projectId: "partners-mixed",
  department: "Департамент IT ; Партнеры. Производство.",
  priority: 2
};
const similarKept: Project = {
  ...base,
  projectId: "similar-kept",
  department: "Партнеры Производство",
  priority: 0
};
const itKeep: Project = {
  ...base,
  projectId: "it-keep",
  department: "Департамент IT",
  priority: 0
};

const pdf = buildOverviewPdfReportData({
  projects: [partnersOnly, partnersMixed, similarKept, itKeep],
  projectEvaluations: [],
  assessmentDate: "2026-06-16",
  selectedYear: 2026,
  selectedQuarter: 2
});

// Still in overall portfolio (stage/priority/totals) — not excluded from whole Overview
assert(pdf.projectsInSelectedYear.length === 4, "excluded depts remain in year portfolio / common totals");
assert(pdf.stageCounts.total === 4, "stage summary still counts all projects");
assert(
  pdf.priorityCounts.p0 + pdf.priorityCounts.p1 + pdf.priorityCounts.p2 === 4,
  "priority summary still counts all projects"
);

// Excluded from department analytics / performance blocks only
const depts = pdf.departmentAnalytics;
assert(
  !depts.some(d => d.department === "Партнеры. Производство."),
  "Партнеры. Производство. must not appear in department analytics/performance"
);
assert(
  depts.some(d => d.department === "Партнеры Производство"),
  "similar name Партнеры Производство is kept in department charts"
);
const it = depts.find(d => d.department === "Департамент IT");
assert(!!it, "IT should remain");
assert(
  (it!.p0 + it!.p1 + it!.p2) === 1,
  "only it-keep counts in IT — mixed with Партнеры. Производство. excluded entirely"
);

console.log("[TEST] overviewDepartmentFilters checks passed");
