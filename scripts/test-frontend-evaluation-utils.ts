import { 
  getEvaluationByProjectId, 
  getNormalizedProjectById, 
  formatPercent, 
  formatNullable, 
  formatStatusLabel, 
  getStatusTone,
  formatPercentLabel,
  getProjectStatusTooltipData
} from "../src/utils/evaluationUtils";

import {
  getRegistryMilestoneProgress,
  getRegistryKpiProgress,
  getRegistryKpiMetrics,
  getRegistryHealthStatus,
  getRegistryMonitoringStatus,
  getRegistryDataQuality
} from "../src/utils/projectRegistryMetrics";

import { ProjectEvaluation, NormalizedProject, Project } from "../src/types";
import {
  getMilestoneTotalMetricsFromEvaluation,
  getMilestonePeriodContributionMetricsFromEvaluation,
  getMilestoneYearContributionMetricsFromEvaluation,
  getMilestonePeriodCompletionMetricsFromEvaluation,
  getMilestoneYearCompletionMetricsFromEvaluation
} from "../src/utils/evaluationMilestoneMetrics";
import {
  getIndicatorPeriodCompletionMetricsFromEvaluation,
  getIndicatorYearCompletionMetricsFromEvaluation
} from "../src/utils/evaluationIndicatorMetrics";

