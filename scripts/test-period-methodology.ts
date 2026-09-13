/**
 * Methodology regression suite (period applicability + selectedYear + Overview/PDF parity).
 * Terminology: показатели (indicators) — not KPI.
 */
import { calculateUnifiedProjectRisk, resolveProjectSelectedYear } from "../src/utils/projectRegistryStatus.js";
import {
  resolveYearWithinAvailableYears,
  getLifecycleMilestoneProgressFromEvaluation,
  getLifecycleIndicatorPerformanceFromEvaluation,
  getQuarterPeriodStatus,
  resolveEffectiveAssessmentDateForSelectedYear
} from "../src/utils/periodApplicability.js";
import { getNormalizedMilestonesForYear } from "../src/utils/projectCalculations.js";
import { getIndicatorYearCompletionMetricsFromEvaluation } from "../src/utils/evaluationIndicatorMetrics.js";
import { getMilestoneYearCompletionMetricsFromEvaluation } from "../src/utils/evaluationMilestoneMetrics.js";
import { computePortfolioProgressAggregates } from "../src/utils/overviewPortfolioAggregates.js";
import { buildOverviewPdfReportData } from "../src/utils/overviewReportData.js";
import { evaluateProject } from "../server/services/projectEvaluationService.js";
import type { Project, ProjectEvaluation } from "../src/types.js";
import type { NormalizedProject } from "../server/services/projectNormalizer.js";
import { getProjectCardProgressMetrics } from "../src/utils/projectCardMetrics.js";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function runTest(name: string, fn: () => void) {
  console.log(`[PERIOD_METHODOLOGY] Running: ${name}...`);
  try {
    fn();
    console.log(`[PERIOD_METHODOLOGY] ✓ Passed\n`);
  } catch (e) {
    console.error(`[PERIOD_METHODOLOGY] ❌ FAILED: ${name}`);
    throw e;
  }
}

const baseProject = (over: Partial<Project> = {}): Project => ({
  projectId: "P1",
  projectName: "Test",
  status: "active",
  stage: "В работе",
  startDate: "2025-01-01",
  endDate: "2026-12-31",
  deadlineAt: "2026-12-31",
  tasks: [],
  milestones: [],
  indicators: [],
  ...over
});

runTest("Future показатель with early fact does not affect average or risk", () => {
  const normalized: NormalizedProject = {
    id: "10",
    projectId: "10",
    sourceRowIndex: 1,
    baseInfo: {
      title: "Future Fact",
      goals: "g",
      resultImages: "образ",
      type: "Проект",
      stage: "В работе",
      priority: 1,
      startDate: "2026-01-01",
      endDate: "2026-12-31"
    },
    people: {
      projectManager: "pm",
      projectAdmin: "pa",
      customers: ["c"],
      team: ["t"],
      responsible: "r",
      owner: "o",
      monitoringParticipants: ["m"]
    },
    organization: { departments: ["IT"] },
    monitoring: {
      startDate: "2026-01-10",
      regularityWeeks: 4,
      lastMonitoringDate: "2026-05-01",
      nextMonitoringDate: "2026-06-20",
      isMonitoringOverdue: false
    },
    links: { bitrixUrl: null },
    milestones: [],
    indicators: [
      {
        id: "i1",
        name: "Выручка",
        year: 2026,
        quarter: "Q1",
        plan: 100,
        fact: 100,
        periodStatus: "past",
        factStatus: "filled",
        isApplicableQuarter: true,
        sourceColumns: { name: "", plan: "", fact: "" }
      },
      {
        id: "i2",
        name: "Выручка",
        year: 2026,
        quarter: "Q4",
        plan: 100,
        fact: 50,
        periodStatus: "future",
        factStatus: "filled",
        isApplicableQuarter: true,
        sourceColumns: { name: "", plan: "", fact: "" }
      }
    ],
    applicableQuarters: [],
    dataQuality: { status: "ok", errorsCount: 0, warningsCount: 0, issues: [] },
    source: { rawRow: {}, detectedYears: [2026] }
  };

  const dict = [
    { name: "Выручка", calculationType: "higher_is_better" as const, aliases: [] as string[], unit: "%" }
  ];

  const ev = evaluateProject(normalized, {
    assessmentDate: new Date("2026-06-15"),
    indicatorDictionary: dict
  });

  assert(ev.indicators.skippedFutureIndicatorsCount >= 1, "future indicator must be skipped from aggregates");
  assert(ev.indicators.averagePerformancePercent === 100, `avg must be 100 from Q1 only, got ${ev.indicators.averagePerformancePercent}`);
  assert(ev.indicators.calculatedIndicatorsCount === 1, "only one indicator calculated for averages");

  const futureRow = ev.indicators.indicatorResults.find(i => i.quarter === "Q4");
  assert(futureRow?.status === "future", "future row kept for display");
  assert(futureRow?.fact === 50, "early fact preserved for display");

  const yearActual = getIndicatorYearCompletionMetricsFromEvaluation(
    ev as any,
    2026,
    "2026-06-15",
    "2026-01-01",
    "2026-12-31",
    "actual"
  );
  assert(yearActual.hasData && Math.abs(yearActual.fact - 100) < 0.01, "actual year avg excludes future");

  const yearRisk = getLifecycleIndicatorPerformanceFromEvaluation(
    ev as any,
    "2026-06-15",
    "2026-01-01",
    "2026-12-31",
    "risk",
    { year: 2026 }
  );
  assert(yearRisk.calculatedCount === 1, "risk excludes current+future; only completed Q1");
});

