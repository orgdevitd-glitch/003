import path from "path";
import fs from "fs-extra";

const TEST_DATA_DIR = path.join(process.cwd(), "data-test-temp-fallback");
process.env.DATA_DIR = TEST_DATA_DIR;

async function runTest(name: string, fn: () => Promise<void>) {
  console.log(`[FALLBACK_TEST] Running: ${name}...`);
  try {
    await fn();
    console.log(`[FALLBACK_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[FALLBACK_TEST] ❌ FAILED: ${name}`);
    throw error;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const mockProjects: any[] = [
  {
    projectId: "P-101",
    id: "P-101",
    projectName: "Test Project Fallback",
    stage: "В работе",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    priority: 1,
    monitoringStart: "2026-01-01",
    monitoringFrequencyWeeks: 2,
    lastPcDate: "2026-01-01",
    milestones: [
      {
        taskId: "M-1",
        title: "Milestone Q1",
        status: "Завершена",
        quarter: "Q1",
        weight: 50,
        progressPercent: 100,
        isMilestone: true
      },
      {
        taskId: "M-2",
        title: "Milestone Q2",
        status: "Выполняется",
        quarter: "Q2",
        weight: 50,
        progressPercent: 50,
        isMilestone: true
      }
    ],
    indicators: [
      {
        indicatorId: "I-1",
        name: "Test Indicator",
        planValue: 100,
        factValue: 90,
        period: "Q1 2026"
      }
    ],
    _dataYear: 2026,
    _rawQuarters: {
      q1plan: "50%", q1fact: "50%",
      q2plan: "50%", q2fact: "50%",
      q3plan: null, q3fact: null,
      q4plan: null, q4fact: null
    },
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "Milestone Q1", q1progress: "100%", q1weights: "50%",
          q2names: "Milestone Q2", q2progress: "50%", q2weights: "50%",
          q3names: null, q3progress: null, q3weights: null,
          q4names: null, q4progress: null, q4weights: null
        },
        indicators: {
          q1names: "Test Indicator", q1plans: "100", q1facts: "90",
          q2names: null, q2plans: null, q2facts: null,
          q3names: null, q3plans: null, q3facts: null,
          q4names: null, q4plans: null, q4facts: null
        }
      }
    }
  }
];

