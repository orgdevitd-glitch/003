import { calculateUnifiedProjectRisk, getQuarterPeriodStatus, TARGET_COMPLETENESS_PERCENT } from "../src/utils/projectRegistryStatus.js";
import {
  calculateYearMilestonesProgressForProject,
  getNormalizedMilestonesForYear
} from "../src/utils/projectCalculations.js";
import { Project, ProjectEvaluation } from "../src/types";

function runTest(name: string, fn: () => void) {
  console.log(`[UNIFIED_RISK_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[UNIFIED_RISK_TEST] ✓ Passed\n`);
  } catch (error: any) {
    console.error(`[UNIFIED_RISK_TEST] ❌ FAILED: ${name}`);
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

runTest("1. Active project before end date with fully met completed periods (no milestone overdue risk)", () => {
  const project: Project = {
    projectId: "p-active-fully-met",
    projectName: "Synthetic Active Fully Met",
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31",
    endDate: "2026-12-31",
    status: "active",
    lastPcDate: "2026-05-01",
    monitoringFrequencyWeeks: 4,
    _dataYear: 2026,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "Milestone Q1",
          q1progress: "100%",
          q1weights: "50%",
          
          q2names: "Milestone Q2",
          q2progress: "0%", // Q2 is current/future on 2026-05-15, ignored
          q2weights: "50%"
        }
      }
    }
  } as any;

  // Evaluation on 2026-05-15: Q1 is completed, Q2 is current
  const result = calculateUnifiedProjectRisk(project, null, "2026-05-15");
  
  // Q1 is 100%, Q2 is ignored. Result should be Low risk
  assert(result.riskLevel === "Низкий", `Expected risk level to be Низкий, got ${result.riskLevel}`);
  assert(!result.reasons.some(r => r.includes("вехам")), "Should not have milestone lag reasons");
});

runTest("2. Active project before end date with partially met completed period", () => {
  const project: Project = {
    projectId: "p-active-partially-met",
    projectName: "Synthetic Active Partially Met",
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31",
    endDate: "2026-12-31",
    status: "active",
    lastPcDate: "2026-05-01",
    monitoringFrequencyWeeks: 4,
    _dataYear: 2026,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "Milestone Q1",
          q1progress: "80%", // Only 80% complete
          q1weights: "50%",
          
          q2names: "Milestone Q2",
          q2progress: "0%", // Q2 ignored
          q2weights: "50%"
        }
      }
    }
  } as any;

  // Evaluation on 2026-05-15: Q1 is completed (80%), Q2 is current
  const result = calculateUnifiedProjectRisk(project, null, "2026-05-15");
  
  assert(result.riskLevel === "Высокий" || result.riskLevel === "Средний", `Expected elevated risk level, got ${result.riskLevel}`);
  assert(result.reasons.some(r => r.includes("отставание по актуальным вехам составляет 20.0%")), "Should contain reasons about 20% milestone lag");
});

runTest("3. Active project after end date", () => {
  const project: Project = {
    projectId: "p-after-end",
    projectName: "Synthetic After End",
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31",
    endDate: "2026-12-31",
    status: "active",
    lastPcDate: "2026-02-15",
    monitoringFrequencyWeeks: 4,
    _dataYear: 2026,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "M1",
          q1progress: "100%",
          q1weights: "50%",
          q2names: "M2",
          q2progress: "80%",
          q2weights: "50%"
        }
      }
    }
  } as any;

  // Evaluation on 2027-02-15 (after project end date)
  const result = calculateUnifiedProjectRisk(project, null, "2027-02-15");
  
  // Progress overall = 100% * 0.5 + 80% * 0.5 = 90%
  // Since 90% < 100%, we have milestone lag risk
  assert(result.reasons.some(r => r.includes("отставание по актуальным вехам составляет 10.0%")), "Should calculate overall progress and lag");
});

