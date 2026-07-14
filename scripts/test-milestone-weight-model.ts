import { calculateMilestonesWeightModel, MilestoneWeightDetail } from "../server/services/milestoneWeightModel";
import { NormalizedMilestone } from "../server/services/projectNormalizer";

function runTest(name: string, fn: () => void) {
  console.log(`[TEST] Running milestone weight case: ${name}...`);
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

function createMilestone(overrides: Partial<NormalizedMilestone>): NormalizedMilestone {
  return {
    id: "M-1",
    year: 2026,
    quarter: "Q1",
    name: "Test Milestone",
    progressPercent: null,
    weightPercent: null,
    periodStatus: "past",
    isApplicableQuarter: true,
    sourceColumns: { name: "", progress: "", weight: "" },
    ...overrides
  };
}

// 1. Все вехи имеют явные веса, сумма = 100
runTest("Scenario 1: All milestones have explicit weights, sum is 100 (20/30/50)", () => {
  const milestones: NormalizedMilestone[] = [
    createMilestone({ id: "M1", weightPercent: 20, progressPercent: 100 }),
    createMilestone({ id: "M2", weightPercent: 30, progressPercent: 50 }),
    createMilestone({ id: "M3", weightPercent: 50, progressPercent: 0 }),
  ];

  const result = calculateMilestonesWeightModel(milestones);

  assert(result.weightStatus === "ok", "weightStatus should be ok");
  assert(result.totalProgressPercent === 35, `Expected 35% progress, got ${result.totalProgressPercent}%`);
  
  const m1 = result.milestones.find(m => m.id === "M1")!;
  const m2 = result.milestones.find(m => m.id === "M2")!;
  const m3 = result.milestones.find(m => m.id === "M3")!;

  assert(m1.effectiveWeightPercent === 20, "M1 effective weight should be 20");
  assert(m1.weightSource === "explicit", "M1 source should be explicit");
  assert(m1.contributionPercent === 20, "M1 contribution should be 20");

  assert(m2.effectiveWeightPercent === 30, "M2 effective weight should be 30");
  assert(m2.weightSource === "explicit", "M2 source should be explicit");
  assert(m2.contributionPercent === 15, "M2 contribution should be 15");

  assert(m3.effectiveWeightPercent === 50, "M3 effective weight should be 50");
  assert(m3.weightSource === "explicit", "M3 source should be explicit");
  assert(m3.contributionPercent === 0, "M3 contribution should be 0");
});

// 2. Часть вех имеет веса, сумма < 100, есть вехи без веса с процентом выполнения
runTest("Scenario 2: Part with explicit weights sum < 100, remaining delegated to unweighted with progress", () => {
  const milestones: NormalizedMilestone[] = [
    createMilestone({ id: "M1", weightPercent: 20, progressPercent: 100 }),
    createMilestone({ id: "M2", weightPercent: 30, progressPercent: 50 }),
    createMilestone({ id: "M3", weightPercent: null, progressPercent: 80 }),
    createMilestone({ id: "M4", weightPercent: null, progressPercent: 40 }),
  ];

  const result = calculateMilestonesWeightModel(milestones);

  // Exact Explicit Sum: 50%
  // Leftover: 50%
  // Count of unweighted with progress: 2 (M3, M4)
  // Per milestone: 25%
  // M1 contrib: 20 * 100 / 100 = 20
  // M2 contrib: 30 * 50 / 100 = 15
  // M3 contrib: 25 * 80 / 100 = 20
  // M4 contrib: 25 * 40 / 100 = 10
  // Total contribution: 20 + 15 + 20 + 10 = 65%

  assert(result.weightStatus === "ok", "weightStatus should be ok");
  assert(result.totalProgressPercent === 65, `Expected 65% progress, got ${result.totalProgressPercent}%`);

  const m3 = result.milestones.find(m => m.id === "M3")!;
  const m4 = result.milestones.find(m => m.id === "M4")!;

  assert(m3.effectiveWeightPercent === 25, "M3 weighted per leftover: 25");
  assert(m3.weightSource === "calculated", "M3 source should be calculated");
  assert(m4.effectiveWeightPercent === 25, "M4 weighted per leftover: 25");
  assert(m4.weightSource === "calculated", "M4 source should be calculated");
});

// 3. Явная сумма = 100, есть дополнительные вехи без веса
runTest("Scenario 3: Explicit weights sum = 100, unweighted milestones are treated as informational", () => {
  const milestones: NormalizedMilestone[] = [
    createMilestone({ id: "M1", weightPercent: 50, progressPercent: 100 }),
    createMilestone({ id: "M2", weightPercent: 50, progressPercent: 50 }),
    createMilestone({ id: "M3", weightPercent: null, progressPercent: 0 }),
  ];

  const result = calculateMilestonesWeightModel(milestones);

  assert(result.weightStatus === "ok", "weightStatus should be ok");
  assert(result.totalProgressPercent === 75, `Expected 75% progress, got ${result.totalProgressPercent}%`);

  const m3 = result.milestones.find(m => m.id === "M3")!;
  assert(m3.effectiveWeightPercent === 0, "M3 effective weight should be 0");
  assert(m3.weightSource === "informational", "M3 status should be informational");
  assert(!m3.isIncludedInProgress, "M3 should not be included in progress calculation");
});

// 4. Явная сумма > 100
runTest("Scenario 4: Sum of explicit weights > 100 results in error state", () => {
  const milestones: NormalizedMilestone[] = [
    createMilestone({ id: "M1", weightPercent: 60, progressPercent: 100 }),
    createMilestone({ id: "M2", weightPercent: 50, progressPercent: 50 }),
  ];

  const result = calculateMilestonesWeightModel(milestones);

  assert(result.weightStatus === "error_over_100", "weightStatus should be error_over_100");
  assert(result.totalProgressPercent === null, "progress should be null under error state");
  assert(result.description.includes("превышает 100%"), "description should display helpful error explanation");
});

// 5. Нет явных весов вообще
runTest("Scenario 5: No explicit weights at all, fallback to equal weights for all milestones with progress", () => {
  const milestones: NormalizedMilestone[] = [
    createMilestone({ id: "M1", weightPercent: null, progressPercent: 100 }),
    createMilestone({ id: "M2", weightPercent: null, progressPercent: 50 }),
    createMilestone({ id: "M3", weightPercent: null, progressPercent: 0 }),
  ];

  const result = calculateMilestonesWeightModel(milestones);

  // Equal fallback to 3 items => 33.33333% each
  // Contribution: 33.3333% * 100/100 + 33.3333% * 50/100 + 0 = 33.3333% + 16.6667% = 50%
  assert(result.weightStatus === "ok", "weightStatus should be ok");
  assert(Math.abs(result.totalProgressPercent! - 50) < 0.1, `Expected total progress around 50%, got ${result.totalProgressPercent}%`);

  const m1 = result.milestones.find(m => m.id === "M1")!;
  assert(m1.weightSource === "equal_fallback", "weightSource should be equal_fallback");
  assert(Math.abs(m1.effectiveWeightPercent - 33.33) < 0.1, "effectiveWeight should be 33.33%");
});

// 6. Явная сумма < 100, невзвешенная веха без факта получает остаток веса (вклад 0)
runTest("Scenario 6: Sum < 100, unweighted milestone without progress still receives residual weight", () => {
  const milestones: NormalizedMilestone[] = [
    createMilestone({ id: "M1", weightPercent: 70, progressPercent: 100 }),
    createMilestone({ id: "M2", weightPercent: null, progressPercent: null }),
  ];

  const result = calculateMilestonesWeightModel(milestones);

  // M1: 70% * 100% = 70; M2: 30% * 0 = 0 → total 70
  assert(result.weightStatus === "warning_missing_progress", "Status should be warning_missing_progress");
  assert(result.totalProgressPercent === 70, `Expected 70%, got ${result.totalProgressPercent}%`);

  const m2 = result.milestones.find(m => m.id === "M2")!;
  assert(m2.weightSource === "calculated", "m2 should receive calculated residual weight");
  assert(m2.effectiveWeightPercent === 30, "m2 effectiveWeight should be 30");
  assert(m2.contributionPercent === 0, "m2 contribution should be 0 with missing progress");
  assert(m2.missingProgress === true, "m2 missingProgress must be true");
});

// 7. Вехи в разных годах и кварталах
runTest("Scenario 7: Multi-year/quarter calculation scope", () => {
  const milestones: NormalizedMilestone[] = [
    createMilestone({ id: "M1", year: 2026, quarter: "Q1", weightPercent: 20, progressPercent: 100 }),
    createMilestone({ id: "M2", year: 2026, quarter: "Q4", weightPercent: 30, progressPercent: 0 }),
    createMilestone({ id: "M3", year: 2027, quarter: "Q2", weightPercent: null, progressPercent: 100 }),
    createMilestone({ id: "M4", year: 2028, quarter: "Q3", weightPercent: null, progressPercent: 50 }),
  ];

  const result = calculateMilestonesWeightModel(milestones);

  // Total explicit sum: 50%
  // Leftover: 50% split to 2 remaining unweighted (M3, M4) => 25% each
  // Progress = 20 * 1.0 + 30 * 0.0 + 25 * 1.0 + 25 * 0.5 = 20 + 0 + 25 + 12.5 = 57.5%
  assert(result.weightStatus === "ok", "Should be ok");
  assert(result.totalProgressPercent === 57.5, `Expected 57.5%, got ${result.totalProgressPercent}%`);
});

// 8. Веха без процента выполнения получает вес, но нулевой вклад (README: 55%)
runTest("Scenario 8: Milestone with no progress receives residual weight but zero contribution", () => {
  const milestones: NormalizedMilestone[] = [
    createMilestone({ id: "M1", weightPercent: 40, progressPercent: 100 }),
    createMilestone({ id: "M2", weightPercent: null, progressPercent: null }),
    createMilestone({ id: "M3", weightPercent: null, progressPercent: 50 }),
  ];

  const result = calculateMilestonesWeightModel(milestones);

  // M1: 40% * 100% = 40
  // M2: 30% * 0 = 0
  // M3: 30% * 50% = 15
  // Expected total progress: 55%

  assert(result.weightStatus === "warning_missing_progress", "Status should be warning_missing_progress");
  assert(result.totalProgressPercent === 55, `Expected 55% progress, got ${result.totalProgressPercent}%`);

  const m2 = result.milestones.find(m => m.id === "M2")!;
  assert(m2.weightSource === "calculated", "M2 weight source must be calculated");
  assert(m2.effectiveWeightPercent === 30, "M2 effective weight must be 30");
  assert(m2.isIncludedInProgress, "M2 isIncludedInProgress must be true");
  assert(m2.contributionPercent === 0, "M2 contribution must be 0");

  const m3 = result.milestones.find(m => m.id === "M3")!;
  assert(m3.weightSource === "calculated", "M3 weight source must be calculated");
  assert(m3.effectiveWeightPercent === 30, "M3 effective weight must be 30");
  assert(m3.isIncludedInProgress, "M3 isIncludedInProgress must be true");
});

console.log("\n-----------------------------------------------------------");
console.log("All milestone weight model test cases passed successfully!");
console.log("-----------------------------------------------------------\n");
