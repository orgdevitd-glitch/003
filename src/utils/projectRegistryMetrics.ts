import { Project, ProjectEvaluation } from '../types';
import { getEvaluationByProjectId } from './evaluationUtils';
import { getRegistryPcStatusView, calculateUnifiedProjectRisk } from './projectRegistryStatus';
import { parseDateSafe } from './dateUtils';
import { 
  calculateSelectedQuarterMilestonesProgressForProject,
  calculateSelectedQuarterKpiProgressForProject,
  calculateTasksProgressForProject,
  calculateKpisProgressForProject,
  getMilestoneSummaryMetrics,
  getIndicatorSummaryMetrics
} from './projectCalculations';
import {
  getMilestoneTotalMetricsFromEvaluation,
  getMilestonePeriodCompletionMetricsFromEvaluation
} from './evaluationMilestoneMetrics';
import {
  getIndicatorPeriodCompletionMetricsFromEvaluation
} from './evaluationIndicatorMetrics';

export interface QuarterYearResult {
  quarter: number;
  year: number;
  date: Date;
}

/**
 * Determines current quarter (1-4) and financial year based on a given assessment date string.
 * Uses today's date if no date string is found.
 */
export function getCurrentQuarterAndYear(assessmentDate?: string | null): QuarterYearResult {
  let date: Date | null = null;
  if (assessmentDate) {
    date = parseDateSafe(assessmentDate);
  }
  if (!date) {
    date = new Date();
  }
  const month = date.getMonth(); // 0 is January, 11 is December
  const year = date.getFullYear();
  let quarter = 1;
  if (month >= 0 && month <= 2) {
    quarter = 1;
  } else if (month >= 3 && month <= 5) {
    quarter = 2;
  } else if (month >= 6 && month <= 8) {
    quarter = 3;
  } else {
    quarter = 4;
  }
  return { quarter, year, date };
}

/**
 * Gets milestone actual progress percent (0-100+) using standard calculations (project-wide).
 */
export function getRegistryMilestoneProgress(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined,
  assessmentYear: number = new Date().getFullYear()
): number | null {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  if (ev && ev.milestones?.actualProgressPercent !== undefined && ev.milestones?.actualProgressPercent !== null) {
    return ev.milestones.actualProgressPercent;
  }
  return calculateTasksProgressForProject(project, assessmentYear);
}

/**
 * Gets indicator capped average performance percent (typically 0-100) using standard calculations (project-wide).
 * Falls back to uncapped averagePerformancePercent only for legacy data where capped fields are not present.
 */
export function getRegistryKpiProgress(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined
): number | null {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  if (ev) {
    const avg =
      ev.indicators?.cappedAveragePerformancePercent
      ?? ev.indicators?.averagePerformancePercent
      ?? null;
    if (avg !== null) {
      return avg;
    }
  }
  return calculateKpisProgressForProject(project);
}

/**
 * Gets milestone metrics for standard calculations (project-wide).
 */
export function getRegistryMilestoneMetrics(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined,
  assessmentYear: number = new Date().getFullYear()
) {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  if (ev) {
    return getMilestoneTotalMetricsFromEvaluation(ev);
  }
  return getMilestoneSummaryMetrics(project, assessmentYear);
}

/**
 * Gets KPI indicators metrics for standard calculations (project-wide).
 */
export function getRegistryKpiMetrics(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined
) {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  if (ev) {
    const avg =
      ev.indicators?.cappedAveragePerformancePercent
      ?? ev.indicators?.averagePerformancePercent
      ?? null;
    return {
      plan: 100,
      fact: avg !== null ? avg : 0,
      deviation: avg !== null ? avg - 100 : -100,
      hasData: avg !== null
    };
  }
  return getIndicatorSummaryMetrics(project);
}

/**
 * Gets milestone actual progress percent (0-100+) using the current quarter calculations.
 */
