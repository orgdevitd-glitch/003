/**
 * Overview portfolio progress — unified evaluation contour only.
 *
 * Consumes the same ProjectEvaluation → computePortfolioProgressAggregates /
 * buildOverviewPdfReportData path as Overview UI and portfolio PDF.
 * No independent Overview fallback formulas or duplicated weighting logic.
 */
import type { Project, ProjectEvaluation } from "../src/types.js";
import { computePortfolioProgressAggregates } from "../src/utils/overviewPortfolioAggregates.js";
import { buildOverviewPdfReportData } from "../src/utils/overviewReportData.js";
import { evaluateProject } from "../server/services/projectEvaluationService.js";
import type { NormalizedProject } from "../server/services/projectNormalizer.js";
import { DEFAULT_INDICATOR_DICTIONARY, setIndicatorDictionary } from "../server/services/indicatorDictionary.js";

function runTest(name: string, fn: () => void) {
  console.log(`[PORTFOLIO_PROGRESS_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[PORTFOLIO_PROGRESS_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[PORTFOLIO_PROGRESS_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function near(actual: number | null, expected: number, eps = 0.05): boolean {
  return actual !== null && Math.abs(actual - expected) < eps;
}

function baseProject(over: Partial<Project> = {}): Project {
  return {
    projectId: "P1",
    projectName: "Project P1",
    status: "active",
    stage: "В работе",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    deadlineAt: "2026-12-31",
    tasks: [],
    milestones: [],
    indicators: [],
    ...over
  };
}

function baseEvaluation(over: Partial<ProjectEvaluation> & { projectId: string }): ProjectEvaluation {
  return {
    assessmentDate: "2026-06-15",
    dataQuality: { status: "ok", completenessPercent: 100, errorsCount: 0, warningsCount: 0, issuesCount: 0 },
    milestones: {
      status: "ok",
      totalProgressPercent: 0,
      actualProgressPercent: 0,
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
      averagePerformancePercent: 0,
      cappedAveragePerformancePercent: 0,
      calculatedIndicatorsCount: 0,
      skippedFutureIndicatorsCount: 0,
      missingDictionaryCount: 0,
      indicatorResults: []
    },
    monitoring: { status: "ok", lastMonitoringDate: null, nextMonitoringDate: null, overdueDays: null },
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: [],
    ...over
  };
}

function createNormalized(overrides: Partial<NormalizedProject> & { projectId?: string } = {}): NormalizedProject {
  const projectId = overrides.projectId || overrides.id || "N1";
  const base: NormalizedProject = {
    id: projectId,
    projectId,
    sourceRowIndex: 1,
    baseInfo: {
      title: "Normalized",
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
    indicators: [],
    applicableQuarters: [],
    dataQuality: { status: "ok", errorsCount: 0, warningsCount: 0, issues: [] },
    source: { rawRow: {}, detectedYears: [2026] }
  };
  return {
    ...base,
    ...overrides,
    id: projectId,
    projectId,
    baseInfo: { ...base.baseInfo, ...(overrides as any).baseInfo }
  };
}

runTest("Quarter milestones from evaluation (weighted) enter portfolio average", () => {
  const projects = [baseProject({ projectId: "M1" })];
  const evaluations = [
    baseEvaluation({
      projectId: "M1",
      milestones: {
        status: "ok",
        totalProgressPercent: 66.67,
        actualProgressPercent: 66.67,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 2,
        actualMilestonesCount: 2,
        completedMilestonesCount: 0,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "a",
            name: "A",
            year: 2026,
            quarter: "Q2",
            originalWeightPercent: 66.67,
            effectiveWeightPercent: 66.67,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 50,
            contributionPercent: 33.33
          },
          {
            id: "b",
            name: "B",
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
      }
    })
  ];

  const agg = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-15"
  });

  // (50*66.67 + 100*33.33) / 100 ≈ 66.67
  assert(near(agg.selectedMilestones, 66.67, 0.2), `expected ~66.67, got ${agg.selectedMilestones}`);
});

runTest("Показатели from evaluation (higher/lower) enter portfolio average uncapped path", () => {
  const projects = [baseProject({ projectId: "I1" })];
  const evaluations = [
    baseEvaluation({
      projectId: "I1",
      indicators: {
        status: "ok",
        averagePerformancePercent: 65,
        cappedAveragePerformancePercent: 65,
        calculatedIndicatorsCount: 2,
        skippedFutureIndicatorsCount: 0,
        missingDictionaryCount: 0,
        indicatorResults: [
          {
            id: "h",
            name: "Доля подразделений, прошедших обучение",
            year: 2026,
            quarter: "Q2",
            plan: 100,
            fact: 80,
            calculationType: "higher_is_better",
            performancePercent: 80,
            cappedPerformancePercent: 80,
            status: "ok",
            explanation: ""
          },
          {
            id: "l",
            name: "Количество ошибок",
            year: 2026,
            quarter: "Q2",
            plan: 5,
            fact: 10,
            calculationType: "lower_is_better",
            performancePercent: 50,
            cappedPerformancePercent: 50,
            status: "ok",
            explanation: ""
          }
        ]
      }
    })
  ];

  const agg = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-15"
  });

  assert(near(agg.selectedIndicators, 65), `expected 65, got ${agg.selectedIndicators}`);
  assert(agg.selectedKpi === agg.selectedIndicators, "selectedKpi alias must match selectedIndicators");
});

runTest("Projects without calculable evaluation data are excluded from portfolio average", () => {
  const projects = [
    baseProject({ projectId: "HAS" }),
    baseProject({ projectId: "EMPTY" })
  ];
  const evaluations = [
    baseEvaluation({
      projectId: "HAS",
      milestones: {
        status: "ok",
        totalProgressPercent: 90,
        actualProgressPercent: 90,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 1,
        actualMilestonesCount: 1,
        completedMilestonesCount: 0,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "m",
            name: "M",
            year: 2026,
            quarter: "Q2",
            originalWeightPercent: 100,
            effectiveWeightPercent: 100,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 90,
            contributionPercent: 90
          }
        ]
      }
    })
    // EMPTY has no evaluation → excluded
  ];

  const agg = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-15"
  });

  assert(near(agg.selectedMilestones, 90), `only HAS must average → 90, got ${agg.selectedMilestones}`);
});

runTest("Future quarter with early fact does not enter Overview quarterly average", () => {
  const projects = [baseProject({ projectId: "F" })];
  const evaluations = [
    baseEvaluation({
      projectId: "F",
      milestones: {
        status: "ok",
        totalProgressPercent: 100,
        actualProgressPercent: 100,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 2,
        actualMilestonesCount: 2,
        completedMilestonesCount: 1,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "q2",
            name: "Current",
            year: 2026,
            quarter: "Q2",
            originalWeightPercent: 50,
            effectiveWeightPercent: 50,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 70,
            contributionPercent: 35
          },
          {
            id: "q3",
            name: "Future early fact",
            year: 2026,
            quarter: "Q3",
            originalWeightPercent: 50,
            effectiveWeightPercent: 50,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 100,
            contributionPercent: 50
          }
        ]
      }
    })
  ];

  const agg = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 3,
    assessmentDate: "2026-06-15"
  });

  assert(agg.selectedMilestones === null, `Q3 future must be excluded, got ${agg.selectedMilestones}`);

  const yearAgg = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-15"
  });
  // Year actual: only Q2 (completed/current) → 70% completion of that period's weight share
  assert(near(yearAgg.yearMilestones, 70, 0.5), `year must use only Q2 → ~70, got ${yearAgg.yearMilestones}`);
});

runTest("Empty milestone progress keeps weight and contributes 0%", () => {
  const projects = [baseProject({ projectId: "E" })];
  const evaluations = [
    baseEvaluation({
      projectId: "E",
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
            id: "filled",
            name: "Filled",
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
            id: "empty",
            name: "Empty fact",
            year: 2026,
            quarter: "Q1",
            originalWeightPercent: 50,
            effectiveWeightPercent: 50,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: null,
            contributionPercent: 0
          }
        ]
      }
    })
  ];

  const agg = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 1,
    assessmentDate: "2026-06-15"
  });

  // factContribution / planContribution = 50 / 100 = 50
  assert(near(agg.selectedMilestones, 50), `empty fact → 0 contribution, weight kept → 50%, got ${agg.selectedMilestones}`);
});

runTest("Equilibrium averaging: projects are equal at portfolio level", () => {
  const projects = [
    baseProject({ projectId: "P90" }),
    baseProject({ projectId: "P30" })
  ];
  const evaluations = [
    baseEvaluation({
      projectId: "P90",
      milestones: {
        status: "ok",
        totalProgressPercent: 90,
        actualProgressPercent: 90,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 1,
        actualMilestonesCount: 1,
        completedMilestonesCount: 0,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "m90",
            name: "M",
            year: 2026,
            quarter: "Q2",
            originalWeightPercent: 100,
            effectiveWeightPercent: 100,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 90,
            contributionPercent: 90
          }
        ]
      }
    }),
    baseEvaluation({
      projectId: "P30",
      milestones: {
        status: "ok",
        totalProgressPercent: 30,
        actualProgressPercent: 30,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 1,
        actualMilestonesCount: 1,
        completedMilestonesCount: 0,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "m30",
            name: "M",
            year: 2026,
            quarter: "Q2",
            originalWeightPercent: 100,
            effectiveWeightPercent: 100,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 30,
            contributionPercent: 30
          }
        ]
      }
    })
  ];

  const agg = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 2,
    assessmentDate: "2026-06-15"
  });

  assert(near(agg.selectedMilestones, 60), `equal project weights → 60, got ${agg.selectedMilestones}`);
});

runTest("Uncapped показатель (>100%) flows into Overview and PDF without capping", () => {
  const projects = [baseProject({ projectId: "U" })];
  const evaluations = [
    baseEvaluation({
      projectId: "U",
      indicators: {
        status: "ok",
        averagePerformancePercent: 150,
        cappedAveragePerformancePercent: 100,
        calculatedIndicatorsCount: 1,
        skippedFutureIndicatorsCount: 0,
        missingDictionaryCount: 0,
        indicatorResults: [
          {
            id: "rev",
            name: "Выручка",
            year: 2026,
            quarter: "Q1",
            plan: 100,
            fact: 150,
            calculationType: "higher_is_better",
            performancePercent: 150,
            cappedPerformancePercent: 100,
            status: "ok",
            explanation: ""
          }
        ]
      }
    })
  ];

  const ui = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 1,
    assessmentDate: "2026-03-31"
  });
  const pdf = buildOverviewPdfReportData({
    projects,
    projectEvaluations: evaluations,
    assessmentDate: "2026-03-31",
    selectedYear: 2026,
    selectedQuarter: 1
  });

  assert(near(ui.selectedIndicators, 150), `UI must keep 150%, got ${ui.selectedIndicators}`);
  assert(near(pdf.portfolioProgress.selectedKpi, 150), `PDF must keep 150%, got ${pdf.portfolioProgress.selectedKpi}`);
  assert(ui.selectedIndicators === pdf.portfolioProgress.selectedKpi, "Overview and PDF must match");
});

runTest("Overview and PDF return identical portfolio values for the same evaluation set", () => {
  const projects = [
    baseProject({ projectId: "A", department: "IT ; Финансы" }),
    baseProject({ projectId: "B", department: "IT" })
  ];
  const evaluations = [
    baseEvaluation({
      projectId: "A",
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
            id: "ma",
            name: "MA",
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
      indicators: {
        status: "ok",
        averagePerformancePercent: 120,
        cappedAveragePerformancePercent: 100,
        calculatedIndicatorsCount: 1,
        skippedFutureIndicatorsCount: 0,
        missingDictionaryCount: 0,
        indicatorResults: [
          {
            id: "ia",
            name: "Показатель A",
            year: 2026,
            quarter: "Q1",
            plan: 100,
            fact: 120,
            calculationType: "higher_is_better",
            performancePercent: 120,
            cappedPerformancePercent: 100,
            status: "ok",
            explanation: ""
          }
        ]
      }
    }),
    baseEvaluation({
      projectId: "B",
      milestones: {
        status: "ok",
        totalProgressPercent: 40,
        actualProgressPercent: 40,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 1,
        actualMilestonesCount: 1,
        completedMilestonesCount: 0,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "mb",
            name: "MB",
            year: 2026,
            quarter: "Q1",
            originalWeightPercent: 100,
            effectiveWeightPercent: 100,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 40,
            contributionPercent: 40
          }
        ]
      },
      indicators: {
        status: "ok",
        averagePerformancePercent: 60,
        cappedAveragePerformancePercent: 60,
        calculatedIndicatorsCount: 1,
        skippedFutureIndicatorsCount: 0,
        missingDictionaryCount: 0,
        indicatorResults: [
          {
            id: "ib",
            name: "Показатель B",
            year: 2026,
            quarter: "Q1",
            plan: 100,
            fact: 60,
            calculationType: "higher_is_better",
            performancePercent: 60,
            cappedPerformancePercent: 60,
            status: "ok",
            explanation: ""
          }
        ]
      }
    })
  ];

  const ui = computePortfolioProgressAggregates({
    projectsInSelectedYear: projects,
    projectEvaluations: evaluations,
    selectedYear: 2026,
    selectedQuarter: 1,
    assessmentDate: "2026-06-15"
  });
  const pdf = buildOverviewPdfReportData({
    projects,
    projectEvaluations: evaluations,
    assessmentDate: "2026-06-15",
    selectedYear: 2026,
    selectedQuarter: 1
  });

  assert(ui.selectedMilestones === pdf.portfolioProgress.selectedMilestones, "quarter milestones");
  assert(ui.yearMilestones === pdf.portfolioProgress.yearMilestones, "year milestones");
  assert(ui.selectedIndicators === pdf.portfolioProgress.selectedKpi, "quarter показатели");
  assert(ui.yearIndicators === pdf.portfolioProgress.yearKpi, "year показатели");
  assert(near(ui.selectedMilestones, 60), `avg milestones (80+40)/2 = 60, got ${ui.selectedMilestones}`);
  assert(near(ui.selectedIndicators, 90), `avg indicators (120+60)/2 = 90, got ${ui.selectedIndicators}`);
});

runTest("Unknown показатель uses evaluateProject default rule and feeds portfolio average", () => {
  const originalDict = [...DEFAULT_INDICATOR_DICTIONARY];
  try {
    setIndicatorDictionary([
      ...DEFAULT_INDICATOR_DICTIONARY.filter(d => d.name !== "Неизвестный показатель X")
    ]);

    const normalized = createNormalized({
      projectId: "UNK",
      indicators: [
        {
          id: "u1",
          name: "Неизвестный показатель X",
          year: 2026,
          quarter: "Q1",
          plan: 100,
          fact: 90,
          periodStatus: "past",
          factStatus: "filled",
          isApplicableQuarter: true,
          sourceColumns: { name: "", plan: "", fact: "" }
        }
      ]
    });

    const evaluation = evaluateProject(normalized, { assessmentDate: new Date("2026-06-15") });
    const ind = evaluation.indicators.indicatorResults.find(r => r.name === "Неизвестный показатель X");
    assert(!!ind, "evaluateProject must emit result for unknown показатель");
    assert(ind!.performancePercent !== null, "default rule must produce performancePercent");
    // Default plan/fact: 90/100 * 100 = 90
    assert(near(ind!.performancePercent, 90), `default rule → 90%, got ${ind!.performancePercent}`);

    const projects = [baseProject({ projectId: "UNK" })];
    const agg = computePortfolioProgressAggregates({
      projectsInSelectedYear: projects,
      projectEvaluations: [evaluation as unknown as ProjectEvaluation],
      selectedYear: 2026,
      selectedQuarter: 1,
      assessmentDate: "2026-06-15"
    });
    assert(near(agg.selectedIndicators, 90), `portfolio must consume evaluation result 90%, got ${agg.selectedIndicators}`);
  } finally {
    setIndicatorDictionary(originalDict);
  }
});

runTest("Multi-department project is counted in each department in PDF analytics", () => {
  const projects = [
    baseProject({
      projectId: "MD",
      department: "Отдел Разработки ; Отдел Маркетинга",
      priority: 1
    })
  ];
  const evaluations = [
    baseEvaluation({
      projectId: "MD",
      milestones: {
        status: "ok",
        totalProgressPercent: 80,
        actualProgressPercent: 80,
        totalWeightPercent: 100,
        weightControlStatus: "ok",
        milestonesCount: 1,
        actualMilestonesCount: 1,
        completedMilestonesCount: 0,
        overdueMilestonesCount: 0,
        milestoneResults: [
          {
            id: "m",
            name: "M",
            year: 2026,
            quarter: "Q2",
            originalWeightPercent: 100,
            effectiveWeightPercent: 100,
            weightSource: "explicit",
            isIncludedInProgress: true,
            completionPercent: 80,
            contributionPercent: 80
          }
        ]
      }
    })
  ];

  const pdf = buildOverviewPdfReportData({
    projects,
    projectEvaluations: evaluations,
    assessmentDate: "2026-06-15",
    selectedYear: 2026,
    selectedQuarter: 2
  });

  const depts = pdf.departmentAnalytics.map(d => d.department);
  assert(depts.includes("Отдел Разработки"), "must include first department");
  assert(depts.includes("Отдел Маркетинга"), "must include second department");
});

console.log("-----------------------------------------------------------");
console.log("All portfolio progress (evaluation SSOT) tests passed!");
console.log("-----------------------------------------------------------");
