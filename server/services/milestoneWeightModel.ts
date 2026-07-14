/**
 * Calculates the milestone weights and project progress across the whole project duration.
 *
 * Methodology (aligned with README):
 * - Explicit weights that sum to 100% are used as-is.
 * - If explicit sum < 100%, residual weight is split evenly across ALL unweighted
 *   milestones (weight null OR 0), including those with empty progress.
 * - Empty / null progress contributes 0% (does not remove the milestone from weight pool).
 * - If explicit sum > 100%, progress is not calculated (error).
 * - If all weights empty, equal split across all milestones; null progress → 0 contribution.
 */
import { NormalizedMilestone } from "./projectNormalizer";

export interface MilestoneWeightDetail {
  id: string;
  name: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  originalWeightPercent: number | null;
  effectiveWeightPercent: number;
  weightSource: "explicit" | "calculated" | "equal_fallback" | "informational" | "excluded_no_progress";
  isIncludedInProgress: boolean;
  completionPercent: number | null;
  contributionPercent: number;
  missingProgress?: boolean;
}

export interface ProjectMilestonesEvaluation {
  weightStatus: "ok" | "warning_under_100_unallocated" | "error_over_100" | "no_milestones" | "warning_missing_progress";
  description: string;
  totalProgressPercent: number | null;
  milestones: MilestoneWeightDetail[];
}

function isExplicitPositiveWeight(m: NormalizedMilestone): boolean {
  return m.weightPercent !== null && m.weightPercent > 0;
}

function isUnweighted(m: NormalizedMilestone): boolean {
  return m.weightPercent === null || m.weightPercent === 0;
}

function buildDetail(
  m: NormalizedMilestone,
  effectiveWeight: number,
  source: MilestoneWeightDetail["weightSource"],
  isIncluded: boolean
): MilestoneWeightDetail {
  const progress = m.progressPercent;
  const missingProgress = progress === null;
  const effectiveProgress = progress === null ? 0 : progress;
  const contr = isIncluded ? (effectiveWeight * effectiveProgress) / 100 : 0;
  return {
    id: m.id,
    name: m.name,
    year: m.year,
    quarter: m.quarter,
    originalWeightPercent: m.weightPercent,
    effectiveWeightPercent: Math.round(effectiveWeight * 100) / 100,
    weightSource: source,
    isIncludedInProgress: isIncluded,
    completionPercent: progress,
    contributionPercent: Math.round(contr * 100) / 100,
    missingProgress
  };
}

export function calculateMilestonesWeightModel(
  milestones: NormalizedMilestone[]
): ProjectMilestonesEvaluation {
  if (!milestones || milestones.length === 0) {
    return {
      weightStatus: "no_milestones",
      description: "В проекте нет вех.",
      totalProgressPercent: null,
      milestones: []
    };
  }

  let explicitWeightSum = 0;
  let explicitCount = 0;
  const unweightedMilestones: NormalizedMilestone[] = [];

  for (const m of milestones) {
    if (isExplicitPositiveWeight(m)) {
      explicitWeightSum += m.weightPercent!;
      explicitCount++;
    } else {
      unweightedMilestones.push(m);
    }
  }

  explicitWeightSum = Math.round(explicitWeightSum * 1000) / 1000;

  if (explicitWeightSum > 100) {
    const details: MilestoneWeightDetail[] = milestones.map(m => {
      const isExplicit = isExplicitPositiveWeight(m);
      return buildDetail(
        m,
        isExplicit ? m.weightPercent! : 0,
        isExplicit ? "explicit" : "excluded_no_progress",
        false
      );
    });

    return {
      weightStatus: "error_over_100",
      description: "Сумма весов по вехам проекта превышает 100%. Проверьте заполнение весов.",
      totalProgressPercent: null,
      milestones: details
    };
  }

  const details: MilestoneWeightDetail[] = [];
  let totalProgressAccumulator = 0;
  let weightStatus: ProjectMilestonesEvaluation["weightStatus"] = "ok";
  let description = "Календарные вехи заполнены корректно.";
  const hasAnyExplicit = explicitCount > 0;
  const hasMissingProgress = milestones.some(m => m.progressPercent === null);

  if (hasAnyExplicit && Math.abs(explicitWeightSum - 100) < 0.001) {
    weightStatus = "ok";
    description = "Календарные вехи заполнены корректно.";

    for (const m of milestones) {
      const isExplicit = isExplicitPositiveWeight(m);
      const detail = buildDetail(
        m,
        isExplicit ? m.weightPercent! : 0,
        isExplicit ? "explicit" : "informational",
        isExplicit
      );
      totalProgressAccumulator += detail.contributionPercent;
      details.push(detail);
    }
  } else if (hasAnyExplicit && explicitWeightSum < 100) {
    const remainingWeight = 100 - explicitWeightSum;

    if (unweightedMilestones.length > 0) {
      weightStatus = hasMissingProgress ? "warning_missing_progress" : "ok";
      description = hasMissingProgress
        ? "Остаток веса распределён на невзвешенные вехи; вехи без факта дают нулевой вклад."
        : "Календарные вехи заполнены корректно.";
      const calculatedWeightPerMilestone = remainingWeight / unweightedMilestones.length;

      for (const m of milestones) {
        const isExplicit = isExplicitPositiveWeight(m);
        let effectiveWeight = 0;
        let source: MilestoneWeightDetail["weightSource"] = "informational";
        let isIncluded = false;

        if (isExplicit) {
          effectiveWeight = m.weightPercent!;
          source = "explicit";
          isIncluded = true;
        } else if (isUnweighted(m)) {
          effectiveWeight = calculatedWeightPerMilestone;
          source = "calculated";
          isIncluded = true;
        }

        const detail = buildDetail(m, effectiveWeight, source, isIncluded);
        totalProgressAccumulator += detail.contributionPercent;
        details.push(detail);
      }
    } else {
      weightStatus = "warning_under_100_unallocated";
      description = "Сумма весов по вехам проекта меньше 100%. Остаток веса не распределен.";

      for (const m of milestones) {
        const isExplicit = isExplicitPositiveWeight(m);
        const detail = buildDetail(
          m,
          isExplicit ? m.weightPercent! : 0,
          isExplicit ? "explicit" : "excluded_no_progress",
          isExplicit
        );
        totalProgressAccumulator += detail.contributionPercent;
        details.push(detail);
      }
    }
  } else {
    // No positive explicit weights — equal split across all milestones
    weightStatus = hasMissingProgress ? "warning_missing_progress" : "ok";
    description = hasMissingProgress
      ? "Веса распределены поровну; вехи без факта дают нулевой вклад."
      : "Календарные вехи заполнены корректно.";
    const equalWeight = 100 / milestones.length;

    for (const m of milestones) {
      const detail = buildDetail(m, equalWeight, "equal_fallback", true);
      totalProgressAccumulator += detail.contributionPercent;
      details.push(detail);
    }
  }

  return {
    weightStatus,
    description,
    totalProgressPercent: Math.round(totalProgressAccumulator * 100) / 100,
    milestones: details
  };
}
