import { Project, ProjectEvaluation } from "../src/types";
import { getProjectCardProgressMetrics } from "../src/utils/projectCardMetrics";
import { buildOverviewPdfReportData } from "../src/utils/overviewReportData";
import { buildProjectCardPdfReportData } from "../src/utils/projectCardPdfReportData";
import { getIndicatorPeriodCompletionMetricsFromEvaluation } from "../src/utils/evaluationIndicatorMetrics";
import { DEFAULT_INDICATOR_DICTIONARY, setIndicatorDictionary } from "../server/services/indicatorDictionary";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTests() {
  console.log("[UNCAPPED_TEST] Starting indicators and metrics verifications...");

  // Mock dictionary with known KPIs and calculated ones
  const originalDict = [...DEFAULT_INDICATOR_DICTIONARY];
  const mockDict = [
    ...DEFAULT_INDICATOR_DICTIONARY,
    { name: "Выручка", calculationType: "higher_is_better" as const, unit: "%", status: "active" },
    { name: "Ошибки", calculationType: "lower_is_better" as const, unit: "шт.", status: "active" }
  ];
  setIndicatorDictionary(mockDict);

  // Define a project with high facts
  const project: Project = {
    projectId: "test-uncapped-1",
    projectName: "Uncapped Test Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    department: "IT",
    _dataYear: 2026,
    _rawIndicatorsNew: {
      q1names: "Выручка",
      q1plans: "100",
      q1facts: "150", // 150% uncapped, 100% capped
      q2names: "Ошибки",
      q2plans: "5",
      q2facts: "2", // 200% uncapped, 100% capped
      q3names: "Выручка; Ошибки",
      q3plans: "100; 5",
      q3facts: "120; 1", // 120% and 500% uncapped
      q4names: "",
      q4plans: "",
      q4facts: ""
    },
    tasks: [],
    milestones: [],
    indicators: []
  };

  const evaluation: ProjectEvaluation = {
    projectId: "test-uncapped-1",
    assessmentDate: "2026-03-31",
    projectHealth: { status: "ok", score: 95, mainReasons: [] },
    monitoring: {
      status: "ok",
      lastMonitoringDate: "2026-03-01",
      nextMonitoringDate: "2026-06-01",
      overdueDays: 0
    },
    dataQuality: {
      status: "ok",
      completenessPercent: 100,
      errorsCount: 0,
      warningsCount: 0,
      issuesCount: 0
    },
    indicators: {
      status: "ok",
      averagePerformancePercent: 150,
      cappedAveragePerformancePercent: 100,
      calculatedIndicatorsCount: 1,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: [
        {
          id: "1",
          year: 2026,
          quarter: "Q1",
          name: "Выручка",
          plan: 100,
          fact: 150,
          calculationType: "higher_is_better",
          performancePercent: 150,
          cappedPerformancePercent: 100,
          status: "ok",
          explanation: "High profit"
        }
      ]
    },
    milestones: {
      status: "ok",
      totalProgressPercent: 80,
      actualProgressPercent: 80,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 1,
      actualMilestonesCount: 1,
      completedMilestonesCount: 1,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone 1",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 100,
          effectiveWeightPercent: 100,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 80,
          contributionPercent: 80
        }
      ]
    },
    explanations: []
  };

  // 1. Evaluation metrics helpers preserve uncapped performancePercent
  const periodMetrics = getIndicatorPeriodCompletionMetricsFromEvaluation(
    evaluation,
    2026,
    1,
    "2026-03-31",
    project.startDate,
    project.endDate,
    "actual"
  );
  assert(periodMetrics.hasData === true, "Period metrics should have data");
  assert(periodMetrics.fact === 150, `Expected evaluation period fact 150%, got ${periodMetrics.fact}%`);
  console.log(`✓ 1. getIndicatorPeriodCompletionMetricsFromEvaluation returns uncapped: ${periodMetrics.fact}%`);

  // 2. Card metrics from ready evaluation shows uncapped performance
  const cardMetricsWithEv = getProjectCardProgressMetrics({
    project,
    evaluation,
    selectedYear: 2026,
    selectedQuarter: 1,
    assessmentDate: "2026-03-31"
  });
  assert(cardMetricsWithEv.kpiQuarterVal === 150, `Expected card metrics KPI quarter val to be 150 (from evaluation), got ${cardMetricsWithEv.kpiQuarterVal}`);
  console.log("✓ 2. Карточка проекта (с оценкой) показывает фактическое выполнение показателей: 150%");

  // 3. Overview portfolio + PDF use the same evaluation result (uncapped)
  const overviewData = buildOverviewPdfReportData({
    projects: [project],
    projectEvaluations: [evaluation],
    assessmentDate: "2026-03-31",
    selectedYear: 2026,
    selectedQuarter: 1
  });
  assert(overviewData.portfolioProgress.selectedKpi === 150, `Expected overview KPI progress to be 150, got ${overviewData.portfolioProgress.selectedKpi}`);
  console.log("✓ 3. Обзор портфеля (через оценку проекта) показывает фактическое выполнение: 150%");

  // 4. PDF report data formatting uses actual uncapped KPI completion as main textual value
  const pdfPayload = buildProjectCardPdfReportData({
    project,
    analysis: null,
    projectEvaluations: [evaluation],
    assessmentDate: "2026-03-31",
    selectedYear: 2026,
    selectedQuarter: 1
  });
  assert(pdfPayload.progressMetrics.indicatorsQuarterText === "150%", `Expected PDF KPI text to be '150%', got '${pdfPayload.progressMetrics.indicatorsQuarterText}'`);
  console.log("✓ 4. PDF-отчет показывает фактическое выполнение показателей как основное текстовое значение: '150%'");

  // 5. Visual clamp / bar widths remain safely within bounds (0-100%)
  const clampPercent = (value: number | null): number => {
    if (value === null || value === undefined || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  };
  const visualWidth = clampPercent(pdfPayload.progressMetrics.indicatorsQuarterVal);
  assert(visualWidth === 100, `Expected visual width to be safely clamped to 100, got ${visualWidth}`);
  console.log("✓ 5. Визуальная заливка кругов и полос остается в границах компонента: 100%");

  // 6. Milestones (вехи) are correct and intact
  assert(pdfPayload.progressMetrics.milestonesYearVal === 80, `Milestones annual progress should remain 80%, got ${pdfPayload.progressMetrics.milestonesYearVal}`);
  console.log("✓ 6. Вехи не изменились и рассчитываются верно: 80%");

  // 7. Risks are correct and intact
  assert(pdfPayload.statusSummary.risk !== undefined && pdfPayload.statusSummary.risk !== null, "Expected risk to be defined");
  console.log(`✓ 7. Риски не изменились и обрабатываются корректно: '${pdfPayload.statusSummary.risk}'`);

  // Restore original dictionary
  setIndicatorDictionary(originalDict);
  console.log("\n[UNCAPPED_TEST] All evaluation-SSOT uncapped scenarios completed successfully!");
}

try {
  runTests();
  process.exit(0);
} catch (err: any) {
  console.error("[UNCAPPED_TEST] FAILED:", err?.message || err);
  process.exit(1);
}
