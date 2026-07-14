import { Project, ProjectEvaluation } from "../src/types";
import { buildProjectCardPdfReportData, escapeHtml } from "../src/utils/projectCardPdfReportData";
import { DEFAULT_INDICATOR_DICTIONARY } from "../server/services/indicatorDictionary";
import { calculateSingleIndicatorPerformance } from "../src/utils/indicatorPerformance";
import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTests() {
  console.log("[TEST] Starting buildProjectCardPdfReportData helper verifications...");

  // Dynamically register test indicators to mock dictionary
  const testIndicators = [
    "KPI Evaluation 2027 Q2 with <b>HTML</b>",
    "KPI 1 2026 Q1"
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

  // Mock a project with both 2026 and 2027 milestones/indicators/effects
  const mockProject: Project = {
    projectId: "proj-123",
    projectName: "Project with <b>HTML</b> & characters",
    projectDescription: "Beautiful project",
    startDate: "2026-01-01",
    endDate: "2027-12-31",
    status: "active",
    milestones: [
      {
        taskId: "m-2026-q1",
        title: "Milestone Q1 2026",
        quarter: "Q1",
        weight: 30,
        progressPercent: 50,
      } as any,
      {
        taskId: "m-2027-q2",
        title: "Milestone Q2 2027 with <script>alert(1)</script>",
        quarter: "Q2",
        weight: 40,
        progressPercent: 80,
      } as any,
      {
        taskId: "m-2027-q3",
        title: "Milestone Q3 2027",
        quarter: "Q3",
        weight: 50,
        progressPercent: 100,
      } as any,
    ],
    indicators: [
      {
        indicatorId: "ind-2026-q1",
        name: "KPI 1 2026 Q1",
        period: "Q1 2026",
        planValue: 100,
        factValue: 80,
      },
      {
        indicatorId: "ind-2027-q2",
        name: "KPI Evaluation 2027 Q2 with <b>HTML</b>",
        period: "Q2 2027",
        planValue: 200,
        factValue: 180,
      },
    ],
    tasks: [],
    _dataYear: 2027,
    _rawMilestonesNew: {
      q1names: null, q1progress: null, q1weights: null,
      q2names: "Milestone Q2 2027 with <script>alert(1)</script>", q2progress: "80", q2weights: "40",
      q3names: "Milestone Q3 2027", q3progress: "100", q3weights: "50",
      q4names: null, q4progress: null, q4weights: null,
    },
    _rawIndicatorsNew: {
      q1names: null, q1plans: null, q1facts: null,
      q2names: "KPI Evaluation 2027 Q2 with <b>HTML</b>", q2plans: "200", q2facts: "180",
      q3names: null, q3plans: null, q3facts: null,
      q4names: null, q4plans: null, q4facts: null,
    }
  } as any as Project;

  // Mock evaluation matching
  const mockEvaluation: ProjectEvaluation = {
    projectId: "proj-123",
    assessmentDate: "2027-06-16",
    dataQuality: {
      status: "ok",
      completenessPercent: 95,
      errorsCount: 0,
      warningsCount: 1,
      issuesCount: 1
    },
    milestones: {
      status: "ok",
      totalProgressPercent: 85,
      actualProgressPercent: 85,
      totalWeightPercent: 100,
      weightControlStatus: "ok",
      milestonesCount: 1,
      actualMilestonesCount: 1,
      completedMilestonesCount: 1,
      overdueMilestonesCount: 0,
      milestoneResults: [
        {
          id: "m-eval-2027-q2",
          name: "Milestone Q2 2027 Evaluation",
          year: 2027,
          quarter: "Q2",
          originalWeightPercent: 100,
          effectiveWeightPercent: 100,
          weightSource: "explicit",
          completionPercent: 90,
          contributionPercent: 90,
          isIncludedInProgress: true,
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
          id: "ind-eval-2027-q2",
          name: "KPI Evaluation 2027 Q2 with <b>HTML</b>",
          year: 2027,
          quarter: "Q2",
          plan: 200,
          fact: 190,
          performancePercent: 95,
          cappedPerformancePercent: 95,
          calculationType: "higher_is_better",
          status: "ok",
          explanation: ""
        }
      ]
    },
    monitoring: {
      status: "ok",
      lastMonitoringDate: null,
      nextMonitoringDate: null,
      overdueDays: null
    },
    projectHealth: {
      status: "ok",
      score: 95,
      mainReasons: []
    },
    explanations: []
  };

  // 1. выбран 2027, Q2, в данных есть 2026 и 2027, отчет берет только 2027 Q2 (With evaluation)
  const reportDataWithEval = buildProjectCardPdfReportData({
    project: mockProject,
    analysis: null,
    projectEvaluations: [mockEvaluation],
    selectedYear: 2027,
    selectedQuarter: 2,
    assessmentDate: "2027-06-15"
  });

  // Verify elements correspond to selected year and quarter
  // Milestones should only have the Q2 2027 evaluation milestone
  assert(reportDataWithEval.milestonesDetails.list.length === 1, "Milestones list count must be 1");
  assert(reportDataWithEval.milestonesDetails.list[0].name === "Milestone Q2 2027 Evaluation", `Milestone name mismatch, got ${reportDataWithEval.milestonesDetails.list[0].name}`);
  assert(reportDataWithEval.progressMetrics.milestonesQuarterSource === "server-evaluation", "Source must be server-evaluation");

  // Indicators should only have Q2 2027 evaluation indicator
  assert(reportDataWithEval.indicatorsDetails.list.length === 1, "Indicators list count must be 1");
  assert(reportDataWithEval.indicatorsDetails.list[0].name === "KPI Evaluation 2027 Q2 with <b>HTML</b>", "KPI name mismatch in evaluation mode");
  assert(reportDataWithEval.progressMetrics.indicatorsQuarterSource === "server-evaluation", "KPI source must be server-evaluation");

  console.log("✓ Correctly filters other quarters and years and uses evaluation when present.");

  // 2. при отсутствии evaluation используется fallback
  const reportDataFallback = buildProjectCardPdfReportData({
    project: mockProject,
    analysis: null,
    projectEvaluations: null,
    selectedYear: 2027,
    selectedQuarter: 2,
    assessmentDate: "2027-06-15"
  });

  // Fallback milestones
  assert(reportDataFallback.milestonesDetails.list.length === 1, "Fallback milestones list count must be 1 for Q2 2027");
  assert(reportDataFallback.milestonesDetails.list[0].name === "Milestone Q2 2027 with <script>alert(1)</script>", "Fallback milestone incorrect");
  assert(reportDataFallback.progressMetrics.milestonesQuarterSource === "fallback-расчет", "Milestones source must be fallback-расчет");

  // Fallback indicators
  assert(reportDataFallback.indicatorsDetails.list.length === 1, "Fallback indicators list count must be 1 for Q2 2027");
  assert(reportDataFallback.indicatorsDetails.list[0].name === "KPI Evaluation 2027 Q2 with <b>HTML</b>", "Fallback KPI incorrect");
  assert(reportDataFallback.progressMetrics.indicatorsQuarterSource === "fallback-расчет", "KPI source must be fallback-расчет");

  console.log("✓ Correctly falls back to local mathematical rules when evaluation is missing.");

  // 3. показатели из других кварталов не попадают в отчет
  // 4. показатели из других лет не попадают в отчет
  const reportDataFallbackQ3 = buildProjectCardPdfReportData({
    project: mockProject,
    analysis: null,
    projectEvaluations: null,
    selectedYear: 2027,
    selectedQuarter: 3
  });
  // There are no indicators for Q3 2027 in the mock project
  assert(reportDataFallbackQ3.indicatorsDetails.list.length === 0, "KPI from other quarter/year must not be present");
  console.log("✓ Indicators from other years and quarters are correctly filtered out.");

  // 5. отсутствие KPI возвращает null, а не 0
  const emptyProject: Project = { ...mockProject, indicators: [], effects: [], milestones: [], _rawMilestonesNew: null, _rawIndicatorsNew: null } as any;
  const reportDataEmpty = buildProjectCardPdfReportData({
    project: emptyProject,
    analysis: null,
    projectEvaluations: null,
    selectedYear: 2027,
    selectedQuarter: 2
  });
  assert(reportDataEmpty.progressMetrics.indicatorsQuarterVal === null, "Empty KPI must return null, not 0");
  assert(reportDataEmpty.progressMetrics.indicatorsQuarterText === "Нет данных", "Empty KPI progress text must be 'Нет данных'");
  assert(reportDataEmpty.progressMetrics.milestonesQuarterVal === null, "Empty Milestones must return null, not 0");
  assert(reportDataEmpty.progressMetrics.milestonesQuarterText === "Нет данных", "Empty Milestones progress text must be 'Нет данных'");
  console.log("✓ Returns 'Нет данных' / null and not 0 / 0% for missing or empty data.");

  // 6. HTML в названии проекта и элементах экранируется
  const escapedName = escapeHtml(mockProject.projectName);
  assert(escapedName === "Project with &lt;b&gt;HTML&lt;/b&gt; &amp; characters", "escapeHtml failed for project name");

  const escapedMilestone = escapeHtml(reportDataFallback.milestonesDetails.list[0].name);
  assert(escapedMilestone === "Milestone Q2 2027 with &lt;script&gt;alert(1)&lt;/script&gt;", "escapeHtml failed for milestone title");

  const escapedIndicator = escapeHtml(reportDataFallback.indicatorsDetails.list[0].name);
  assert(escapedIndicator === "KPI Evaluation 2027 Q2 with &lt;b&gt;HTML&lt;/b&gt;", "escapeHtml failed for indicator name");

  console.log("✓ HTML escaping verifies securely.");

  // 7. Test: assessmentDate is received and used for status/risk/pc calculations
  const dateSensitiveProject: Project = {
    ...mockProject,
    stage: "В работе",
    status: "active",
    monitoringStart: "2026-06-01",
    monitoringFrequencyWeeks: 2, // next PC date: 2026-06-15
  } as any;

  const dataBeforePc = buildProjectCardPdfReportData({
    project: dateSensitiveProject,
    analysis: null,
    projectEvaluations: null,
    assessmentDate: "2026-06-10", // before next PC date (June 15)
    selectedYear: 2027,
    selectedQuarter: 2
  });
  assert(dataBeforePc.statusSummary.pcStatus === "Своевременно", `Expected PC status to be 'Своевременно' before next PC date, got ${dataBeforePc.statusSummary.pcStatus}`);

  const dataAfterPc = buildProjectCardPdfReportData({
    project: dateSensitiveProject,
    analysis: null,
    projectEvaluations: null,
    assessmentDate: "2026-06-25", // after next PC date (June 15)
    selectedYear: 2027,
    selectedQuarter: 2
  });
  assert(dataAfterPc.statusSummary.pcStatus === "Просрочен", `Expected PC status to be 'Просрочен' after next PC date, got ${dataAfterPc.statusSummary.pcStatus}`);
  console.log("✓ Correctly uses assessmentDate for status/risk/pc calculations.");

  // 8. Test: if projectEvaluations contains evaluation of another project, the helper ignores it and uses fallback logic
  const otherProjectEvaluation: ProjectEvaluation = {
    ...mockEvaluation,
    projectId: "proj-different-999",
    indicators: {
      ...mockEvaluation.indicators,
      averagePerformancePercent: 20, // Different performance to identify fallback vs eval
      cappedAveragePerformancePercent: 20,
    } as any
  };

  const dataWithWrongEval = buildProjectCardPdfReportData({
    project: mockProject, // projectId: "proj-123"
    analysis: null,
    projectEvaluations: [otherProjectEvaluation],
    selectedYear: 2027,
    selectedQuarter: 2,
    assessmentDate: "2027-06-15"
  });

  // Verify that fallback data is used (indicators count in evaluation is 1, in fallback it's 1 or whatever the local math provides)
  assert(dataWithWrongEval.progressMetrics.indicatorsQuarterVal === 90, `Expected fallback indicator performance to be 90% (fallback-расчет), but was ${dataWithWrongEval.progressMetrics.indicatorsQuarterVal}%`);
  assert(dataWithWrongEval.progressMetrics.indicatorsQuarterSource === "fallback-расчет", "Expected wrong evaluation to be ignored, falling back to local formulas");
  console.log("✓ Correctly ignores evaluations belonging to other projects.");

  // 9. Check that there is no duplicate 'КАРТОЧКА ПРОЕКТА' подряд in src/utils/pdfExport.ts
  const pdfExportFileContent = fs.readFileSync(path.join(process.cwd(), "src/utils/pdfExport.ts"), "utf8");
  assert(!pdfExportFileContent.includes("КАРТОЧКА ПРОЕКТА</span>\r\n                <span style=\"font-size: 10px; font-weight: 700; text-transform: uppercase; color: #4b5563; letter-spacing: 0.1em;\">КАРТОЧКА ПРОЕКТА") &&
         !pdfExportFileContent.includes("КАРТОЧКА ПРОЕКТА</span>\n                <span style=\"font-size: 10px; font-weight: 700; text-transform: uppercase; color: #4b5563; letter-spacing: 0.1em;\">КАРТОЧКА ПРОЕКТА"),
         "Detected duplicate 'КАРТОЧКА ПРОЕКТА' header spans in pdfExport.ts");
  console.log("✓ Verified no duplicate 'КАРТОЧКА ПРОЕКТА' spans exist in pdfExport.ts.");

  // 10. Test: KPI calculation methodology inside PDF details (lower_is_better, higher_is_better, target)
  const mathSensitiveProject: Project = {
    projectId: "proj-math-test",
    projectName: "Math Test Project",
    status: "active",
    milestones: [],
    indicators: [
      {
        indicatorId: "ind-lower",
        name: "Средний срок согласования договора", // "lower_is_better"
        period: "Q1 2026",
        planValue: "10",
        factValue: "5"
      },
      {
        indicatorId: "ind-higher",
        name: "Доля подразделений, прошедших обучение", // "higher_is_better"
        period: "Q1 2026",
        planValue: "100",
        factValue: "80"
      },
      {
        indicatorId: "ind-target",
        name: "KPI с типом target", // target
        period: "Q1 2026",
        planValue: "100",
        factValue: "90"
      }
    ],
    tasks: [],
    _dataYear: 2026,
    _rawIndicatorsNew: {
      q1names: "Средний срок согласования договора;Доля подразделений, прошедших обучение;KPI с типом target",
      q1plans: "10;100;100",
      q1facts: "5;80;90",
      q2names: null, q2plans: null, q2facts: null,
      q3names: null, q3plans: null, q3facts: null,
      q4names: null, q4plans: null, q4facts: null,
    }
  } as any as Project;

  // Temporarily add a target type indicator to the dictionary
  DEFAULT_INDICATOR_DICTIONARY.push({
    name: "KPI с типом target",
    calculationType: "target",
    unit: "%"
  });
  
  const resLower = calculateSingleIndicatorPerformance("Средний срок согласования договора", "10", "5");
  assert(resLower !== null && resLower.cappedPerformancePercent === 100 && resLower.performancePercent === 200, "lower_is_better: plan 10, fact 5 should be capped 100%, performance 200%");

  const resHigher = calculateSingleIndicatorPerformance("Доля подразделений, прошедших обучение", "100", "80");
  assert(resHigher !== null && resHigher.cappedPerformancePercent === 80, "higher_is_better: plan 100, fact 80 should be 80%");

  const resTarget = calculateSingleIndicatorPerformance("KPI с типом target", "100", "90");
  assert(resTarget !== null && resTarget.cappedPerformancePercent === 90, "target: plan 100, fact 90 should be 90%");

  // New Validation Tests for invalid/garbage KPI values
  const resHigherAbc = calculateSingleIndicatorPerformance("Доля подразделений, прошедших обучение", "100", "abc");
  assert(resHigherAbc === null, "higher_is_better with fact 'abc' should return null");

  const resLowerAbc = calculateSingleIndicatorPerformance("Средний срок согласования договора", "10", "abc");
  assert(resLowerAbc === null, "lower_is_better with fact 'abc' should return null");

  const resTargetAbc = calculateSingleIndicatorPerformance("KPI с типом target", "100", "abc");
  assert(resTargetAbc === null, "target with fact 'abc' should return null");

  const resPlanAbc = calculateSingleIndicatorPerformance("Доля подразделений, прошедших обучение", "abc", "50");
  assert(resPlanAbc === null, "plan as 'abc' should return null");

  // Let's also check with mock project to ensure it displays "Нет данных" in PDF output list
  const invalidFactsProject: Project = {
    projectId: "proj-invalid-facts-test",
    projectName: "Invalid Facts Project",
    status: "active",
    milestones: [],
    indicators: [
      {
        indicatorId: "ind-invalid",
        name: "Средний срок согласования договора",
        period: "Q1 2026",
        planValue: "10",
        factValue: "abc"
      }
    ],
    tasks: [],
    _dataYear: 2026,
    _rawIndicatorsNew: {
      q1names: "Средний срок согласования договора",
      q1plans: "10",
      q1facts: "abc",
      q2names: null, q2plans: null, q2facts: null,
      q3names: null, q3plans: null, q3facts: null,
      q4names: null, q4plans: null, q4facts: null,
    }
  } as any as Project;

  const reportDataInvalid = buildProjectCardPdfReportData({
    project: invalidFactsProject,
    analysis: null,
    projectEvaluations: null,
    selectedYear: 2026,
    selectedQuarter: 1
  });

  const invalidItem = reportDataInvalid.indicatorsDetails.list.find(i => i.name === "Средний срок согласования договора");
  assert(invalidItem !== undefined, "invalid indicator not found in list");
  assert(invalidItem?.progressText === "Нет данных", `Expected progressText to be 'Нет данных', got ${invalidItem?.progressText}`);

  const reportDataMath = buildProjectCardPdfReportData({
    project: mathSensitiveProject,
    analysis: null,
    projectEvaluations: null,
    selectedYear: 2026,
    selectedQuarter: 1
  });

  const lowerItem = reportDataMath.indicatorsDetails.list.find(i => i.name === "Средний срок согласования договора");
  assert(lowerItem !== undefined, "lower_is_better indicator not found in list");
  assert(lowerItem?.progressText === "200% (ограничено: 100%)", `Expected lower_is_better progress to be 200% (ограничено: 100%), got ${lowerItem?.progressText}`);

  const higherItem = reportDataMath.indicatorsDetails.list.find(i => i.name === "Доля подразделений, прошедших обучение");
  assert(higherItem !== undefined, "higher_is_better indicator not found in list");
  assert(higherItem?.progressText === "80%", `Expected higher_is_better progress to be 80%, got ${higherItem?.progressText}`);

  const targetItem = reportDataMath.indicatorsDetails.list.find(i => i.name === "KPI с типом target");
  assert(targetItem !== undefined, "target indicator not found in list");
  assert(targetItem?.progressText === "90%", `Expected target progress to be 90%, got ${targetItem?.progressText}`);

  // Milestone fallback and selection tests
  const testMilestonesProject: Project = {
    projectId: "proj-milestones-test",
    projectName: "Milestone Test Project",
    status: "active",
    milestones: [
      {
        taskId: "task-1",
        title: "Веха Q2 2026",
        quarter: "Q2 2026",
        weight: 100,
        progressPercent: 50,
        isMilestone: true
      }
    ],
    indicators: [],
    tasks: [],
    _dataYear: 2026
  } as any as Project;

  const testEvaluationsEmptyMilestones: ProjectEvaluation[] = [
    {
      projectId: "proj-milestones-test",
      assessmentDate: "2026-06-15",
      dataQuality: {
        completenessPercent: 100,
        errorsCount: 0,
        status: "ok"
      },
      milestones: {
        totalProgressPercent: 0,
        weightControlStatus: "ok",
        milestoneResults: [] // Empty milestoneResults array in evaluation
      },
      indicators: {
        indicatorResults: []
      }
    } as any as ProjectEvaluation
  ];

  const reportDataEmptyEvaluation = buildProjectCardPdfReportData({
    project: testMilestonesProject,
    analysis: null,
    projectEvaluations: testEvaluationsEmptyMilestones,
    selectedYear: 2026,
    selectedQuarter: 2
  });

  // Verify that the fallback milestone from the project is loaded
  const fallbackMilestoneInPdf = reportDataEmptyEvaluation.milestonesDetails.list.find(m => m.name === "Веха Q2 2026");
  assert(fallbackMilestoneInPdf !== undefined, "Fallback milestone 'Веха Q2 2026' was not found in PDF details when milestoneResults was empty");
  assert(fallbackMilestoneInPdf?.progressText === "50%", `Expected fallback milestone progress to be '50%', got ${fallbackMilestoneInPdf?.progressText}`);
  assert(fallbackMilestoneInPdf?.quarterText === "Q2 2026", `Expected fallback milestone quarter text to be 'Q2 2026', got ${fallbackMilestoneInPdf?.quarterText}`);

  // Scenario 3: Verify that if evaluation contains results for the period, they are preferred and fallback is NOT duplicated
  const testEvaluationsWithMilestones: ProjectEvaluation[] = [
    {
      projectId: "proj-milestones-test",
      assessmentDate: "2026-06-15",
      dataQuality: {
        completenessPercent: 100,
        errorsCount: 0,
        status: "ok"
      },
      milestones: {
        totalProgressPercent: 80,
        weightControlStatus: "ok",
        milestoneResults: [
          {
            id: "eval-m1",
            name: "Веха Q2 2026 из Evaluation",
            year: 2026,
            quarter: "Q2",
            effectiveWeightPercent: 100,
            completionPercent: 80,
            isIncludedInProgress: true
          }
        ]
      },
      indicators: {
        indicatorResults: []
      }
    } as any as ProjectEvaluation
  ];

  const reportDataWithEvaluation = buildProjectCardPdfReportData({
    project: testMilestonesProject,
    analysis: null,
    projectEvaluations: testEvaluationsWithMilestones,
    selectedYear: 2026,
    selectedQuarter: 2
  });

  const evaluationMilestoneInPdf = reportDataWithEvaluation.milestonesDetails.list.find(m => m.name === "Веха Q2 2026 из Evaluation");
  assert(evaluationMilestoneInPdf !== undefined, "Evaluation milestone was not found in PDF details when present");
  const fallbackInPdfAfterEval = reportDataWithEvaluation.milestonesDetails.list.find(m => m.name === "Веха Q2 2026");
  assert(fallbackInPdfAfterEval === undefined, "Fallback milestone was mistakenly included alongside evaluation milestones");

  console.log("✓ Milestone evaluation fallback and duplication priority tests passed successfully.");

  // Raw-only data fallback scenario test
  const rawOnlyProject: Project = {
    projectId: "proj-raw-only",
    projectName: "Raw Only Project",
    status: "active",
    milestones: [], // Empty milestones!
    _dataYear: 2026,
    _rawMilestonesNew: {
      q2names: "M raw",
      q2progress: "50",
      q2weights: "100"
    }
  } as any as Project;

  const rawOnlyReportData = buildProjectCardPdfReportData({
    project: rawOnlyProject,
    analysis: null,
    projectEvaluations: [], // Empty evaluations!
    selectedYear: 2026,
    selectedQuarter: 2
  });

  const rawMilestonesList = rawOnlyReportData.milestonesDetails.list;
  assert(rawMilestonesList.length > 0, "Raw milestones should be extracted when project.milestones is empty");
  const rawMItem = rawMilestonesList.find(m => m.name === "M raw");
  assert(rawMItem !== undefined, "Raw milestone 'M raw' should be present in PDF list");
  assert(rawMItem?.progressText === "50%", `Expected progressText to be '50%', but got '${rawMItem?.progressText}'`);
  assert(rawMItem?.weightText === "100%", `Expected weightText to be '100%', but got '${rawMItem?.weightText}'`);

  console.log("✓ Raw-only milestone fallback extraction tests passed successfully.");

  // 11. Test: project without sufficient data and without evaluations
  const completelyEmptyProject: Project = {
    projectId: "proj-insufficient-test",
    projectName: "Insufficient Data Project",
    status: "active",
    milestones: [],
    indicators: [],
    tasks: [],
    _dataYear: 2026
  } as any;

  const reportDataEmptyProject = buildProjectCardPdfReportData({
    project: completelyEmptyProject,
    analysis: null,
    projectEvaluations: [],
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-01"
  });

  assert(reportDataEmptyProject.statusSummary.status === "Недостаточно данных", `Expected status to be 'Недостаточно данных', got ${reportDataEmptyProject.statusSummary.status}`);
  assert(reportDataEmptyProject.statusSummary.risk === "Недостаточно данных", `Expected risk to be 'Недостаточно данных', got ${reportDataEmptyProject.statusSummary.risk}`);
  assert(reportDataEmptyProject.statusSummary.status !== "Норма" && reportDataEmptyProject.statusSummary.status !== "В норме", "Status must not be Normal/In norm");
  assert(reportDataEmptyProject.statusSummary.risk !== "Низкий" && reportDataEmptyProject.statusSummary.risk !== "Низкий риск", "Risk must not be Low");

  console.log("✓ Correctly returns 'Недостаточно данных' for project status and risk when data is insufficient.");

  // Clean up dictionary mutation
  DEFAULT_INDICATOR_DICTIONARY.pop();

  console.log("✓ Fallback KPI calculations in PDF correctly use indicator performance types (lower_is_better, higher_is_better, target).");

  // 12. Stage and Deadline formatting tests in PDF report
  // Scenario A: status = "active", stage empty → Стадия не указана (status must not restore stage)
  const activeProj: Project = {
    projectId: "p-active",
    projectName: "Active Proj",
    status: "active",
    stage: "",
    milestones: [],
    indicators: [],
    tasks: [],
    _dataYear: 2026
  } as any;
  const dataActive = buildProjectCardPdfReportData({
    project: activeProj,
    analysis: null,
    projectEvaluations: [],
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-01"
  });
  assert(dataActive.projectInfo.stage === "Стадия не указана", `Expected stage 'Стадия не указана', got '${dataActive.projectInfo.stage}'`);

  // Scenario B: status = "completed", stage empty → Стадия не указана
  const completedProj: Project = {
    projectId: "p-completed",
    projectName: "Completed Proj",
    status: "completed",
    stage: "",
    milestones: [],
    indicators: [],
    tasks: [],
    _dataYear: 2026
  } as any;
  const dataCompleted = buildProjectCardPdfReportData({
    project: completedProj,
    analysis: null,
    projectEvaluations: [],
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-01"
  });
  assert(dataCompleted.projectInfo.stage === "Стадия не указана", `Expected stage 'Стадия не указана', got '${dataCompleted.projectInfo.stage}'`);

  // Scenario C: deadlineAt is empty, endDate = "2026-06-30"
  const endDateProj: Project = {
    projectId: "p-enddate",
    projectName: "EndDate Proj",
    endDate: "2026-06-30",
    deadlineAt: "",
    milestones: [],
    indicators: [],
    tasks: [],
    _dataYear: 2026
  } as any;
  const dataEndDate = buildProjectCardPdfReportData({
    project: endDateProj,
    analysis: null,
    projectEvaluations: [],
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-01"
  });
  assert(dataEndDate.projectInfo.deadlineAt.includes("30.06.2026"), `Expected deadlineAt to contain '30.06.2026', got '${dataEndDate.projectInfo.deadlineAt}'`);

  // Scenario D: deadlineAt = "2026-06-20", endDate = "2026-06-30" (priority check)
  const priorityProj: Project = {
    projectId: "p-priority",
    projectName: "Priority Proj",
    deadlineAt: "2026-06-20",
    endDate: "2026-06-30",
    milestones: [],
    indicators: [],
    tasks: [],
    _dataYear: 2026
  } as any;
  const dataPriority = buildProjectCardPdfReportData({
    project: priorityProj,
    analysis: null,
    projectEvaluations: [],
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-01"
  });
  assert(dataPriority.projectInfo.deadlineAt.includes("20.06.2026"), `Expected deadlineAt to contain '20.06.2026', got '${dataPriority.projectInfo.deadlineAt}'`);

  // Scenario E: both dates empty
  const bothEmptyProj: Project = {
    projectId: "p-bothempty",
    projectName: "BothEmpty Proj",
    deadlineAt: "",
    endDate: "",
    milestones: [],
    indicators: [],
    tasks: [],
    _dataYear: 2026
  } as any;
  const dataBothEmpty = buildProjectCardPdfReportData({
    project: bothEmptyProj,
    analysis: null,
    projectEvaluations: [],
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-01"
  });
  assert(dataBothEmpty.projectInfo.deadlineAt === "Не указан", `Expected deadlineAt to be 'Не указан', got '${dataBothEmpty.projectInfo.deadlineAt}'`);

  console.log("✓ Stage normalization and effective deadline formatting tests in PDF card passed successfully.");

  // --- NEW TESTS FOR UNKNOWN KPIS IN PDF ---
  console.log("\n[TEST] Verifying unknown KPIs in PDF report data...");

  // Register a pending indicator to default dictionary for testing
  DEFAULT_INDICATOR_DICTIONARY.push({
    name: "Отложенный показатель",
    calculationType: "pending",
    unit: "%",
    status: "pending_business_decision"
  } as any);

  const unknownKpiInPdfProject: Project = {
    projectId: "proj-unknown-kpi-pdf",
    projectName: "Unknown KPI PDF Proj",
    status: "active",
    milestones: [],
    indicators: [
      {
        indicatorId: "ind-unknown-pdf",
        name: "Доля отсрочки", // Not in dictionary (explicitly omitted)
        period: "Q1 2026",
        planValue: "100",
        factValue: "50"
      },
      {
        indicatorId: "ind-pending-pdf",
        name: "Отложенный показатель", // Pending in dictionary
        period: "Q1 2026",
        planValue: "100",
        factValue: "50"
      },
      {
        indicatorId: "ind-known-pdf",
        name: "Доля подразделений, прошедших обучение", // In dictionary
        period: "Q1 2026",
        planValue: "100",
        factValue: "100"
      },
      {
        indicatorId: "ind-new-known-pdf",
        name: "Прибыль", // In dictionary (newly added known KPI)
        period: "Q1 2026",
        planValue: "100",
        factValue: "100"
      }
    ],
    tasks: [],
    _dataYear: 2026,
    _rawIndicatorsNew: {
      q1names: "Доля отсрочки;Отложенный показатель;Доля подразделений, прошедших обучение;Прибыль",
      q1plans: "100;100;100;100",
      q1facts: "50;50;100;100",
      q2names: null, q2plans: null, q2facts: null,
      q3names: null, q3plans: null, q3facts: null,
      q4names: null, q4plans: null, q4facts: null,
    }
  } as any as Project;

  const reportDataUnknownPdf = buildProjectCardPdfReportData({
    project: unknownKpiInPdfProject,
    analysis: null,
    projectEvaluations: [],
    selectedYear: 2026,
    selectedQuarter: 1
  });

  const unknownPdfItem = reportDataUnknownPdf.indicatorsDetails.list.find(i => i.name === "Доля отсрочки");
  assert(unknownPdfItem !== undefined, "Unknown KPI 'Доля отсрочки' should be in the PDF details list");
  assert(unknownPdfItem?.progressText === "50% (Базовый расчет plan/fact)", `Expected unknown KPI to have progressText '50% (Базовый расчет plan/fact)', got: ${unknownPdfItem?.progressText}`);

  const pendingPdfItem = reportDataUnknownPdf.indicatorsDetails.list.find(i => i.name === "Отложенный показатель");
  assert(pendingPdfItem !== undefined, "Pending KPI 'Отложенный показатель' should be in the PDF details list");
  assert(pendingPdfItem?.progressText === "Требует согласования методики", `Expected pending KPI to have progressText 'Требует согласования методики', got: ${pendingPdfItem?.progressText}`);

  const knownPdfItem = reportDataUnknownPdf.indicatorsDetails.list.find(i => i.name === "Доля подразделений, прошедших обучение");
  assert(knownPdfItem !== undefined, "Known KPI should be in the PDF details list");
  assert(knownPdfItem?.progressText === "100%", `Expected known KPI to have progressText '100%', got: ${knownPdfItem?.progressText}`);

  const newKnownPdfItem = reportDataUnknownPdf.indicatorsDetails.list.find(i => i.name === "Прибыль");
  assert(newKnownPdfItem !== undefined, "Newly added known KPI 'Прибыль' should be in the PDF details list");
  assert(newKnownPdfItem?.progressText === "100%", `Expected newly added known KPI to have progressText '100%', got: ${newKnownPdfItem?.progressText}`);

  console.log("✓ Correctly displayed fallback plan/fact percentage for unknown KPI ('Доля отсрочки') in PDF details.");
  console.log("✓ Correctly displayed 'Требует согласования методики' for pending KPI ('Отложенный показатель') in PDF details.");
  console.log("✓ Correctly displayed percentage for newly added known KPI ('Прибыль') in PDF details.");

  console.log("All tests passed successfully for buildProjectCardPdfReportData helper!");
}

try {
  runTests();
} catch (error) {
  console.error("Test failed:", error);
  process.exit(1);
}
