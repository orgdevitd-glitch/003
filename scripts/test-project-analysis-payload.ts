import { buildProjectAnalysisPayload } from "../server/services/projectAnalysisPayloadService";
import type { Project } from "../src/types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const project: Project = {
  projectId: "PAYLOAD-PERIODS-1",
  projectName: "Проверка периодов аналитики",
  status: "active",
  stage: "В работе",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  deadlineAt: "2026-12-31",
  tasks: [],
  milestones: [
    {
      taskId: "M-PAST",
      title: "Просроченная веха",
      status: "Выполняется",
      quarter: "Q1 2026",
      weight: 40,
      progressPercent: 50,
      isMilestone: true
    },
    {
      taskId: "M-CURRENT",
      title: "Текущая веха",
      status: "Ждёт выполнения",
      quarter: "Q2 2026",
      weight: 30,
      progressPercent: 0,
      isMilestone: true
    },
    {
      taskId: "M-FUTURE",
      title: "Будущая веха",
      status: "Ждёт выполнения",
      quarter: "Q3 2026",
      weight: 30,
      progressPercent: 0,
      isMilestone: true
    }
  ],
  indicators: [
    {
      indicatorId: "I-PAST",
      name: "Просроченный показатель",
      period: "Q1 2026",
      planValue: 100,
      factValue: 80
    },
    {
      indicatorId: "I-CURRENT",
      name: "Текущий показатель",
      period: "Q2 2026",
      planValue: 50,
      factValue: null
    },
    {
      indicatorId: "I-FUTURE",
      name: "Будущий показатель",
      period: "Q4 2026",
      planValue: 100,
      factValue: 0
    }
  ]
};

const payload = buildProjectAnalysisPayload({
  project,
  assessmentDate: "2026-06-15",
  assessmentDateMode: "custom"
});

const milestoneDetails = new Map(
  payload.cardSnapshot.milestonesDetails.map((milestone) => [milestone.name, milestone])
);
const indicatorDetails = new Map(
  payload.cardSnapshot.indicatorsDetails.map((indicator) => [indicator.name, indicator])
);

assert(
  milestoneDetails.get("Просроченная веха")?.periodStatus === "past",
  "Q1 milestone must be past during Q2"
);
assert(
  milestoneDetails.get("Текущая веха")?.periodStatus === "current",
  "Q2 milestone must be current during Q2"
);
assert(
  milestoneDetails.get("Будущая веха")?.periodStatus === "future",
  "Q3 milestone must be future during Q2"
);
assert(
  milestoneDetails.get("Будущая веха")?.isProblematic === false,
  "incomplete future milestone must not be reported as problematic"
);

assert(
  indicatorDetails.get("Просроченный показатель")?.periodStatus === "past",
  "Q1 indicator must be past during Q2"
);
assert(
  indicatorDetails.get("Текущий показатель")?.periodStatus === "current",
  "Q2 indicator must be current during Q2"
);
assert(
  indicatorDetails.get("Будущий показатель")?.periodStatus === "future",
  "Q4 indicator must be future during Q2"
);
assert(
  indicatorDetails.get("Будущий показатель")?.isProblematic === false,
  "zero future indicator fact must not be reported as problematic"
);

const milestoneIssueNames = payload.analysisInsights.topMilestoneIssues.map((issue) => issue.name);
assert(
  milestoneIssueNames.includes("Просроченная веха") &&
    milestoneIssueNames.includes("Текущая веха"),
  "past and current incomplete milestones must be included in analysis evidence"
);
assert(
  !milestoneIssueNames.includes("Будущая веха"),
  "future milestones must be excluded from analysis evidence"
);

const indicatorIssueNames = payload.analysisInsights.topIndicatorIssues.map((issue) => issue.name);
assert(
  indicatorIssueNames.includes("Просроченный показатель") &&
    indicatorIssueNames.includes("Текущий показатель"),
  "past and current deficient indicators must be included in analysis evidence"
);
assert(
  !indicatorIssueNames.includes("Будущий показатель"),
  "future indicators must be excluded from analysis evidence"
);

const currentIssueTitles = payload.analysisInsights.currentPeriodIssues.map((issue) => issue.title);
assert(
  currentIssueTitles.includes("Веха: Текущая веха") &&
    currentIssueTitles.includes("Показатель: Текущий показатель"),
  "current-period issues must be surfaced to the assistant"
);
assert(
  !currentIssueTitles.some((title) => title.includes("Просроченная")),
  "past issues must not be mislabeled as current-period issues"
);
assert(
  !currentIssueTitles.some((title) => title.includes("Будущ")),
  "future issues must not be mislabeled as current-period issues"
);

assert(
  !payload.assistantEvidenceBrief.includes("Будущая веха") &&
    !payload.assistantEvidenceBrief.includes("Будущий показатель"),
  "assistant evidence must not describe future periods as lagging"
);

console.log("Project analysis payload period-boundary tests passed.");
