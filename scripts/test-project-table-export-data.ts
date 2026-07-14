import { Project, ProjectEvaluation } from "../src/types";
import { buildExcelExportData } from "../src/utils/projectTableExportData";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log("[TEST] Starting projectTableExportData helper verifications...");

const mockProject: Project = {
  projectId: "proj-123",
  projectName: "Test Export Project",
  status: "active",
  milestones: [],
  _rawMilestonesNew: {
    q1names: "Milestone Q1",
    q1progress: "100",
    q1weights: "100",
    q2names: "Milestone Q2",
    q2progress: "0",
    q2weights: "100"
  }
} as any as Project;

const mockEvaluation: ProjectEvaluation = {
  projectId: "proj-123",
  year: 2026,
  dataQuality: {
    completenessPercent: 100,
    errorsCount: 0,
    status: "ok"
  },
  milestones: {
    weightControlStatus: "ok",
    milestoneResults: [
      {
        year: 2026,
        quarter: "Q1",
        progress: 100,
        rawProgress: 100,
        plan: 100,
        fact: 100,
        deviation: 0,
        weight: 50,
        isCompleted: true,
        isIncludedInProgress: true,
        effectiveWeightPercent: 50,
        contributionPercent: 50
      },
      {
        year: 2026,
        quarter: "Q2",
        progress: 0,
        rawProgress: 0,
        plan: 100,
        fact: 0,
        deviation: -100,
        weight: 50,
        isCompleted: false,
        isIncludedInProgress: true,
        effectiveWeightPercent: 50,
        contributionPercent: 0
      }
    ]
  },
  indicators: {
    indicatorResults: [
      {
        indicatorId: "ind-1",
        year: 2026,
        quarter: "Q1",
        plan: 100,
        fact: 100,
        rawFact: 100,
        deviation: 0,
        hasData: true,
        cappedPerformancePercent: 100,
        performancePercent: 100
      },
      {
        indicatorId: "ind-1",
        year: 2026,
        quarter: "Q2",
        plan: 100,
        fact: 0,
        rawFact: 0,
        deviation: -100,
        hasData: true,
        cappedPerformancePercent: 0,
        performancePercent: 0
      }
    ]
  }
} as any as ProjectEvaluation;

// Run with Q2 assessment date
const exportData = buildExcelExportData(
  [mockProject],
  [mockEvaluation],
  "2026-06-20", // Q2 2026
  null
);

const { headers, rows } = exportData;
assert(headers.length > 0, "Headers should not be empty");
assert(rows.length === 1, "There should be exactly 1 row");

const row = rows[0];

// Match headers and values
const headerToValue = new Map<string, string>();
headers.forEach((h, index) => {
  headerToValue.set(h, row[index]);
});

// Check if correctly pulled Q2 metrics
const q2MilestoneFact = headerToValue.get("Вехи текущего квартала - факт");
const q2MilestonePlan = headerToValue.get("Вехи текущего квартала - план");
const q2KpiFact = headerToValue.get("Показатели текущего квартала - факт");
const q2KpiPlan = headerToValue.get("Показатели текущего квартала - план");

assert(q2MilestoneFact === "0%", `Expected milestones fact to be '0%', got '${q2MilestoneFact}'`);
assert(q2MilestonePlan === "100%", `Expected milestones plan to be '100%', got '${q2MilestonePlan}'`);
assert(q2KpiFact === "0%", `Expected KPI fact to be '0%', got '${q2KpiFact}'`);
assert(q2KpiPlan === "100%", `Expected KPI plan to be '100%', got '${q2KpiPlan}'`);

console.log("✓ Correctly verified Q2 metrics are exported under Q2 assessmentDate (Fact: 0% instead of Q1/annual 50%/100%)");

// Run with Q1 assessment date
const exportDataQ1 = buildExcelExportData(
  [mockProject],
  [mockEvaluation],
  "2026-02-15", // Q1 2026
  null
);

const headerToValueQ1 = new Map<string, string>();
exportDataQ1.headers.forEach((h, index) => {
  headerToValueQ1.set(h, exportDataQ1.rows[0][index]);
});

const q1MilestoneFact = headerToValueQ1.get("Вехи текущего квартала - факт");
const q1KpiFact = headerToValueQ1.get("Показатели текущего квартала - факт");

assert(q1MilestoneFact === "100%", `Expected milestones fact in Q1 to be '100%', got '${q1MilestoneFact}'`);
assert(q1KpiFact === "100%", `Expected KPI fact in Q1 to be '100%', got '${q1KpiFact}'`);

console.log("✓ Correctly verified Q1 metrics are exported under Q1 assessmentDate (Fact: 100%)");

// Check handling of no data / missing evaluations
const exportDataNoData = buildExcelExportData(
  [mockProject],
  [], // No evaluations
  "2026-09-20", // Q3 2026 (No milestones or indicators in raw/eval for Q3)
  null
);

const headerToValueNoData = new Map<string, string>();
exportDataNoData.headers.forEach((h, index) => {
  headerToValueNoData.set(h, exportDataNoData.rows[0][index]);
});

const q3MilestoneFact = headerToValueNoData.get("Вехи текущего квартала - факт");
const q3KpiFact = headerToValueNoData.get("Показатели текущего квартала - факт");

assert(q3MilestoneFact === "Нет данных", `Expected milestones fact to be 'Нет данных', got '${q3MilestoneFact}'`);
assert(q3KpiFact === "Нет данных", `Expected KPI fact to be 'Нет данных', got '${q3KpiFact}'`);

console.log("✓ Correctly verified missing/no data handles correctly ('Нет данных' instead of 0%)");

console.log("All projectTableExportData tests passed successfully!");