runTest("4. Project before start date", () => {
  const project: Project = {
    projectId: "p-before-start",
    projectName: "Synthetic Before Start",
    startDate: "2026-06-01",
    deadlineAt: "2026-12-31",
    endDate: "2026-12-31",
    status: "active",
    lastPcDate: "2026-02-15",
    monitoringFrequencyWeeks: 4,
    _dataYear: 2026,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "M1",
          q1progress: "0%",
          q1weights: "100%"
        }
      }
    }
  } as any;

  // Evaluation on 2026-02-15 (before project starts)
  const result = calculateUnifiedProjectRisk(project, null, "2026-02-15");
  
  // No milestone overdue risk since project hasn't started yet
  assert(!result.reasons.some(r => r.includes("вехам")), "No milestone lag risk should be reported before start");
});

runTest("5. Project with calculated weights", () => {
  const project: Project = {
    projectId: "p-calculated-weights",
    projectName: "Synthetic Calculated Weights",
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31",
    endDate: "2026-12-31",
    status: "active",
    lastPcDate: "2026-05-01",
    monitoringFrequencyWeeks: 4,
    _dataYear: 2026,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "M1; M2",
          q1progress: "100%; 50%",
          q1weights: "40%; 60%" // explicit weights
        }
      }
    }
  } as any;

  // Evaluation on 2026-05-15 (Q1 completed, Q2 current)
  // Weighted Q1 progress = 100% * 0.4 + 50% * 0.6 = 70%
  const result = calculateUnifiedProjectRisk(project, null, "2026-05-15");
  
  assert(result.reasons.some(r => r.includes("отставание по актуальным вехам составляет 30.0%")), "Should use effective weights to calculate 30% lag");
});

runTest("6. Completeness below threshold", () => {
  const project: Project = {
    projectId: "p-completeness-low",
    projectName: "Synthetic Completeness Low",
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31",
    endDate: "2026-12-31",
    status: "active",
    _dataYear: 2026,
    _rawByYear: {}
  } as any;

  const evaluation: ProjectEvaluation = {
    projectId: "p-completeness-low",
    dataQuality: {
      completenessPercent: 85, // Below 90%
      errorsCount: 0,
      warningsCount: 0,
      issuesCount: 0,
      status: "warning"
    }
  } as any;

  const result = calculateUnifiedProjectRisk(project, evaluation, "2026-02-15");
  
  assert(result.reasons.some(r => r.includes(`заполненность данных проекта составляет 85%, что ниже целевого уровня ${TARGET_COMPLETENESS_PERCENT}%`)), 
    `Expected exact Russian reason, got: ${result.reasonsText}`);
});

runTest("7. Completeness exactly at threshold", () => {
  const project: Project = {
    projectId: "p-completeness-ok",
    projectName: "Synthetic Completeness OK",
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31",
    endDate: "2026-12-31",
    status: "active",
    _dataYear: 2026,
    _rawByYear: {}
  } as any;

  const evaluation: ProjectEvaluation = {
    projectId: "p-completeness-ok",
    dataQuality: {
      completenessPercent: 90, // Exactly at 90%
      errorsCount: 0,
      warningsCount: 0,
      issuesCount: 0,
      status: "ok"
    }
  } as any;

  const result = calculateUnifiedProjectRisk(project, evaluation, "2026-02-15");
  
  // No completeness risk since it is exactly on the threshold
  assert(!result.reasons.some(r => r.includes("заполненность")), "Should not report completeness risk when exactly on threshold");
});

runTest("8. Project card using project card thresholds, registry using registry thresholds", () => {
  const project: Project = {
    projectId: "p-threshold-diff",
    projectName: "Synthetic Threshold Diff",
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31",
    endDate: "2026-12-31",
    status: "active",
    lastPcDate: "2026-05-01",
    monitoringFrequencyWeeks: 4,
    _dataYear: 2026,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "M1",
          q1progress: "80%", // deviation 20%
          q1weights: "100%"
        }
      }
    }
  } as any;

  // Case A: useRegistryThresholds = true (Registry mode)
  // Registry high risk threshold = 10% deviation. 20% >= 10% -> Risk = 'Высокий'
  const registryResult = calculateUnifiedProjectRisk(project, null, "2026-05-15", true);
  assert(registryResult.riskLevel === "Высокий", `Registry risk should be Высокий for 20% deviation, got ${registryResult.riskLevel}`);

  // Case B: useRegistryThresholds = false (Project Card mode)
  // Project Card high risk threshold = 25% deviation, med threshold = 10%. 20% < 25% and >= 10% -> Risk = 'Средний'
  const cardResult = calculateUnifiedProjectRisk(project, null, "2026-05-15", false);
  assert(cardResult.riskLevel === "Средний", `Project Card risk should be Средний for 20% deviation, got ${cardResult.riskLevel}`);
});