function runTest(name: string, fn: () => void) {
  console.log(`[FRONTEND_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[FRONTEND_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[FRONTEND_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

runTest("getEvaluationByProjectId should find matching evaluation", () => {
  const evaluations: ProjectEvaluation[] = [
    {
      projectId: "P-1",
      assessmentDate: "2026-06-01",
      dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
      milestones: { status: "ok", totalProgressPercent: 100, actualProgressPercent: 100, totalWeightPercent: 100, weightControlStatus: "ok", milestonesCount: 1, actualMilestonesCount: 1, completedMilestonesCount: 1, overdueMilestonesCount: 0 },
      indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
      monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
      projectHealth: { status: "ok", score: 100, mainReasons: [] },
      explanations: []
    }
  ];

  const res1 = getEvaluationByProjectId(evaluations, "P-1");
  assert(res1 !== null && res1.projectId === "P-1", "Should find P-1");

  const res2 = getEvaluationByProjectId(evaluations, "P-UNKNOWN");
  assert(res2 === null, "Should return null for non-existent projects");

  const res3 = getEvaluationByProjectId(null, "P-1");
  assert(res3 === null, "Should return null if input array is missing");
});

runTest("getNormalizedProjectById should find normalized project", () => {
  const normalized: NormalizedProject[] = [
    {
      id: "P-1",
      projectId: "P-1",
      sourceRowIndex: 3,
      baseInfo: { title: "Test A", goals: "", resultImages: "", type: "Проект", stage: "В работе", priority: 1, startDate: null, endDate: null },
      people: { projectManager: null, projectAdmin: null, customers: [], team: [], responsible: null, owner: null, monitoringParticipants: [] },
      organization: { departments: [] },
      monitoring: { startDate: null, regularityWeeks: null, lastMonitoringDate: null, nextMonitoringDate: null, isMonitoringOverdue: null },
      links: { bitrixUrl: null },
      milestones: [],
      indicators: [],
      applicableQuarters: [],
      dataQuality: { status: "ok", errorsCount: 0, warningsCount: 0, issues: [] },
      source: { rawRow: {}, detectedYears: [] }
    }
  ];

  const res1 = getNormalizedProjectById(normalized, "P-1");
  assert(res1 !== null && res1.projectId === "P-1", "Should find normalized P-1");

  const res2 = getNormalizedProjectById(null, "P-1");
  assert(res2 === null, "Should return null for null inputs");
});

runTest("formatPercent formatting rules", () => {
  assert(formatPercent(100) === "100.0%", "Should format 100 exactly");
  assert(formatPercent(95.45) === "95.5%", "Should round to 1 decimal place");
  assert(formatPercent(null) === "-", "Should render null cleanly as -");
  assert(formatPercent(undefined) === "-", "Should render undefined safely");
});

runTest("formatNullable formatting rules", () => {
  assert(formatNullable("Hello") === "Hello", "Should return present strings");
  assert(formatNullable(null) === "-", "Should return - for null by default");
  assert(formatNullable(undefined, "N/A") === "N/A", "Should return custom placeholder if specified");
  assert(formatNullable("") === "-", "Should treat empty string as empty");
});

runTest("formatStatusLabel status localization translation map", () => {
  assert(formatStatusLabel("ok") === "В норме", "Should map ok standard");
  assert(formatStatusLabel("attention") === "Требует внимания", "Should map attention");
  assert(formatStatusLabel("risk") === "Зона риска", "Should map risk");
  assert(formatStatusLabel("not_enough_data") === "Недостаточно данных", "Should map not_enough_data");
  assert(formatStatusLabel("warning") === "Предупреждение", "Should map warning");
  assert(formatStatusLabel("error") === "Ошибка", "Should map error");
  assert(formatStatusLabel("not_applicable") === "Не применимо", "Should map not_applicable");
  assert(formatStatusLabel("overdue") === "Просрочено", "Should map overdue");
  assert(formatStatusLabel("Some Status") === "Some Status", "Should keep unknown status verbatim");
  assert(formatStatusLabel(null) === "-", "Should return hyphen for null");
});

runTest("getStatusTone visual colors map", () => {
  const toneOk = getStatusTone("ok");
  assert(toneOk.text.includes("emerald"), "ok visual should contain emerald green");
  
  const toneRisk = getStatusTone("risk");
  assert(toneRisk.text.includes("rose"), "risk visual should contain rose red");

  const toneUnknown = getStatusTone("something");
  assert(toneUnknown.text.includes("zinc"), "fallback visual should contain zinc gray");
});

runTest("formatPercentLabel for status/priority segments", () => {
  // Integers should be returned without decimal part
  assert(formatPercentLabel(2, 5) === "40%", "2 out of 5 should format directly as 40%");
  assert(formatPercentLabel(1, 4) === "25%", "1 out of 4 should format directly as 25%");

  // Fractions should round to 1 decimal place
  assert(formatPercentLabel(1, 3) === "33.3%", "1 out of 3 should design 33.3%");
  assert(formatPercentLabel(2, 3) === "66.7%", "2 out of 3 should design 66.7%");

  // Zero segments or negative or invalid denominators should return empty string
  assert(formatPercentLabel(0, 10) === "", "Zero segment must return empty string");
  assert(formatPercentLabel(null, 10) === "", "Null segment must return empty string");
  assert(formatPercentLabel(1, 0) === "", "Zero total must return empty string");
  assert(formatPercentLabel(-1, 5) === "", "Negative value must return empty string");
});

runTest("Status segments and priority segments calculation verification", () => {
  const totalProjects = 15;
  const inWorkCount = 6; // 6 / 15 * 100 = 40%
  const plannedCount = 3;  // 3 / 15 * 100 = 20%
  const onPauseCount = 5;  // 5 / 15 * 100 = 33.333% -> 33.3%
  const completedCount = 1; // 1 / 15 * 100 = 6.666% -> 6.7%
  const zeroCount = 0;

  // Verify status segments
  assert(formatPercentLabel(inWorkCount, totalProjects) === "40%", "In Work should be 40%");
  assert(formatPercentLabel(plannedCount, totalProjects) === "20%", "Planned should be 20%");
  assert(formatPercentLabel(onPauseCount, totalProjects) === "33.3%", "On Pause should be 33.3%");
  assert(formatPercentLabel(completedCount, totalProjects) === "6.7%", "Completed should be 6.7%");
  
  // Verify zero segments don't get a signature / label
  assert(formatPercentLabel(zeroCount, totalProjects) === "", "Zero segment must not be labeled");

  // Verify priority segments
  const p0count = 10; // 10 / 15 * 100 = 66.666% -> 66.7%
  const p1count = 5;  // 5 / 15 * 100 = 33.333% -> 33.3%
  const p2count = 0;  // 0 / 15 * 100 = 0% -> ""

  assert(formatPercentLabel(p0count, totalProjects) === "66.7%", "P0 Priority should be 66.7%");
  assert(formatPercentLabel(p1count, totalProjects) === "33.3%", "P1 Priority should be 33.3%");
  assert(formatPercentLabel(p2count, totalProjects) === "", "P2 Priority (zero) must be empty");
});

runTest("assessmentDate selection and apply lifecycle logic to prevent extra refetch", () => {
  // Let's verify our logic with a mock controller of the state
  let mode: 'today' | 'custom' = 'today';
  let selectedAppliedCustomDate = "2026-06-04";
  let draftAssessmentDate = selectedAppliedCustomDate;

  // Today's date mock
  const todayStr = "2026-06-04";

  function getAppliedDate() {
    return mode === 'today' ? todayStr : selectedAppliedCustomDate;
  }

  // 1. Initial State
  assert(getAppliedDate() === "2026-06-04", "Should apply today on start");

  // 2. User types draft date (navigation/months change)
  draftAssessmentDate = "2026-07-15"; // modified draft
  // Verify that applied date is NOT yet updated! (Thus avoiding premature API refetch during navigation/typing)
  assert(getAppliedDate() === "2026-06-04", "Applied date must remain unchanged during draft navigation");

  // 3. User clicks "Apply" or does valid completed action
  mode = 'custom';
  selectedAppliedCustomDate = draftAssessmentDate;
  assert(getAppliedDate() === "2026-07-15", "Applied date must only update after explicit apply action");

  // 4. Repeated selection of same date
  const previousAppliedDate = getAppliedDate();
  draftAssessmentDate = "2026-07-15"; // Choose same date again
  if (draftAssessmentDate !== selectedAppliedCustomDate) {
    selectedAppliedCustomDate = draftAssessmentDate;
  }
  assert(getAppliedDate() === previousAppliedDate, "No actual work/refetch should be done if date didn't change");
});

runTest("getRegistryMetrics should use evaluations if present and return safe defaults otherwise", () => {
  const mockProject: Project = {
    id: "proj1",
    projectId: "proj1",
    projectName: "Project Beta",
    status: "active",
    stage: "In Work",
    createdAt: "2026-01-01"
  } as any;

  // 1. Without ProjectEvaluation (safe defaults)
  const milestoneEmpty = getRegistryMilestoneProgress(mockProject, null);
  assert(milestoneEmpty === 0, "Default milestone progress should be 0");

  const monitoringStatusEmpty = getRegistryMonitoringStatus(mockProject, null);
  assert(monitoringStatusEmpty === "not_enough_data", "Default monitoring status should be 'not_enough_data'");

  const dqEmpty = getRegistryDataQuality(mockProject, null);
  assert(dqEmpty === null, "Default data quality should be null");

  // 2. With modern ProjectEvaluation (prioritizes evaluation)
  const mockEvaluations: ProjectEvaluation[] = [
    {
      projectId: "proj1",
      assessmentDate: "2026-06-04",
      dataQuality: { status: "ok", completenessPercent: 95, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
      milestones: { status: "ok", totalProgressPercent: 100, actualProgressPercent: 75, totalWeightPercent: 100, weightControlStatus: "ok", milestonesCount: 1, actualMilestonesCount: 1, completedMilestonesCount: 1, overdueMilestonesCount: 0 },
      indicators: { status: "ok", averagePerformancePercent: 120, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 1, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
      monitoring: { status: "overdue", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: 5 },
      projectHealth: { status: "risk", score: 40, mainReasons: [] },
      explanations: []
    }
  ];

  const milestoneVal = getRegistryMilestoneProgress(mockProject, mockEvaluations);
  assert(milestoneVal === 75, "Milestone progress should be 75 from evaluation");

  const kpiVal = getRegistryKpiProgress(mockProject, mockEvaluations);
  assert(kpiVal === 100, "KPI performance should be 100 from evaluation");

  const healthStatusVal = getRegistryHealthStatus(mockProject, mockEvaluations);
  assert(healthStatusVal === "risk", "Health status should be 'risk' from evaluation");

  const monitoringStatusVal = getRegistryMonitoringStatus(mockProject, mockEvaluations);
  assert(monitoringStatusVal === "overdue", "Monitoring status should be 'overdue' from evaluation");

  const dqVal = getRegistryDataQuality(mockProject, mockEvaluations);
  assert(dqVal === 95, "Data quality should be 95 from evaluation");
});

runTest("Project status ordinary tooltip should conform to styling and methodology specifications", () => {
  const statuses = ['Норма', 'Зона риска', 'Недостаточно данных'] as const;
  const risks = ['Низкий', 'Средний', 'Высокий'] as const;

  for (const status of statuses) {
    for (const risk of risks) {
      const data = getProjectStatusTooltipData(status, risk);

      // 1. Tooltip must not contain technical, debug or score components in ordinary view
      const serializedData = JSON.stringify(data);
      assert(!serializedData.includes("SERVER API"), "Ordinary tooltip must not contain 'SERVER API'");
      assert(!serializedData.includes("score"), "Ordinary tooltip must not contain 'score'");
      assert(!serializedData.includes("Статус здоровья"), "Ordinary tooltip must not contain 'Статус здоровья'");

      // 2. Output strings must use only valid statuses
      assert(data.statusLabel.startsWith("Статус: "), "Status label should start with standard lead");
      const statusValue = data.statusLabel.replace("Статус: ", "");
      assert(statuses.includes(statusValue as any), "Status value must be one of: 'Норма', 'Зона риска', 'Недостаточно данных'");

      // 3. Methodology block must contain appropriate title
      assert(data.methodologyTitle === "Методология зоны риска", "Methodology title must be 'Методология зоны риска'");
      assert(data.methodologyDescription.includes("на выбранную дату оценки"), "Methodology description must explain assessment date aspect");
    }
  }
});

runTest("getMilestoneTotalMetricsFromEvaluation should calculate correct total milestone progress", () => {
  // Test 1: Null/undefined handling
  const resEmpty = getMilestoneTotalMetricsFromEvaluation(null);
  assert(resEmpty.plan === 100 && resEmpty.fact === 0 && !resEmpty.hasData, "Should return safe defaults on null");

  // Test 2: Normal evaluation
  const mockEv: ProjectEvaluation = {
    projectId: "P-1",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 85,
      actualProgressPercent: 90,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 2,
      actualMilestonesCount: 2,
      completedMilestonesCount: 1,
      overdueMilestonesCount: 0,
      milestoneResults: []
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };
  const resNormal = getMilestoneTotalMetricsFromEvaluation(mockEv);
  assert(resNormal.plan === 100 && resNormal.fact === 85 && resNormal.deviation === -15 && resNormal.hasData, "Should parse normal evaluation success");

  // Test 3: Weight error
  const mockEvError: ProjectEvaluation = {
    ...mockEv,
    milestones: {
      ...mockEv.milestones,
      weightControlStatus: "error"
    }
  };
  const resError = getMilestoneTotalMetricsFromEvaluation(mockEvError);
  assert(resError.plan === 100 && resError.fact === 0 && resError.deviation === -100 && !resError.hasData && resError.status === "error", "Should return errored values on weight sum error");
});

runTest("getMilestonePeriodContributionMetricsFromEvaluation should calculate period-level progress accurately", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-1",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 60,
      actualProgressPercent: 80,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 3,
      actualMilestonesCount: 3,
      completedMilestonesCount: 2,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone Q1 2026",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 30,
          effectiveWeightPercent: 30,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 30
        },
        {
          id: "m2",
          name: "Milestone Q2 2026",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 40,
          effectiveWeightPercent: 40,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 50,
          contributionPercent: 20
        },
        {
          id: "m3",
          name: "Milestone Q2 2027",
          year: 2027,
          quarter: "Q2",
          originalWeightPercent: 30,
          effectiveWeightPercent: 30,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 0,
          contributionPercent: 0
        },
        {
          id: "m4",
          name: "Excluded Milestone Q2 2026",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 10,
          effectiveWeightPercent: 10,
          weightSource: "explicit",
          isIncludedInProgress: false,
          completionPercent: 100,
          contributionPercent: 10
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  // Check 2026 Q1
  const m2026Q1 = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 1);
  assert(m2026Q1.plan === 30 && m2026Q1.fact === 30 && m2026Q1.deviation === 0 && m2026Q1.hasData, "2026 Q1 calculation failed");

  // Check 2026 Q2: must only sum isIncludedInProgress=true (i.e. exclude m4); Q2 is current on 2026-06-04
  const m2026Q2 = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 2);
  assert(m2026Q2.plan === 40 && m2026Q2.fact === 20 && m2026Q2.deviation === -20 && m2026Q2.hasData, "2026 Q2 filtration / weight summing failed");

  // 2027 Q2 is future relative to assessmentDate → excluded from aggregates
  const m2027Q2 = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2027, 2);
  assert(!m2027Q2.hasData, "Future period 2027 Q2 must not enter aggregates");

  const m2027Q2Later = getMilestonePeriodContributionMetricsFromEvaluation(
    mockEv,
    2027,
    2,
    "2027-06-15"
  );
  assert(m2027Q2Later.plan === 30 && m2027Q2Later.fact === 0 && m2027Q2Later.hasData, "2027 Q2 included when assessment reaches it");

  // Check 2026 Q3: future relative to June → no data (even if empty of milestones)
  const m2026Q3 = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 3);
  assert(!m2026Q3.hasData, "Future Q3 must report hasData: false");
});

runTest("getMilestoneYearContributionMetricsFromEvaluation should calculate yearly contribution helper properly", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-Y",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 85,
      actualProgressPercent: 85,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 3,
      actualMilestonesCount: 3,
      completedMilestonesCount: 2,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone 1",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 30,
          effectiveWeightPercent: 30,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 30
        },
        {
          id: "m2",
          name: "Milestone 2",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 40,
          effectiveWeightPercent: 40,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 50,
          contributionPercent: 20
        },
        {
          id: "m3",
          name: "Milestone 3",
          year: 2027,
          quarter: "Q1",
          originalWeightPercent: 30,
          effectiveWeightPercent: 30,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 30
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  // June 2026: Q1 completed + Q2 current → both in actual mode
  const metrics2026 = getMilestoneYearContributionMetricsFromEvaluation(mockEv, 2026);
  assert(metrics2026.plan === 70, "Plan for 2026 should be 70");
  assert(metrics2026.fact === 50, "Fact for 2026 should be 50");
  assert(metrics2026.deviation === -20, "Deviation for 2026 should be -20");

  // 2027 is future relative to assessmentDate → excluded from aggregates
  const metrics2027 = getMilestoneYearContributionMetricsFromEvaluation(mockEv, 2027);
  assert(!metrics2027.hasData && metrics2027.plan === 0, "Future year 2027 must not enter year aggregates");

  // When assessment is inside/after 2027, year contribution includes that year
  const metrics2027Later = getMilestoneYearContributionMetricsFromEvaluation(
    mockEv,
    2027,
    "2027-06-15"
  );
  assert(metrics2027Later.plan === 30 && metrics2027Later.fact === 30, "2027 included when assessment reaches it");

  // Risk mode excludes current Q2
  const metrics2026Risk = getMilestoneYearContributionMetricsFromEvaluation(
    mockEv,
    2026,
    "2026-06-04",
    null,
    null,
    "risk"
  );
  assert(metrics2026Risk.plan === 30 && metrics2026Risk.fact === 30, "Risk year metrics: completed Q1 only");
});

runTest("Scenario 1: Milestones without custom weights", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-S1",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 66.66,
      actualProgressPercent: 66.66,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 3,
      actualMilestonesCount: 3,
      completedMilestonesCount: 2,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "mA",
          name: "A",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 33.33,
          effectiveWeightPercent: 33.33,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 33.33
        },
        {
          id: "mB",
          name: "B",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 33.33,
          effectiveWeightPercent: 33.33,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 0,
          contributionPercent: 0
        },
        {
          id: "mC",
          name: "C",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 33.33,
          effectiveWeightPercent: 33.33,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 33.33
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const q1Metrics = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 1);
  assert(Math.abs(q1Metrics.plan - 66.66) < 0.01, "Q1 plan should be 66.66");
  assert(Math.abs(q1Metrics.fact - 33.33) < 0.01, "Q1 fact should be 33.33");

  const q2Metrics = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 2);
  assert(Math.abs(q2Metrics.plan - 33.33) < 0.01, "Q2 plan should be 33.33");
  // Verification: The main display value should be the fact 33.33, not 100% normalized!
  assert(Math.abs(q2Metrics.fact - 33.33) < 0.01, "Q2 fact/actual value should be 33.33, not normalized to 100");
});

runTest("Scenario 2: Milestones with explicit weights", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-S2",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 85,
      actualProgressPercent: 85,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 3,
      actualMilestonesCount: 3,
      completedMilestonesCount: 2,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone Q1 1",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 20,
          effectiveWeightPercent: 20,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 20
        },
        {
          id: "m2",
          name: "Milestone Q1 2",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 30,
          effectiveWeightPercent: 30,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 50,
          contributionPercent: 15
        },
        {
          id: "m3",
          name: "Milestone Q2 1",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 50,
          effectiveWeightPercent: 50,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 50
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const q1Metrics = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 1);
  assert(q1Metrics.plan === 50, "Q1 plan should be 50");
  assert(q1Metrics.fact === 35, "Q1 fact should be 35");

  const q2Metrics = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 2);
  assert(q2Metrics.plan === 50, "Q2 plan should be 50");
  assert(q2Metrics.fact === 50, "Q2 fact should be 50");

  const yearMetrics = getMilestoneYearContributionMetricsFromEvaluation(mockEv, 2026);
  assert(yearMetrics.plan === 100, "2026 overall year plan should sum to 100");
  assert(yearMetrics.fact === 85, "2026 overall year fact should sum to 85");
});

runTest("Scenario 3: Multi-year filters", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-S3",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 30,
      actualProgressPercent: 30,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 2,
      actualMilestonesCount: 2,
      completedMilestonesCount: 0,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m2026",
          name: "2026 Milestone",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 10,
          effectiveWeightPercent: 10,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 10
        },
        {
          id: "m2027",
          name: "2027 Milestone",
          year: 2027,
          quarter: "Q1",
          originalWeightPercent: 20,
          effectiveWeightPercent: 20,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 20
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const metrics2026Q1 = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 1);
  assert(metrics2026Q1.plan === 10, "2026 Q1 plan should be 10");
  assert(metrics2026Q1.fact === 10, "2026 Q1 fact should be 10 (excluding 2027)");

  // 2027 is future vs assessmentDate → excluded unless assessment is advanced
  const metrics2027Q1Future = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2027, 1);
  assert(!metrics2027Q1Future.hasData, "2027 Q1 must be excluded while assessment is in 2026");

  const metrics2027Q1 = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2027, 1, "2027-03-15");
  assert(metrics2027Q1.plan === 20, "2027 Q1 plan should be 20");
  assert(metrics2027Q1.fact === 20, "2027 Q1 fact should be 20 (excluding 2026)");
});

runTest("New Scenario 1: Quarterly completion differs from contribution", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-N1",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 25,
      actualProgressPercent: 25,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 2,
      actualMilestonesCount: 2,
      completedMilestonesCount: 1,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "mA",
          name: "A",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 20,
          effectiveWeightPercent: 20,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 20
        },
        {
          id: "mB",
          name: "B",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 10,
          effectiveWeightPercent: 10,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 50,
          contributionPercent: 5
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const contrib = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 2);
  assert(contrib.plan === 30, "Contribution plan should sum to 30");
  assert(contrib.fact === 25, "Contribution fact should sum to 25");

  const completion = getMilestonePeriodCompletionMetricsFromEvaluation(mockEv, 2026, 2);
  assert(completion.plan === 100, "Completion plan should be exactly 100");
  assert(Math.abs(completion.fact - 83.33) < 0.01, `Completion fact should be 83.33, got ${completion.fact}`);
  assert(Math.abs(completion.deviation - (-16.67)) < 0.01, `Deviation should be -16.67, got ${completion.deviation}`);
});

runTest("New Scenario 2: Quarter fully completed", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-N2",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 50,
      actualProgressPercent: 50,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 2,
      actualMilestonesCount: 2,
      completedMilestonesCount: 2,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "mC",
          name: "C",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 15,
          effectiveWeightPercent: 15,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 15
        },
        {
          id: "mD",
          name: "D",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 35,
          effectiveWeightPercent: 35,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 35
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const contrib = getMilestonePeriodContributionMetricsFromEvaluation(mockEv, 2026, 1);
  assert(contrib.plan === 50, "Contribution plan should be 50");
  assert(contrib.fact === 50, "Contribution fact should be 50");

  const completion = getMilestonePeriodCompletionMetricsFromEvaluation(mockEv, 2026, 1);
  assert(completion.plan === 100, "Completion plan should be 100");
  assert(completion.fact === 100, "Completion fact should be 100");
  assert(completion.deviation === 0, "Deviation should be 0");
});

runTest("New Scenario 3: Quarter does not get plan 30% in user completion metrics", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-N3",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 25,
      actualProgressPercent: 25,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 2,
      actualMilestonesCount: 2,
      completedMilestonesCount: 1,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "mA",
          name: "A",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 20,
          effectiveWeightPercent: 20,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 20
        },
        {
          id: "mB",
          name: "B",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 10,
          effectiveWeightPercent: 10,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 50,
          contributionPercent: 5
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const metrics = getMilestonePeriodCompletionMetricsFromEvaluation(mockEv, 2026, 2);
  assert(metrics.plan === 100, `Expected completion plan to be 100, got ${metrics.plan}`);
});

runTest("New Scenario 4: Multi-year period filtration", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-N4",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 30,
      actualProgressPercent: 30,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 2,
      actualMilestonesCount: 2,
      completedMilestonesCount: 2,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m2026",
          name: "2026 Milestone",
          year: 2026,
          quarter: "Q2",
          originalWeightPercent: 10,
          effectiveWeightPercent: 10,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 10
        },
        {
          id: "m2027",
          name: "2027 Milestone",
          year: 2027,
          quarter: "Q2",
          originalWeightPercent: 20,
          effectiveWeightPercent: 20,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 20
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const c2026 = getMilestonePeriodCompletionMetricsFromEvaluation(mockEv, 2026, 2);
  assert(c2026.planContributionPercent === 10, `Expected 2026 Q2 plan contribution 10, got ${c2026.planContributionPercent}`);
  assert(c2026.factContributionPercent === 10, `Expected 2026 Q2 fact contribution 10, got ${c2026.factContributionPercent}`);
  assert(c2026.fact === 100, `Expected 100% completion, got ${c2026.fact}`);

  const c2027Future = getMilestonePeriodCompletionMetricsFromEvaluation(mockEv, 2027, 2);
  assert(!c2027Future.hasData, "2027 Q2 excluded while assessment is in 2026");

  const c2027 = getMilestonePeriodCompletionMetricsFromEvaluation(mockEv, 2027, 2, "2027-06-15");
  assert(c2027.planContributionPercent === 20, `Expected 2027 Q2 plan contribution 20, got ${c2027.planContributionPercent}`);
  assert(c2027.factContributionPercent === 20, `Expected 2027 Q2 fact contribution 20, got ${c2027.factContributionPercent}`);
  assert(c2027.fact === 100, `Expected 100% completion, got ${c2027.fact}`);
});

runTest("New Scenario 5: Total project progress is not normalized", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-N5",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 47,
      actualProgressPercent: 47,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 1,
      actualMilestonesCount: 1,
      completedMilestonesCount: 0,
      overdueMilestonesCount: 0,
      milestoneResults: []
    },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const totalMetrics = getMilestoneTotalMetricsFromEvaluation(mockEv);
  assert(totalMetrics.fact === 47, `Expected total progress fact 47, got ${totalMetrics.fact}`);
});

runTest("Indicator Metrics Scenario 1: Quarter indicators for different years do not mix", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-IND1",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { status: "ok", totalProgressPercent: 0, actualProgressPercent: 0, totalWeightPercent: 0, weightControlStatus: "ok", milestonesCount: 0, actualMilestonesCount: 0, completedMilestonesCount: 0, overdueMilestonesCount: 0, milestoneResults: [] },
    indicators: {
      status: "ok",
      averagePerformancePercent: 60,
      cappedAveragePerformancePercent: 60,
      calculatedIndicatorsCount: 2,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: [
        {
          id: "ind1",
          name: "Indicator 1",
          year: 2026,
          quarter: "Q2",
          plan: 10,
          fact: 8,
          calculationType: "higher_is_better",
          performancePercent: 80,
          cappedPerformancePercent: 80,
          status: "ok",
          explanation: ""
        },
        {
          id: "ind2",
          name: "Indicator 2",
          year: 2027,
          quarter: "Q2",
          plan: 10,
          fact: 4,
          calculationType: "higher_is_better",
          performancePercent: 40,
          cappedPerformancePercent: 40,
          status: "ok",
          explanation: ""
        }
      ]
    },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const metrics2026 = getIndicatorPeriodCompletionMetricsFromEvaluation(mockEv, 2026, 2);
  assert(metrics2026.fact === 80, `Expected 80, got ${metrics2026.fact}`);

  // 2027 Q2 is future relative to assessmentDate → not in aggregates
  const metrics2027 = getIndicatorPeriodCompletionMetricsFromEvaluation(mockEv, 2027, 2);
  assert(!metrics2027.hasData, "Future period must not enter indicator aggregates");

  const metrics2027Later = getIndicatorPeriodCompletionMetricsFromEvaluation(
    mockEv,
    2027,
    2,
    "2027-06-15"
  );
  assert(metrics2027Later.fact === 40, `Expected 40 when assessment reaches 2027 Q2, got ${metrics2027Later.fact}`);
});

runTest("Indicator Metrics Scenario 2: Yearly indicators for different years do not mix", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-IND2",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { status: "ok", totalProgressPercent: 0, actualProgressPercent: 0, totalWeightPercent: 0, weightControlStatus: "ok", milestonesCount: 0, actualMilestonesCount: 0, completedMilestonesCount: 0, overdueMilestonesCount: 0, milestoneResults: [] },
    indicators: {
      status: "ok",
      averagePerformancePercent: 73.3,
      cappedAveragePerformancePercent: 73.3,
      calculatedIndicatorsCount: 3,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: [
        {
          id: "ind1",
          name: "Indicator 1",
          year: 2026,
          quarter: "Q1",
          plan: 10,
          fact: 10,
          calculationType: "higher_is_better",
          performancePercent: 100,
          cappedPerformancePercent: 100,
          status: "ok",
          explanation: ""
        },
        {
          id: "ind2",
          name: "Indicator 2",
          year: 2026,
          quarter: "Q2",
          plan: 10,
          fact: 8,
          calculationType: "higher_is_better",
          performancePercent: 80,
          cappedPerformancePercent: 80,
          status: "ok",
          explanation: ""
        },
        {
          id: "ind3",
          name: "Indicator 3",
          year: 2027,
          quarter: "Q1",
          plan: 10,
          fact: 4,
          calculationType: "higher_is_better",
          performancePercent: 40,
          cappedPerformancePercent: 40,
          status: "ok",
          explanation: ""
        }
      ]
    },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const metrics2026 = getIndicatorYearCompletionMetricsFromEvaluation(mockEv, 2026);
  assert(metrics2026.fact === 90, `Expected (100+80)/2 = 90, got ${metrics2026.fact}`);

  const metrics2027 = getIndicatorYearCompletionMetricsFromEvaluation(mockEv, 2027);
  assert(!metrics2027.hasData, "Future year indicators must not enter year aggregates");

  const metrics2027Later = getIndicatorYearCompletionMetricsFromEvaluation(mockEv, 2027, "2027-03-15");
  assert(metrics2027Later.fact === 40, `Expected 40 when assessment reaches 2027, got ${metrics2027Later.fact}`);
});

runTest("Indicator Metrics Scenario 3: Null indicators are not treated as 0", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-IND3",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { status: "ok", totalProgressPercent: 0, actualProgressPercent: 0, totalWeightPercent: 0, weightControlStatus: "ok", milestonesCount: 0, actualMilestonesCount: 0, completedMilestonesCount: 0, overdueMilestonesCount: 0, milestoneResults: [] },
    indicators: {
      status: "ok",
      averagePerformancePercent: 100,
      cappedAveragePerformancePercent: 100,
      calculatedIndicatorsCount: 1,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: [
        {
          id: "ind1",
          name: "Indicator 1",
          year: 2026,
          quarter: "Q1",
          plan: 10,
          fact: 10,
          calculationType: "higher_is_better",
          performancePercent: 100,
          cappedPerformancePercent: 100,
          status: "ok",
          explanation: ""
        },
        {
          id: "ind2",
          name: "Indicator 2",
          year: 2026,
          quarter: "Q2",
          plan: 10,
          fact: null,
          calculationType: "higher_is_better",
          performancePercent: null,
          cappedPerformancePercent: null,
          status: "ok",
          explanation: ""
        }
      ]
    },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const metrics = getIndicatorYearCompletionMetricsFromEvaluation(mockEv, 2026);
  assert(metrics.fact === 100, `Expected 100, got ${metrics.fact}`);
  assert(metrics.calculatedIndicatorsCount === 1, `Expected calculated indicators count to be 1, got ${metrics.calculatedIndicatorsCount}`);
});

runTest("Indicator Metrics Scenario 4: rawFact preserves value above 100", () => {
  const mockEv: ProjectEvaluation = {
    projectId: "P-IND4",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { status: "ok", totalProgressPercent: 0, actualProgressPercent: 0, totalWeightPercent: 0, weightControlStatus: "ok", milestonesCount: 0, actualMilestonesCount: 0, completedMilestonesCount: 0, overdueMilestonesCount: 0, milestoneResults: [] },
    indicators: {
      status: "ok",
      averagePerformancePercent: 120,
      cappedAveragePerformancePercent: 100,
      calculatedIndicatorsCount: 1,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: [
        {
          id: "ind1",
          name: "Indicator 1",
          year: 2026,
          quarter: "Q1",
          plan: 10,
          fact: 12,
          calculationType: "higher_is_better",
          performancePercent: 120,
          cappedPerformancePercent: 100,
          status: "ok",
          explanation: ""
        }
      ]
    },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const metrics = getIndicatorYearCompletionMetricsFromEvaluation(mockEv, 2026);
  assert(metrics.fact === 120, `Expected uncapped performance fact 120 for display gauges, got ${metrics.fact}`);
  assert(metrics.rawFact === 120, `Expected raw performance fact 120, got ${metrics.rawFact}`);
  assert(metrics.cappedFact === 100, `Expected cappedFact 100, got ${metrics.cappedFact}`);
});

runTest("Registry KPI Prioritizes Capped Performance", () => {
  const mockProj: Project = {
    projectId: "P-KPI-CAPPED",
    projectName: "Test Project Capped KPI",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: []
  };

  const mockEv: ProjectEvaluation = {
    projectId: "P-KPI-CAPPED",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { status: "ok", totalProgressPercent: 0, actualProgressPercent: 0, totalWeightPercent: 0, weightControlStatus: "ok", milestonesCount: 0, actualMilestonesCount: 0, completedMilestonesCount: 0, overdueMilestonesCount: 0, milestoneResults: [] },
    indicators: {
      status: "ok",
      averagePerformancePercent: 137,
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

  const evs = [mockEv];
  const progressVal = getRegistryKpiProgress(mockProj, evs);
  assert(progressVal === 100, `Expected capped average 100 for registry KPI progress, but got ${progressVal}`);

  const metricsVal = getRegistryKpiMetrics(mockProj, evs);
  assert(metricsVal.fact === 100, `Expected capped average 100 for registry KPI metrics, but got ${metricsVal.fact}`);
});

runTest("Registry KPI Fallback to Uncapped Performance if Capped is Missing", () => {
  const mockProj: Project = {
    projectId: "P-KPI-FALLBACK",
    projectName: "Test Project Fallback KPI",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: []
  };

  const mockEv: ProjectEvaluation = {
    projectId: "P-KPI-FALLBACK",
    assessmentDate: "2026-06-04",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { status: "ok", totalProgressPercent: 0, actualProgressPercent: 0, totalWeightPercent: 0, weightControlStatus: "ok", milestonesCount: 0, actualMilestonesCount: 0, completedMilestonesCount: 0, overdueMilestonesCount: 0, milestoneResults: [] },
    indicators: {
      status: "ok",
      averagePerformancePercent: 87,
      cappedAveragePerformancePercent: null,
      calculatedIndicatorsCount: 1,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: []
    },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const evs = [mockEv];
  const progressVal = getRegistryKpiProgress(mockProj, evs);
  assert(progressVal === 87, `Expected fallback to averagePerformancePercent 87, but got ${progressVal}`);

  const metricsVal = getRegistryKpiMetrics(mockProj, evs);
  assert(metricsVal.fact === 87, `Expected fallback to averagePerformancePercent 87 in metrics, but got ${metricsVal.fact}`);
});

console.log("-----------------------------------------------------------");
console.log("All frontend helper unit test scenarios executed successfully!");
console.log("-----------------------------------------------------------\n");
