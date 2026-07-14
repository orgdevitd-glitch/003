import { ProjectEvaluation } from '../types';
import {
  getQuarterPeriodStatus,
  isPeriodIncludedForMode,
  PeriodInclusionMode
} from './periodApplicability';

export interface MilestoneMetrics {
  plan: number;
  fact: number;
  deviation: number;
  hasData: boolean;
  weightControlStatus?: string;
  status?: string;
}

export function getMilestoneTotalMetricsFromEvaluation(
  evaluation: ProjectEvaluation | null | undefined
): MilestoneMetrics {
  if (!evaluation || !evaluation.milestones) {
    return { plan: 100, fact: 0, deviation: -100, hasData: false };
  }

  const fact = evaluation.milestones.totalProgressPercent;
  const weightControlStatus = evaluation.milestones.weightControlStatus;

  if (weightControlStatus === 'error') {
    return {
      plan: 100,
      fact: 0,
      deviation: -100,
      hasData: false,
      weightControlStatus,
      status: 'error',
    };
  }

  return {
    plan: 100,
    fact: fact !== null ? fact : 0,
    deviation: fact !== null ? fact - 100 : -100,
    hasData: fact !== null,
    weightControlStatus,
  };
}

export function getMilestonePeriodContributionMetricsFromEvaluation(
  evaluation: ProjectEvaluation | null | undefined,
  year: number,
  quarter: number | string,
  assessmentDate?: string | Date | null,
  projectStartDate?: string | null,
  projectEndDate?: string | null,
  mode: PeriodInclusionMode = "actual"
): MilestoneMetrics {
  if (!evaluation || !evaluation.milestones || !evaluation.milestones.milestoneResults) {
    return { plan: 100, fact: 0, deviation: -100, hasData: false };
  }

  const qStr = typeof quarter === 'number' ? `Q${quarter}` : quarter;
  const assess = assessmentDate ?? evaluation.assessmentDate;

  // Future periods must not enter aggregates (even with early fact).
  const periodStatus = getQuarterPeriodStatus(
    year,
    qStr,
    assess,
    projectStartDate,
    projectEndDate
  );
  if (!isPeriodIncludedForMode(periodStatus, mode)) {
    return {
      plan: 100,
      fact: 0,
      deviation: -100,
      hasData: false,
      weightControlStatus: evaluation.milestones.weightControlStatus,
    };
  }

  const filtered = evaluation.milestones.milestoneResults.filter(
    (m) => m.year === year && m.quarter === qStr && m.isIncludedInProgress === true
  );

  const plan = filtered.reduce((sum, m) => sum + (m.effectiveWeightPercent || 0), 0);
  const fact = filtered.reduce((sum, m) => sum + (m.contributionPercent || 0), 0);

  return {
    plan,
    fact,
    deviation: fact - plan,
    hasData: plan > 0,
    weightControlStatus: evaluation.milestones.weightControlStatus,
  };
}

export function getMilestoneYearContributionMetricsFromEvaluation(
  evaluation: ProjectEvaluation | null | undefined,
  year: number,
  assessmentDate?: string | Date | null,
  projectStartDate?: string | null,
  projectEndDate?: string | null,
  mode: PeriodInclusionMode = "actual"
): MilestoneMetrics {
  if (!evaluation || !evaluation.milestones || !evaluation.milestones.milestoneResults) {
    return { plan: 100, fact: 0, deviation: -100, hasData: false };
  }

  const assess = assessmentDate ?? evaluation.assessmentDate;

  const filtered = evaluation.milestones.milestoneResults.filter((m) => {
    if (m.year !== year || !m.isIncludedInProgress) return false;
    const status = getQuarterPeriodStatus(
      m.year,
      m.quarter,
      assess,
      projectStartDate,
      projectEndDate
    );
    return isPeriodIncludedForMode(status, mode);
  });

  const plan = filtered.reduce((sum, m) => sum + (m.effectiveWeightPercent || 0), 0);
  const fact = filtered.reduce((sum, m) => sum + (m.contributionPercent || 0), 0);

  return {
    plan,
    fact,
    deviation: fact - plan,
    hasData: plan > 0,
    weightControlStatus: evaluation.milestones.weightControlStatus,
  };
}

export interface MilestoneCompletionMetrics {
  plan: number;
  fact: number;
  deviation: number;
  hasData: boolean;
  planContributionPercent: number;
  factContributionPercent: number;
  weightControlStatus?: string;
  status?: string;
}

export function getMilestonePeriodCompletionMetricsFromEvaluation(
  evaluation: ProjectEvaluation | null | undefined,
  year: number,
  quarter: number | string,
  assessmentDate?: string | Date | null,
  projectStartDate?: string | null,
  projectEndDate?: string | null,
  mode: PeriodInclusionMode = "actual"
): MilestoneCompletionMetrics {
  const contrib = getMilestonePeriodContributionMetricsFromEvaluation(
    evaluation,
    year,
    quarter,
    assessmentDate,
    projectStartDate,
    projectEndDate,
    mode
  );

  if (!contrib.hasData || contrib.plan <= 0) {
    return {
      plan: 100,
      fact: 0,
      deviation: -100,
      hasData: false,
      planContributionPercent: 0,
      factContributionPercent: 0,
      weightControlStatus: contrib.weightControlStatus,
    };
  }

  const planContributionPercent = contrib.plan;
  const factContributionPercent = contrib.fact;
  const fact = (factContributionPercent / planContributionPercent) * 100;

  return {
    plan: 100,
    fact,
    deviation: fact - 100,
    hasData: true,
    planContributionPercent,
    factContributionPercent,
    weightControlStatus: contrib.weightControlStatus,
  };
}

export function getMilestoneYearCompletionMetricsFromEvaluation(
  evaluation: ProjectEvaluation | null | undefined,
  year: number,
  assessmentDate?: string | Date | null,
  projectStartDate?: string | null,
  projectEndDate?: string | null,
  mode: PeriodInclusionMode = "actual"
): MilestoneCompletionMetrics {
  const contrib = getMilestoneYearContributionMetricsFromEvaluation(
    evaluation,
    year,
    assessmentDate,
    projectStartDate,
    projectEndDate,
    mode
  );

  if (!contrib.hasData || contrib.plan <= 0) {
    return {
      plan: 100,
      fact: 0,
      deviation: -100,
      hasData: false,
      planContributionPercent: 0,
      factContributionPercent: 0,
      weightControlStatus: contrib.weightControlStatus,
    };
  }

  const planContributionPercent = contrib.plan;
  const factContributionPercent = contrib.fact;
  const fact = (factContributionPercent / planContributionPercent) * 100;

  return {
    plan: 100,
    fact,
    deviation: fact - 100,
    hasData: true,
    planContributionPercent,
    factContributionPercent,
    weightControlStatus: contrib.weightControlStatus,
  };
}