runTest("Current period enters Overview actual, not risk until completed", () => {
  const evaluation: ProjectEvaluation = {
    projectId: "P1",
    assessmentDate: "2026-05-15",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 50,
      actualProgressPercent: 50,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 2,
      actualMilestonesCount: 2,
      completedMilestonesCount: 1,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m1",
          name: "Q1",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 50,
          effectiveWeightPercent: 50,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 50
        },
        {
          id: "m2",
          name: "Q2",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 50,
          effectiveWeightPercent: 50,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 40,
          contributionPercent: 20
        }
      ]
    },
    indicators: {
      status: "ok",
      averagePerformancePercent: 100,
      cappedAveragePerformancePercent: 100,
      calculatedIndicatorsCount: 1,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: []
    },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const actual = getLifecycleMilestoneProgressFromEvaluation(
    evaluation,
    "2026-05-15",
    "2026-01-01",
    "2026-12-31",
    "actual"
  );
  const risk = getLifecycleMilestoneProgressFromEvaluation(
    evaluation,
    "2026-05-15",
    "2026-01-01",
    "2026-12-31",
    "risk"
  );

  // May 15 2026 → Q1 completed, Q2 current
  assert(actual.progressPercent !== null && Math.abs(actual.progressPercent - 70) < 0.1, `actual should include Q2 → 70%, got ${actual.progressPercent}`);
  assert(risk.progressPercent !== null && Math.abs(risk.progressPercent - 100) < 0.1, `risk completed-only → 100%, got ${risk.progressPercent}`);
  assert(getQuarterPeriodStatus(2026, 2, "2026-05-15", "2026-01-01", "2026-12-31") === "current", "Q2 is current");
});

