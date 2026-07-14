import { Project, ProjectEvaluation } from '../src/types';
import { buildOverviewPdfReportData } from '../src/utils/overviewReportData';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTests() {
  console.log("[TEST] Starting buildOverviewPdfReportData logic verifications...");

  // Mock project 1: Active in 2026 & 2027, has multiple departments via ";"
  const mockProject1: Project = {
    projectId: "project-1",
    projectName: "Project One (Multi-year, Multi-dept)",
    status: "active",
    stage: "В работе",
    department: "Департамент IT ; Департамент Финансов",
    priority: 1, // First priority
    startDate: "2026-01-01",
    deadlineAt: "2027-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    projectOwner: "Овнер 1",
    projectManager: "РП 1",
  };

  // Mock project 2: Active only in 2026, single department, NO indicators and NO milestones (missing / empty data)
  const mockProject2: Project = {
    projectId: "project-2",
    projectName: "Project Two (2026 only, empty data)",
    status: "active",
    stage: "Планируется",
    department: "Департамент IT",
    priority: 0, // Zero priority
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    projectOwner: "Овнер 2",
    projectManager: "РП 2",
  };

  // Mock Evaluation for project-1 representing Q3 2027
  const evaluation1: ProjectEvaluation = {
    projectId: "project-1",
    assessmentDate: "2027-09-15",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 0,
      actualProgressPercent: 0,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 1,
      actualMilestonesCount: 1,
      completedMilestonesCount: 0,
      overdueMilestonesCount: 1,
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone Q3 2027",
          year: 2027,
          quarter: "Q3",
          originalWeightPercent: 100,
          effectiveWeightPercent: 100,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 0,
          contributionPercent: 0
        }
      ]
    },
    indicators: {
      status: "ok",
      averagePerformancePercent: 50,
      cappedAveragePerformancePercent: 50,
      calculatedIndicatorsCount: 1,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: [
        {
          id: "ind-res-2",
          name: "KPI Q3 2027",
          year: 2027,
          quarter: "Q3",
          plan: 100,
          fact: 50,
          calculationType: "higher_is_better",
          performancePercent: 50,
          cappedPerformancePercent: 50,
          status: "ok",
          explanation: "Perfect KPI"
        }
      ]
    },
    monitoring: { status: "ok", lastMonitoringDate: "2027-09-15", nextMonitoringDate: "2027-12-15", overdueDays: 0 },
    projectHealth: { status: "ok", score: 50, mainReasons: [] },
    explanations: []
  };

  const projectEvaluations: ProjectEvaluation[] = [evaluation1];

  // --- Scenario 1: selectedYear = 2027, data contains 2026 & 2027. Report takes ONLY 2027 projects.
  // assessmentDate is still in 2026 → future year periods must stay excluded (do not force 2027-12-31).
  const result2027Future = buildOverviewPdfReportData({
    projects: [mockProject1, mockProject2],
    projectEvaluations,
    assessmentDate: "2026-06-16",
    selectedYear: 2027,
    selectedQuarter: 3
  });

  assert(result2027Future.selectedYear === 2027, "selectedYear should be 2027");
  assert(result2027Future.projectsInSelectedYear.length === 1, "Only 1 project (mockProject1) is active in year 2027");
  assert(result2027Future.projectsInSelectedYear[0].projectId === "project-1", "Selected project should be project-1");
  assert(result2027Future.effectiveAssessmentDate === "2026-06-16", `future year must keep real assessment date, got ${result2027Future.effectiveAssessmentDate}`);
  assert(result2027Future.portfolioProgress.selectedMilestones === null, "Q3 2027 milestones must be excluded while assessment is still in 2026");
  assert(result2027Future.portfolioProgress.selectedKpi === null, "Q3 2027 indicators must be excluded while assessment is still in 2026");
  assert(result2027Future.portfolioProgress.yearMilestones === null, "2027 year milestones must be excluded while assessment is still in 2026");
  console.log("✓ Correctly filtered projects for selected year 2027 and excluded future-year progress");

  // --- Scenario 2: same year as assessment — Q3 2027 metrics are included
  const result2027 = buildOverviewPdfReportData({
    projects: [mockProject1, mockProject2],
    projectEvaluations,
    assessmentDate: "2027-09-15",
    selectedYear: 2027,
    selectedQuarter: 3
  });

  assert(result2027.selectedQuarter === 3, "selectedQuarter should be 3");
  assert(result2027.effectiveAssessmentDate === "2027-09-15", `current selected year must keep assessment date, got ${result2027.effectiveAssessmentDate}`);
  const progress = result2027.portfolioProgress;
  assert(progress.selectedMilestones !== null, "Milestone progress for Q3 2027 should not be null");
  assert(progress.selectedKpi !== null, "KPI progress for Q3 2027 should not be null");
  assert(progress.selectedMilestones === 0, `Q3 2027 milestones progress should be 0%, got: ${progress.selectedMilestones}`);
  assert(progress.selectedKpi === 50, `Q3 2027 kpi progress should be 50%, got: ${progress.selectedKpi}`);
  console.log("✓ Correctly verified Q3 2027 indicators and milestones are fetched when assessment is in 2027");

  // --- Scenario 3: indicators and milestones without data return null, not 0
  const result2026_empty = buildOverviewPdfReportData({
    projects: [mockProject2], // mockProject2 is active in 2026 but has NO tasks, NO indicators, and NO evaluations
    projectEvaluations,
    assessmentDate: "2026-06-16",
    selectedYear: 2026,
    selectedQuarter: 2
  });

  assert(result2026_empty.portfolioProgress.selectedMilestones === null, "Missing Q2 milestones should return null progress, not 0");
  assert(result2026_empty.portfolioProgress.selectedKpi === null, "Missing Q2 kpis should return null progress, not 0");
  assert(result2026_empty.portfolioProgress.yearMilestones === null, "Missing annual milestones should return null progress, not 0");
  assert(result2026_empty.portfolioProgress.yearKpi === null, "Missing annual kpis should return null progress, not 0");
  console.log("✓ Correctly verified that missing indicators and milestones return null instead of 0%");

  // --- Scenario 4: projects with multiple departments split by ";" fall into each department
  const result2026_all = buildOverviewPdfReportData({
    projects: [mockProject1, mockProject2],
    projectEvaluations,
    assessmentDate: "2026-06-16",
    selectedYear: 2026,
    selectedQuarter: 2
  });

  const depts = result2026_all.departmentAnalytics;
  const itDept = depts.find(d => d.department === "Департамент IT");
  const finDept = depts.find(d => d.department === "Департамент Финансов");

  assert(!!itDept, "Should find 'Департамент IT'");
  assert(!!finDept, "Should find 'Департамент Финансов'");

  assert(itDept.p0 === 1, "IT dept should have 1 project of priority 0");
  assert(itDept.p1 === 1, "IT dept should have 1 project of priority 1");

  assert(finDept.p0 === 0, "Finance dept should have 0 projects of priority 0");
  assert(finDept.p1 === 1, "Finance dept should have 1 project of priority 1");

  console.log("✓ Correctly verified project with multiple departments contributes to all departments");

  // --- Scenario 5: HAFF 51 / Производство / Партнеры. Производство. excluded from department analytics
  const projectHaff: Project = {
    ...mockProject2,
    projectId: "project-haff",
    department: "HAFF 51",
    priority: 0
  };
  const projectProd: Project = {
    ...mockProject2,
    projectId: "project-prod",
    department: "Производство",
    priority: 1
  };
  const projectPartners: Project = {
    ...mockProject2,
    projectId: "project-partners-prod",
    department: "Партнеры. Производство.",
    priority: 1
  };
  const projectMixedExcluded: Project = {
    ...mockProject1,
    projectId: "project-mixed-excl",
    department: "Департамент IT ; HAFF 51",
    priority: 2
  };
  const projectMixedPartners: Project = {
    ...mockProject1,
    projectId: "project-mixed-partners",
    department: "Департамент IT ; Партнеры. Производство.",
    priority: 2
  };
  const projectKeep: Project = {
    ...mockProject2,
    projectId: "project-keep",
    department: "Департамент IT",
    priority: 0
  };

  const resultExcluded = buildOverviewPdfReportData({
    projects: [projectHaff, projectProd, projectPartners, projectMixedExcluded, projectMixedPartners, projectKeep],
    projectEvaluations: [],
    assessmentDate: "2026-06-16",
    selectedYear: 2026,
    selectedQuarter: 2
  });

  assert(resultExcluded.projectsInSelectedYear.length === 6, "Excluded depts must still count in year portfolio");
  const deptsEx = resultExcluded.departmentAnalytics;
  assert(!deptsEx.some(d => d.department === "HAFF 51"), "HAFF 51 must not appear in department analytics");
  assert(!deptsEx.some(d => d.department === "Производство"), "Производство must not appear in department analytics");
  assert(!deptsEx.some(d => d.department === "Партнеры. Производство."), "Партнеры. Производство. must not appear in department analytics");
  const itKeep = deptsEx.find(d => d.department === "Департамент IT");
  assert(!!itKeep, "IT department should remain");
  assert(itKeep.p0 === 1, "Only project-keep (p0) should count in IT — mixed excluded projects skipped entirely");
  assert((itKeep.p0 + itKeep.p1 + itKeep.p2) === 1, "Mixed HAFF/Partners projects must not contribute to IT in dept charts");
  console.log("✓ Correctly excluded HAFF 51 / Производство / Партнеры. Производство. from department analytics");

  // --- Scenario 6: empty/unknown stage → «Стадия не указана»; totals stay consistent
  const projectUnspecified: Project = {
    ...mockProject2,
    projectId: "project-unspecified-stage",
    stage: "",
    status: "active", // legacy status must NOT restore a known stage
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31"
  };
  const resultUnspecified = buildOverviewPdfReportData({
    projects: [projectUnspecified],
    projectEvaluations: [],
    assessmentDate: "2026-06-16",
    selectedYear: 2026,
    selectedQuarter: 2
  });
  const sc = resultUnspecified.stageCounts;
  assert(sc.total === 1, `expected total 1, got ${sc.total}`);
  assert(sc.unspecified === 1, `expected unspecified 1, got ${sc.unspecified}`);
  assert(
    sc.planned + sc.inWork + sc.onPause + sc.stopped + sc.completed + sc.unspecified === sc.total,
    `stage sum must equal total: planned=${sc.planned} inWork=${sc.inWork} pause=${sc.onPause} stopped=${sc.stopped} completed=${sc.completed} unspecified=${sc.unspecified} total=${sc.total}`
  );
  assert(sc.inWork === 0, "empty stage with status=active must not map to В работе");
  console.log("✓ Correctly counted empty stage as «Стадия не указана» in PDF stageCounts (totals consistent)");

  console.log("[TEST] All buildOverviewPdfReportData logic verifications passed successfully!");
}

try {
  runTests();
  process.exit(0);
} catch (e: any) {
  console.error("[TEST] Error executing test cases:", e);
  process.exit(1);
}
