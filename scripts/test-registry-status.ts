import { 
  getRegistryPcStatusView,
  getProjectMonitoringStatus,
  getRegistryRiskView,
  getRegistryProjectStatusView,
  getPcStatusTooltipData,
  getRiskTooltipData,
  getProjectStatusTooltipData,
  calculateUnifiedProjectRisk
} from "../src/utils/projectRegistryStatus.js";

import { mapRoadmapHealthStatusToRiskLabel } from "../src/utils/roadmapYearUtils.js";

import { 
  getNormalizedMilestonesForYear,
  calculateYearMilestonesProgressForProject,
  calculateSelectedQuarterMilestonesProgressForProject
} from "../src/utils/projectCalculations.js";

import { Project, ProjectEvaluation } from "../src/types";

function runTest(name: string, fn: () => void) {
  console.log(`[REGISTRY_STATUS_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[REGISTRY_STATUS_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[REGISTRY_STATUS_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// ----------------- TEST SUITE -----------------

runTest("getRegistryPcStatusView logic checking", () => {
  // Scenario 1: Svoevremenno (Next PC is in the future)
  const projectOk: Project = {
    id: "p-ok",
    projectId: "p-ok",
    projectName: "Project OK",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    monitoringStart: "2026-05-01",
    lastPcDate: "2026-05-15",
    monitoringFrequencyWeeks: 3, // next planned: 2026-06-05
  } as any;

  const status1 = getRegistryPcStatusView(projectOk, null, "2026-06-01");
  assert(status1 === "Своевременно", "2026-06-01 is before 2026-06-05, should be Своевременно");

  // Scenario 2: Proshrochen (Next PC is in the past)
  const status2 = getRegistryPcStatusView(projectOk, null, "2026-06-10");
  assert(status2 === "Просрочен", "2026-06-10 is after 2026-06-05, should be Просрочен");

  // Scenario 3: Not enough data (frequency is missing)
  const projectMissingFreq: Project = {
    id: "p-missing",
    projectId: "p-missing",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    monitoringStart: "2026-05-01",
    lastPcDate: "2026-05-15"
  } as any;
  const status3 = getRegistryPcStatusView(projectMissingFreq, null, "2026-06-01");
  assert(status3 === "Недостаточно данных", "Missing frequency should return Недостаточно данных");
});

runTest("getRegistryRiskView calculation rules", () => {
  // Base project setup: no pc issues, valid dates
  const p: Project = {
    id: "p1",
    projectId: "p1",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    lastPcDate: "2026-05-15",
    monitoringFrequencyWeeks: 4, // Next: 2026-06-12
  } as any;

  // Evaluation: perfect shape
  const evalOk: ProjectEvaluation = {
    projectId: "p1",
    assessmentDate: "2026-06-01",
    dataQuality: { status: "ok", completenessPercent: 95, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { 
      totalProgressPercent: 100, 
      actualProgressPercent: 100, 
      weightControlStatus: "ok",
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone Q1",
          year: 2026,
          quarter: "Q1",
          isIncludedInProgress: true,
          effectiveWeightPercent: 100,
          contributionPercent: 100,
          completionPercent: 100
        }
      ]
    },
    indicators: { averagePerformancePercent: 100, cappedAveragePerformancePercent: 100 },
    monitoring: { status: "ok" },
    projectHealth: { status: "ok", score: 100, mainReasons: [] }
  } as any;

  const r1 = getRegistryRiskView(p, evalOk, "2026-06-01");
  assert(r1 === "Низкий", "Perfect metrics should be Low risk (Низкий)");

  // Milestone lag (at 94%) should trigger High risk (Высокий) under registry thresholds due to overdue milestones
  const evalMilestoneAvg: ProjectEvaluation = {
    ...evalOk,
    milestones: { 
      totalProgressPercent: 100, 
      actualProgressPercent: 94, 
      weightControlStatus: "ok",
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone Q1",
          year: 2026,
          quarter: "Q1",
          isIncludedInProgress: true,
          effectiveWeightPercent: 100,
          contributionPercent: 94,
          completionPercent: 94
        }
      ]
    }
  } as any;
  const r2 = getRegistryRiskView(p, evalMilestoneAvg, "2026-06-01");
  assert(r2 === "Высокий", "Milestone progress at 94% (6% lag) triggers Высокий risk due to overdue completed milestones under registry thresholds");

  // Critical milestones deviation (at 88%) should trigger High risk (Высокий)
  const evalMilestoneBad: ProjectEvaluation = {
    ...evalOk,
    milestones: { 
      totalProgressPercent: 100, 
      actualProgressPercent: 88, 
      weightControlStatus: "ok",
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone Q1",
          year: 2026,
          quarter: "Q1",
          isIncludedInProgress: true,
          effectiveWeightPercent: 100,
          contributionPercent: 88,
          completionPercent: 88
        }
      ]
    }
  } as any;
  const r3 = getRegistryRiskView(p, evalMilestoneBad, "2026-06-01");
  assert(r3 === "Высокий", "Milestone progress at 88% (12% lag) should compute Высокий risk");
});

runTest("getRegistryProjectStatusView status categorization mapping", () => {
  const pBase: Project = {
    id: "p1",
    projectId: "p1",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    monitoringStart: "2026-05-01",
    lastPcDate: "2026-05-15",
    monitoringFrequencyWeeks: 4, // Next: 2026-06-12
  } as any;

  // Scenario 1: projectHealth.status = "not_enough_data", but milestones.weightControlStatus = "error"
  // Expect: "Зона риска"
  const evalScenario1: ProjectEvaluation = {
    projectId: "p1",
    projectHealth: { status: "not_enough_data" },
    milestones: { actualProgressPercent: 100, weightControlStatus: "error" },
    dataQuality: { completenessPercent: 95, errorsCount: 0 },
    indicators: { averagePerformancePercent: 100 }
  } as any;
  const status1 = getRegistryProjectStatusView(pBase, evalScenario1, "2026-06-01");
  assert(status1 === "Зона риска", "Scenario 1: Weight control error must override projectHealth.status and return Зона риска");

  // Scenario 2: projectHealth.status = "not_enough_data", PC is overdue
  // Expect: "Зона риска"
  const pOverdue: Project = {
    id: "p-overdue",
    projectId: "p-overdue",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    monitoringStart: "2026-05-01",
    lastPcDate: "2026-05-01",
    monitoringFrequencyWeeks: 2, // Next PC is 2026-05-15, overdue on 2026-06-01
  } as any;
  const evalScenario2: ProjectEvaluation = {
    projectId: "p-overdue",
    projectHealth: { status: "not_enough_data" },
    milestones: { actualProgressPercent: 100, weightControlStatus: "ok" },
    dataQuality: { completenessPercent: 95, errorsCount: 0 },
    indicators: { averagePerformancePercent: 100 }
  } as any;
  const status2 = getRegistryProjectStatusView(pOverdue, evalScenario2, "2026-06-01");
  assert(status2 === "Зона риска", "Scenario 2: Overdue PC must return Зона риска");

  // Scenario 3: projectHealth.status = "not_enough_data", but there is cappedAveragePerformancePercent = 100, actualProgressPercent = 100, PC is timely
  // Expect: "Норма"
  const evalScenario3: ProjectEvaluation = {
    projectId: "p1",
    projectHealth: { status: "not_enough_data" },
    milestones: { actualProgressPercent: 100, weightControlStatus: "ok" },
    dataQuality: { completenessPercent: 95, errorsCount: 0 },
    indicators: { cappedAveragePerformancePercent: 100 }
  } as any;
  const status3 = getRegistryProjectStatusView(pBase, evalScenario3, "2026-06-01");
  assert(status3 === "Норма", "Scenario 3: Low risk with sufficient signal must return Норма, even if projectHealth.status is not_enough_data");

  const pNoPc: Project = {
    id: "p-no-pc",
    projectId: "p-no-pc",
  } as any;

  // Scenario 4: evaluation is completely absent, project lacks reliable signals
  // Expect: "Недостаточно данных"
  const status4 = getRegistryProjectStatusView(pNoPc, null, "2026-06-01");
  assert(status4 === "Недостаточно данных", "Scenario 4: Absent evaluation with no signals must return Недостаточно данных");

  // Scenario 5: evaluation exists, but has no milestones, no indicators, no pc, nor data quality signals
  // Expect: "Недостаточно данных"
  const evalScenario5: ProjectEvaluation = {
    projectId: "p-no-pc",
    projectHealth: { status: "not_enough_data" },
    milestones: { actualProgressPercent: null, weightControlStatus: "ok" },
    dataQuality: { completenessPercent: null, errorsCount: 0 },
    indicators: { averagePerformancePercent: null, cappedAveragePerformancePercent: null }
  } as any;
  const status5 = getRegistryProjectStatusView(pNoPc, evalScenario5, "2026-06-01");
  assert(status5 === "Недостаточно данных", "Scenario 5: Completely empty calculation base must return Недостаточно данных");
});

runTest("Tooltip Data generators", () => {
  const p: Project = {
    id: "p1",
    projectId: "p1",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    monitoringStart: "2026-05-01",
    lastPcDate: "2026-05-15",
    monitoringFrequencyWeeks: 4, // 28 days -> next: 2026-06-12
  } as any;

  const ev: ProjectEvaluation = {
    projectId: "p1",
    projectHealth: { status: "ok" },
    dataQuality: { completenessPercent: 95, errorsCount: 0 },
    milestones: { actualProgressPercent: 100, weightControlStatus: "ok" },
    indicators: { averagePerformancePercent: 100 }
  } as any;

  // Let's test PC Status generator
  const pcTd = getPcStatusTooltipData(p, ev, "2026-06-01");
  assert(pcTd.title === "Статус ПК (Проектный комитет)", "Check title");
  assert(pcTd.status === "Своевременно", "Check status");
  assert(pcTd.frequency === "4 нед.", "Check frequency formatting");
  assert(pcTd.nextPcDate === "12.06.2026", "Check correct formatted next audit date");
  assert(pcTd.explanation.includes("проводится регулярно"), "Should output positive description");

  // Let's test Risk tooltip generator
  const riskTd = getRiskTooltipData(p, ev, "2026-06-01");
  assert(riskTd.title === "Уровень риска", "Check title");
  assert(riskTd.risk === "Низкий", "Check risk");
  assert(riskTd.explanation.includes("Факторы риска не обнаружены"), "Check explanation detail");

  // Let's test Managerial status tooltip generator
  const statusTd = getProjectStatusTooltipData(p, ev, "2026-06-01");
  assert(statusTd.title === "Зона риска", "Check title");
  assert(statusTd.status === "Норма", "Check status");
  assert(statusTd.statusBadgeClass.includes("bg-emerald-50"), "Check badge style mapping");
});

runTest("getRegistryPcStatusView should NOT use startDate or createdAt and handle lack of monitoring dates", () => {
  // Scenario 1: Only startDate and createdAt are present. This should return "Недостаточно данных" because monitoringStart and lastPcDate are empty.
  const projectWithLegacyDates: Project = {
    id: "p-legacy",
    projectId: "p-legacy",
    projectName: "Legacy Project",
    stage: "В работе",
    startDate: "2026-05-15",
    endDate: "2026-12-31",
    createdAt: "2026-05-01",
    monitoringFrequencyWeeks: 3
  } as any;

  const status = getRegistryPcStatusView(projectWithLegacyDates, null, "2026-06-01");
  assert(status === "Недостаточно данных", "Progress control status must return 'Недостаточно данных' if lastPcDate and monitoringStart are empty, regardless of startDate or createdAt");

  // Scenario 2: monitoringStart is present, no lastPcDate. This should compute next PC off monitoringStart.
  const projectWithMonitoringStart: Project = {
    id: "p-mon-start",
    projectId: "p-mon-start",
    projectName: "Mon Start Project",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    monitoringStart: "2026-05-15",
    monitoringFrequencyWeeks: 3 // next audit: 2026-06-05
  } as any;

  const statusOk = getRegistryPcStatusView(projectWithMonitoringStart, null, "2026-06-01");
  assert(statusOk === "Своевременно", "Must compute next audit off monitoringStart since lastPcDate is empty");

  // Scenario 3: both monitoringStart and lastPcDate are absent
  const projectNoDates: Project = {
    id: "p-no-dates",
    projectId: "p-no-dates",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    monitoringFrequencyWeeks: 3
  } as any;
  const statusNoDates = getRegistryPcStatusView(projectNoDates, null, "2026-06-01");
  assert(statusNoDates === "Недостаточно данных", "Must return 'Недостаточно данных' without monitoring dates");
});

runTest("Verify sorting rank configurations are correctly defined", () => {
  const mapPcStatus = (st: string) => {
    if (st === 'Недостаточно данных') return 0;
    if (st === 'Своевременно') return 1;
    if (st === 'Просрочен') return 2;
    return 0;
  };
  assert(mapPcStatus('Недостаточно данных') === 0, "PC status sort order: 'Недостаточно данных' = 0");
  assert(mapPcStatus('Своевременно') === 1, "PC status sort order: 'Своевременно' = 1");
  assert(mapPcStatus('Просрочен') === 2, "PC status sort order: 'Просрочен' = 2");

  const mapRisk = (rk: string) => {
    if (rk === 'Низкий') return 0;
    if (rk === 'Средний') return 1;
    if (rk === 'Высокий') return 2;
    return 0;
  };
  assert(mapRisk('Низкий') === 0, "Risk level sort order: 'Низкий' = 0");
  assert(mapRisk('Средний') === 1, "Risk level sort order: 'Средний' = 1");
  assert(mapRisk('Высокий') === 2, "Risk level sort order: 'Высокий' = 2");

  const mapProjectStatus = (st: string) => {
    if (st === 'Недостаточно данных') return 0;
    if (st === 'Норма') return 1;
    if (st === 'Зона риска') return 2;
    return 0;
  };
  assert(mapProjectStatus('Недостаточно данных') === 0, "Project status sort order: 'Недостаточно данных' = 0");
  assert(mapProjectStatus('Норма') === 1, "Project status sort order: 'Норма' = 1");
  assert(mapProjectStatus('Зона риска') === 2, "Project status sort order: 'Зона риска' = 2");
});

// Added scenarios for project status fallback logic
runTest("Fallback scenarios for absent ProjectEvaluation", () => {
  // Сценарий 1. evaluation отсутствует, ПК просрочен.
  const project1: Project = {
    id: "p1",
    projectId: "p1",
    projectName: "Project 1",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    monitoringStart: "2026-05-01",
    lastPcDate: "2026-05-01",
    monitoringFrequencyWeeks: 2, // Next PC: 2026-05-15, overdue on 2026-06-01
  } as any;
  const status1 = getRegistryProjectStatusView(project1, null, "2026-06-01");
  assert(status1 === "Зона риска", "Scenario 1: missing evaluation, PC overdue should be Зона риска");

  // Сценарий 2. evaluation отсутствует, ПК своевременен.
  const project2: Project = {
    id: "p2",
    projectId: "p2",
    projectName: "Project 2",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    monitoringStart: "2026-05-01",
    lastPcDate: "2026-05-25",
    monitoringFrequencyWeeks: 2, // Next PC: 2026-06-08, timely on 2026-06-01
  } as any;
  const status2 = getRegistryProjectStatusView(project2, null, "2026-06-01");
  assert(status2 === "Норма", "Scenario 2: missing evaluation, PC timely should be Норма");

  // Сценарий 3. evaluation отсутствует, ПК отсутствует, но вехи дают 100%.
  const project3: Project = {
    id: "p3",
    projectId: "p3",
    projectName: "Project 3",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    _dataYear: 2026,
    _rawMilestonesNew: {
      q1names: "M1",
      q1progress: "100%",
      q1weights: "100%"
    }
  } as any;
  const status3 = getRegistryProjectStatusView(project3, null, "2026-06-01");
  assert(status3 === "Норма", "Scenario 3: missing evaluation, PC missing, milestones 100% should be Норма");

  // Сценарий 4. evaluation отсутствует, ПК отсутствует, вехи дают 60%.
  const project4: Project = {
    id: "p4",
    projectId: "p4",
    projectName: "Project 4",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    _dataYear: 2026,
    _rawMilestonesNew: {
      q1names: "M1",
      q1progress: "60%",
      q1weights: "100%"
    }
  } as any;
  const status4 = getRegistryProjectStatusView(project4, null, "2026-06-01");
  assert(status4 === "Зона риска", "Scenario 4: missing evaluation, PC missing, milestones 60% should be Зона риска");

  // Сценарий 5. evaluation отсутствует, нет ПК, нет вех, нет показателей, нет сроков.
  const project5: Project = {
    id: "p5",
    projectId: "p5",
    projectName: "Project 5",
  } as any;
  const status5 = getRegistryProjectStatusView(project5, null, "2026-06-01");
  assert(status5 === "Недостаточно данных", "Scenario 5: missing evaluation, absolutely empty should be Недостаточно данных");

  // Сценарий 6. evaluation есть, milestones.weightControlStatus === 'error'.
  const project6: Project = {
    id: "p6",
    projectId: "p6",
    projectName: "Project 6",
    lastPcDate: "2026-05-25",
    monitoringFrequencyWeeks: 2,
  } as any;
  const eval6: ProjectEvaluation = {
    milestones: { weightControlStatus: "error", actualProgressPercent: 100 }
  } as any;
  const status6 = getRegistryProjectStatusView(project6, eval6, "2026-06-01");
  assert(status6 === "Зона риска", "Scenario 6: evaluation present, milestones total weight error should be Зона риска");

  // Сценарий 7. evaluation есть, milestones.weightControlStatus === 'warning_under_100_unallocated'.
  const project7: Project = {
    id: "p7",
    projectId: "p7",
    projectName: "Project 7",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    lastPcDate: "2026-05-25",
    monitoringFrequencyWeeks: 2,
  } as any;
  const eval7: ProjectEvaluation = {
    projectId: "p7",
    dataQuality: { completenessPercent: 95, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { 
      actualProgressPercent: 100, 
      totalProgressPercent: 100, 
      weightControlStatus: 'warning_under_100_unallocated',
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone Q1",
          year: 2026,
          quarter: "Q1",
          isIncludedInProgress: true,
          effectiveWeightPercent: 100,
          contributionPercent: 100,
          completionPercent: 100
        }
      ]
    },
    indicators: { averagePerformancePercent: 100, cappedAveragePerformancePercent: 100 },
    monitoring: { status: "ok" },
    projectHealth: { status: "ok", score: 100, mainReasons: [] }
  } as any;
  const status7 = getRegistryProjectStatusView(project7, eval7, "2026-06-01");
  assert(status7 === "Норма", "Scenario 7: evaluation present with warning_under_100_unallocated should be Норма");
});

runTest("Milestone weight control text and warning exclusion checks", () => {
  const p: Project = { 
    id: "p-test-text",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31"
  } as any;

  // Case 1: weightControlStatus is 'error' -> must contain the new error phrase
  const evalError: ProjectEvaluation = {
    projectId: "p-test-text",
    dataQuality: { completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { weightControlStatus: "error", actualProgressPercent: 100 },
    indicators: { averagePerformancePercent: 100 }
  } as any;
  const tooltipError = getRiskTooltipData(p, evalError, "2026-06-01");
  assert(
    tooltipError.explanation.includes("заданных весов вех превышает допустимые 100%"),
    "Tooltip should show the new error explanation for weightControlStatus === 'error'"
  );
  assert(
    !tooltipError.explanation.toLowerCase().includes("должна быть равна 100%"),
    "Tooltip should NOT contain the legacy weight sum message"
  );

  // Case 2: weightControlStatus is a warning (e.g. warning_under_100_unallocated) -> must NOT have the weight control error explanation
  const evalWarning: ProjectEvaluation = {
    projectId: "p-test-text",
    dataQuality: { completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { weightControlStatus: "warning_under_100_unallocated", actualProgressPercent: 100 },
    indicators: { averagePerformancePercent: 100 }
  } as any;
  const tooltipWarning = getRiskTooltipData(p, evalWarning, "2026-06-01");
  assert(
    !tooltipWarning.explanation.includes("заданных весов вех превышает допустимые 100%"),
    "Tooltip should NOT show weight error explanation when status is warning"
  );
  assert(
    !tooltipWarning.explanation.toLowerCase().includes("должна быть равна 100%"),
    "Tooltip should NOT contain legacy message on warning"
  );
});

runTest("Project without evaluation and without signals of assessment", () => {
  const emptyProject: Project = {
    id: "empty-p",
    projectId: "empty-p",
    projectName: "Empty Project",
  } as any;

  const risk = getRegistryRiskView(emptyProject, null, "2026-06-01");
  const status = getRegistryProjectStatusView(emptyProject, null, "2026-06-01");

  assert(risk === "Недостаточно данных", `Expected risk 'Недостаточно данных', got ${risk}`);
  assert(status === "Недостаточно данных", `Expected status 'Недостаточно данных', got ${status}`);
});

runTest("Evaluation exists but lacks all signals and has status not_enough_data", () => {
  const p: Project = {
    id: "empty-p-with-eval",
    projectId: "empty-p-with-eval",
    projectName: "Empty Project with Evaluation",
  } as any;

  const evalEmpty: ProjectEvaluation = {
    projectId: "empty-p-with-eval",
    assessmentDate: "2026-06-01",
    projectHealth: { status: "not_enough_data" },
    milestones: { actualProgressPercent: null, weightControlStatus: "ok" },
    dataQuality: { completenessPercent: null, errorsCount: 0 },
    indicators: { averagePerformancePercent: null, cappedAveragePerformancePercent: null }
  } as any;

  const risk = getRegistryRiskView(p, evalEmpty, "2026-06-01");
  const tooltipData = getRiskTooltipData(p, evalEmpty, "2026-06-01");

  assert(risk === "Недостаточно данных", `Expected risk 'Недостаточно данных', got ${risk}`);
  assert(tooltipData.risk === "Недостаточно данных", `Expected tooltip risk 'Недостаточно данных', got ${tooltipData.risk}`);
  assert(tooltipData.riskLabel.includes("Недостаточно данных"), `Expected tooltip riskLabel to contain 'Недостаточно данных', got ${tooltipData.riskLabel}`);
  assert(tooltipData.riskBadgeClass.includes("gray-50"), `Expected badge class to be grey style, got ${tooltipData.riskBadgeClass}`);
  assert(!tooltipData.riskBadgeClass.includes("emerald-50"), `Expected badge class not to be green style, got ${tooltipData.riskBadgeClass}`);
});

runTest("Roadmap mapRoadmapHealthStatusToRiskLabel tests", () => {
  assert(mapRoadmapHealthStatusToRiskLabel("risk") === "Высокий", "risk -> Высокий");
  assert(mapRoadmapHealthStatusToRiskLabel("attention") === "Средний", "attention -> Средний");
  assert(mapRoadmapHealthStatusToRiskLabel("ok") === "Низкий", "ok -> Низкий");
  assert(mapRoadmapHealthStatusToRiskLabel("not_enough_data") === "Недостаточно данных", "not_enough_data -> Недостаточно данных");
  assert(mapRoadmapHealthStatusToRiskLabel(undefined) === "Недостаточно данных", "undefined -> Недостаточно данных");
  assert(mapRoadmapHealthStatusToRiskLabel(null) === "Недостаточно данных", "null -> Недостаточно данных");
  assert(mapRoadmapHealthStatusToRiskLabel("unknown") === "Недостаточно данных", "unknown -> Недостаточно данных");
});

runTest("Project without valid dates", () => {
  const projectNoDates: Project = {
    id: "p-no-dates-synthetic",
    projectId: "p-no-dates-synthetic",
    projectName: "No Dates Project",
    lastPcDate: "2026-05-15",
    monitoringFrequencyWeeks: 4,
  } as any;

  const evaluation: ProjectEvaluation = {
    projectId: "p-no-dates-synthetic",
    assessmentDate: "2026-06-01",
    dataQuality: { status: "ok", completenessPercent: 95, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { 
      totalProgressPercent: 100, 
      actualProgressPercent: 80, 
      weightControlStatus: "ok",
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone Q1",
          year: 2026,
          quarter: "Q1",
          isIncludedInProgress: true,
          effectiveWeightPercent: 100,
          contributionPercent: 80,
          completionPercent: 80
        }
      ]
    },
    indicators: { averagePerformancePercent: 100, cappedAveragePerformancePercent: 100 },
    monitoring: { status: "ok" },
    projectHealth: { status: "ok", score: 100, mainReasons: [] }
  } as any;

  const result = calculateUnifiedProjectRisk(projectNoDates, evaluation, "2026-06-01", true);

  // 1. Risk level and registry status should be 'Недостаточно данных' since dates are missing/invalid
  assert(result.riskLevel === "Недостаточно данных", `Risk level should be Недостаточно данных, got ${result.riskLevel}`);
  assert(result.registryStatus === "Недостаточно данных", `Registry status should be Недостаточно данных, got ${result.registryStatus}`);

  // 2. The milestone lag reason should NOT appear
  assert(!result.reasons.some(r => r.includes("отставание по актуальным вехам")), "Should NOT contain milestone lag reason");

  // 3. The date quality warning reason MUST appear
  assert(result.reasons.some(r => r.includes("отсутствуют или некорректно заполнены даты начала/окончания проекта")), "Should contain the missing dates warning");

  // 4. The overall status should reflect the missing dates issue (reasons array is not empty)
  assert(result.reasons.length > 0, "Reasons should not be empty due to date error");
});

runTest("Regression: Milestone weight sum less than 100% normalization alignment", () => {
  const p: Project = {
    id: "p-underweighted-synthetic",
    projectId: "p-underweighted-synthetic",
    projectName: "Underweighted Project",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    lastPcDate: "2026-06-15",
    monitoringFrequencyWeeks: 4,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "Milestone A",
          q1progress: "80%",
          q1weights: "50%",
          q2names: "Milestone B",
          q2progress: "100%",
          q2weights: "30%",
          q3names: "",
          q3progress: "",
          q3weights: "",
          q4names: "",
          q4progress: "",
          q4weights: ""
        }
      }
    }
  } as any;

  // Let's get normalized progress
  const norm = getNormalizedMilestonesForYear(p, 2026, "2026-07-01");
  assert(norm.weightControlStatus === "warning", `Expected weightControlStatus to be warning, got ${norm.weightControlStatus}`);

  const totalProgress = calculateYearMilestonesProgressForProject(p, 2026);
  const q1Progress = calculateSelectedQuarterMilestonesProgressForProject(p, 1, 2026);
  const q2Progress = calculateSelectedQuarterMilestonesProgressForProject(p, 2, 2026);

  assert(totalProgress !== null && totalProgress > 0, "Total progress should be valid");
  assert(q1Progress !== null && q1Progress === 80, `Expected Q1 progress to be 80, got ${q1Progress}`);
  assert(q2Progress !== null && q2Progress === 100, `Expected Q2 progress to be 100, got ${q2Progress}`);
});

runTest("Regression: Risk calculated only on completed quarters under unified weights", () => {
  const p: Project = {
    id: "p-completed-quarters-synthetic",
    projectId: "p-completed-quarters-synthetic",
    projectName: "Completed Quarters Project",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    lastPcDate: "2026-06-15",
    monitoringFrequencyWeeks: 4,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "Milestone A",
          q1progress: "100%",
          q1weights: "50%",
          q2names: "Milestone B",
          q2progress: "0%", // current/future Q2
          q2weights: "50%",
          q3names: "",
          q3progress: "",
          q3weights: "",
          q4names: "",
          q4progress: "",
          q4weights: ""
        }
      }
    }
  } as any;

  const evaluation: ProjectEvaluation = {
    projectId: "p-completed-quarters-synthetic",
    assessmentDate: "2026-03-31",
    dataQuality: { status: "ok", completenessPercent: 95, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { totalProgressPercent: 100, actualProgressPercent: 100, weightControlStatus: "ok" },
    indicators: { averagePerformancePercent: 100, cappedAveragePerformancePercent: 100 },
    monitoring: { status: "ok" },
    projectHealth: { status: "ok", score: 100, mainReasons: [] }
  } as any;

  const result = calculateUnifiedProjectRisk(p, evaluation, "2026-03-31", true);
  assert(result.riskLevel === "Низкий", `Risk level should be Низкий, got ${result.riskLevel}`);
  assert(!result.reasons.some(r => r.includes("отставание")), "Should not have lag reason because completed Q1 is 100% completed");
});

runTest("Regression: Weight sum exceeding 100% control error preservation", () => {
  const p: Project = {
    id: "p-overweighted-synthetic",
    projectId: "p-overweighted-synthetic",
    projectName: "Overweighted Project",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    lastPcDate: "2026-06-15",
    monitoringFrequencyWeeks: 4,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "Milestone A;Milestone B",
          q1progress: "100%;100%",
          q1weights: "70%;50%", // Sum is 120%
          q2names: "",
          q2progress: "",
          q2weights: "",
          q3names: "",
          q3progress: "",
          q3weights: "",
          q4names: "",
          q4progress: "",
          q4weights: ""
        }
      }
    }
  } as any;

  const norm = getNormalizedMilestonesForYear(p, 2026, "2026-07-01");
  assert(norm.weightControlStatus === "error", `Expected weightControlStatus to be error, got ${norm.weightControlStatus}`);

  const evaluation: ProjectEvaluation = {
    projectId: "p-overweighted-synthetic",
    assessmentDate: "2026-07-01",
    dataQuality: { status: "ok", completenessPercent: 95, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { totalProgressPercent: 100, actualProgressPercent: 100, weightControlStatus: "error" },
    indicators: { averagePerformancePercent: 100, cappedAveragePerformancePercent: 100 },
    monitoring: { status: "ok" },
    projectHealth: { status: "ok", score: 100, mainReasons: [] }
  } as any;

  const result = calculateUnifiedProjectRisk(p, evaluation, "2026-07-01", true);
  assert(result.details.hasWeightControlError === true, "Should preserve hasWeightControlError as true");
  assert(result.details.milestoneActualProgressForRisk === null, `Expected milestoneActualProgressForRisk to be null under weight control error, got ${result.details.milestoneActualProgressForRisk}`);
  assert(result.riskLevel === "Высокий", `Expected riskLevel to be Высокий under weight control error, got ${result.riskLevel}`);
  assert(result.reasons.includes("сумма заданных весов вех превышает допустимые 100%"), "Expected reasons to contain weight control error reason");
  assert(!result.reasons.some(r => r.includes("отставание")), `Expected reasons to not contain lag reasons, got: ${result.reasons.join(", ")}`);
});

runTest("getProjectMonitoringStatus: В работе inclusion and green exemptions", () => {
  const assessmentDate = "2026-06-01";

  // Non-"В работе" stages are excluded from the timeliness block
  assert(
    getProjectMonitoringStatus({ stage: "Планируется", startDate: "2026-01-01", endDate: "2026-12-31" } as any, assessmentDate) === "not_applicable",
    "Планируется → not_applicable"
  );
  assert(
    getProjectMonitoringStatus({ stage: "Завершен", startDate: "2026-01-01", endDate: "2026-05-15" } as any, assessmentDate) === "not_applicable",
    "Завершен → not_applicable"
  );
  assert(
    getProjectMonitoringStatus({ stage: "На паузе", startDate: "2026-01-01", endDate: "2026-12-31", monitoringStart: "2026-01-01", monitoringFrequencyWeeks: 2 } as any, assessmentDate) === "not_applicable",
    "На паузе → not_applicable"
  );

  // Before project start → green
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-07-01",
      endDate: "2026-12-31"
    } as any, assessmentDate) === "Своевременно",
    "Before start → Своевременно"
  );

  // After end while still В работе → green
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-01-01",
      endDate: "2026-05-15"
    } as any, assessmentDate) === "Своевременно",
    "After end, still В работе → Своевременно"
  );

  // Monitoring start not yet reached → green
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monitoringStart: "2026-07-01"
    } as any, assessmentDate) === "Своевременно",
    "Before monitoring start → Своевременно"
  );

  // Missing monitoring start (and monitoring already required) → insufficient
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-01-01",
      endDate: "2026-12-31"
    } as any, assessmentDate) === "Недостаточно данных",
    "Missing monitoring start → Недостаточно данных"
  );

  // Missing / invalid frequency → insufficient
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monitoringStart: "2026-05-01"
    } as any, assessmentDate) === "Недостаточно данных",
    "Missing frequency → Недостаточно данных"
  );
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monitoringStart: "2026-05-01",
      monitoringFrequencyWeeks: 0
    } as any, assessmentDate) === "Недостаточно данных",
    "Invalid frequency → Недостаточно данных"
  );

  // Overdue: monStart 2026-05-01 + 2w = 2026-05-15 < 2026-06-01
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monitoringStart: "2026-05-01",
      monitoringFrequencyWeeks: 2
    } as any, assessmentDate) === "Просрочен",
    "Overdue without lastPc → Просрочен"
  );

  // Overdue with lastPc
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monitoringStart: "2026-05-01",
      lastPcDate: "2026-05-10",
      monitoringFrequencyWeeks: 2
    } as any, assessmentDate) === "Просрочен",
    "Overdue with lastPc → Просрочен"
  );

  // Timely: next PC == assessment
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monitoringStart: "2026-05-01",
      lastPcDate: "2026-05-18",
      monitoringFrequencyWeeks: 2
    } as any, assessmentDate) === "Своевременно",
    "Next PC == assessment → Своевременно"
  );

  // Timely: next PC after assessment
  assert(
    getProjectMonitoringStatus({
      stage: "В работе",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monitoringStart: "2026-05-01",
      lastPcDate: "2026-05-20",
      monitoringFrequencyWeeks: 2
    } as any, assessmentDate) === "Своевременно",
    "Next PC after assessment → Своевременно"
  );
});

console.log("[REGISTRY_STATUS_TEST] ALL TESTS IN SUITE PASSED SUCCESSFULLY!\n");