runTest("After deadline uses full lifecycle weighted progress", () => {
  const evaluation: ProjectEvaluation = {
    projectId: "P1",
    assessmentDate: "2027-02-01",
    dataQuality: { status: "ok", completenessPercent: 95, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 55,
      actualProgressPercent: 55,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 2,
      actualMilestonesCount: 2,
      completedMilestonesCount: 1,
      overdueMilestonesCount: 1,
      milestoneResults: [
        {
          id: "m2025",
          name: "A",
          year: 2025,
          quarter: "Q4",
          originalWeightPercent: 40,
          effectiveWeightPercent: 40,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 40
        },
        {
          id: "m2026",
          name: "B",
          year: 2026,
          quarter: "Q4",
          originalWeightPercent: 60,
          effectiveWeightPercent: 60,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 25,
          contributionPercent: 15
        }
      ]
    },
    indicators: {
      status: "ok",
      averagePerformancePercent: null,
      cappedAveragePerformancePercent: null,
      calculatedIndicatorsCount: 0,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: []
    },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "risk", score: 40, mainReasons: [] },
    explanations: []
  };

  const project = baseProject({
    startDate: "2025-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    _rawByYear: {
      2025: { milestones: { q4names: "A", q4progress: "100", q4weights: "40" }, indicators: {} },
      2026: { milestones: { q4names: "B", q4progress: "25", q4weights: "60" }, indicators: {} }
    } as any
  });

  const lifecycle = getLifecycleMilestoneProgressFromEvaluation(
    evaluation,
    "2027-02-01",
    project.startDate,
    project.deadlineAt,
    "risk"
  );
  assert(lifecycle.progressPercent !== null && Math.abs(lifecycle.progressPercent - 55) < 0.1, `lifecycle 55%, got ${lifecycle.progressPercent}`);

  const risk = calculateUnifiedProjectRisk(project, evaluation, "2027-02-01", true);
  assert(
    risk.details.milestoneActualProgressForRisk !== null &&
      Math.abs(risk.details.milestoneActualProgressForRisk - 55) < 0.1,
    `risk uses lifecycle 55%, not first-year 100%; got ${risk.details.milestoneActualProgressForRisk}`
  );

  const selected = resolveProjectSelectedYear(project, evaluation, "2027-02-01");
  assert(selected === 2026, `selectedYear after end must be last year 2026, got ${selected}`);
});

runTest("Assessment before project start selects first year", () => {
  const project = baseProject({ startDate: "2025-06-01", endDate: "2026-12-31", deadlineAt: "2026-12-31" });
  const y = resolveProjectSelectedYear(project, null, "2024-01-10");
  assert(y === 2025, `expected first year 2025, got ${y}`);
});

runTest("Assessment after project end selects last year", () => {
  const project = baseProject({ startDate: "2025-01-01", endDate: "2026-12-31", deadlineAt: "2026-12-31" });
  const y = resolveProjectSelectedYear(project, null, "2028-03-01");
  assert(y === 2026, `expected last year 2026, got ${y}`);
});

runTest("First year of portfolio is not used as fallback when assessment is after range", () => {
  const years = [2024, 2025, 2026];
  const y = resolveYearWithinAvailableYears(years, "2028-01-01");
  assert(y === 2026, `must clamp to last=2026, not first=2024; got ${y}`);
  const yEarly = resolveYearWithinAvailableYears(years, "2020-01-01");
  assert(yEarly === 2024, `before range → first=2024, got ${yEarly}`);
  const yMissingInsideRange = resolveYearWithinAvailableYears([2024, 2026, 2028], "2027-01-01");
  assert(yMissingInsideRange === 2026, `missing assessment year must select nearest prior year=2026, got ${yMissingInsideRange}`);
});

runTest("Raw milestone actual progress excludes future-quarter early facts", () => {
  const project = baseProject({
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "Completed milestone",
          q1progress: "100",
          q1weights: "25",
          q2names: "Current milestone",
          q2progress: "50",
          q2weights: "25",
          q3names: "Future milestone with early fact",
          q3progress: "100",
          q3weights: "50"
        },
        indicators: {}
      }
    }
  });

  const normalized = getNormalizedMilestonesForYear(project, 2026, "2026-06-15");

  assert(normalized.totalProgressPercent === 87.5, `full-year total must retain all raw facts, got ${normalized.totalProgressPercent}`);
  assert(normalized.actualProgressPercent === 75, `actual must include only completed/current weighted progress, got ${normalized.actualProgressPercent}`);
  assert(
    normalized.milestones.find(m => m.quarter === "Q3")?.periodStatus === "future",
    "Q3 must be classified as future at the June assessment boundary"
  );
});

