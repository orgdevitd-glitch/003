import { ProjectEvaluation } from '../types';
import {
  getLifecycleIndicatorPerformanceFromEvaluation,
  PeriodInclusionMode
} from './periodApplicability';

export interface IndicatorCompletionMetrics {
  plan: number;
  fact: number;
  rawFact: number;
  cappedFact?: number;
  deviation: number;
  hasData: boolean;
  calculatedIndicatorsCount: number;
}

const emptyMetrics = (): IndicatorCompletionMetrics => ({
  plan: 100,
  fact: 0,
  rawFact: 0,
  deviation: -100,
  hasData: false,
  calculatedIndicatorsCount: 0
});

/**
 * Показатели for a single year+quarter.
 * mode "actual" (default): completed + current — for Overview / PDF / actualProgress.
 * mode "risk": completed only.
 * Future periods are always excluded, even with early fact.
 */
export function getIndicatorPeriodCompletionMetricsFromEvaluation(
  evaluation: ProjectEvaluation | null | undefined,
  year: number,
  quarter: number | string,
  assessmentDate?: string | Date | null,
  projectStartDate?: string | null,
  projectEndDate?: string | null,
  mode: PeriodInclusionMode = "actual"
): IndicatorCompletionMetrics {
  if (!evaluation?.indicators?.indicatorResults) {
    return emptyMetrics();
  }

  const result = getLifecycleIndicatorPerformanceFromEvaluation(
    evaluation,
    assessmentDate ?? evaluation.assessmentDate,
    projectStartDate,
    projectEndDate,
    mode,
    { year, quarter, useCapped: true }
  );

  if (result.calculatedCount === 0 || result.averagePercent === null) {
    return emptyMetrics();
  }

  const fact = result.averagePercent;
  const cappedFact = result.cappedAveragePercent ?? fact;

  return {
    plan: 100,
    fact,
    rawFact: fact,
    cappedFact,
    deviation: fact - 100,
    hasData: true,
    calculatedIndicatorsCount: result.calculatedCount
  };
}

/**
 * Показатели for a calendar year with period filtering (completed+current by default).
 */
export function getIndicatorYearCompletionMetricsFromEvaluation(
  evaluation: ProjectEvaluation | null | undefined,
  year: number,
  assessmentDate?: string | Date | null,
  projectStartDate?: string | null,
  projectEndDate?: string | null,
  mode: PeriodInclusionMode = "actual"
): IndicatorCompletionMetrics {
  if (!evaluation?.indicators?.indicatorResults) {
    return emptyMetrics();
  }

  const result = getLifecycleIndicatorPerformanceFromEvaluation(
    evaluation,
    assessmentDate ?? evaluation.assessmentDate,
    projectStartDate,
    projectEndDate,
    mode,
    { year, useCapped: true }
  );

  if (result.calculatedCount === 0 || result.averagePercent === null) {
    return emptyMetrics();
  }

  const fact = result.averagePercent;
  const cappedFact = result.cappedAveragePercent ?? fact;

  return {
    plan: 100,
    fact,
    rawFact: fact,
    cappedFact,
    deviation: fact - 100,
    hasData: true,
    calculatedIndicatorsCount: result.calculatedCount
  };
}
