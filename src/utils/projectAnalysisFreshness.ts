import type { ProjectAnalysisResult } from "../types";

const toDateKey = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  return match?.[1] ?? null;
};

export const getProjectAnalysisAssessmentDate = (
  analysis: ProjectAnalysisResult | null | undefined,
): string | null => {
  if (!analysis) return null;
  return toDateKey(analysis.assessmentDate)
    ?? toDateKey(analysis.shortAnalysis?.assessmentDate);
};

export const isProjectAnalysisCurrent = (
  analysis: ProjectAnalysisResult | null | undefined,
  assessmentDate: string | null | undefined,
): boolean => {
  const analysisDate = getProjectAnalysisAssessmentDate(analysis);
  const currentDate = toDateKey(assessmentDate);
  return analysisDate !== null && currentDate !== null && analysisDate === currentDate;
};

export const getCurrentProjectAnalysis = (
  analysis: ProjectAnalysisResult | null | undefined,
  assessmentDate: string | null | undefined,
): ProjectAnalysisResult | null => (
  isProjectAnalysisCurrent(analysis, assessmentDate) ? analysis ?? null : null
);
