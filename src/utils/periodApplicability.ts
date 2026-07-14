/**
 * Single source of truth for period applicability and project year selection.
 *
 * Semantics (methodology 14.07.2026):
 * - actualProgress / Overview / PDF: completed + current (future excluded even with early fact)
 * - risk: completed only
 * - selectedYear is clamped to the project's real year range (never "first portfolio year" fallback)
 * - after deadline: risk uses lifecycle-weighted progress across all applicable periods
 *
 * Terminology: use "показатель" / indicator — do not introduce KPI naming in new APIs.
 */
import { Project, ProjectEvaluation } from "../types";
import { parseDateSafe } from "./dateUtils";
import { getYearsForProject } from "./overviewYearFiltering";

export type QuarterPeriodStatus =
  | "completed"
  | "current"
  | "future"
  | "outside_project_period";

export type PeriodInclusionMode = "actual" | "risk";

/**
 * Universal period status relative to assessmentDate and project lifecycle.
 */
export function getQuarterPeriodStatus(
  year: number,
  quarter: number | string,
  assessmentDate: string | Date | null | undefined,
  projectStartDate: string | null | undefined,
  projectEndDate: string | null | undefined
): QuarterPeriodStatus {
  const assessDate =
    assessmentDate instanceof Date
      ? assessmentDate
      : (assessmentDate ? parseDateSafe(String(assessmentDate)) : null) || new Date();

  let qIndex = 1;
  const qStr = String(quarter).toUpperCase();
  if (qStr.includes("1") || qStr.includes("Q1")) qIndex = 1;
  else if (qStr.includes("2") || qStr.includes("Q2")) qIndex = 2;
  else if (qStr.includes("3") || qStr.includes("Q3")) qIndex = 3;
  else if (qStr.includes("4") || qStr.includes("Q4")) qIndex = 4;
  else {
    const parsed = parseInt(qStr, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 4) qIndex = parsed;
  }

  const qStart = new Date(year, (qIndex - 1) * 3, 1, 0, 0, 0, 0);
  const qEnd = new Date(year, qIndex * 3, 0, 23, 59, 59, 999);

  const pStart = projectStartDate ? parseDateSafe(projectStartDate) : null;
  const pEnd = projectEndDate ? parseDateSafe(projectEndDate) : null;

  if (pStart) {
    if (pStart.getTime() > qEnd.getTime()) {
      return "outside_project_period";
    }
    if (pEnd && pEnd.getTime() < qStart.getTime()) {
      return "outside_project_period";
    }
  }

  const assessTime = assessDate.getTime();
  if (assessTime < qStart.getTime()) {
    return "future";
  }
  if (assessTime > qEnd.getTime()) {
    return "completed";
  }
  return "current";
}

export function isPeriodIncludedForMode(
  status: QuarterPeriodStatus,
  mode: PeriodInclusionMode
): boolean {
  if (status === "outside_project_period" || status === "future") {
    return false;
  }
  if (mode === "risk") {
    return status === "completed";
  }
  // actual / Overview / PDF
  return status === "completed" || status === "current";
}

/**
 * Assessment date used for progress aggregates when a portfolio/project year is selected.
 *
 * - past years (selectedYear < assessment year): end of that year (YYYY-12-31)
 * - current year: keep the real assessment date
 * - future years (selectedYear > assessment year): keep the real assessment date
 *   so quarters that have not started yet stay "future" and do not enter averages
 *   even if early fact is already filled.
 */
export function resolveEffectiveAssessmentDateForSelectedYear(
  selectedYear: number,
  assessmentDate: string | Date | null | undefined
): string {
  const assessDate =
    assessmentDate instanceof Date
      ? assessmentDate
      : (assessmentDate ? parseDateSafe(String(assessmentDate)) : null) || new Date();

  const assessmentYear = assessDate.getFullYear();
  const assessmentDateStr =
    assessmentDate instanceof Date
      ? `${assessDate.getFullYear()}-${String(assessDate.getMonth() + 1).padStart(2, "0")}-${String(assessDate.getDate()).padStart(2, "0")}`
      : (typeof assessmentDate === "string" && assessmentDate.trim()
          ? assessmentDate.trim().slice(0, 10)
          : `${assessDate.getFullYear()}-${String(assessDate.getMonth() + 1).padStart(2, "0")}-${String(assessDate.getDate()).padStart(2, "0")}`);

  if (selectedYear < assessmentYear) {
    return `${selectedYear}-12-31`;
  }
  return assessmentDateStr;
}

/**
 * Clamp assessment calendar year into a sorted list of real project/portfolio years.
 * - before first year → first
 * - inside range → assessment year if present, else nearest year ≤ assessment year
 * - after last year → last
 *
 * Never falls back to "first year of portfolio" when assessment is after the range.
 */
export function resolveYearWithinAvailableYears(
  availableYears: number[],
  assessmentDate: string | Date | null | undefined
): number {
  const assessDate =
    assessmentDate instanceof Date
      ? assessmentDate
      : (assessmentDate ? parseDateSafe(String(assessmentDate)) : null) || new Date();
  const assessmentYear = assessDate.getFullYear();

  const years = [...new Set(availableYears.filter(y => Number.isFinite(y)))].sort((a, b) => a - b);
  if (years.length === 0) {
    return assessmentYear;
  }

  const first = years[0];
  const last = years[years.length - 1];

  if (assessmentYear < first) {
    return first;
  }
  if (assessmentYear > last) {
    return last;
  }
  if (years.includes(assessmentYear)) {
    return assessmentYear;
  }
  // Assessment year is inside [first, last] numerically but missing from data —
  // pick nearest year ≤ assessmentYear (still within range).
  const notAfter = years.filter(y => y <= assessmentYear);
  return notAfter.length > 0 ? notAfter[notAfter.length - 1] : first;
}