runTest("Overview and PDF return identical portfolio aggregates", () => {
  const projects: Project[] = [
    baseProject({
      projectId: "A",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      deadlineAt: "2026-12-31"
    })
  ];
  const evaluations: ProjectEvaluation[] = [
    {
      projectId: "A",
      assessmentDate: "2026-06-15",
      dataQuality: { status: "ok", completenessPercent: 90, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
      milestones: {
        status: "ok",
        totalProgressPercent: 60,
        actualProgressPercent: 60,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 1,
        actualMilestonesCount: 1,
        completedMilestonesCount: 1,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "m1",
            name: "M",
            year: 2026,
            quarter: "Q1",
            originalWeightPercent: 100,
            effectiveWeightPercent: 100,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 60,
            contributionPercent: 60
          }
        ]
      },
      indicators: {
        status: "ok",
        averagePerformancePercent: 80,
        cappedAveragePerformancePercent: 80,
        calculatedIndicatorsCount: 1,
        skippedFutureIndicatorsCount: 0,
        missingDictionaryCount: 0,
        indicatorResults: [
          {
            id: "i1",
            name: "Показатель 1",
            year: 2026,
            quarter: "Q1",
            plan: 100,
            fact: 80,
            calculationType: "higher_is_better",
            performancePercent: 80,
            cappedPerformancePercent: 80,
            status: "ok",
            explanation: ""
          }
        ]
      },
      monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
      projectHealth: { status: "attention", score: 70, mainReasons: [] },
      explanations: []
    }
  ];

  const ui = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-15"
  });

  const pdf = buildOverviewPdfReportData({
    projects,
    projectEvaluations: evaluations,
    assessmentDate: "2026-06-15",
    selectedYear: 2026,
    selectedQuarter: 2
  });

  assert(ui.selectedMilestones === pdf.portfolioProgress.selectedMilestones, "quarter milestones must match");
  assert(ui.yearMilestones === pdf.portfolioProgress.yearMilestones, "year milestones must match");
  assert(ui.selectedIndicators === pdf.portfolioProgress.selectedKpi, "quarter показатели must match");
  assert(ui.yearIndicators === pdf.portfolioProgress.yearKpi, "year показатели must match");
});

runTest("Future quarter milestones excluded from Overview quarterly aggregate even with early fact", () => {
  const projects: Project[] = [
    baseProject({
      projectId: "F",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      deadlineAt: "2026-12-31"
    })
  ];
  const evaluations: ProjectEvaluation[] = [
    {
      projectId: "F",
      assessmentDate: "2026-06-15",
      dataQuality: { status: "ok", completenessPercent: 90, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
      milestones: {
        status: "ok",
        totalProgressPercent: 80,
        actualProgressPercent: 80,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 2,
        actualMilestonesCount: 2,
        completedMilestonesCount: 1,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "m1",
            name: "Q1",
            year: 2026,
            quarter: "Q1",
            originalWeightPercent: 50,
            effectiveWeightPercent: 50,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 100,
            contributionPercent: 50
          },
          {
            id: "m4",
            name: "Q4 early fact",
            year: 2026,
            quarter: "Q4",
            originalWeightPercent: 50,
            effectiveWeightPercent: 50,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 100,
            contributionPercent: 50
          }
        ]
      },
      indicators: {
        status: "ok",
        averagePerformancePercent: null,
        cappedAveragePerformancePercent: null,
        calculatedIndicatorsCount: 0,
        skippedFutureIndicatorsCount: 0,
        missingDictionaryCount: 0,
        indicatorResults: []
      },
      monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
      projectHealth: { status: "ok", score: 100, mainReasons: [] },
      explanations: []
    }
  ];

  const futureQ = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 4,
    assessmentDate: "2026-06-15"
  });
  assert(futureQ.selectedMilestones === null, "future Q4 must not enter quarterly milestone average");

  const yearAgg = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-15"
  });
  assert(
    yearAgg.yearMilestones !== null && Math.abs(yearAgg.yearMilestones - 100) < 0.1,
    `year actual should use only Q1 (completed), got ${yearAgg.yearMilestones}`
  );
});

runTest("resolveEffectiveAssessmentDateForSelectedYear: past / current / future year rules", () => {
  assert(
    resolveEffectiveAssessmentDateForSelectedYear(2025, "2026-06-15") === "2025-12-31",
    "past year → Dec 31 of selected year"
  );
  assert(
    resolveEffectiveAssessmentDateForSelectedYear(2026, "2026-06-15") === "2026-06-15",
    "current year → real assessment date"
  );
  assert(
    resolveEffectiveAssessmentDateForSelectedYear(2027, "2026-06-15") === "2026-06-15",
    "future year → real assessment date (not Dec 31 of future year)"
  );
});