runTest("9. Synthetic test for calculated weights with unweighted/zero-weighted milestones", () => {
  // Residual weight is split across ALL unweighted milestones (incl. missing progress → 0%).
  const project: Project = {
    projectId: "p-calculated-weights-synthetic",
    projectName: "Synthetic Calculated Weights Test",
    startDate: "2026-01-01",
    deadlineAt: "2026-12-31",
    endDate: "2026-12-31",
    status: "active",
    lastPcDate: "2026-08-10",
    monitoringFrequencyWeeks: 4,
    _dataYear: 2026,
    _rawByYear: {
      "2026": {
        milestones: {
          q1names: "M1",
          q1progress: "100%",
          q1weights: "40%",
          q2names: "M2",
          q2progress: "80%",
          q2weights: "",
          q3names: "M3",
          q3progress: "",
          q3weights: "0%"
        }
      }
    }
  } as any;

  // Explicit 40%. Residual 60% → M2 and M3 equally → 30% each.
  // Year progress: 40*100 + 30*80 + 30*0 = 64%
  const cardProgress = calculateYearMilestonesProgressForProject(project, 2026);
  assert(cardProgress !== null && Math.abs(cardProgress - 64) < 0.1, `Expected card progress to be 64%, got ${cardProgress}`);

  const norm = getNormalizedMilestonesForYear(project, 2026, "2026-08-15");
  const m3 = norm.milestones.find(m => m.name === "M3");
  assert(m3?.isIncludedInProgress === true, "M3 without progress must stay in weight pool");
  assert(m3?.weightSource === "calculated", "M3 must receive calculated residual weight");
  assert(m3 !== undefined && Math.abs(m3.effectiveWeightPercent - 30) < 0.1, `M3 weight should be 30%, got ${m3?.effectiveWeightPercent}`);
  assert(m3?.contributionPercent === 0, "M3 contribution must be 0");
  assert(norm.weightControlStatus === "warning", "Missing progress among included milestones → warning");

  // Assessment 2026-08-15: Q1+Q2 completed. plan 70, fact 64 → ~91.43%, lag ~8.57%.
  // Card thresholds (med=10): lag alone → Низкий.
  // Registry: incomplete completed-period milestone (M2 at 80%) forces Высокий via overdue count.
  const riskResult = calculateUnifiedProjectRisk(project, null, "2026-08-15", false);
  assert(riskResult.riskLevel === "Низкий", `Expected card risk Низкий, got ${riskResult.riskLevel}`);
  assert(
    riskResult.details.milestoneActualProgressForRisk !== null &&
      Math.abs(riskResult.details.milestoneActualProgressForRisk - (64 / 70) * 100) < 0.2,
    `Expected completed-period progress ~91.4%, got ${riskResult.details.milestoneActualProgressForRisk}`
  );

  const registryRiskResult = calculateUnifiedProjectRisk(project, null, "2026-08-15", true);
  assert(registryRiskResult.riskLevel === "Высокий", `Expected registry risk Высокий (overdue M2), got ${registryRiskResult.riskLevel}`);
  assert(registryRiskResult.details.totalOverdueMilestones > 0, "Registry high risk driven by incomplete completed-period milestone");
});

console.log("[UNIFIED_RISK_TEST] ALL PARAMS AND REGRESSION TESTS COMPLETED SUCCESSFULLY!\n");