/**
 * Per-project selected year for display / within-lifecycle risk slices.
 * After deadline, risk must use lifecycle progress — selectedYear is display-only then.
 */
export function resolveProjectSelectedYear(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string | Date | null | undefined
): number {
  const availableYears = getYearsForProject(project, evaluation);
  return resolveYearWithinAvailableYears(availableYears, assessmentDate);
}

export function getProjectEndDate(project: Project): Date | null {
  return parseDateSafe(project.deadlineAt || project.endDate || null);
}

export function isAssessmentAfterProjectDeadline(
  project: Project,
  assessmentDate: string | Date | null | undefined
): boolean {
  const assessDate =
    assessmentDate instanceof Date
      ? assessmentDate
      : (assessmentDate ? parseDateSafe(String(assessmentDate)) : null) || new Date();
  const end = getProjectEndDate(project);
  if (!end || isNaN(end.getTime())) return false;
  return assessDate.getTime() > end.getTime();
}

export interface WeightedPeriodProgress {
  progressPercent: number | null;
  planWeightPercent: number;
  factContributionPercent: number;
  itemsCount: number;
}

/**
 * Lifecycle-weighted milestone progress from evaluation.milestoneResults.
 * Weights are preserved (not averaging yearly percentages).
 */
export function getLifecycleMilestoneProgressFromEvaluation(
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string | Date | null | undefined,
  projectStartDate: string | null | undefined,
  projectEndDate: string | null | undefined,
  mode: PeriodInclusionMode
): WeightedPeriodProgress {
  const empty: WeightedPeriodProgress = {
    progressPercent: null,
    planWeightPercent: 0,
    factContributionPercent: 0,
    itemsCount: 0
  };
  if (!evaluation?.milestones?.milestoneResults?.length) {
    return empty;
  }
  if (evaluation.milestones.weightControlStatus === "error") {
    return empty;
  }

  let plan = 0;
  let fact = 0;
  let count = 0;

  for (const m of evaluation.milestones.milestoneResults) {
    if (!m.isIncludedInProgress) continue;
    const status = getQuarterPeriodStatus(
      m.year,
      m.quarter,
      assessmentDate,
      projectStartDate,
      projectEndDate
    );
    if (!isPeriodIncludedForMode(status, mode)) continue;

    plan += m.effectiveWeightPercent || 0;
    fact += m.contributionPercent || 0;
    count++;
  }

  if (plan <= 0) {
    return { progressPercent: null, planWeightPercent: 0, factContributionPercent: 0, itemsCount: count };
  }

  return {
    progressPercent: (fact / plan) * 100,
    planWeightPercent: plan,
    factContributionPercent: fact,
    itemsCount: count
  };
}

/**
 * Average of indicator (показатель) performance for periods included by mode.
 * Future periods are always excluded, even when fact is pre-filled.
 */
export function getLifecycleIndicatorPerformanceFromEvaluation(
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string | Date | null | undefined,
  projectStartDate: string | null | undefined,
  projectEndDate: string | null | undefined,
  mode: PeriodInclusionMode,
  options?: { year?: number | null; quarter?: number | string | null; useCapped?: boolean }
): {
  averagePercent: number | null;
  cappedAveragePercent: number | null;
  calculatedCount: number;
} {
  const none = { averagePercent: null, cappedAveragePercent: null, calculatedCount: 0 };
  if (!evaluation?.indicators?.indicatorResults?.length) {
    return none;
  }

  const useCapped = options?.useCapped !== false;
  const yearFilter = options?.year ?? null;
  const quarterFilter =
    options?.quarter == null
      ? null
      : typeof options.quarter === "number"
        ? `Q${options.quarter}`
        : String(options.quarter).toUpperCase().startsWith("Q")
          ? String(options.quarter).toUpperCase()
          : `Q${options.quarter}`;

  let rawSum = 0;
  let cappedSum = 0;
  let count = 0;

  for (const ind of evaluation.indicators.indicatorResults) {
    if (yearFilter != null && ind.year !== yearFilter) continue;
    if (quarterFilter != null && ind.quarter !== quarterFilter) continue;

    const status = getQuarterPeriodStatus(
      ind.year,
      ind.quarter,
      assessmentDate,
      projectStartDate,
      projectEndDate
    );
    if (!isPeriodIncludedForMode(status, mode)) continue;

    // Server may still store future rows with early facts — never aggregate them
    if (ind.status === "future") continue;
    if (ind.cappedPerformancePercent === null && ind.performancePercent === null) continue;

    const raw = ind.performancePercent;
    const capped = ind.cappedPerformancePercent;
    if (raw === null && capped === null) continue;

    rawSum += raw ?? capped ?? 0;
    cappedSum += capped ?? Math.min(100, Math.max(0, raw ?? 0));
    count++;
  }

  if (count === 0) return none;

  return {
    averagePercent: rawSum / count,
    cappedAveragePercent: cappedSum / count,
    calculatedCount: count
  };
}
