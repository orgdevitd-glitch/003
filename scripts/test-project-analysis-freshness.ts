import {
  getCurrentProjectAnalysis,
  getProjectAnalysisAssessmentDate,
  isProjectAnalysisCurrent,
} from "../src/utils/projectAnalysisFreshness";
import { ProjectAnalysisResult } from "../src/types";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
};

const analysis = (assessmentDate?: string): ProjectAnalysisResult => ({
  analysisId: "analysis-1",
  projectId: "project-1",
  createdAt: "2026-09-20T10:00:00.000Z",
  model: "test",
  assessmentDate,
});

assert(
  isProjectAnalysisCurrent(analysis("2026-09-20"), "2026-09-20"),
  "an analysis should be current only for its assessment date",
);
assert(
  isProjectAnalysisCurrent(analysis("2026-09-20T00:00:00.000Z"), "2026-09-20"),
  "ISO timestamps should compare by calendar date",
);
assert(
  !isProjectAnalysisCurrent(analysis("2026-09-19"), "2026-09-20"),
  "an analysis from another assessment date must be rejected",
);
assert(
  !isProjectAnalysisCurrent(analysis(), "2026-09-20"),
  "an untagged analysis must not be presented as current",
);
assert(
  getCurrentProjectAnalysis(analysis("2026-09-19"), "2026-09-20") === null,
  "stale analysis must be suppressed from cards and reports",
);

const matchingAnalysis = analysis("2026-09-20");
assert(
  getCurrentProjectAnalysis(matchingAnalysis, "2026-09-20") === matchingAnalysis,
  "matching analysis should pass through unchanged",
);

const legacyAnalysis = analysis();
legacyAnalysis.shortAnalysis = {
  dataCompleteness: "",
  missingSignificantData: [],
  pcTimeliness: "",
  nextPcDate: null,
  assessmentDate: "2026-09-20",
  weightedTaskProgress: "",
  periodPlan: "",
  periodFact: "",
  deviation: "",
  indicators: "",
  overallStatus: "",
};

assert(
  getProjectAnalysisAssessmentDate(legacyAnalysis) === "2026-09-20",
  "legacy analysis dates should remain usable",
);
assert(
  isProjectAnalysisCurrent(legacyAnalysis, "2026-09-20"),
  "a legacy analysis with a matching date should remain visible",
);

console.log("Project analysis freshness tests passed.");