runTest("Selecting a future year keeps assessment date — early facts do not enter year aggregates", () => {
  const projects: Project[] = [
    baseProject({
      projectId: "FY",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      deadlineAt: "2027-12-31"
    })
  ];
  const evaluations: ProjectEvaluation[] = [
    {
      projectId: "FY",
      assessmentDate: "2026-06-15",
      dataQuality: { status: "ok", completenessPercent: 90, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
      milestones: {
        status: "ok",
        totalProgressPercent: 100,
        actualProgressPercent: 100,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 2,
        actualMilestonesCount: 2,
        completedMilestonesCount: 0,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "m2027q1",
            name: "Future Q1 early fact",
            year: 2027,
            quarter: "Q1",
            originalWeightPercent: 50,
            effectiveWeightPercent: 50,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 100,
            contributionPercent: 50
          },
          {
            id: "m2027q2",
            name: "Future Q2 early fact",
            year: 2027,
            quarter: "Q2",
            originalWeightPercent: 50,
            effectiveWeightPercent: 50,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 80,
            contributionPercent: 40
          }
        ]
      },
      indicators: {
        status: "ok",
        averagePerformancePercent: 100,
        cappedAveragePerformancePercent: 100,
        calculatedIndicatorsCount: 1,
        skippedFutureIndicatorsCount: 0,
        missingDictionaryCount: 0,
        indicatorResults: [
          {
            id: "i2027",
            name: "Показатель 2027",
            year: 2027,
            quarter: "Q1",
            plan: 100,
            fact: 100,
            calculationType: "higher_is_better",
            performancePercent: 100,
            cappedPerformancePercent: 100,
            status: "ok",
            explanation: ""
          }
        ]
      },
      monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
      projectHealth: { status: "ok", score: 100, mainReasons: [] },
      explanations: []
    }
  ];

  // Bug previously: selectedYear=2027 forced assessment to 2027-12-31 → year avg = 90%.
  const ui = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2027,
    selectedQuarter: 1,
    assessmentDate: resolveEffectiveAssessmentDateForSelectedYear(2027, "2026-06-15")
  });
  assert(ui.yearMilestones === null, `future-year milestones must stay excluded, got ${ui.yearMilestones}`);
  assert(ui.selectedMilestones === null, `future-year Q1 milestones must stay excluded, got ${ui.selectedMilestones}`);
  assert(ui.yearIndicators === null, `future-year indicators must stay excluded, got ${ui.yearIndicators}`);

  const pdf = buildOverviewPdfReportData({
    projects,
    projectEvaluations: evaluations,
    assessmentDate: "2026-06-15",
    selectedYear: 2027,
    selectedQuarter: 1
  });
  assert(pdf.portfolioProgress.yearMilestones === null, "PDF year milestones must exclude future year early facts");
  assert(pdf.effectiveAssessmentDate === "2026-06-15", `PDF effective date must stay 2026-06-15, got ${pdf.effectiveAssessmentDate}`);

  const yearMetrics = getMilestoneYearCompletionMetricsFromEvaluation(
    evaluations[0],
    2027,
    resolveEffectiveAssessmentDateForSelectedYear(2027, "2026-06-15"),
    "2026-01-01",
    "2027-12-31",
    "actual"
  );
  assert(!yearMetrics.hasData, "year completion helper must exclude future year when assessment is still in prior year");

  // Card metrics for future year must also keep real assessment date
  const card = getProjectCardProgressMetrics({
    project: projects[0],
    evaluation: evaluations[0],
    selectedYear: 2027,
    selectedQuarter: 1,
    assessmentDate: "2026-06-15"
  });
  assert(card.milestonesYearVal === null, `card year milestones must be null for future year, got ${card.milestonesYearVal}`);
});

console.log("-----------------------------------------------------------");
console.log("All period methodology tests passed successfully!");
console.log("-----------------------------------------------------------");
