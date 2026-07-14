import { 
  evaluateProject, 
  evaluateProjects, 
  calculatePortfolioEvaluation, 
  ProjectEvaluation, 
  IndicatorEvaluation 
} from "../server/services/projectEvaluationService";
import { NormalizedProject } from "../server/services/projectNormalizer";
import { DEFAULT_METHODOLOGY_CONFIG } from "../server/services/methodologyConfig";
import { DEFAULT_INDICATOR_DICTIONARY } from "../server/services/indicatorDictionary";

function runTest(name: string, fn: () => void) {
  console.log(`[TEST] Running evaluation case: ${name}...`);
  try {
    fn();
    console.log(`[TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// Helper template generator for mock projects
function createMockProject(overrides: Partial<any> = {}): NormalizedProject {
  return {
    id: "MOCK-1",
    projectId: "MOCK-1",
    sourceRowIndex: 2,
    baseInfo: {
      title: "Тестовый проект",
      goals: "Сделать тесты зелеными",
      resultImages: "Образ результата",
      type: "Проект",
      stage: "В работе",
      priority: 2,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      ...overrides.baseInfo
    },
    people: {
      projectManager: "Иванов",
      projectAdmin: "Петров",
      customers: ["Заказчик"],
      team: ["Участник"],
      responsible: "Сидоров",
      owner: "Владелец",
      monitoringParticipants: ["Участник мониторинга"],
      ...overrides.people
    },
    organization: {
      departments: ["Департамент"],
      ...overrides.organization
    },
    monitoring: {
      startDate: "2026-01-10",
      regularityWeeks: 2,
      lastMonitoringDate: "2026-01-15",
      nextMonitoringDate: "2026-01-29",
      isMonitoringOverdue: false,
      ...overrides.monitoring
    },
    links: {
      bitrixUrl: "",
      ...overrides.links
    },
    milestones: overrides.milestones || [],
    indicators: overrides.indicators || [],
    applicableQuarters: overrides.applicableQuarters || [],
    dataQuality: {
      status: "ok",
      errorsCount: 0,
      warningsCount: 0,
      issuesCount: 0,
      issues: [],
      ...overrides.dataQuality
    },
    source: {
      rawRow: {},
      detectedYears: [2026],
      ...overrides.source
    }
  };
}

// 1. Проект без вех, но с показателями
runTest("Scenario 1: Project with indicators only, no milestones", () => {
  const proj = createMockProject({
    milestones: [],
    indicators: [
      {
        id: "IND-1",
        year: 2026,
        quarter: "Q1",
        name: "Доля подразделений, прошедших обучение",
        plan: 100,
        fact: 95,
        periodStatus: "past",
        isApplicableQuarter: true,
        factStatus: "filled",
        sourceColumns: { name: "", plan: "", fact: "" }
      }
    ]
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });

  assert(res.milestones.status === "not_applicable", "Milestones should be not_applicable");
  assert(res.milestones.totalProgressPercent === null, "Total progress should be null");
  assert(res.indicators.status === "ok", "Indicators status should be ok for 95% performance");
  assert(res.indicators.averagePerformancePercent === 95, "Average performance must be 95%");
});

// 2. Проект с вехами, но без показателей
runTest("Scenario 2: Project with milestones, no indicators", () => {
  const proj = createMockProject({
    milestones: [
      {
        id: "M-1",
        year: 2026,
        quarter: "Q1",
        name: "Веха Раз",
        progressPercent: 100,
        weightPercent: 100,
        periodStatus: "past",
        isApplicableQuarter: true,
        sourceColumns: { name: "", progress: "", weight: "" }
      }
    ],
    indicators: []
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });

  assert(res.indicators.status === "not_applicable", "Indicators should be not_applicable");
  assert(res.milestones.status === "ok", "Milestone status should be ok");
  assert(res.milestones.totalProgressPercent === 100, "Milestone total progress should be 100");
  assert(res.milestones.actualProgressPercent === 100, "Milestone actual progress should be 100");
});

// 3. Проект с будущими вехами
runTest("Scenario 3: Project with future milestones", () => {
  const proj = createMockProject({
    milestones: [
      {
        id: "M-1",
        year: 2026,
        quarter: "Q1",
        name: "Прошлая завершенная веха",
        progressPercent: 100,
        weightPercent: 40,
        periodStatus: "past",
        isApplicableQuarter: true,
        sourceColumns: { name: "", progress: "", weight: "" }
      },
      {
        id: "M-2",
        year: 2026,
        quarter: "Q4",
        name: "Будущая веха",
        progressPercent: 0,
        weightPercent: 60,
        periodStatus: "future",
        isApplicableQuarter: true,
        sourceColumns: { name: "", progress: "", weight: "" }
      }
    ]
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") }); // Inside Q2

  // Total progress contribution: 100 * 40 / 100 + 0 * 60 / 100 = 40%
  assert(res.milestones.totalProgressPercent === 40, "Total progress should be 40%");
  
  // Actual progress scaled: actual count is 1 (Q1), progress is 100%, weight is 40%. Scaled: (40 / 40) * 100 = 100%!
  // Future milestones do not lower actual progress.
  assert(res.milestones.actualProgressPercent === 100, "Actual progress should be 100%");
  assert(res.milestones.status === "ok", "Milestone status should be ok");
});

// 4. Проект с будущими показателями без факта
runTest("Scenario 4: Future indicators without fact must be skipped gracefully", () => {
  const proj = createMockProject({
    indicators: [
      {
        id: "IND-1",
        year: 2026,
        quarter: "Q1",
        name: "Доля подразделений, прошедших обучение",
        plan: 100,
        fact: 95,
        periodStatus: "past",
        isApplicableQuarter: true,
        factStatus: "filled",
        sourceColumns: { name: "", plan: "", fact: "" }
      },
      {
        id: "IND-2",
        year: 2026,
        quarter: "Q4",
        name: "Доля договоров, заведенных в реестр",
        plan: 200,
        fact: null, // Empty fact in future period
        periodStatus: "future",
        isApplicableQuarter: true,
        factStatus: "empty_future",
        sourceColumns: { name: "", plan: "", fact: "" }
      }
    ]
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });

  assert(res.indicators.calculatedIndicatorsCount === 1, "Only 1 indicator should be calculated");
  assert(res.indicators.skippedFutureIndicatorsCount === 1, "1 future indicator should be skipped");
  assert(res.indicators.averagePerformancePercent === 95, "Average performance should cover Q1 only: 95%");
  
  const futureEvalObj = res.indicators.indicatorResults.find(i => i.id === "IND-2");
  assert(futureEvalObj !== undefined, "Future item should exist in results");
  assert(futureEvalObj?.status === "future", "Future item status should be 'future'");
});

// 5. Проект с несколькими годами
runTest("Scenario 5: Multi-year monitoring scope", () => {
  const proj = createMockProject({
    milestones: [
      {
        id: "M-1",
        year: 2026,
        quarter: "Q1",
        name: "Веха 2026",
        progressPercent: 100,
        weightPercent: 55,
        periodStatus: "past",
        isApplicableQuarter: true,
        sourceColumns: { name: "", progress: "", weight: "" }
      },
      {
        id: "M-2",
        year: 2027,
        quarter: "Q2",
        name: "Веха 2027",
        progressPercent: 50,
        weightPercent: 45,
        periodStatus: "future",
        isApplicableQuarter: true,
        sourceColumns: { name: "", progress: "", weight: "" }
      }
    ]
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  assert(res.milestones.totalWeightPercent === 100, "Sum of weights is 100% across years");
  assert(res.milestones.weightControlStatus === "ok", "Weight sum is correct");
});

// 6. Контроль весов вех (100% vs dev)
runTest("Scenario 6: Weight control checks (correct/incorrect sums)", () => {
  const monitoringSafe = {
    startDate: "2026-01-10",
    regularityWeeks: 2,
    lastMonitoringDate: "2026-05-25",
    nextMonitoringDate: "2026-06-15", // Safe in the future of assessmentDate (2026-06-01)
    isMonitoringOverdue: false
  };

  // Correct weight sum
  const projCorrect = createMockProject({
    monitoring: monitoringSafe,
    milestones: [
      {
        id: "M-1", year: 2026, quarter: "Q1", name: "А", progressPercent: 100, weightPercent: 100,
        periodStatus: "past", isApplicableQuarter: true, sourceColumns: { name: "", progress: "", weight: "" }
      }
    ]
  });
  const resCorrect = evaluateProject(projCorrect, { assessmentDate: new Date("2026-06-01") });
  assert(resCorrect.milestones.weightControlStatus === "ok", "Weight control status must be ok");

  // Incorrect weight sum (less than 100)
  const projIncorrect = createMockProject({
    monitoring: monitoringSafe,
    milestones: [
      {
        id: "M-1", year: 2026, quarter: "Q1", name: "А", progressPercent: 100, weightPercent: 85,
        periodStatus: "past", isApplicableQuarter: true, sourceColumns: { name: "", progress: "", weight: "" }
      }
    ]
  });
  const resIncorrect = evaluateProject(projIncorrect, { assessmentDate: new Date("2026-06-01") });
  assert(resIncorrect.milestones.weightControlStatus === "warning", "Weight control status must be warning");
  assert(resIncorrect.projectHealth.status === "ok", "State health remains ok because warning is not critical");
});

// 7. Формула higher_is_better
runTest("Scenario 7: Indicator calculation: higher_is_better", () => {
  const proj = createMockProject({
    indicators: [
      {
        id: "IND-1",
        year: 2026,
        quarter: "Q1",
        name: "Доля подразделений, прошедших обучение", // higher_is_better
        plan: 80,
        fact: 84, // 105% performance
        periodStatus: "past",
        isApplicableQuarter: true,
        factStatus: "filled",
        sourceColumns: { name: "", plan: "", fact: "" }
      }
    ]
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  const indRes = res.indicators.indicatorResults[0];

  assert(indRes.performancePercent === 105, "Performance should be fact / plan * 100 = 105%");
  assert(indRes.cappedPerformancePercent === 100, "Capped performance should be limited to 100%");
  assert(indRes.status === "ok", "Individual status is ok");
});

// 8. Формула lower_is_better
runTest("Scenario 8: Indicator calculation: lower_is_better", () => {
  const proj = createMockProject({
    indicators: [
      {
        id: "IND-1",
        year: 2026,
        quarter: "Q1",
        name: "Количество ошибок", // lower_is_better
        plan: 5,
        fact: 4, // 125% performance (good lower value)
        periodStatus: "past",
        isApplicableQuarter: true,
        factStatus: "filled",
        sourceColumns: { name: "", plan: "", fact: "" }
      },
      {
        id: "IND-2",
        year: 2026,
        quarter: "Q1",
        name: "Средний срок согласования договора", // lower_is_better
        plan: 10,
        fact: 12, // 83.3% performance (contract is worse)
        periodStatus: "past",
        isApplicableQuarter: true,
        factStatus: "filled",
        sourceColumns: { name: "", plan: "", fact: "" }
      }
    ]
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  
  const idx1 = res.indicators.indicatorResults.find(i => i.id === "IND-1");
  const idx2 = res.indicators.indicatorResults.find(i => i.id === "IND-2");

  assert(idx1?.performancePercent === 125, "Lower is better errors: 5 / 4 * 100 = 125%");
  assert(idx1?.cappedPerformancePercent === 100, "Capped is 100%");
  
  assert(idx2?.performancePercent === 83.3, "Lower is better delay: 10 / 12 * 100 = 83.3%");
  assert(idx2?.cappedPerformancePercent === 83.3, "Capped is 83.3%");
});

// 9. Показатель без справочника
runTest("Scenario 9: Indicator not defined in methodology dictionary", () => {
  const proj = createMockProject({
    indicators: [
      {
        id: "IND-1",
        year: 2026,
        quarter: "Q1",
        name: "Космический взлет ракет", // Not in dictionary
        plan: 10,
        fact: 8,
        periodStatus: "past",
        isApplicableQuarter: true,
        factStatus: "filled",
        sourceColumns: { name: "", plan: "", fact: "" }
      }
    ]
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  const indRes = res.indicators.indicatorResults[0];

  assert(indRes.calculationSource === "fallback_plan_fact", "Calculation source must be fallback_plan_fact");
  assert(indRes.performancePercent === 80, "Performance must be 80%");
  assert(indRes.status === "attention", "Status should be attention (80% performance is attention status)");
  assert(res.indicators.missingDictionaryCount === 0, "Missing dictionary count must be 0");
  assert(res.indicators.status === "attention", "Indicators block status should be attention");
});

// 10. Просроченный мониторинг
runTest("Scenario 10: Overdue corporate monitoring tracking", () => {
  const proj = createMockProject({
    monitoring: {
      startDate: "2026-01-10",
      regularityWeeks: 2,
      lastMonitoringDate: "2026-01-15",
      nextMonitoringDate: "2026-01-29", // Next was scheduled inside Q1
      isMonitoringOverdue: true
    }
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-02-15") }); // Assessment after schedule

  assert(res.monitoring.status === "overdue", "Monitoring status is overdue");
  assert(res.monitoring.overdueDays !== null && res.monitoring.overdueDays > 0, "Overdue days computed");
  assert(res.projectHealth.status === "attention" || res.projectHealth.status === "risk", "Status downgraded to at least attention due to overdue monitoring");
});

// 11. Проект, который еще не начался
runTest("Scenario 11: Project which hasn't started yet", () => {
  const proj = createMockProject({
    baseInfo: {
      startDate: "2026-07-01",
      endDate: "2026-12-31"
    }
  });

  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") }); // Assessment before start

  assert(res.monitoring.status === "not_applicable", "Monitoring should be not_applicable before start");
});

// 12. Итоговые статусы (OK / Attention / Risk)
runTest("Scenario 12: Combined Project Health Status Transitions", () => {
  // Case A: Everything is OK
  const pOK = createMockProject({
    monitoring: {
      startDate: "2026-01-10",
      regularityWeeks: 2,
      lastMonitoringDate: "2026-05-25",
      nextMonitoringDate: "2026-06-15", // Safe in the future of assessmentDate (2026-06-01)
      isMonitoringOverdue: false
    },
    milestones: [
      { id: "M-1", year: 2026, quarter: "Q1", name: "A", progressPercent: 100, weightPercent: 100, periodStatus: "past", isApplicableQuarter: true, sourceColumns: { name: "", progress: "", weight: "" } }
    ],
    indicators: [
      { id: "IND-1", year: 2026, quarter: "Q1", name: "Количество ошибок", plan: 10, fact: 10, periodStatus: "past", isApplicableQuarter: true, factStatus: "filled", sourceColumns: { name: "", plan: "", fact: "" } }
    ]
  });
  const resOK = evaluateProject(pOK, { assessmentDate: new Date("2026-06-01") });
  assert(resOK.projectHealth.status === "ok", "Status should stay OK when limits are perfect");

  // Case B: Dev/Milestone Attention
  const pAtt = createMockProject({
    monitoring: {
      startDate: "2026-01-10",
      regularityWeeks: 2,
      lastMonitoringDate: "2026-05-25",
      nextMonitoringDate: "2026-06-15",
      isMonitoringOverdue: false
    },
    milestones: [
      { id: "M-1", year: 2026, quarter: "Q1", name: "A", progressPercent: 80, weightPercent: 100, periodStatus: "past", isApplicableQuarter: true, sourceColumns: { name: "", progress: "", weight: "" } }
    ]
  });
  const resAtt = evaluateProject(pAtt, { assessmentDate: new Date("2026-06-01") });
  assert(resAtt.projectHealth.status === "attention", "Status is attention for 80% progress (deviation is 20%)");

  // Case C: Dev/KPI Risk
  const pRisk = createMockProject({
    monitoring: {
      startDate: "2026-01-10",
      regularityWeeks: 2,
      lastMonitoringDate: "2026-05-25",
      nextMonitoringDate: "2026-06-15",
      isMonitoringOverdue: false
    },
    indicators: [
      { id: "IND-1", year: 2026, quarter: "Q1", name: "Доля договоров, заведенных в реестр", plan: 100, fact: 60, periodStatus: "past", isApplicableQuarter: true, factStatus: "filled", sourceColumns: { name: "", plan: "", fact: "" } }
    ]
  });
  const resRisk = evaluateProject(pRisk, { assessmentDate: new Date("2026-06-01") });
  assert(resRisk.projectHealth.status === "risk", "Status is risk for 60% performance (deviation is 40%)");
});

// 13. Сводный портфельный отчет (calculatePortfolioEvaluation)
runTest("Scenario 13: Portfolio aggregation logic", () => {
  const p1 = createMockProject({ baseInfo: { title: "А" } });
  const p2 = createMockProject({ baseInfo: { title: "Б" } });

  const e1: ProjectEvaluation = {
    projectId: "MOCK-1",
    assessmentDate: "2026-06-01",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { status: "ok", totalProgressPercent: 100, actualProgressPercent: 100, totalWeightPercent: 100, weightControlStatus: "ok", milestonesCount: 1, actualMilestonesCount: 1, completedMilestonesCount: 1, overdueMilestonesCount: 0 },
    indicators: { status: "ok", averagePerformancePercent: 100, cappedAveragePerformancePercent: 100, calculatedIndicatorsCount: 1, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: ["ОК"] },
    explanations: []
  };

  const e2: ProjectEvaluation = {
    projectId: "MOCK-2",
    assessmentDate: "2026-06-01",
    dataQuality: { status: "warning", completenessPercent: 80, errorsCount: 0, warningsCount: 2, issuesCount: 2 },
    milestones: { status: "attention", totalProgressPercent: 80, actualProgressPercent: 80, totalWeightPercent: 100, weightControlStatus: "ok", milestonesCount: 1, actualMilestonesCount: 1, completedMilestonesCount: 0, overdueMilestonesCount: 0 },
    indicators: { status: "attention", averagePerformancePercent: 80, cappedAveragePerformancePercent: 80, calculatedIndicatorsCount: 1, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "attention", score: 80, mainReasons: ["Внимание"] },
    explanations: []
  };

  const port = calculatePortfolioEvaluation([p1, p2], [e1, e2], { assessmentDate: new Date("2026-06-01") });

  assert(port.totalProjects === 2, "Portfolio has 2 projects");
  assert(port.okCount === 1, "OK project count match");
  assert(port.attentionCount === 1, "Attention project count match");
  assert(port.averageCompletenessPercent === 90, "Avg completeness (100+80)/2 = 90%");
  assert(port.averageMilestoneProgressPercent === 90, "Avg milestones total progress 90%");
  assert(port.averageActualMilestoneProgressPercent === 90, "Avg actual milestones progress 90%");
  assert(port.averageIndicatorPerformancePercent === 90, "Avg KPI performance 90%");
});

// ==========================================
// NEW MILESTONE WEIGHT MODEL PROJECTS EVALUATION TESTS
// ==========================================

// Сценарий A. Вехи с явными весами, сумма 100
runTest("Scenario A: Milestones with explicit weights, sum 100 (20/30/50)", () => {
  const proj = createMockProject({
    milestones: [
      { id: "M1", year: 2026, quarter: "Q1", name: "M1", progressPercent: 100, weightPercent: 20, periodStatus: "past" },
      { id: "M2", year: 2026, quarter: "Q2", name: "M2", progressPercent: 50, weightPercent: 30, periodStatus: "past" },
      { id: "M3", year: 2026, quarter: "Q3", name: "M3", progressPercent: 0, weightPercent: 50, periodStatus: "past" }
    ]
  });
  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  assert(res.milestones.totalProgressPercent === 35, `Expected 35%, got ${res.milestones.totalProgressPercent}%`);
});

// Сценарий B. Сумма явных весов меньше 100, есть вехи без веса
runTest("Scenario B: Sum < 100, unweighted with progress get allocated weight", () => {
  const proj = createMockProject({
    milestones: [
      { id: "M1", year: 2026, quarter: "Q1", name: "M1", progressPercent: 100, weightPercent: 20, periodStatus: "past" },
      { id: "M2", year: 2026, quarter: "Q2", name: "M2", progressPercent: 50, weightPercent: 30, periodStatus: "past" },
      { id: "M3", year: 2026, quarter: "Q3", name: "M3", progressPercent: 80, weightPercent: null, periodStatus: "past" },
      { id: "M4", year: 2026, quarter: "Q4", name: "M4", progressPercent: 40, weightPercent: null, periodStatus: "past" }
    ]
  });
  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  assert(res.milestones.totalProgressPercent === 65, `Expected 65%, got ${res.milestones.totalProgressPercent}%`);
});

// Сценарий C. Сумма явных весов равна 100, есть веха без веса
runTest("Scenario C: Sum is 100, unweighted milestones treated as informational", () => {
  const proj = createMockProject({
    milestones: [
      { id: "M1", year: 2026, quarter: "Q1", name: "M1", progressPercent: 100, weightPercent: 50, periodStatus: "past" },
      { id: "M2", year: 2026, quarter: "Q2", name: "M2", progressPercent: 50, weightPercent: 50, periodStatus: "past" },
      { id: "M3", year: 2026, quarter: "Q3", name: "M3", progressPercent: 0, weightPercent: null, periodStatus: "past" }
    ]
  });
  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  assert(res.milestones.totalProgressPercent === 75, `Expected 75%, got ${res.milestones.totalProgressPercent}%`);
});

// Сценарий D. Сумма явных весов больше 100
runTest("Scenario D: Sum of explicit weights > 100 results in error and null progress", () => {
  const proj = createMockProject({
    milestones: [
      { id: "M1", year: 2026, quarter: "Q1", name: "M1", progressPercent: 100, weightPercent: 60, periodStatus: "past" },
      { id: "M2", year: 2026, quarter: "Q2", name: "M2", progressPercent: 50, weightPercent: 50, periodStatus: "past" }
    ]
  });
  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  assert(res.milestones.totalProgressPercent === null, "totalProgressPercent should be null");
  assert(res.milestones.actualProgressPercent === null, "actualProgressPercent should be null");
  assert(res.projectHealth.mainReasons.includes("Ошибка весов вех") || res.explanations.some(e => e.includes("превышает 100%")), "Should contain explanation or mainreason of error weight sum");
});

// Сценарий E. Нет явных весов вообще
runTest("Scenario E: No explicit weights at all fallback to equal weighting", () => {
  const proj = createMockProject({
    milestones: [
      { id: "M1", year: 2026, quarter: "Q1", name: "M1", progressPercent: 100, weightPercent: null, periodStatus: "past" },
      { id: "M2", year: 2026, quarter: "Q2", name: "M2", progressPercent: 50, weightPercent: null, periodStatus: "past" },
      { id: "M3", year: 2026, quarter: "Q3", name: "M3", progressPercent: 0, weightPercent: null, periodStatus: "past" }
    ]
  });
  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  assert(res.milestones.totalProgressPercent !== null && Math.abs(res.milestones.totalProgressPercent - 50) < 0.2, `Expected ~50%, got ${res.milestones.totalProgressPercent}%`);
});

// Сценарий F. Вехи в разных годах
runTest("Scenario F: Milestones across multiple years", () => {
  const proj = createMockProject({
    milestones: [
      { id: "M1", year: 2026, quarter: "Q1", name: "M1", progressPercent: 100, weightPercent: 20, periodStatus: "past" },
      { id: "M2", year: 2027, quarter: "Q2", name: "M2", progressPercent: 100, weightPercent: null, periodStatus: "past" },
      { id: "M3", year: 2028, quarter: "Q4", name: "M3", progressPercent: 50, weightPercent: null, periodStatus: "past" }
    ]
  });
  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  // Total explicit: 20%, remaining 80% split between M2, M3 which have progress -> 40% each
  // Total progress: 20 * 1.0 + 40 * 1.0 + 40 * 0.5 = 20 + 40 + 20 = 80%
  assert(res.milestones.totalProgressPercent === 80, `Expected 80%, got ${res.milestones.totalProgressPercent}%`);
});

// Сценарий G: warning_under_100_unallocated (under 100%, no unweighted milestones with progress)
runTest("Scenario G: warning_under_100_unallocated status", () => {
  const proj = createMockProject({
    milestones: [
      { id: "M1", year: 2026, quarter: "Q1", name: "M1", progressPercent: 100, weightPercent: 20, periodStatus: "past" },
      { id: "M2", year: 2026, quarter: "Q2", name: "M2", progressPercent: 50, weightPercent: 30, periodStatus: "past" }
    ]
  });
  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  assert(res.milestones.weightControlStatus === "warning", "Weight control status must be warning");
  assert(res.milestones.totalProgressPercent !== null, "totalProgressPercent must be calculated");
  // Total contribution: 20% * 100% + 30% * 50% = 35%
  assert(res.milestones.totalProgressPercent === 35, `Expected 35%, got ${res.milestones.totalProgressPercent}%`);
  assert(res.milestones.totalWeightPercent === 50, `Expected total weight percent to be 50, got ${res.milestones.totalWeightPercent}`);
  assert(!res.projectHealth.mainReasons.includes("Ошибка весов вех"), "mainReasons must not contain error string");
  assert(res.explanations.some(e => e.includes("меньше 100%")), "Should contain explanation warning about < 100%");
});

// Сценарий H: error_over_100 (over 100% weights)
runTest("Scenario H: error_over_100 critical error status", () => {
  const proj = createMockProject({
    milestones: [
      { id: "M1", year: 2026, quarter: "Q1", name: "M1", progressPercent: 100, weightPercent: 60, periodStatus: "past" },
      { id: "M2", year: 2026, quarter: "Q2", name: "M2", progressPercent: 50, weightPercent: 50, periodStatus: "past" }
    ]
  });
  const res = evaluateProject(proj, { assessmentDate: new Date("2026-06-01") });
  assert(res.milestones.weightControlStatus === "error", "Weight control status must be error");
  assert(res.milestones.totalProgressPercent === null, "totalProgressPercent must be null under error_over_100");
  assert(res.milestones.actualProgressPercent === null, "actualProgressPercent must be null under error_over_100");
  assert(res.projectHealth.mainReasons.includes("Ошибка весов вех"), "mainReasons should contain error message");
  assert(res.explanations.some(e => e.includes("превышает 100%")), "explanations should contain explanation about over 100%");
});

console.log("\n-----------------------------------------------------------");
console.log("All project assessment evaluation test scenarios completed successfully!");
console.log("-----------------------------------------------------------\n");
