/**
 * Shared portfolio progress aggregates for Overview UI and portfolio PDF.
 * One calculation path — values must not diverge between surfaces.
 *
 * Uses period mode "actual" (completed + current). Future periods excluded.
 * Terminology: показатели (indicators), not KPI.
 */
import { Project, ProjectEvaluation } from "../types";
import { getEvaluationByProjectId } from "./evaluationUtils";
import {
  getMilestonePeriodCompletionMetricsFromEvaluation,
  getMilestoneYearCompletionMetricsFromEvaluation
} from "./evaluationMilestoneMetrics";
import {
  getIndicatorPeriodCompletionMetricsFromEvaluation,
  getIndicatorYearCompletionMetricsFromEvaluation
} from "./evaluationIndicatorMetrics";

export interface PortfolioProgressAggregates {
  selectedMilestones: number | null;
  /** @deprecated name kept for PDF field compatibility — means показатели quarter avg */
  selectedKpi: number | null;
  selectedIndicators: number | null;
  yearMilestones: number | null;
  /** @deprecated name kept for PDF field compatibility — means показатели year avg */
  yearKpi: number | null;
  yearIndicators: number | null;
}

export function computePortfolioProgressAggregates(params: {
  projectsInSelectedYear: Project[];
  projectEvaluations?: ProjectEvaluation[] | null;
  selectedYear: number;
  selectedQuarter: number;
  assessmentDate: string | Date;
}): PortfolioProgressAggregates {
  const {
    projectsInSelectedYear,
    projectEvaluations,
    selectedYear,
    selectedQuarter,
    assessmentDate
  } = params;

  const selectedMilestonesVals = projectsInSelectedYear
    .map(p => {
      const evaluation = getEvaluationByProjectId(projectEvaluations, p.projectId);
      if (!evaluation?.milestones?.milestoneResults) return null;
      const qMetrics = getMilestonePeriodCompletionMetricsFromEvaluation(
        evaluation,
        selectedYear,
        selectedQuarter,
        assessmentDate,
        p.startDate,
        p.deadlineAt || p.endDate,
        "actual"
      );
      return qMetrics.hasData ? qMetrics.fact : null;
    })
    .filter((v): v is number => v !== null);

  const selectedIndicatorVals = projectsInSelectedYear
    .map(p => {
      const evaluation = getEvaluationByProjectId(projectEvaluations, p.projectId);
      if (!evaluation?.indicators?.indicatorResults) return null;
      const metrics = getIndicatorPeriodCompletionMetricsFromEvaluation(
        evaluation,
        selectedYear,
        selectedQuarter,
        assessmentDate,
        p.startDate,
        p.deadlineAt || p.endDate,
        "actual"
      );
      return metrics.hasData ? metrics.fact : null;
    })
    .filter((v): v is number => v !== null);

  const yearMilestonesVals = projectsInSelectedYear
    .map(p => {
      const evaluation = getEvaluationByProjectId(projectEvaluations, p.projectId);
      if (!evaluation?.milestones?.milestoneResults) return null;
      const yMetrics = getMilestoneYearCompletionMetricsFromEvaluation(
        evaluation,
        selectedYear,
        assessmentDate,
        p.startDate,
        p.deadlineAt || p.endDate,
        "actual"
      );
      return yMetrics.hasData ? yMetrics.fact : null;
    })
    .filter((v): v is number => v !== null);

  const yearIndicatorVals = projectsInSelectedYear
    .map(p => {
      const evaluation = getEvaluationByProjectId(projectEvaluations, p.projectId);
      if (!evaluation?.indicators?.indicatorResults) return null;
      const metrics = getIndicatorYearCompletionMetricsFromEvaluation(
        evaluation,
        selectedYear,
        assessmentDate,
        p.startDate,
        p.deadlineAt || p.endDate,
        "actual"
      );
      return metrics.hasData ? metrics.fact : null;
    })
    .filter((v): v is number => v !== null);

  const avg = (vals: number[]) =>
    vals.length > 0 ? vals.reduce((sum, v) => sum + v, 0) / vals.length : null;

  const selectedIndicators = avg(selectedIndicatorVals);
  const yearIndicators = avg(yearIndicatorVals);

  return {
    selectedMilestones: avg(selectedMilestonesVals),
    selectedIndicators,
    selectedKpi: selectedIndicators,
    yearMilestones: avg(yearMilestonesVals),
    yearIndicators,
    yearKpi: yearIndicators
  };
}
