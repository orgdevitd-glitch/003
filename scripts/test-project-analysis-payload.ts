import assert from "node:assert/strict";
import { buildProjectAnalysisPayload } from "../server/services/projectAnalysisPayloadService";
import { Project, ProjectEvaluation } from "../src/types";

const project: Project = {
  projectId: "direction-aware-kpis",
  projectName: "Direction-aware KPI analysis",
  status: "active",
  tasks: [],
  milestones: [],
  indicators: [
    {
      indicatorId: "zero-defects",
      name: "Zero defects",
      period: "Q1 2026",
      planValue: 10,
      factValue: 0
    },
    {
      indicatorId: "excess-defects",
      name: "Excess defects",
      period: "Q1 2026",
      planValue: 10,
      factValue: 20
    },
    {
      indicatorId: "pending-methodology",
      name: "Pending methodology",
      period: "Q1 2026",
      planValue: 10,
      factValue: 20
    }
  ]
};

const evaluation = {
  projectId: project.projectId,
  assessmentDate: "2026-06-01",
  dataQuality: {
    status: "ok",
    completenessPercent: 100,
    errorsCount: 0,
    warningsCount: 0,
    issuesCount: 0
  },
  milestones: {
    status: "not_applicable",
    totalProgressPercent: null,
    actualProgressPercent: null,
    totalWeightPercent: null,
    weightControlStatus: "not_applicable",
    milestonesCount: 0,
    actualMilestonesCount: 0,
    completedMilestonesCount: 0,
    overdueMilestonesCount: 0,
    milestoneResults: []
  },
  indicators: {
    status: "risk",
    averagePerformancePercent: 75,
    cappedAveragePerformancePercent: 75,
    calculatedIndicatorsCount: 2,
    skippedFutureIndicatorsCount: 0,
    missingDictionaryCount: 0,
    indicatorResults: [
      {
        id: "zero-defects",
        name: "Zero defects",
        year: 2026,
        quarter: "Q1",
        plan: 10,
        fact: 0,
        calculationType: "lower_is_better",
        performancePercent: 100,
        cappedPerformancePercent: 100,
        status: "ok",
        explanation: "No defects meets the lower-is-better target."
      },
      {
        id: "excess-defects",
        name: "Excess defects",
        year: 2026,
        quarter: "Q1",
        plan: 10,
        fact: 20,
        calculationType: "lower_is_better",
        performancePercent: 50,
        cappedPerformancePercent: 50,
        status: "risk",
        explanation: "Defects exceed the lower-is-better target."
      },
      {
        id: "pending-methodology",
        name: "Pending methodology",
        year: 2026,
        quarter: "Q1",
        plan: 10,
        fact: 20,
        calculationType: "unknown",
        performancePercent: null,
        cappedPerformancePercent: null,
        status: "not_enough_data",
        explanation: "The calculation methodology is pending."
      }
    ]
  },
  monitoring: {
    status: "not_enough_data",
    lastMonitoringDate: null,
    nextMonitoringDate: null,
    overdueDays: null
  },
  projectHealth: {
    status: "risk",
    score: 50,
    mainReasons: ["Excess defects"]
  },
  explanations: []
} as ProjectEvaluation;

const payload = buildProjectAnalysisPayload({
  project,
  evaluation,
  assessmentDate: "2026-06-01",
  assessmentDateMode: "custom"
});

const snapshotByName = new Map(
  payload.indicatorsSnapshot.indicators.map(indicator => [indicator.name, indicator])
);
assert.equal(snapshotByName.get("Zero defects")?.performancePercent, 100);
assert.equal(snapshotByName.get("Excess defects")?.performancePercent, 50);
assert.equal(
  snapshotByName.get("Pending methodology")?.performancePercent,
  null,
  "AI payload must not invent plan/fact performance after evaluation declined to calculate it"
);

const issueNames = payload.analysisInsights.topIndicatorIssues.map(issue => issue.name);
assert(issueNames.includes("Excess defects"), "A breached lower-is-better KPI must be an AI issue");
assert(!issueNames.includes("Zero defects"), "A zero fact that meets a lower-is-better target must not be an AI issue");
assert(!issueNames.includes("Pending methodology"), "A KPI without an approved methodology must not be reclassified");

const detailByName = new Map(
  payload.cardSnapshot.indicatorsDetails.map(indicator => [indicator.name, indicator])
);
assert.equal(detailByName.get("Zero defects")?.isProblematic, false);
assert.equal(detailByName.get("Excess defects")?.isProblematic, true);
assert.equal(detailByName.get("Pending methodology")?.isProblematic, false);

console.log("Project analysis payload preserves direction-aware KPI evaluation.");
