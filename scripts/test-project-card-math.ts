import { Project, ProjectEvaluation } from "../src/types";
import { getCurrentQuarterKpiProgress, getCurrentQuarterKpiMetrics, getRegistryMilestoneMetrics, getRegistryMilestoneProgress } from "../src/utils/projectRegistryMetrics";
import { getIndicatorPeriodCompletionMetricsFromEvaluation, getIndicatorYearCompletionMetricsFromEvaluation } from "../src/utils/evaluationIndicatorMetrics";
import { parseProjectDate, calculateSelectedQuarterMilestonesProgressForProject, calculateSelectedQuarterKpiProgressForProject, calculateYearMilestonesProgressForProject, calculateYearKpisProgressForProject, getMilestoneSummaryMetrics, calculateTasksProgressForProject, getIndicatorSummaryMetrics, calculateKpiProgressForProjectDepts } from "../src/utils/projectCalculations";
import { getYearsForProject } from "../src/utils/overviewYearFiltering";
import { getProjectCardProgressMetrics } from "../src/utils/projectCardMetrics";
import { resolveEffectiveAssessmentDateForSelectedYear } from "../src/utils/periodApplicability";
import { buildProjectAnalysisPayload } from "../server/services/projectAnalysisPayloadService";
import { toLegacyProjectView } from "../server/services/projectViewAdapter";
import { parseIndicatorPeriod } from "../src/components/ProjectCard";
import { DEFAULT_INDICATOR_DICTIONARY, setIndicatorDictionary } from "../server/services/indicatorDictionary";
import { calculateSingleIndicatorPerformance } from "../src/utils/indicatorPerformance";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTests() {
  console.log("[TEST] Starting Project Card math and date parsing verifications...");

  // Dynamically register test indicators to mock dictionary
  const testIndicators = [
    "KPI A",
    "Show KPI",
    "Indicator 1",
    "Indicator 2",
    "Indicator 3",
    "Indicator 4",
    "A",
    "B",
    "Normalized Indicator"
  ];
  testIndicators.forEach(name => {
    if (!DEFAULT_INDICATOR_DICTIONARY.some(item => item.name === name)) {
      DEFAULT_INDICATOR_DICTIONARY.push({
        name,
        calculationType: "higher_is_better",
        unit: "%"
      });
    }
  });

  // 1. Verify parseProjectDate logic (Russian and ISO fallback formats)
  const isoDate = "2026-04-01";
  const parsedIso = parseProjectDate(isoDate);
  assert(!!parsedIso && parsedIso.getFullYear() === 2026 && parsedIso.getMonth() === 3, `Failed to parse ISO date "${isoDate}".`);
  console.log("✓ Correctly parsed ISO date: 2026-04-01");

  const rusDate = "01.12.2026";
  const parsedRus = parseProjectDate(rusDate);
  assert(!!parsedRus && parsedRus.getFullYear() === 2026 && parsedRus.getMonth() === 11, `Failed to parse Russian date "${rusDate}".`);
  console.log("✓ Correctly parsed Russian date: 01.12.2026");

  // Mock evaluation matching the ProjectEvaluation interface exactly
  const mockEvaluation: ProjectEvaluation = {
    projectId: "proj-abc",
    assessmentDate: "2026-06-16",
    dataQuality: {
      status: "ok",
      completenessPercent: 100,
      errorsCount: 0,
      warningsCount: 0,
      issuesCount: 0
    },
    milestones: {
      status: "ok",
      totalProgressPercent: 100,
      actualProgressPercent: 100,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 1,
      actualMilestonesCount: 1,
      completedMilestonesCount: 1,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m1",
          name: "Milestone Q2 2026",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 100,
          effectiveWeightPercent: 100,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 100,
          contributionPercent: 100
        }
      ]
    },
    indicators: {
      status: "ok",
      averagePerformancePercent: 95,
      cappedAveragePerformancePercent: 95,
      calculatedIndicatorsCount: 1,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: [
        {
          id: "ind-res-1",
          name: "KPI A",
          year: 2026,
          quarter: "Q2",
          plan: 100,
          fact: 95,
          calculationType: "higher_is_better",
          performancePercent: 95,
          cappedPerformancePercent: 95,
          status: "ok",
          explanation: "Perfect KPI"
        }
      ]
    },
    monitoring: {
      status: "ok",
      lastMonitoringDate: "2026-06-01",
      nextMonitoringDate: "2026-09-01",
      overdueDays: 0
    },
    projectHealth: {
      status: "ok",
      score: 100,
      mainReasons: []
    },
    explanations: []
  };

  const mockProject: Project = {
    projectId: "proj-abc",
    projectName: "Test mathematical models",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: []
  };

  // Test 3. Test Indicator evaluations extraction
  const qKpiMetrics = getIndicatorPeriodCompletionMetricsFromEvaluation(mockEvaluation, 2026, 2);
  assert(qKpiMetrics.hasData && qKpiMetrics.fact === 95, `Expected Q2 2026 KPI progress fact 95 from evaluation, got: ${JSON.stringify(qKpiMetrics)}`);
  console.log("✓ Correctly fetched Q2 2026 Indicator completion metrics from evaluation");

  const yKpiMetrics = getIndicatorYearCompletionMetricsFromEvaluation(mockEvaluation, 2026);
  assert(yKpiMetrics.hasData && yKpiMetrics.fact === 95, `Expected Year 2026 KPI progress fact 95, got: ${JSON.stringify(yKpiMetrics)}`);
  console.log("✓ Correctly fetched Year 2026 Indicator completion metrics from evaluation");

  // Test 4. Test getCurrentQuarterKpiProgress and getCurrentQuarterKpiMetrics adapters
  const registryProgress = getCurrentQuarterKpiProgress(mockProject, [mockEvaluation], "2026-05-15");
  assert(registryProgress === 95, `Expected metrics from registry adapter to be 95, got: ${registryProgress}`);
  console.log("✓ Registry KPI progress adapter correctly prefers evaluation indicators: 95%");

  const registryMetrics = getCurrentQuarterKpiMetrics(mockProject, [mockEvaluation], "2026-05-15");
  assert(registryMetrics.hasData && registryMetrics.fact === 95 && registryMetrics.plan === 100, `Expected metrics from registry KPI metrics to contain fact 95, plan 100. Got: ${JSON.stringify(registryMetrics)}`);
  console.log("✓ Registry KPI metrics adapter correctly outputs normalized (plan: 100, fact: 95) telemetry");


  // --- ADDITIONAL SPECIFIC SCENARIOS AS DOCUMENTED ---

  // Сценарий 1. ISO-дата старта проекта не включает квартал до старта.
  const projectIsoStart: Project = {
    projectId: "proj-iso-start",
    projectName: "ISO Start Project",
    status: "active",
    startDate: "2026-04-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "Веха Q1",
          q1progress: "100",
          q1weights: "100"
        },
        indicators: {}
      }
    }
  };

  const progressQ1 = calculateSelectedQuarterMilestonesProgressForProject(projectIsoStart, 1, 2026);
  assert(progressQ1 === null, `Expected Q1 progress to be null because ISO start date is 2026-04-01, but got ${progressQ1}`);
  console.log("✓ Scenario 1 passed: ISO-дата старта проекта не включает квартал до старта");


  // Сценарий 2. ISO-дата завершения проекта не включает квартал после завершения.
  const projectIsoEnd: Project = {
    projectId: "proj-iso-end",
    projectName: "ISO End Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-06-30",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q3names: "Веха Q3",
          q3progress: "100",
          q3weights: "100"
        },
        indicators: {}
      }
    }
  };

  const progressQ3 = calculateSelectedQuarterMilestonesProgressForProject(projectIsoEnd, 3, 2026);
  assert(progressQ3 === null, `Expected Q3 progress to be null because ISO end date is 2026-06-30, but got ${progressQ3}`);
  console.log("✓ Scenario 2 passed: ISO-дата завершения проекта не включает квартал после завершения");


  // Сценарий 3. deadlineAt учитывается как дата завершения.
  const projectDeadline: Project = {
    projectId: "proj-deadline",
    projectName: "ISO Deadline Project",
    status: "active",
    startDate: "2026-01-01",
    deadlineAt: "2026-06-30",
    endDate: "",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q3names: "Показатель Q3",
          q3plans: "100",
          q3facts: "100"
        }
      }
    }
  };

  const kpiProgressQ3 = calculateSelectedQuarterKpiProgressForProject(projectDeadline, 3, 2026, new Date("2026-08-01"));
  assert(kpiProgressQ3 === null, `Expected Q3 KPI progress to be null because deadlineAt is 2026-06-30, but got ${kpiProgressQ3}`);
  console.log("✓ Scenario 3 passed: deadlineAt учитывается как дата завершения");


  // Сценарий 4. Вкладка 2 берет показатели из ProjectEvaluation.
  const projectTab2: Project = {
    projectId: "proj-tab2",
    projectName: "Tab 2 KPI assessment project",
    status: "active",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2027: {
        milestones: {},
        indicators: {
          q2names: "Show KPI",
          q2plans: "100",
          q2facts: "100" // legacy gives 100
        }
      }
    }
  };

  const evalTab2: ProjectEvaluation = {
    projectId: "proj-tab2",
    assessmentDate: "2027-05-01",
    dataQuality: {
      status: "ok",
      completenessPercent: 100,
      errorsCount: 0,
      warningsCount: 0,
      issuesCount: 0
    },
    milestones: {
      status: "ok",
      totalProgressPercent: 100,
      actualProgressPercent: 100,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 0,
      actualMilestonesCount: 0,
      completedMilestonesCount: 0,
      overdueMilestonesCount: 0,
      milestoneResults: []
    },
    indicators: {
      status: "ok",
      averagePerformancePercent: 40,
      cappedAveragePerformancePercent: 40,
      calculatedIndicatorsCount: 1,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: [
        {
          id: "ind-tab2-r1",
          name: "Show KPI",
          year: 2027,
          quarter: "Q1", // assessment year 2027, month 05 (May is Q2)
          plan: 100,
          fact: 10,
          calculationType: "higher_is_better",
          performancePercent: 10,
          cappedPerformancePercent: 10,
          status: "ok",
          explanation: "Q1 val"
        },
        {
          id: "ind-tab2-r2",
          name: "Show KPI",
          year: 2027,
          quarter: "Q2", // current evaluated period
          plan: 100,
          fact: 40,
          calculationType: "higher_is_better",
          performancePercent: 40,
          cappedPerformancePercent: 40,
          status: "ok",
          explanation: "Q2 val"
        }
      ]
    },
    monitoring: {
      status: "ok",
      lastMonitoringDate: "2027-04-01",
      nextMonitoringDate: "2027-07-01",
      overdueDays: 0
    },
    projectHealth: {
      status: "ok",
      score: 100,
      mainReasons: []
    },
    explanations: []
  };

  const progressTab2Result = getCurrentQuarterKpiProgress(projectTab2, [evalTab2], "2027-05-01"); // Q2 2027
  assert(progressTab2Result === 40, `Expected getCurrentQuarterKpiProgress to use evaluation indicators (40), but got ${progressTab2Result}`);
  console.log("✓ Scenario 4 passed: Вкладка 2 берет показатели из ProjectEvaluation");


  // Сценарий 5. rawFact выше 100 сохраняется, fact остается capped.
  const evaluationCapped: ProjectEvaluation = {
    ...evalTab2,
    indicators: {
      status: "ok",
      averagePerformancePercent: 125,
      cappedAveragePerformancePercent: 100,
      calculatedIndicatorsCount: 1,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: [
        {
          id: "ind-capped",
          name: "Show KPI",
          year: 2027,
          quarter: "Q2",
          plan: 100,
          fact: 125,
          calculationType: "higher_is_better",
          performancePercent: 125,
          cappedPerformancePercent: 100, // Capped to 100 max
          status: "ok",
          explanation: "Overperforming KPI"
        }
      ]
    }
  };

  const metricsResult = getCurrentQuarterKpiMetrics(projectTab2, [evaluationCapped], "2027-05-01");
  assert(metricsResult.fact === 125, `Expected uncapped fact to be 125, got ${metricsResult.fact}`);
  assert(metricsResult.rawFact === 125, `Expected rawFact to preserve overperformance (125), got ${metricsResult.rawFact}`);
  assert(metricsResult.cappedFact === 100, `Expected cappedFact to be 100, got ${metricsResult.cappedFact}`);
  console.log("✓ Scenario 5 passed: fact возвращает фактическое значение, cappedFact содержит ограниченное");

  // --- NEW PROJECTCARD SCENARIOS ---

  // Сценарий 6. ProjectCard берёт вехи по selectedYear; будущий год не входит в прогресс даже с ранним фактом.
  const projectCardProj: Project = {
    projectId: "proj-pc-test",
    projectName: "Multiyear Project 2026-2030",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2030-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "Milestone Q1 2026",
          q1progress: "80",
          q1weights: "100"
        },
        indicators: {}
      },
      2030: {
        milestones: {
          q2names: "Milestone Q2 2030",
          q2progress: "10",
          q2weights: "100"
        },
        indicators: {}
      }
    }
  };

  const evalCardPc: ProjectEvaluation = {
    projectId: "proj-pc-test",
    assessmentDate: "2026-06-15",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 10,
      actualProgressPercent: 10,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 2,
      actualMilestonesCount: 2,
      completedMilestonesCount: 0,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m2026q1",
          name: "Milestone Q1 2026",
          year: 2026,
          quarter: "Q1",
          originalWeightPercent: 100,
          effectiveWeightPercent: 100,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 80,
          contributionPercent: 80
        },
        {
          id: "m2030q2",
          name: "Milestone Q2 2030",
          year: 2030,
          quarter: "Q2",
          originalWeightPercent: 100,
          effectiveWeightPercent: 100,
          weightSource: "explicit",
          isIncludedInProgress: true,
          completionPercent: 10,
          contributionPercent: 10
        }
      ]
    },
    indicators: { status: "ok", averagePerformancePercent: 0, cappedAveragePerformancePercent: 0, calculatedIndicatorsCount: 0, skippedFutureIndicatorsCount: 0, missingDictionaryCount: 0, indicatorResults: [] },
    monitoring: { status: "ok", lastMonitoringDate: "", nextMonitoringDate: "", overdueDays: 0 },
    projectHealth: { status: "ok", score: 10, mainReasons: [] },
    explanations: []
  };

  const metricsPc_26_1 = getProjectCardProgressMetrics({
    project: projectCardProj,
    evaluation: evalCardPc,
    selectedYear: 2026,
    selectedQuarter: 1,
    assessmentDate: "2026-06-15"
  });
  assert(
    metricsPc_26_1.milestonesQuarterVal === 80,
    `Expected milestonesQuarterVal to be 80 for selectedYear 2026 Q1, got: ${metricsPc_26_1.milestonesQuarterVal}`
  );

  const metricsPc_30_2 = getProjectCardProgressMetrics({
    project: projectCardProj,
    evaluation: evalCardPc,
    selectedYear: 2030,
    selectedQuarter: 2,
    assessmentDate: "2026-06-15"
  });
  assert(
    metricsPc_30_2.milestonesQuarterVal === null,
    `Expected milestonesQuarterVal null for future year 2030 Q2 (early fact excluded from progress), got: ${metricsPc_30_2.milestonesQuarterVal}`
  );
  assert(
    metricsPc_30_2.milestonesYearVal === null,
    `Expected milestonesYearVal null for future year 2030, got: ${metricsPc_30_2.milestonesYearVal}`
  );
  console.log("✓ Scenario 6 passed: selectedYear routing + future year early facts excluded from card progress");

  // Сценарий 7. availableYears для проекта 2026-2030 содержит 2026, 2027, 2028, 2029, 2030.
  const yearsComputed = getYearsForProject(projectCardProj, evalCardPc);
  assert(yearsComputed.includes(2026) && yearsComputed.includes(2027) && yearsComputed.includes(2028) && yearsComputed.includes(2029) && yearsComputed.includes(2030), `Expected estimated project years to include entire span [2026..2030], got: ${JSON.stringify(yearsComputed)}`);
  console.log("✓ Scenario 7 passed: availableYears содержит годы от 2026 до 2030");

  // Сценарий 8. Если selectedYear = 2030, таблица вех показывает только вехи 2030.
  const milestonesList = evalCardPc.milestones.milestoneResults;
  const filteredMilestones2030 = milestonesList.filter(m => m.year === 2030);
  assert(filteredMilestones2030.length === 1 && filteredMilestones2030[0].year === 2030, "Expected table milestones filter to show only 2030 milestones");
  console.log("✓ Scenario 8 passed: Фильтрация вех возвращает только выбранный год (2030)");

  // Сценарий 9. Если selectedYear = 2027, таблица вех не показывает Q2 2030.
  const filteredMilestones2027 = milestonesList.filter(m => m.year === 2027);
  assert(filteredMilestones2027.length === 0, "Expected table milestones filter to yield empty for 2027");
  console.log("✓ Scenario 9 passed: Фильтрация вех не показывает вехи 2030, если выбран 2027");

  // Сценарий 10. effectiveAssessmentDate: past → Dec 31; current/future → real assessment date
  const assessmentDateStr = "2026-06-15";
  assert(
    resolveEffectiveAssessmentDateForSelectedYear(2025, assessmentDateStr) === "2025-12-31",
    `Expected past year effective date "2025-12-31", got ${resolveEffectiveAssessmentDateForSelectedYear(2025, assessmentDateStr)}`
  );
  assert(
    resolveEffectiveAssessmentDateForSelectedYear(2026, assessmentDateStr) === "2026-06-15",
    `Expected current year to keep assessment date, got ${resolveEffectiveAssessmentDateForSelectedYear(2026, assessmentDateStr)}`
  );
  assert(
    resolveEffectiveAssessmentDateForSelectedYear(2030, assessmentDateStr) === "2026-06-15",
    `Expected future year to keep assessment date (not 2030-12-31), got ${resolveEffectiveAssessmentDateForSelectedYear(2030, assessmentDateStr)}`
  );
  console.log("✓ Scenario 10 passed: effectiveAssessmentDate past/current/future year rules");

  // Сценарий 11. Универсальный взвешенный расчет годового прогресса по вехам.
  const weightedProject: Project = {
    projectId: "weighted-proj-test",
    projectName: "Weighted Project Test",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "Milestone 1",
          q1progress: "100",
          q1weights: "10",
          q2names: "Milestone 2",
          q2progress: "0",
          q2weights: "90"
        },
        indicators: {}
      }
    }
  };

  const calculatedYearProgress = calculateYearMilestonesProgressForProject(weightedProject, 2026);
  assert(calculatedYearProgress === 10, `Expected weighted year progress to be 10, but got: ${calculatedYearProgress}`);
  console.log("✓ Scenario 11 passed: Универсальный взвешенный расчет годового прогресса по вехам корректно возвращает 10 (100% * 10 + 0% * 90) / 100");

  // Сценарий 12. Смешанный расчет: одна веха с явным весом, другая без веса с прогрессом
  const mixedProject: Project = {
    projectId: "mixed-proj-test",
    projectName: "Mixed Project Test",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "Milestone 1",
          q1progress: "100",
          q1weights: "50",
          q2names: "Milestone 2",
          q2progress: "0",
          q2weights: "" // empty weight
        },
        indicators: {}
      }
    }
  };

  const calculatedMixedProgress = calculateYearMilestonesProgressForProject(mixedProject, 2026);
  assert(calculatedMixedProgress === 50, `Expected mixed year progress to be 50, but got: ${calculatedMixedProgress}`);
  console.log("✓ Scenario 12 passed: Смешанный расчет годового прогресса по вехам корректно возвращает 50 (explicit 50% * 100 + unallocated remaining 50% * 0%)");

  // Сценарий 13. Тест будущего квартала для KPI:
  // Проект активен весь 2026 год, assessmentDate = 2026-06-15. Расчет KPI для Q3 должен вернуть null.
  const kpiProject: Project = {
    projectId: "kpi-test-proj",
    projectName: "KPI Test Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q1names: "Indicator 1",
          q1plans: "100",
          q1facts: "90",
          q2names: "Indicator 2",
          q2plans: "100",
          q2facts: "80",
          q3names: "Indicator 3",
          q3plans: "100",
          q3facts: "70",
          q4names: "Indicator 4",
          q4plans: "100",
          q4facts: "60"
        }
      }
    }
  };

  const assessmentDate = new Date(2026, 5, 15); // Month is 0-indexed (June is 5)
  const q3Progress = calculateSelectedQuarterKpiProgressForProject(kpiProject, 3, 2026, assessmentDate);
  assert(q3Progress === null, `Expected Q3 KPI progress to be null on assessment date 2026-06-15, but got: ${q3Progress}`);
  console.log("✓ Scenario 13 passed: Q3 KPI progress is null because it is in the future relative to 2026-06-15");

  // Сценарий 14. Тест текущего/прошлого квартала для KPI:
  // Проект активен весь 2026 год, assessmentDate = 2026-06-15. Расчет KPI для Q2 должен вернуть рассчитанное значение (80).
  const q2Progress = calculateSelectedQuarterKpiProgressForProject(kpiProject, 2, 2026, assessmentDate);
  assert(q2Progress === 80, `Expected Q2 KPI progress to be 80 on assessment date 2026-06-15, but got: ${q2Progress}`);
  console.log("✓ Scenario 14 passed: Q2 KPI progress returns the correct value (80%) because June 15th is in Q2");

  // Сценарий 15. Годовой fallback-расчет KPI:
  // Должен учитывать только применимые кварталы на дату оценки (Q1 и Q2), будущие кварталы не должны попадать в расчет.
  // Среднее значение: (90 + 80) / 2 = 85.
  const annualKpiProgress = calculateYearKpisProgressForProject(kpiProject, 2026, assessmentDate);
  assert(annualKpiProgress === 85, `Expected annual KPI progress considering only applicable quarters to be 85, but got: ${annualKpiProgress}`);
  console.log("✓ Scenario 15 passed: Annual KPI progress includes only applicable quarters (90% and 80%), resulting in 85%");

  // Сценарий 16. Лимиты жизненного цикла вех: Старт после начала года (01.04.2026)
  // Q1: progress = 0%, weight = 50
  // Q2: progress = 100%, weight = 50
  // Q1 вне жизненного цикла (проект начинается в Q2) => Q1 должен быть полностью пропущен.
  // Ожидаемый сводный прогресс по вехам: 100%
  const milestoneProjectQ2Start: Project = {
    projectId: "milestone-start-q2",
    projectName: "Milestone Q2 Start Project",
    status: "active",
    startDate: "2026-04-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawMilestonesNew: {
      q1names: "Milestone Q1",
      q1progress: "0",
      q1weights: "50",
      q2names: "Milestone Q2",
      q2progress: "100",
      q2weights: "50",
      q3names: null,
      q3progress: null,
      q3weights: null,
      q4names: null,
      q4progress: null,
      q4weights: null
    }
  };

  const q2StartMetrics = getMilestoneSummaryMetrics(milestoneProjectQ2Start, 2026);
  assert(q2StartMetrics.fact === 100, `Expected summary milestones metrics fact to be 100, but got: ${q2StartMetrics.fact}`);
  console.log("✓ Scenario 16 passed: Q1 is ignored because it starts before 2026-04-01");

  // Сценарий 17. Лимиты жизненного цикла вех: Завершение до конца года (30.06.2026)
  // Q2: progress = 100%, weight = 50
  // Q3: progress = 0%, weight = 50
  // Q3 вне жизненного цикла (проект заканчивается в Q2) => Q3 должен быть полностью пропущен.
  // Ожидаемый сводный прогресс по вехам: 100%
  const milestoneProjectQ2End: Project = {
    projectId: "milestone-end-q2",
    projectName: "Milestone Q2 End Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-06-30",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawMilestonesNew: {
      q1names: null,
      q1progress: null,
      q1weights: null,
      q2names: "Milestone Q2",
      q2progress: "100",
      q2weights: "50",
      q3names: "Milestone Q3",
      q3progress: "0",
      q3weights: "50",
      q4names: null,
      q4progress: null,
      q4weights: null
    }
  };

  const q2EndMetrics = getMilestoneSummaryMetrics(milestoneProjectQ2End, 2026);
  assert(q2EndMetrics.fact === 100, `Expected summary milestones metrics fact to be 100, but got: ${q2EndMetrics.fact}`);
  console.log("✓ Scenario 17 passed: Q3 is ignored because the project ends on 2026-06-30");

  // Сценарий 18. Лимиты жизненного цикла вех: Проект активен весь 2026 год
  // Q1 и Q2 заполнены. Должны корректно считаться как обычно.
  const milestoneProjectFullYear: Project = {
    projectId: "milestone-full-year",
    projectName: "Milestone Full Year Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawMilestonesNew: {
      q1names: "Milestone Q1",
      q1progress: "80",
      q1weights: "50",
      q2names: "Milestone Q2",
      q2progress: "100",
      q2weights: "50",
      q3names: null,
      q3progress: null,
      q3weights: null,
      q4names: null,
      q4progress: null,
      q4weights: null
    }
  };

  const fullYearMetrics = getMilestoneSummaryMetrics(milestoneProjectFullYear, 2026);
  assert(fullYearMetrics.fact === 90, `Expected summary milestones metrics fact to be 90, but got: ${fullYearMetrics.fact}`);
  console.log("✓ Scenario 18 passed: Full year project calculated correctly to be 90%");

  // Сценарий 19. Универсальный multi-year кейс для реестра
  const multiYearProject: Project = {
    projectId: "multi-year-test",
    projectName: "Multi-year Test Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2027-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "Milestone 2026 Q1",
          q1progress: "0",
          q1weights: "100",
          q2names: null, q2progress: null, q2weights: null,
          q3names: null, q3progress: null, q3weights: null,
          q4names: null, q4progress: null, q4weights: null,
        },
        indicators: {}
      },
      2027: {
        milestones: {
          q1names: "Milestone 2027 Q1",
          q1progress: "100",
          q1weights: "100",
          q2names: null, q2progress: null, q2weights: null,
          q3names: null, q3progress: null, q3weights: null,
          q4names: null, q4progress: null, q4weights: null,
        },
        indicators: {}
      }
    }
  };

  const metrics2026 = getRegistryMilestoneMetrics(multiYearProject, undefined, 2026);
  assert(metrics2026.fact === 0, `Expected multi-year 2026 fact to be 0, but got: ${metrics2026.fact}`);

  const metrics2027 = getRegistryMilestoneMetrics(multiYearProject, undefined, 2027);
  assert(metrics2027.fact === 100, `Expected multi-year 2027 fact to be 100, but got: ${metrics2027.fact}`);
  console.log("✓ Scenario 19 passed: getRegistryMilestoneMetrics gets data for selected year in multi-year case");

  // Сценарий 20. Обратная совместимость без указания assessmentYear
  const defaultYearProject: Project = {
    projectId: "default-year-test",
    projectName: "Default Year Test Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawMilestonesNew: {
      q1names: "Milestone Q1",
      q1progress: "75",
      q1weights: "100",
      q2names: null, q2progress: null, q2weights: null,
      q3names: null, q3progress: null, q3weights: null,
      q4names: null, q4progress: null, q4weights: null,
    }
  };
  const metricsDefault = getRegistryMilestoneMetrics(defaultYearProject, undefined);
  assert(metricsDefault.fact === 75, `Expected default milestone metrics fact to be 75, but got: ${metricsDefault.fact}`);
  console.log("✓ Scenario 20 passed: getRegistryMilestoneMetrics doesn't fail when year is omitted");

  // Сценарий 21. calculateTasksProgressForProject year-aware проверка
  const res2026_task = calculateTasksProgressForProject(multiYearProject, 2026);
  assert(res2026_task === 0, `Expected calculateTasksProgressForProject to be 0 for 2026, but got: ${res2026_task}`);
  
  const res2027_task = calculateTasksProgressForProject(multiYearProject, 2027);
  assert(res2027_task === 100, `Expected calculateTasksProgressForProject to be 100 for 2027, but got: ${res2027_task}`);
  console.log("✓ Scenario 21 passed: calculateTasksProgressForProject gets correct progress per year");

  // Сценарий 22. getRegistryMilestoneProgress year-aware проверка
  const progress2026 = getRegistryMilestoneProgress(multiYearProject, undefined, 2026);
  assert(progress2026 === 0, `Expected getRegistryMilestoneProgress to be 0 for 2026, but got: ${progress2026}`);

  const progress2027 = getRegistryMilestoneProgress(multiYearProject, undefined, 2027);
  assert(progress2027 === 100, `Expected getRegistryMilestoneProgress to be 100 for 2027, but got: ${progress2027}`);
  console.log("✓ Scenario 22 passed: getRegistryMilestoneProgress gets correct progress per year");

  // Сценарий 23. toLegacyProjectView при пустом detectedYears не подставляет 2026, а использует fallback к текущему году
  const mockNormalized = {
    id: "p1",
    baseInfo: {
      title: "Test Project",
      stage: "В работе",
      resultImages: null,
      goals: null,
    },
    milestones: [],
    indicators: [],
    links: {},
    people: {
      team: [],
      customers: [],
    },
    monitoring: {},
    organization: {
      departments: [],
    },
    source: {
      rawRow: {},
      detectedYears: [] // Empty list to trigger fallback logic
    }
  } as any;

  const legacyProj = toLegacyProjectView(mockNormalized);
  const currentExpectedYear = new Date().getFullYear();
  assert(legacyProj._dataYear === currentExpectedYear, `Expected toLegacyProjectView legacyProj._dataYear to fallback to ${currentExpectedYear}, but got: ${legacyProj._dataYear}`);
  console.log("✓ Scenario 23 passed: toLegacyProjectView correctly falls back to current year when detectedYears is empty");

  // Сценарий 24. buildProjectAnalysisPayload при некорректной дате оценки выдаёт fallback к текущему году, а не 2026
  const mockPayloadProject: Project = {
    projectId: "p_payload",
    projectName: "Payload Project",
    milestones: [],
    indicators: [],
  } as any;

  const payloadInvalidDate = buildProjectAnalysisPayload({
    project: mockPayloadProject,
    assessmentDate: "invalid-date-format",
    assessmentDateMode: "server_fallback"
  });

  assert(payloadInvalidDate.assessmentContext.currentYear === currentExpectedYear, `Expected invalid date fallback currentYear to be ${currentExpectedYear}, but got: ${payloadInvalidDate.assessmentContext.currentYear}`);
  console.log("✓ Scenario 24 passed: buildProjectAnalysisPayload correctly falls back currentYear to current year when assessmentDate is invalid");

  // Сценарий 25. buildProjectAnalysisPayload корректно применяет assessment date year для расчета вех (вычисляет по указанному году, а не hardcoded 2026)
  const projectWith2027Milestones: Project = {
    projectId: "p_multi_year",
    projectName: "Multi Year Milestone Project",
    _dataYear: 2027,
    milestones: [],
    _rawMilestonesNew: {
      q1names: "Milestone Q1",
      q1progress: "80%",
      q1weights: "100"
    },
    _rawQuarters: {
      q1plan: "100", q1fact: "100"
    },
    _rawByYear: {
      2027: {
        milestones: {
          q1names: "Milestone Q1",
          q1progress: "80%",
          q1weights: "100"
        }
      }
    }
  } as any;

  const payloadWith2027 = buildProjectAnalysisPayload({
    project: projectWith2027Milestones,
    assessmentDate: "2027-01-15",
    assessmentDateMode: "custom"
  });

  assert(payloadWith2027.dashboardSnapshot.milestonesProgressPercent === 80, `Expected milestonesProgressPercent for 2027 assessment date to be 80, but got: ${payloadWith2027.dashboardSnapshot.milestonesProgressPercent}`);
  console.log("✓ Scenario 25 passed: buildProjectAnalysisPayload correctly passes assessment year to getRegistryMilestoneProgress");

  // Сценарий 26. parseIndicatorPeriod распознаёт варианты квартала и года
  const testP1 = parseIndicatorPeriod("Q1 2026");
  assert(testP1.year === 2026 && testP1.quarter === "Q1" && testP1.label === "Q1 2026", "Failed parsing Q1 2026");

  const testP2 = parseIndicatorPeriod("2027 Q2");
  assert(testP2.year === 2027 && testP2.quarter === "Q2" && testP2.label === "Q2 2027", "Failed parsing 2027 Q2");

  const testP3 = parseIndicatorPeriod("1 кв 2026");
  assert(testP3.year === 2026 && testP3.quarter === "Q1" && testP3.label === "Q1 2026", "Failed parsing 1 кв 2026");

  const testP4 = parseIndicatorPeriod("2 квартал 2027");
  assert(testP4.year === 2027 && testP4.quarter === "Q2" && testP4.label === "Q2 2027", "Failed parsing 2 квартал 2027");

  const testP5 = parseIndicatorPeriod("I кв 2026");
  assert(testP5.year === 2026 && testP5.quarter === "Q1" && testP5.label === "Q1 2026", "Failed parsing I кв 2026");

  const testP6 = parseIndicatorPeriod("II кв 2027");
  assert(testP6.year === 2027 && testP6.quarter === "Q2" && testP6.label === "Q2 2027", "Failed parsing II кв 2027");

  const testP7 = parseIndicatorPeriod("Q3");
  assert(testP7.year === null && testP7.quarter === "Q3" && testP7.label === "Q3", "Failed parsing Q3");

  const testP8 = parseIndicatorPeriod("2028");
  assert(testP8.year === 2028 && testP8.quarter === null && testP8.label === "2028", "Failed parsing 2028");

  const testP9 = parseIndicatorPeriod(null);
  assert(testP9.year === null && testP9.quarter === null && testP9.label === "Без периода", "Failed parsing null period");

  // Тесты для длинных римских кварталов на русском языке
  const testRoman1 = parseIndicatorPeriod("I квартал 2026");
  assert(testRoman1.year === 2026 && testRoman1.quarter === "Q1" && testRoman1.label === "Q1 2026", "Failed parsing I квартал 2026");

  const testRoman2 = parseIndicatorPeriod("II квартал 2026");
  assert(testRoman2.year === 2026 && testRoman2.quarter === "Q2" && testRoman2.label === "Q2 2026", "Failed parsing II квартал 2026");

  const testRoman3 = parseIndicatorPeriod("III квартал 2026");
  assert(testRoman3.year === 2026 && testRoman3.quarter === "Q3" && testRoman3.label === "Q3 2026", "Failed parsing III квартал 2026");

  const testRoman4 = parseIndicatorPeriod("IV квартал 2026");
  assert(testRoman4.year === 2026 && testRoman4.quarter === "Q4" && testRoman4.label === "Q4 2026", "Failed parsing IV квартал 2026");

  console.log("✓ Scenario 26 passed: parseIndicatorPeriod correctly parses layout alternatives including Roman long quarters");

  // Сценарий 27. Фильтрация и селекторы года и квартала (Кейс 1 и Кейс 2)
  interface TestIndicator {
    id: string;
    year: number | null;
    quarter: "Q1" | "Q2" | "Q3" | "Q4" | null;
  }
  const testList: TestIndicator[] = [
    { id: "1", year: 2026, quarter: "Q1" },
    { id: "2", year: 2026, quarter: "Q2" },
    { id: "3", year: 2026, quarter: "Q3" },
    { id: "4", year: 2027, quarter: "Q3" },
    { id: "5", year: 2026, quarter: "Q2" },
    { id: "6", year: 2027, quarter: "Q2" },
  ];

  // Кейс 1: selectedYear = 2026, selectedQuarter = 3
  const filter1 = testList.filter(item => item.year === 2026 && item.quarter === "Q3");
  assert(filter1.length === 1 && filter1[0].id === "3", "Case 1 filter mismatch");

  // Кейс 2: selectedYear = 2027, selectedQuarter = 2
  const filter2 = testList.filter(item => item.year === 2027 && item.quarter === "Q2");
  assert(filter2.length === 1 && filter2[0].id === "6", "Case 2 filter mismatch");

  console.log("✓ Scenario 27 passed: Year and quarter indicators filters logic matches expected Case 1 & Case 2");

  // Сценарий 28. Приоритетность источников при дедупликации по name + year + quarter (Кейс 3)
  const dedupMap = new Map<string, any>();
  const normalizeTestName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, " ");
  
  const registerTestIndicator = (item: any) => {
    const normName = normalizeTestName(item.name);
    const key = `${normName}||${item.year}||${item.quarter}`;
    if (!dedupMap.has(key)) {
      dedupMap.set(key, { ...item });
    } else {
      const existing = dedupMap.get(key);
      const isEmpty = (v: any) => v === null || v === undefined || String(v).trim() === "";
      if (isEmpty(existing.plan) && !isEmpty(item.plan)) existing.plan = item.plan;
      if (isEmpty(existing.fact) && !isEmpty(item.fact)) existing.fact = item.fact;
    }
  };

  // 1. Highest Priority source item
  registerTestIndicator({
    name: "Indicator A",
    year: 2026,
    quarter: "Q1",
    plan: 100,
    fact: 95,
  });

  // 2. Medium Priority source item
  registerTestIndicator({
    name: "Indicator A",
    year: 2026,
    quarter: "Q1",
    plan: 200,
    fact: 190,
  });

  const finalDedupList = Array.from(dedupMap.values());
  assert(finalDedupList.length === 1, "Expected only single deduplicated indicator");
  assert(finalDedupList[0].plan === 100 && finalDedupList[0].fact === 95, "Priority source should have overridden lower priority source");

  console.log("✓ Scenario 28 passed: Deduplication priority rules validated successfully");

  // Сценарий 29. Multi-year fallback и фильтрация в ProjectCard
  const mockProjectForFallback = {
    indicators: [
      { indicatorId: "ind-2026-q2", period: "Q2 2026", name: "A", planValue: 100, factValue: 80 },
      { indicatorId: "ind-2027-q2", period: "Q2 2027", name: "B", planValue: 150, factValue: 120 }
    ],
    _dataYear: 2027
  } as any;

  // Симулируем логику парсинга и фильтрации ProjectCard
  const testIndicatorMap = new Map<string, any>();
  mockProjectForFallback.indicators.forEach((ind: any) => {
    const period = ind.period ? String(ind.period).trim() : null;
    const parsed = parseIndicatorPeriod(period);
    const item = {
      id: ind.indicatorId,
      name: ind.name,
      period: parsed.label,
      year: parsed.year,
      quarter: parsed.quarter
    };
    const key = `${item.name.trim().toLowerCase()}||${item.year || "unknown"}||${item.quarter || "unknown"}`;
    testIndicatorMap.set(key, item);
  });

  const testCombined = Array.from(testIndicatorMap.values());
  const testSelectedYear = 2027;
  const testSelectedQuarter = 2; // Q2

  const testFiltered = testCombined.filter(item => {
    return item.year === testSelectedYear && item.quarter === `Q${testSelectedQuarter}`;
  });

  assert(testFiltered.length === 1, `Expected exactly 1 indicator, got: ${testFiltered.length}`);
  assert(testFiltered[0].id === "ind-2027-q2", `Expected 'ind-2027-q2', got: ${testFiltered[0].id}`);
  console.log("✓ Scenario 29 passed: Multi-year backend indicators filter displays only indicators from selected year and quarter");

  // Сценарий 30. Adapter test: toLegacyProjectView preserves indicator year in period
  const mockNormalizedProj = {
    id: "p_adapter_test",
    baseInfo: {
      title: "Adapter Test Project",
      stage: "В работе",
      resultImages: null,
      goals: null,
    },
    milestones: [],
    indicators: [
      {
        id: "ind_norm",
        year: 2027,
        quarter: "Q2",
        name: "Normalized Indicator",
        plan: 200,
        fact: 180,
      } as any
    ],
    links: {},
    people: {
      team: [],
      customers: [],
    },
    monitoring: {},
    organization: {
      departments: [],
    },
    source: {
      rawRow: {},
      detectedYears: [2027]
    }
  } as any;

  const legacyProjectResult = toLegacyProjectView(mockNormalizedProj);
  assert(legacyProjectResult.indicators.length === 1, "Expected 1 indicator from legacy conversion");
  assert(legacyProjectResult.indicators[0].period === "Q2 2027", `Expected converted period to be 'Q2 2027', but got: ${legacyProjectResult.indicators[0].period}`);
  console.log("✓ Scenario 30 passed: toLegacyProjectView correctly maps NormalizedIndicator.year and .quarter to period format 'Qx YYYY'");

  // Сценарий 31. Годовой прогресс по вехам (модель весов: при сумме < 100 без невзвешенных — абсолютный вклад, без ренормализации)
  // 1. M1 (100%, w=20) + M2 (100%, w=30) → 50 (не 100)
  const projLess100Weight = {
    projectId: "proj-less-100",
    projectName: "Less Than 100 Weight",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "M1",
          q1progress: "100",
          q1weights: "20",
          q2names: "M2",
          q2progress: "100",
          q2weights: "30"
        },
        indicators: {}
      }
    }
  } as any;
  const resLess100 = calculateYearMilestonesProgressForProject(projLess100Weight, 2026);
  assert(resLess100 === 50, `Expected absolute progress 50 when weights sum to 50 with no residual receivers, got: ${resLess100}`);
  console.log("✓ Scenario 31-1 passed: Year with sum of weights < 100 and no unweighted keeps absolute contribution (50)");

  // 2. M1 (100%, w=20) + M2 (0%, w=30) → 20
  const projLess100Partial = {
    projectId: "proj-less-100-partial",
    projectName: "Less Than 100 Weight Partial",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "M1",
          q1progress: "100",
          q1weights: "20",
          q2names: "M2",
          q2progress: "0",
          q2weights: "30"
        },
        indicators: {}
      }
    }
  } as any;
  const resLess100Partial = calculateYearMilestonesProgressForProject(projLess100Partial, 2026);
  assert(resLess100Partial === 20, `Expected absolute progress 20, got: ${resLess100Partial}`);
  console.log("✓ Scenario 31-2 passed: Partial completion with sum of weights < 100 returns absolute 20%");

  // 3. Сумма весов 100: M1 (progress = 100, weight = 50), M2 (progress = 0, weight = 50) => ожидаемый результат: 50
  const projSum100 = {
    projectId: "proj-sum-100",
    projectName: "Sum 100",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "M1",
          q1progress: "100",
          q1weights: "50",
          q2names: "M2",
          q2progress: "0",
          q2weights: "50"
        },
        indicators: {}
      }
    }
  } as any;
  const resSum100 = calculateYearMilestonesProgressForProject(projSum100, 2026);
  assert(resSum100 === 50, `Expected progress to be 50, but got: ${resSum100}`);
  console.log("✓ Scenario 31-3 passed: Sum of weights target 100 with 50% weighted completion returns 50%");

  // 4. Смешанная модель: M1 (progress = 100, weight = 50), M2 (progress = 0, weight пустой) => ожидаемый результат: 50
  const projMixed = {
    projectId: "proj-mixed",
    projectName: "Mixed Weight and Unweighted",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "M1",
          q1progress: "100",
          q1weights: "50",
          q2names: "M2",
          q2progress: "0",
          q2weights: ""
        },
        indicators: {}
      }
    }
  } as any;
  const resMixed = calculateYearMilestonesProgressForProject(projMixed, 2026);
  assert(resMixed === 50, `Expected mixed progress to be 50, but got: ${resMixed}`);
  console.log("✓ Scenario 31-4 passed: Mixed explicit/implicit model with weights < 100 resolves remaining unallocated weights properly and returns 50%");

  // Сценарий 32-1. Две вехи в одном году, веса 50/50, факт первой 100, факт второй пустой (null) => ожидаемый результат годового расчета: 50, а не 100
  const projEmptyFactWithWeight = {
    projectId: "proj-empty-fact-with-weight",
    projectName: "Empty Fact with explicit 50/50 weights",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "M1",
          q1progress: "100",
          q1weights: "50",
          q2names: "M2",
          q2progress: "",
          q2weights: "50"
        },
        indicators: {}
      }
    }
  } as any;
  const resEmptyFactWithWeight = calculateYearMilestonesProgressForProject(projEmptyFactWithWeight, 2026);
  assert(resEmptyFactWithWeight === 50, `Expected annual progress to be 50, but got: ${resEmptyFactWithWeight}`);
  console.log("✓ Scenario 32-1 passed: Milestone with explicit weight and empty/null progress is included in annual denominator and yields 50%");

  // Сценарий 32-2. Квартальный расчет для вехи с пустым прогрессом также должен вернуть согласованный результат (50% для квартала, если они в одном квартале)
  const projEmptyFactWithWeightQ1 = {
    projectId: "proj-empty-fact-with-weight-q1",
    projectName: "Empty Fact Q1",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {
          q1names: "M1;M2",
          q1progress: "100;",
          q1weights: "50;50"
        },
        indicators: {}
      }
    }
  } as any;
  const resEmptyFactWithWeightQ1Annual = calculateYearMilestonesProgressForProject(projEmptyFactWithWeightQ1, 2026);
  const resEmptyFactWithWeightQ1Quarter = calculateSelectedQuarterMilestonesProgressForProject(projEmptyFactWithWeightQ1, 1, 2026);
  assert(resEmptyFactWithWeightQ1Annual === 50, `Expected annual progress to be 50, but got: ${resEmptyFactWithWeightQ1Annual}`);
  assert(resEmptyFactWithWeightQ1Quarter === 50, `Expected quarter progress to be 50, but got: ${resEmptyFactWithWeightQ1Quarter}`);
  console.log("✓ Scenario 32-2 passed: Quarterly and annual fallback calculation yields consistent results (50%) when a milestone progress is blank");

  // --- NEW REGRESSION TESTS FOR REAL AND UNKNOWN KPIS ---
  console.log("\n[TEST] Running regression tests for real and unknown KPIs...");

  // 1. KPI "Прибыль", plan 100, fact 100. Теперь присутствует в словаре как higher_is_better.
  // Ожидание: корректный расчет 100%.
  const knownKpiProjectProfit: Project = {
    projectId: "proj-known-kpi-profit",
    projectName: "Known KPI Profit Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "Прибыль",
          q2plans: "100",
          q2facts: "100"
        }
      }
    }
  };

  const knownKpiProgressProfit = calculateSelectedQuarterKpiProgressForProject(knownKpiProjectProfit, 2, 2026, new Date("2026-06-15"));
  assert(knownKpiProgressProfit === 100, `Expected KPI 'Прибыль' progress to be 100, got: ${knownKpiProgressProfit}`);
  console.log("✓ Correctly calculated known KPI 'Прибыль' as 100%");

  // 2. KPI "Оборот", plan 100, fact 50. Теперь в словаре.
  // Ожидание: корректный расчет 50%.
  const knownKpiProjectTurnover: Project = {
    projectId: "proj-known-kpi-turnover",
    projectName: "Known KPI Turnover Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "Оборот",
          q2plans: "100",
          q2facts: "50"
        }
      }
    }
  };

  const knownKpiProgressTurnover = calculateSelectedQuarterKpiProgressForProject(knownKpiProjectTurnover, 2, 2026, new Date("2026-06-15"));
  assert(knownKpiProgressTurnover === 50, `Expected KPI 'Оборот' progress to be 50, got: ${knownKpiProgressTurnover}`);
  console.log("✓ Correctly calculated known KPI 'Оборот' as 50%");

  // 3. KPI "Рентабельность", plan 20, fact 10. Теперь в словаре.
  // Ожидание: корректный расчет 50%.
  const knownKpiProjectRent: Project = {
    projectId: "proj-known-kpi-rent",
    projectName: "Known KPI Rent Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "Рентабельность",
          q2plans: "20",
          q2facts: "10"
        }
      }
    }
  };

  const knownKpiProgressRent = calculateSelectedQuarterKpiProgressForProject(knownKpiProjectRent, 2, 2026, new Date("2026-06-15"));
  assert(knownKpiProgressRent === 50, `Expected KPI 'Рентабельность' progress to be 50, got: ${knownKpiProgressRent}`);
  console.log("✓ Correctly calculated known KPI 'Рентабельность' as 50%");

  // 4. KPI "Новые клиенты", plan 10, fact 5. Теперь в словаре.
  // Ожидание: корректный расчет 50%.
  const knownKpiProjectNewClients: Project = {
    projectId: "proj-known-kpi-new-clients",
    projectName: "Known KPI New Clients Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "Новые клиенты",
          q2plans: "10",
          q2facts: "5"
        }
      }
    }
  };

  const knownKpiProgressNewClients = calculateSelectedQuarterKpiProgressForProject(knownKpiProjectNewClients, 2, 2026, new Date("2026-06-15"));
  assert(knownKpiProgressNewClients === 50, `Expected KPI 'Новые клиенты' progress to be 50, got: ${knownKpiProgressNewClients}`);
  console.log("✓ Correctly calculated known KPI 'Новые клиенты' as 50%");

  // 5. KPI "ОБОРОТ HONOR", plan 100, fact 50. Теперь в словаре.
  // Ожидание: корректный расчет 50%.
  const knownKpiProjectHonor: Project = {
    projectId: "proj-known-kpi-honor",
    projectName: "Known KPI Honor Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "ОБОРОТ HONOR",
          q2plans: "100",
          q2facts: "50"
        }
      }
    }
  };

  const knownKpiProgressHonor = calculateSelectedQuarterKpiProgressForProject(knownKpiProjectHonor, 2, 2026, new Date("2026-06-15"));
  assert(knownKpiProgressHonor === 50, `Expected KPI 'ОБОРОТ HONOR' progress to be 50, got: ${knownKpiProgressHonor}`);
  console.log("✓ Correctly calculated known KPI 'ОБОРОТ HONOR' as 50%");

  // 6. KPI "вп1", plan 100, fact 50. Теперь в словаре.
  // Ожидание: корректный расчет 50%.
  const knownKpiProjectVP1: Project = {
    projectId: "proj-known-kpi-vp1",
    projectName: "Known KPI VP1 Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "вп1",
          q2plans: "100",
          q2facts: "50"
        }
      }
    }
  };

  const knownKpiProgressVP1 = calculateSelectedQuarterKpiProgressForProject(knownKpiProjectVP1, 2, 2026, new Date("2026-06-15"));
  assert(knownKpiProgressVP1 === 50, `Expected KPI 'вп1' progress to be 50, got: ${knownKpiProgressVP1}`);
  console.log("✓ Correctly calculated known KPI 'вп1' as 50%");

  // 7. KPI "Доля отсрочки", plan 100, fact 50. Исключена из словаря.
  // Ожидание: возвращает null / "Нет методики расчета".
  const unknownKpiProjectDeferral: Project = {
    projectId: "proj-unknown-kpi-deferral",
    projectName: "Unknown KPI Deferral Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "Доля отсрочки",
          q2plans: "100",
          q2facts: "50"
        }
      }
    }
  };

  const unknownKpiProgressDeferral = calculateSelectedQuarterKpiProgressForProject(unknownKpiProjectDeferral, 2, 2026, new Date("2026-06-15"));
  assert(unknownKpiProgressDeferral === 50, `Expected KPI 'Доля отсрочки' progress to be 50 under fallback plan/fact, got: ${unknownKpiProgressDeferral}`);
  console.log("✓ Correctly returned 50% for unknown KPI 'Доля отсрочки' under fallback rule");

  // В existing тестах сохранить позитивные сценарии:
  // - известный higher_is_better считается корректно
  const knownKpiProject1: Project = {
    projectId: "proj-known-kpi-1",
    projectName: "Known KPI Project 1",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "Доля договоров, заведенных в реестр",
          q2plans: "100",
          q2facts: "85"
        }
      }
    }
  };
  const knownKpiProgress1 = calculateSelectedQuarterKpiProgressForProject(knownKpiProject1, 2, 2026, new Date("2026-06-15"));
  assert(knownKpiProgress1 === 85, `Expected known KPI 'Доля договоров, заведенных в реестр' progress to be 85, got: ${knownKpiProgress1}`);
  console.log("✓ Correctly calculated known higher_is_better KPI 'Доля договоров, заведенных в реестр' as 85%");

  // - известный lower_is_better считается корректно
  const knownKpiProject2: Project = {
    projectId: "proj-known-kpi-2",
    projectName: "Known KPI Project 2",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "Количество ошибок",
          q2plans: "10",
          q2facts: "5"
        }
      }
    }
  };
  const knownKpiProgress2 = calculateSelectedQuarterKpiProgressForProject(knownKpiProject2, 2, 2026, new Date("2026-06-15"));
  assert(knownKpiProgress2 === 200, `Expected known KPI 'Количество ошибок' progress to be 200, got: ${knownKpiProgress2}`);
  console.log("✓ Correctly calculated known lower_is_better KPI 'Количество ошибок' as 200% (uncapped)");

  // Добавить регрессионный сценарий по расхождению:
  // - ProjectEvaluation не содержит рассчитанного KPI по проекту (для Доля отсрочки)
  // - project raw содержит неизвестный KPI с plan/fact
  // - карточка проекта не должна показывать процент
  const regressionProject: Project = {
    projectId: "proj-regression-discrepancy",
    projectName: "Regression Discrepancy Project",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q2names: "Доля отсрочки",
          q2plans: "100",
          q2facts: "90"
        }
      }
    }
  };

  const regressionEvaluation: ProjectEvaluation = {
    projectId: "proj-regression-discrepancy",
    assessmentDate: "2026-06-15",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: { status: "ok", totalProgressPercent: 100, actualProgressPercent: 100, totalWeightPercent: 100, weightControlStatus: "ok", milestonesCount: 0, actualMilestonesCount: 0, completedMilestonesCount: 0, overdueMilestonesCount: 0, milestoneResults: [] },
    indicators: {
      status: "missing_dictionary" as any,
      averagePerformancePercent: 0,
      cappedAveragePerformancePercent: 0,
      calculatedIndicatorsCount: 0,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 1,
      indicatorResults: [
        {
          id: "ind-res-rent",
          name: "Доля отсрочки",
          year: 2026,
          quarter: "Q2",
          plan: 100,
          fact: 90,
          calculationType: "unknown" as any,
          performancePercent: null,
          cappedPerformancePercent: null,
          status: "missing_dictionary" as any,
          explanation: "Показатель отсутствует в справочнике"
        }
      ]
    },
    monitoring: { status: "ok", lastMonitoringDate: "", nextMonitoringDate: "", overdueDays: 0 } as any,
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const cardMetricsRegression = getProjectCardProgressMetrics({
    project: regressionProject,
    evaluation: regressionEvaluation,
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-15"
  });

  assert(cardMetricsRegression.kpiQuarterVal === 90, `Expected project card KPI fallback average to be 90, got: ${cardMetricsRegression.kpiQuarterVal}`);
  console.log("✓ Regression Scenario passed: Unknown KPI 'Доля отсрочки' was calculated via fallback and returned 90%");

  // --- NEW SCENARIOS FOR UNIVERSAL KPI FALLBACK ---
  console.log("\n[TEST] Running universal unknown KPI and pending KPI fallback tests...");

  const universalTestProject: Project = {
    projectId: "P1",
    projectName: "Universal KPI Test",
    stage: "В работе",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    _dataYear: 2026,
    _rawIndicatorsNew: {
      q1names: "",
      q1plans: "",
      q1facts: "",
      q2names: "Новый показатель",
      q2plans: "100",
      q2facts: "50",
      q3names: "",
      q3plans: "",
      q3facts: "",
      q4names: "",
      q4plans: "",
      q4facts: ""
    },
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q1names: "",
          q1plans: "",
          q1facts: "",
          q2names: "Новый показатель",
          q2plans: "100",
          q2facts: "50",
          q3names: "",
          q3plans: "",
          q3facts: "",
          q4names: "",
          q4plans: "",
          q4facts: ""
        }
      }
    },
    tasks: [],
    milestones: [],
    indicators: []
  };

  // 1. Check calculateSingleIndicatorPerformance
  const perfSingle = calculateSingleIndicatorPerformance("Новый показатель", "100", "50");
  assert(perfSingle !== null, "calculateSingleIndicatorPerformance must not be null for unknown KPI");
  assert(perfSingle?.performancePercent === 50, `Expected performancePercent 50, got ${perfSingle?.performancePercent}`);
  assert(perfSingle?.calculationSource === "fallback_plan_fact", `Expected fallback_plan_fact source, got ${perfSingle?.calculationSource}`);
  console.log("✓ calculateSingleIndicatorPerformance('Новый показатель', '100', '50') -> 50%, fallback_plan_fact");

  // 2. Check calculateSelectedQuarterKpiProgressForProject
  const universalQ2Progress = calculateSelectedQuarterKpiProgressForProject(universalTestProject, 2, 2026, new Date("2026-06-30"));
  assert(universalQ2Progress === 50, `Expected quarter 2 progress to be 50, got ${universalQ2Progress}`);
  console.log("✓ calculateSelectedQuarterKpiProgressForProject -> 50");

  // 3. Check calculateYearKpisProgressForProject
  const yearProgress = calculateYearKpisProgressForProject(universalTestProject, 2026, new Date("2026-06-30"));
  assert(yearProgress === 50, `Expected year progress to be 50, got ${yearProgress}`);
  console.log("✓ calculateYearKpisProgressForProject -> 50");

  // 4. Check getIndicatorSummaryMetrics
  const summaryMetrics = getIndicatorSummaryMetrics(universalTestProject);
  assert(summaryMetrics.hasData === true, "Expected hasData to be true in summary metrics");
  assert(summaryMetrics.fact === 50, `Expected summary fact to be 50, got ${summaryMetrics.fact}`);
  console.log("✓ getIndicatorSummaryMetrics -> hasData = true, fact = 50");

  // 5. Check calculateKpiProgressForProjectDepts
  const deptsProgress = calculateKpiProgressForProjectDepts(universalTestProject, 2026, new Date("2026-06-30"));
  assert(deptsProgress !== null, "Depts progress must not be null");
  assert(deptsProgress?.capped === 50, `Expected capped to be 50, got ${deptsProgress?.capped}`);
  assert(deptsProgress?.raw === 50, `Expected raw to be 50, got ${deptsProgress?.raw}`);
  console.log("✓ calculateKpiProgressForProjectDepts -> capped = 50, raw = 50");

  // --- Pending KPI test ---
  console.log("[TEST] Testing pending/disabled KPI in universal fallback...");

  // Mock a pending KPI in the active indicator dictionary
  const originalDict = [...DEFAULT_INDICATOR_DICTIONARY];
  const pendingDict = [
    ...DEFAULT_INDICATOR_DICTIONARY,
    {
      name: "Доля отсрочки",
      calculationType: "pending" as any,
      status: "pending_business_decision",
      unit: "%"
    }
  ];
  setIndicatorDictionary(pendingDict);

  const pendingTestProject: Project = {
    projectId: "P2",
    projectName: "Pending KPI Test",
    stage: "В работе",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    _dataYear: 2026,
    _rawIndicatorsNew: {
      q1names: "",
      q1plans: "",
      q1facts: "",
      q2names: "Доля отсрочки",
      q2plans: "100",
      q2facts: "50",
      q3names: "",
      q3plans: "",
      q3facts: "",
      q4names: "",
      q4plans: "",
      q4facts: ""
    },
    _rawByYear: {
      2026: {
        milestones: {},
        indicators: {
          q1names: "",
          q1plans: "",
          q1facts: "",
          q2names: "Доля отсрочки",
          q2plans: "100",
          q2facts: "50",
          q3names: "",
          q3plans: "",
          q3facts: "",
          q4names: "",
          q4plans: "",
          q4facts: ""
        }
      }
    },
    tasks: [],
    milestones: [],
    indicators: []
  };

  // 1. Single performance for pending should be null
  const pendingPerf = calculateSingleIndicatorPerformance("Доля отсрочки", "100", "50");
  assert(pendingPerf === null, "calculateSingleIndicatorPerformance must return null for pending KPI");
  console.log("✓ calculateSingleIndicatorPerformance -> null");

  // 2. Quarter progress for pending should be null
  const pendingQ2 = calculateSelectedQuarterKpiProgressForProject(pendingTestProject, 2, 2026, new Date("2026-06-30"));
  assert(pendingQ2 === null, `Expected pending Q2 progress to be null, got ${pendingQ2}`);
  console.log("✓ calculateSelectedQuarterKpiProgressForProject -> null");

  // 3. Year progress for pending should be null
  const pendingYear = calculateYearKpisProgressForProject(pendingTestProject, 2026, new Date("2026-06-30"));
  assert(pendingYear === null, `Expected pending year progress to be null, got ${pendingYear}`);
  console.log("✓ calculateYearKpisProgressForProject -> null");

  // 4. Summary metrics for pending should be hasData: false
  const pendingSummary = getIndicatorSummaryMetrics(pendingTestProject);
  assert(pendingSummary.hasData === false, "Expected pending summary hasData to be false");
  console.log("✓ getIndicatorSummaryMetrics -> hasData = false");

  // 5. Depts progress for pending should be null
  const pendingDepts = calculateKpiProgressForProjectDepts(pendingTestProject, 2026, new Date("2026-06-30"));
  assert(pendingDepts === null, `Expected pending depts progress to be null, got ${JSON.stringify(pendingDepts)}`);
  console.log("✓ calculateKpiProgressForProjectDepts -> null");

  // Restore dictionary
  setIndicatorDictionary(originalDict);

  console.log("\n[TEST] All mathematical calculations and data integrations tested successfully!");
}

try {
  runTests();
  process.exit(0);
} catch (err: any) {
  console.error("[TEST] FAILED:", err?.message || err);
  process.exit(1);
}