async function main() {
  // Ensure we start with a clean test directory
  await fs.remove(TEST_DATA_DIR);
  await fs.ensureDir(TEST_DATA_DIR);

  try {
    // Dynamically import to ensure process.env.DATA_DIR is set beforehand
    const { 
      restoreOrCalculateEvaluations,
      getLatestProjectEvaluations,
      getLatestPortfolioEvaluation,
      getLatestNormalizedProjects,
      resetLatestEvaluationsForTesting,
      buildProjectEvaluationSignature,
      buildIndicatorDictionarySignature
    } = await import("../server/services/googleSheetsService");

    const {
      setIndicatorDictionary,
      getIndicatorDictionary,
      DEFAULT_INDICATOR_DICTIONARY
    } = await import("../server/services/indicatorDictionary");

    // Define cache paths to inspect
    const EVALUATIONS_FILE = path.join(TEST_DATA_DIR, "project-evaluations.json");
    const PORTFOLIO_EVAL_FILE = path.join(TEST_DATA_DIR, "portfolio-evaluation.json");
    const NORMALIZED_PROJECTS_FILE = path.join(TEST_DATA_DIR, "normalized-projects.json");
    const EVALUATIONS_META_FILE = path.join(TEST_DATA_DIR, "evaluations-meta.json");

    // 1. Scenario: RAM is empty, cache doesn't exist, projects are present.
    // Expectation: Evaluations are calculated, stored in cache and RAM is not empty.
    await runTest("RAM is empty, no cache, projects are present -> calculates and caches", async () => {
      resetLatestEvaluationsForTesting();
      assert(getLatestProjectEvaluations().length === 0, "Initial RAM evaluations should be empty");

      const assessmentDate = new Date("2026-01-05");
      await restoreOrCalculateEvaluations(mockProjects, assessmentDate);

      const evaluations = getLatestProjectEvaluations();
      assert(evaluations.length === 1, "Should have calculated 1 evaluation");
      assert(evaluations[0].projectId === "P-101", "Should have calculated for P-101");
      assert(evaluations[0].monitoring.status === "ok", "Expected status ok");

      const portfolio = getLatestPortfolioEvaluation();
      assert(portfolio !== null, "Portfolio evaluation should be calculated");
      assert(portfolio?.totalProjects === 1, "Portfolio should count 1 project");

      // Assert cache files exist and have valid JSON
      assert(await fs.pathExists(EVALUATIONS_FILE), "Evaluations cache file should exist");
      assert(await fs.pathExists(PORTFOLIO_EVAL_FILE), "Portfolio cache file should exist");
      assert(await fs.pathExists(NORMALIZED_PROJECTS_FILE), "Normalized projects cache file should exist");
      assert(await fs.pathExists(EVALUATIONS_META_FILE), "Meta file should exist");

      const evCache = await fs.readJson(EVALUATIONS_FILE);
      assert(Array.isArray(evCache) && evCache.length === 1, "Cache should contain 1 evaluation");
    });

    // Scenario A: assessmentDate changed
    await runTest("Scenario A: assessmentDate changed -> recalculates correct monitoring status", async () => {
      // RAM is set for 2026-01-05 (status ok)
      // Call with 2026-06-30
      const assessmentDate = new Date("2026-06-30");
      await restoreOrCalculateEvaluations(mockProjects, assessmentDate);

      const evaluations = getLatestProjectEvaluations();
      assert(evaluations.length === 1, "Should have 1 evaluation");
      assert(evaluations[0].monitoring.status === "overdue", `Expected status overdue on 2026-06-30, got ${evaluations[0].monitoring.status}`);
    });

    await runTest("Concurrent assessment dates return isolated evaluation snapshots", async () => {
      resetLatestEvaluationsForTesting();

      const [januarySnapshot, juneSnapshot] = await Promise.all([
        restoreOrCalculateEvaluations(mockProjects, new Date("2026-01-05")),
        restoreOrCalculateEvaluations(mockProjects, new Date("2026-06-30"))
      ]);

      assert(
        januarySnapshot.projectEvaluations[0]?.assessmentDate.startsWith("2026-01-05"),
        `January request must retain its own date, got ${januarySnapshot.projectEvaluations[0]?.assessmentDate}`
      );
      assert(
        januarySnapshot.projectEvaluations[0]?.monitoring.status === "ok",
        `January request must retain status ok, got ${januarySnapshot.projectEvaluations[0]?.monitoring.status}`
      );
      assert(
        juneSnapshot.projectEvaluations[0]?.assessmentDate.startsWith("2026-06-30"),
        `June request must retain its own date, got ${juneSnapshot.projectEvaluations[0]?.assessmentDate}`
      );
      assert(
        juneSnapshot.projectEvaluations[0]?.monitoring.status === "overdue",
        `June request must retain status overdue, got ${juneSnapshot.projectEvaluations[0]?.monitoring.status}`
      );
    });

    // Scenario B: restart + stale disk cache by assessmentDate
    await runTest("Scenario B: restart + stale disk cache by assessmentDate -> ignores cache and recalculates", async () => {
      // 1. Force state to be evaluated for 2026-01-05 and saved to disk
      resetLatestEvaluationsForTesting();
      const assessmentDate1 = new Date("2026-01-05");
      await restoreOrCalculateEvaluations(mockProjects, assessmentDate1);
      assert(getLatestProjectEvaluations()[0].monitoring.status === "ok", "Should be ok initially");

      // 2. Clear RAM (simulate restart)
      resetLatestEvaluationsForTesting();
      assert(getLatestProjectEvaluations().length === 0, "RAM should be cleared");

      // 3. Request evaluation for 2026-06-30 (which makes 2026-01-05 cache stale)
      const assessmentDate2 = new Date("2026-06-30");
      await restoreOrCalculateEvaluations(mockProjects, assessmentDate2);

      // 4. Verify it recalculated instead of returning the cached ok status
      const evaluations = getLatestProjectEvaluations();
      assert(evaluations.length === 1, "Should have 1 evaluation");
      assert(evaluations[0].monitoring.status === "overdue", "Expected status overdue because disk cache was stale");
    });

    // Scenario C: project data changed
    await runTest("Scenario C: project data changed -> signature mismatch -> recalculates", async () => {
      // 1. Establish cache for mockProjects on 2026-06-30
      resetLatestEvaluationsForTesting();
      const assessmentDate = new Date("2026-06-30");
      await restoreOrCalculateEvaluations(mockProjects, assessmentDate);
      assert(getLatestProjectEvaluations()[0].monitoring.status === "overdue", "Initial monitoring status should be overdue");

      // 2. Clear RAM (simulate restart)
      resetLatestEvaluationsForTesting();

      // 3. Create modified projects (change lastPcDate to 2026-06-25, which makes monitoring ok on 2026-06-30)
      const modifiedProjects = JSON.parse(JSON.stringify(mockProjects));
      modifiedProjects[0].lastPcDate = "2026-06-25";

      // 4. Request evaluation on 2026-06-30
      await restoreOrCalculateEvaluations(modifiedProjects, assessmentDate);

      // 5. Verify it recalculated due to signature mismatch
      const evaluations = getLatestProjectEvaluations();
      assert(evaluations.length === 1, "Should have 1 evaluation");
      assert(evaluations[0].monitoring.status === "ok", `Expected status ok after updating lastPcDate, but got ${evaluations[0].monitoring.status}`);
    });

    // Scenario D: empty projects
    await runTest("Scenario D: empty projects -> resets RAM but does not overwrite valid disk cache", async () => {
      // 1. Force a valid state on disk
      resetLatestEvaluationsForTesting();
      const assessmentDate = new Date("2026-06-30");
      await restoreOrCalculateEvaluations(mockProjects, assessmentDate);
      assert(await fs.pathExists(EVALUATIONS_FILE), "Disk cache should exist");

      // 2. Call restoreOrCalculateEvaluations with empty list
      await restoreOrCalculateEvaluations([]);

      // 3. RAM should be empty
      assert(getLatestProjectEvaluations().length === 0, "RAM should be reset to empty");

      // 4. Disk cache should NOT be empty or deleted
      assert(await fs.pathExists(EVALUATIONS_FILE), "Disk cache should still exist");
      const diskContent = await fs.readJson(EVALUATIONS_FILE);
      assert(Array.isArray(diskContent) && diskContent.length === 1, "Disk cache should not have been overwritten with empty data");
    });

    // Scenario E: Signature sensitivity to endDate and deadlineAt
    await runTest("Scenario E: Signature sensitivity to endDate and deadlineAt", async () => {
      const projBase = {
        projectId: "P-101",
        projectName: "Test Project",
        endDate: "2026-12-31",
        deadlineAt: "2026-06-01"
      };

      const sigBase = buildProjectEvaluationSignature([projBase as any]);

      // Change deadlineAt only
      const projDiffDeadline = {
        ...projBase,
        deadlineAt: "2026-11-01"
      };
      const sigDiffDeadline = buildProjectEvaluationSignature([projDiffDeadline as any]);
      assert(sigBase !== sigDiffDeadline, "Signature must change when only deadlineAt changes");

      // Change endDate only
      const projDiffEndDate = {
        ...projBase,
        endDate: "2026-10-15"
      };
      const sigDiffEndDate = buildProjectEvaluationSignature([projDiffEndDate as any]);
      assert(sigBase !== sigDiffEndDate, "Signature must change when only endDate changes");
    });

    // Dictionary signature tests
    await runTest("Dictionary signature changes on modifications", async () => {
      // C. Changing only aliases changes dictionary signature
      const baseDict = [{
        name: "Кастом KPI",
        calculationType: "pending" as any,
        unit: null,
        status: "pending_business_decision",
        aliases: []
      }];
      
      const sigBase = buildIndicatorDictionarySignature(baseDict);
      
      const dictWithAlias = [{
        ...baseDict[0],
        aliases: ["Кастом KPI Алиас"]
      }];
      const sigWithAlias = buildIndicatorDictionarySignature(dictWithAlias);
      assert(sigBase !== sigWithAlias, "Signature must change when only aliases change");

      // D. Changing only status changes dictionary signature
      const dictWithStatus = [{
        ...baseDict[0],
        status: "active"
      }];
      const sigWithStatus = buildIndicatorDictionarySignature(dictWithStatus);
      assert(sigBase !== sigWithStatus, "Signature must change when only status changes");

      // E. Changing only method changes dictionary signature
      const dictWithMethod = [{
        ...baseDict[0],
        calculationType: "higher_is_better" as any
      }];
      const sigWithMethod = buildIndicatorDictionarySignature(dictWithMethod);
      assert(sigBase !== sigWithMethod, "Signature must change when only calculationType/method changes");
    });

    // Integration of active dictionary and invalidation tests
    await runTest("Integration of active dictionary and cache invalidation", async () => {
      // Start clean
      resetLatestEvaluationsForTesting();
      setIndicatorDictionary(DEFAULT_INDICATOR_DICTIONARY);

      // Create a project containing 'Кастом KPI'
      const customKpiProj = {
        projectId: "P-CUSTOM",
        id: "P-CUSTOM",
        projectName: "Custom KPI Project",
        stage: "В работе",
        status: "active",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        priority: 1,
        monitoringStart: "2026-01-01",
        monitoringFrequencyWeeks: 2,
        lastPcDate: "2026-01-01",
        milestones: [],
        indicators: [
          {
            indicatorId: "I-CUSTOM",
            name: "Кастом KPI",
            planValue: 100,
            factValue: 50,
            period: "Q1 2026"
          }
        ],
        _dataYear: 2026,
        _rawByYear: {
          2026: {
            milestones: {},
            indicators: {
              q1names: "Кастом KPI", q1plans: "100", q1facts: "50"
            }
          }
        }
      };

      // 1. Initial calculation: 'Кастом KPI' is not in DEFAULT_INDICATOR_DICTIONARY
      // Since it's missing, under the new rules it should be calculated as fallback_plan_fact
      const assessmentDate = new Date("2026-03-31");
      await restoreOrCalculateEvaluations([customKpiProj as any], assessmentDate);
      
      const ev1 = getLatestProjectEvaluations()[0];
      const customKpiPerf1 = ev1.indicators.indicatorResults.find(ind => ind.name === "Кастом KPI");
      assert(!!customKpiPerf1, "Custom KPI must be calculated initially");
      assert(customKpiPerf1?.performancePercent === 50, `Expected Custom KPI performance to be calculated as 50%, got ${customKpiPerf1?.performancePercent}%`);
      assert((customKpiPerf1 as any).calculationSource === "fallback_plan_fact", `Expected Custom KPI source to be fallback_plan_fact, got ${(customKpiPerf1 as any).calculationSource}`);

      // Clear RAM (simulate restart)
      resetLatestEvaluationsForTesting();

      // A. Now, add 'Кастом KPI' as higher_is_better to active dictionary
      const customDict = [
        ...DEFAULT_INDICATOR_DICTIONARY,
        {
          name: "Кастом KPI",
          calculationType: "higher_is_better" as any,
          unit: null,
          status: "active",
          aliases: []
        }
      ];
      setIndicatorDictionary(customDict);

      // B. Trigger evaluations again on same projects and assessmentDate.
      // Cache should be recognized as stale due to indicatorDictionarySignature mismatch!
      // It must recalculate and compute the KPI performance correctly (50%)
      await restoreOrCalculateEvaluations([customKpiProj as any], assessmentDate);

      const ev2 = getLatestProjectEvaluations()[0];
      const customKpiPerf2 = ev2.indicators.indicatorResults.find(ind => ind.name === "Кастом KPI");
      assert(!!customKpiPerf2, "Custom KPI must be found in evaluated indicators list");
      assert(customKpiPerf2?.performancePercent === 50, `Expected Custom KPI performance to be calculated as 50%, got ${customKpiPerf2?.performancePercent}%`);
      assert((customKpiPerf2 as any).calculationSource === "dictionary", `Expected Custom KPI source to be dictionary, got ${(customKpiPerf2 as any).calculationSource}`);

      // Reset dictionary to default after test
      setIndicatorDictionary(DEFAULT_INDICATOR_DICTIONARY);
    });

  } finally {
    // Scenario E: temp folder cleanup
    await fs.remove(TEST_DATA_DIR);
    console.log("[FALLBACK_TEST] Cleanup: test temp directory successfully deleted.");
  }

  console.log("-----------------------------------------------------------");
  console.log("All fallback assessment evaluation tests passed successfully!");
  console.log("-----------------------------------------------------------");
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
