import { Project, ProjectEvaluation } from "../types";
import { parseDateSafe } from "./dateUtils";
import { resolveEffectiveAssessmentDateForSelectedYear } from "./periodApplicability";
import {
  getMilestonePeriodCompletionMetricsFromEvaluation,
  getMilestoneYearCompletionMetricsFromEvaluation
} from "./evaluationMilestoneMetrics";
import {
  getIndicatorPeriodCompletionMetricsFromEvaluation,
  getIndicatorYearCompletionMetricsFromEvaluation
} from "./evaluationIndicatorMetrics";
import {
  calculateSelectedQuarterMilestonesProgressForProject,
  calculateSelectedQuarterKpiProgressForProject,
  calculateYearKpisProgressForProject,
  calculateMilestonesProgressForProjectDepts
} from "./projectCalculations";

export interface ProjectCardProgressMetricsInput {
  project: Project;
  evaluation?: ProjectEvaluation | null;
  selectedYear: number;
  selectedQuarter: number;
  assessmentDate?: string;
}

export interface ProjectCardProgressMetricsResult {
  milestonesQuarterVal: number | null;
  milestonesQuarterPlan: number | undefined;
  milestonesQuarterTitle: string | undefined;

  milestonesYearVal: number | null;
  milestonesYearPlan: number | undefined;
  milestonesYearTitle: string | undefined;

  kpiQuarterVal: number | null;
  kpiQuarterPlan: number | undefined;
  kpiQuarterTitle: string | undefined;

  kpiYearVal: number | null;
  kpiYearPlan: number | undefined;
  kpiYearTitle: string | undefined;
}

export function getProjectCardProgressMetrics({
  project,
  evaluation,
  selectedYear,
  selectedQuarter,
  assessmentDate
}: ProjectCardProgressMetricsInput): ProjectCardProgressMetricsResult {
  const dateStr = assessmentDate || evaluation?.assessmentDate || new Date().toISOString().split("T")[0];
  const parsedAssessmentDateForQuarter = (dateStr ? parseDateSafe(dateStr) : null) || new Date();

  const effectiveAssessmentDate = resolveEffectiveAssessmentDateForSelectedYear(selectedYear, dateStr);
  const parsedEffectiveAssessmentDate = parseDateSafe(effectiveAssessmentDate) || parsedAssessmentDateForQuarter;

  const isMilestonesError = evaluation?.milestones?.weightControlStatus === "error";

  let milestonesQuarterVal: number | null = null;
  let milestonesQuarterPlan: number | undefined = undefined;
  let milestonesQuarterTitle: string | undefined = undefined;

  let milestonesYearVal: number | null = null;
  let milestonesYearPlan: number | undefined = undefined;
  let milestonesYearTitle: string | undefined = undefined;

  if (isMilestonesError) {
    milestonesQuarterVal = null;
    milestonesYearVal = null;
  } else if (evaluation?.milestones?.milestoneResults) {
    const qMetrics = getMilestonePeriodCompletionMetricsFromEvaluation(
      evaluation,
      selectedYear,
      selectedQuarter,
      effectiveAssessmentDate,
      project.startDate,
      project.deadlineAt || project.endDate,
      "actual"
    );
    if (qMetrics.hasData) {
      milestonesQuarterVal = qMetrics.fact;
      milestonesQuarterPlan = 100;
      milestonesQuarterTitle = `Вес вех периода в проекте: ${qMetrics.planContributionPercent.toFixed(1)}%. Выполненный вклад: ${qMetrics.factContributionPercent.toFixed(1)}%.`;
    }

    const yMetrics = getMilestoneYearCompletionMetricsFromEvaluation(
      evaluation,
      selectedYear,
      effectiveAssessmentDate,
      project.startDate,
      project.deadlineAt || project.endDate,
      "actual"
    );
    if (yMetrics.hasData) {
      milestonesYearVal = yMetrics.fact;
      milestonesYearPlan = 100;
      milestonesYearTitle = `Вес вех периода в проекте: ${yMetrics.planContributionPercent.toFixed(1)}%. Выполненный вклад: ${yMetrics.factContributionPercent.toFixed(1)}%.`;
    }
  }

  // Fallback if null — helpers already exclude future periods via effectiveAssessmentDate
  if (milestonesQuarterVal === null && !isMilestonesError) {
    milestonesQuarterVal = calculateSelectedQuarterMilestonesProgressForProject(
      project,
      selectedQuarter,
      selectedYear,
      parsedEffectiveAssessmentDate
    );
  }
  if (milestonesYearVal === null && !isMilestonesError) {
    milestonesYearVal = calculateMilestonesProgressForProjectDepts(
      project,
      selectedYear,
      parsedEffectiveAssessmentDate
    );
  }

  let kpiQuarterVal: number | null = null;
  let kpiQuarterPlan: number | undefined = undefined;
  let kpiQuarterTitle: string | undefined = undefined;

  let kpiYearVal: number | null = null;
  let kpiYearPlan: number | undefined = undefined;
  let kpiYearTitle: string | undefined = undefined;

  if (evaluation?.indicators?.indicatorResults) {
    const qIndicatorMetrics = getIndicatorPeriodCompletionMetricsFromEvaluation(
      evaluation,
      selectedYear,
      selectedQuarter,
      effectiveAssessmentDate,
      project.startDate,
      project.deadlineAt || project.endDate,
      "actual"
    );
    if (qIndicatorMetrics.hasData) {
      kpiQuarterVal = qIndicatorMetrics.fact;
      kpiQuarterPlan = 100;
      kpiQuarterTitle = `Фактическое среднее: ${qIndicatorMetrics.rawFact.toFixed(1)}%. Рассчитано показателей: ${qIndicatorMetrics.calculatedIndicatorsCount}.`;
    }

    const yIndicatorMetrics = getIndicatorYearCompletionMetricsFromEvaluation(
      evaluation,
      selectedYear,
      effectiveAssessmentDate,
      project.startDate,
      project.deadlineAt || project.endDate,
      "actual"
    );
    if (yIndicatorMetrics.hasData) {
      kpiYearVal = yIndicatorMetrics.fact;
      kpiYearPlan = 100;
      kpiYearTitle = `Фактическое среднее: ${yIndicatorMetrics.rawFact.toFixed(1)}%. Рассчитано показателей: ${yIndicatorMetrics.calculatedIndicatorsCount}.`;
    }
  }

  // Fallback if null — date-aware helpers exclude future periods
  if (kpiQuarterVal === null) {
    kpiQuarterVal = calculateSelectedQuarterKpiProgressForProject(
      project,
      selectedQuarter,
      selectedYear,
      parsedEffectiveAssessmentDate
    );
  }
  if (kpiYearVal === null) {
    kpiYearVal = calculateYearKpisProgressForProject(
      project,
      selectedYear,
      parsedEffectiveAssessmentDate
    );
  }

  return {
    milestonesQuarterVal,
    milestonesQuarterPlan,
    milestonesQuarterTitle,
    milestonesYearVal,
    milestonesYearPlan,
    milestonesYearTitle,
    kpiQuarterVal,
    kpiQuarterPlan,
    kpiQuarterTitle,
    kpiYearVal,
    kpiYearPlan,
    kpiYearTitle
  };
}