export function getCurrentQuarterMilestoneProgress(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined,
  assessmentDate?: string | null
): number | null {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  const { quarter, year } = getCurrentQuarterAndYear(assessmentDate);
  if (ev) {
    const metrics = getMilestonePeriodCompletionMetricsFromEvaluation(ev, year, quarter);
    return metrics.hasData ? metrics.fact : null;
  }
  return calculateSelectedQuarterMilestonesProgressForProject(project, quarter, year);
}

/**
 * Gets indicator average performance percent (0-infinite) using the current quarter calculations.
 */
export function getCurrentQuarterKpiProgress(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined,
  assessmentDate?: string | null
): number | null {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  const { quarter, year, date } = getCurrentQuarterAndYear(assessmentDate);
  if (ev?.indicators?.indicatorResults) {
    const metrics = getIndicatorPeriodCompletionMetricsFromEvaluation(ev, year, quarter);
    return metrics.hasData ? metrics.fact : null;
  }
  return calculateSelectedQuarterKpiProgressForProject(project, quarter, year, date);
}

/**
 * Gets milestone metrics for ProjectTable row rendering, representing the current quarter's performance.
 */
export function getCurrentQuarterMilestoneMetrics(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined,
  assessmentDate?: string | null
) {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  const { quarter, year } = getCurrentQuarterAndYear(assessmentDate);
  if (ev) {
    return getMilestonePeriodCompletionMetricsFromEvaluation(ev, year, quarter);
  }
  const fact = calculateSelectedQuarterMilestonesProgressForProject(project, quarter, year);
  if (fact === null) {
    return {
      plan: 100,
      fact: 0,
      deviation: -100,
      hasData: false
    };
  }
  return {
    plan: 100,
    fact: fact,
    deviation: fact - 100,
    hasData: true
  };
}

/**
 * Gets KPI indicators metrics for ProjectTable row rendering, representing the current quarter's performance.
 */
export function getCurrentQuarterKpiMetrics(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined,
  assessmentDate?: string | null
) {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  const { quarter, year, date } = getCurrentQuarterAndYear(assessmentDate);
  if (ev?.indicators?.indicatorResults) {
    const metrics = getIndicatorPeriodCompletionMetricsFromEvaluation(ev, year, quarter);
    if (metrics.hasData) {
      return {
        plan: 100,
        fact: metrics.fact,
        deviation: metrics.deviation,
        hasData: true,
        rawFact: metrics.rawFact,
        cappedFact: metrics.cappedFact,
        calculatedIndicatorsCount: metrics.calculatedIndicatorsCount
      };
    }
  }
  const fact = calculateSelectedQuarterKpiProgressForProject(project, quarter, year, date);
  if (fact === null) {
    return {
      plan: 100,
      fact: 0,
      deviation: -100,
      hasData: false
    };
  }
  return {
    plan: 100,
    fact: fact,
    deviation: fact - 100,
    hasData: true
  };
}

/**
 * Gets the registry health status code using ProjectEvaluation if available,
 * falls back to legacy overall status classification otherwise.
 */
export function getRegistryHealthStatus(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined
): string {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  if (ev) {
    return ev.projectHealth.status;
  }
  return 'not_enough_data';
}

/**
 * Gets the monitoring (PC) status code using ProjectEvaluation if available,
 * falls back to legacy pcStatus classification otherwise.
 */
export function getRegistryMonitoringStatus(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined
): string {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  if (ev) {
    return ev.monitoring?.status ?? 'not_enough_data';
  }
  return 'not_enough_data';
}

/**
 * Gets data quality completeness percent using ProjectEvaluation if available,
 * falls back to legacy completeness percent otherwise.
 */
export function getRegistryDataQuality(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined
): number | null {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  if (ev) {
    return ev.dataQuality?.completenessPercent ?? null;
  }
  return null;
}

/**
 * Gets list of active risk reasons for the project using ProjectEvaluation if available.
 */
export function getRegistryRiskReasons(
  project: Project,
  projectEvaluations: ProjectEvaluation[] | null | undefined,
  assessmentDate: string
): string[] {
  const ev = getEvaluationByProjectId(projectEvaluations, project.projectId);
  const result = calculateUnifiedProjectRisk(project, ev, assessmentDate);
  return result.reasons;
}

