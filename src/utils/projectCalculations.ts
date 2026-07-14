import { Project } from "../types";
import { resolveIndicatorDictionaryItem } from "../../server/services/indicatorDictionary";
import { parseDateSafe } from "./dateUtils";
import { calculateSingleIndicatorPerformance } from "./indicatorPerformance";

/**
 * Safely sanitizes and parses numeric values from input strings.
 * Core fixes: Handles ranges (e.g., "10-20%"), random dashes, percentages, and empty or lone minus signs.
 * Guarantees a return value of 0 instead of NaN in case of configuration errors.
 */
export const sanitizeAndParseFloat = (val: string | number | undefined | null): number => {
  if (val === undefined || val === null) return 0;
  const valStr = val.toString().trim().replace(/,/g, ".");
  if (valStr === "" || valStr.toLowerCase() === "nan") return 0;

  // Handle ranges like "10-20%" or "10 - 20"
  const rangeMatch = valStr.match(/^([\d.]+)\s*-\s*([\d.]+)/);
  if (rangeMatch) {
    const first = parseFloat(rangeMatch[1]);
    const second = parseFloat(rangeMatch[2]);
    if (!isNaN(first) && !isNaN(second)) {
      return (first + second) / 2;
    }
  }

  // Handle potential leading/trailing garbage, but keep main digits, dot, and minus-sign prefix
  const cleaned = valStr.replace(/[^\d.-]/g, "");
  if (
    cleaned === "" ||
    cleaned === "." ||
    cleaned === "-" ||
    cleaned === ".-" ||
    cleaned === "-."
  ) {
    return 0;
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Parses dates in Russian format (DD.MM.YYYY) into safe JS Date objects.
 */
export const parseRussianDate = (dateStr: string | undefined | null): Date | null => {
  if (!dateStr || dateStr.toLowerCase().trim() === "nan") return null;
  const standardized = dateStr.trim().replace(/[,/]/g, '.');
  const parts = standardized.split(".");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed month
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  return null;
};

export const parseProjectDate = (value: string | undefined | null): Date | null => {
  return parseRussianDate(value) || parseDateSafe(value);
};

/**
 * Checks if a specific quarter index (1, 2, 3, 4) of year `year` is overlapping with project lifecycle.
 */
export const isQuarterInProjectLifecycle = (p: Project, qIndex: number, year: number = new Date().getFullYear()): boolean => {
  const qStart = new Date(year, (qIndex - 1) * 3, 1);
  const qEnd = new Date(year, qIndex * 3, 0, 23, 59, 59);

  const pStart = parseProjectDate(p.startDate) || new Date(year, 0, 1);
  const pEnd = parseProjectDate(p.deadlineAt || p.endDate) || new Date(year, 11, 31);

  return pStart <= qEnd && pEnd >= qStart;
};

/**
 * Determines whether the quarter should be processed for milestone calculations.
 */
export const isQuarterActiveForMilestones = (
  namesStr: string,
  progStr: string,
  weightStr: string
): boolean => {
  const namesClean = (namesStr || "").trim().toLowerCase();
  if (!namesClean || namesClean === "nan") return false;

  const progClean = (progStr || "").trim().toLowerCase();
  const weightClean = (weightStr || "").trim().toLowerCase();

  const isProgEmpty = !progClean || progClean === "nan" || progClean === "";
  const isWeightEmpty = !weightClean || weightClean === "nan" || weightClean === "";

  if (isProgEmpty && isWeightEmpty) return false;

  const progParts = progClean.split(";").map((s) => s.trim());
  const weightParts = weightClean.split(";").map((s) => s.trim());

  const allProgEmptyOrNan =
    progParts.length === 0 ||
    progParts.every((p) => {
      if (p === "" || p === "nan") return true;
      const parsed = p.replace(/,/g, ".").replace(/[^\d.-]/g, "");
      return parsed === "" || parsed === "." || parsed === "-";
    });
  const allWeightEmptyOrNan =
    weightParts.length === 0 ||
    weightParts.every((w) => {
      if (w === "" || w === "nan") return true;
      const parsed = w.replace(/,/g, ".").replace(/[^\d.-]/g, "");
      return parsed === "" || parsed === "." || parsed === "-";
    });

  if (allProgEmptyOrNan && allWeightEmptyOrNan) {
    return false;
  }

  return true;
};

/**
 * Determines whether the quarter has configured KPIs and can be calculated.
 */
export const isQuarterActiveForKpi = (
  namesStr: string,
  plansStr: string,
  factsStr: string
): boolean => {
  const namesClean = (namesStr || "").trim().toLowerCase();
  if (!namesClean || namesClean === "nan") return false;

  const names = namesClean.split(";").map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return false;

  const plans = (plansStr || "").split(";").map((s) => s.trim());
  const facts = (factsStr || "").split(";").map((s) => s.trim());

  let hasRealFact = false;
  let hasConfiguredIndicator = false;

  names.forEach((_, index) => {
    const planVal = sanitizeAndParseFloat(plans[index] || "");
    const factRaw = facts[index] ? facts[index].trim() : "";
    const factVal = sanitizeAndParseFloat(factRaw);

    if (planVal > 0) {
      hasConfiguredIndicator = true;
      if (factRaw !== "" && factRaw.toLowerCase() !== "nan" && factVal > 0) {
        hasRealFact = true;
      }
    }
  });

  if (hasConfiguredIndicator && !hasRealFact) {
    return false;
  }

  return true;
};

/**
 * Overall milestones/tasks progress for project across all active quarters.
 */
export const calculateTasksProgressForProject = (
  p: Project,
  assessmentYear: number = new Date().getFullYear()
): number => {
  const m = getMilestoneSummaryMetrics(p, assessmentYear);
  return m.hasData ? m.fact : 0;
};

/**
 * Overall KPIs progress for project across active quarters.
 */
export const calculateKpisProgressForProject = (p: Project): number | null => {
  const i = getIndicatorSummaryMetrics(p);
  return i.hasData ? i.fact : null;
};

/**
 * Calculates milestones progress across the project's entire active lifecycle quarters.
 * Uses dynamic assessment year (defaults to current year).
 */
export const calculateYearMilestonesProgressForProject = (
  p: Project,
  assessmentYear: number = new Date().getFullYear()
): number | null => {
  const norm = getNormalizedMilestonesForYear(p, assessmentYear);
  if (!norm.milestones || norm.milestones.length === 0) return null;
  if (norm.weightControlStatus === "error") return null;
  return norm.totalProgressPercent;
};

/**
 * Aggregate annual indicators progress based only on active quarters that actually have KPIs.
 */
export const calculateYearKpisProgressForProject = (
  p: Project,
  assessmentYear: number = new Date().getFullYear(),
  assessmentDate: Date = new Date()
): number | null => {
  const activeQuartersKpi: number[] = [];

  for (let qIdx = 1; qIdx <= 4; qIdx++) {
    const qProgress = calculateSelectedQuarterKpiProgressForProject(p, qIdx, assessmentYear, assessmentDate);
    if (qProgress !== null) {
      activeQuartersKpi.push(qProgress);
    }
  }

  return activeQuartersKpi.length > 0
    ? activeQuartersKpi.reduce((sum, val) => sum + val, 0) / activeQuartersKpi.length
    : null;
};

export const getRawMilestonesForYear = (p: Project, year: number) => {
  if (p._rawByYear?.[year]?.milestones) {
    return p._rawByYear[year].milestones;
  }
  if (p._dataYear === year || p._dataYear === undefined || p._dataYear === null) {
    return p._rawMilestonesNew || null;
  }
  return null;
};

export const getRawIndicatorsForYear = (p: Project, year: number) => {
  if (p._rawByYear?.[year]?.indicators) {
    return p._rawByYear[year].indicators;
  }
  if (p._dataYear === year || p._dataYear === undefined || p._dataYear === null) {
    return p._rawIndicatorsNew || null;
  }
  return null;
};

export interface NormalizedMilestoneDetail {
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
  periodStatus: "completed" | "current" | "future" | "outside_project_period";
}

const localGetQuarterPeriodStatus = (
  year: number,
  quarter: number | string,
  assessmentDate: string | Date | null | undefined,
  projectStartDate: string | null | undefined,
  projectEndDate: string | null | undefined
): "completed" | "current" | "future" | "outside_project_period" => {
  const assessDate = (assessmentDate instanceof Date)
    ? assessmentDate
    : (assessmentDate ? parseProjectDate(String(assessmentDate)) : null) || new Date();

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

  const pStart = projectStartDate ? parseProjectDate(projectStartDate) : null;
  const pEnd = projectEndDate ? parseProjectDate(projectEndDate) : null;

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
};

export const getNormalizedMilestonesForYear = (
  p: Project,
  year: number,
  assessmentDateStr: string = new Date().toISOString().split('T')[0]
) => {
  const rawM = getRawMilestonesForYear(p, year);
  if (!rawM) {
    return {
      milestones: [] as NormalizedMilestoneDetail[],
      weightControlStatus: "not_applicable" as const,
      totalProgressPercent: null as number | null,
      actualProgressPercent: null as number | null
    };
  }

  const rawMilestones: Array<{
    id: string;
    name: string;
    quarter: "Q1" | "Q2" | "Q3" | "Q4";
    year: number;
    originalWeightPercent: number | null;
    progressPercent: number | null;
    periodStatus: "completed" | "current" | "future" | "outside_project_period";
  }> = [];

  const isValidRawValue = (str: string | null | undefined): boolean => {
    if (str === null || str === undefined) return false;
    const cleaned = str.trim().toLowerCase();
    if (!cleaned || cleaned === "nan" || cleaned === "—" || cleaned === "--" || cleaned === "-" || cleaned === "нет" || cleaned === "n/a" || cleaned === "н/д") {
      return false;
    }
    const dotStr = cleaned.replace(/,/g, ".");
    const withoutPercent = dotStr.replace(/%/g, "").trim();
    return !isNaN(parseFloat(withoutPercent));
  };

  const isExplicitWeightVal = (str: string | null | undefined): boolean => {
    if (str === null || str === undefined) return false;
    const cleaned = str.trim().toLowerCase();
    if (!cleaned || cleaned === "nan" || cleaned === "—" || cleaned === "--" || cleaned === "-" || cleaned === "нет" || cleaned === "n/a" || cleaned === "н/д") {
      return false;
    }
    const dotStr = cleaned.replace(/,/g, ".");
    const withoutPercent = dotStr.replace(/%/g, "").trim();
    const parsed = parseFloat(withoutPercent);
    if (isNaN(parsed)) return false;
    return parsed > 0;
  };

  for (let q = 1; q <= 4; q++) {
    if (!isQuarterInProjectLifecycle(p, q, year)) {
      continue;
    }

    const qKey = `q${q}` as 'q1' | 'q2' | 'q3' | 'q4';
    const namesStr = rawM[`${qKey}names`] || "";
    const progStr = rawM[`${qKey}progress`] || "";
    const weightStr = rawM[`${qKey}weights`] || "";

    const names = namesStr.split(/[;\n\r]+/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0 || namesStr.toLowerCase() === "nan") {
      continue;
    }

    const progresses = progStr.split(/[;\n\r]+/).map((s) => s.trim());
    const weights = weightStr.split(/[;\n\r]+/).map((s) => s.trim());

    names.forEach((name, index) => {
      const pStr = progresses[index] || "";
      const wStr = weights[index] || "";

      const hasProgress = isValidRawValue(pStr);
      const progressPercent = hasProgress ? sanitizeAndParseFloat(pStr) : null;

      const hasWeight = isExplicitWeightVal(wStr);
      const originalWeightPercent = hasWeight ? sanitizeAndParseFloat(wStr) : null;

      rawMilestones.push({
        id: `raw-milestone-${year}-Q${q}-${index}`,
        name,
        quarter: `Q${q}` as "Q1" | "Q2" | "Q3" | "Q4",
        year,
        originalWeightPercent,
        progressPercent,
        periodStatus: localGetQuarterPeriodStatus(year, q, assessmentDateStr, p.startDate, p.deadlineAt || p.endDate)
      });
    });
  }

  if (rawMilestones.length === 0) {
    return {
      milestones: [] as NormalizedMilestoneDetail[],
      weightControlStatus: "not_applicable" as const,
      totalProgressPercent: null,
      actualProgressPercent: null
    };
  }

  // Weight model (aligned with server/services/milestoneWeightModel.ts):
  // - residual (<100%) → split across ALL unweighted milestones (incl. missing progress);
  // - missing progress → included with contribution 0%, not excluded from the weight pool.
  let explicitWeightSum = 0;
  let explicitCount = 0;
  const unweightedMilestones: typeof rawMilestones = [];

  rawMilestones.forEach(m => {
    if (m.originalWeightPercent !== null) {
      explicitWeightSum += m.originalWeightPercent;
      explicitCount++;
    } else {
      unweightedMilestones.push(m);
    }
  });

  explicitWeightSum = Math.round(explicitWeightSum * 1000) / 1000;

  const details: NormalizedMilestoneDetail[] = [];
  let totalProgressAccumulator = 0;
  let weightControlStatus: "ok" | "warning" | "error" = "ok";
  const hasMissingProgress = rawMilestones.some(m => m.progressPercent === null);

  if (explicitWeightSum > 100) {
    weightControlStatus = "error";
    rawMilestones.forEach(m => {
      const isExplicit = m.originalWeightPercent !== null;
      details.push({
        ...m,
        effectiveWeightPercent: isExplicit ? m.originalWeightPercent! : 0,
        weightSource: isExplicit ? "explicit" : "excluded_no_progress",
        isIncludedInProgress: false,
        completionPercent: m.progressPercent,
        contributionPercent: 0
      });
    });

    return {
      milestones: details,
      weightControlStatus,
      totalProgressPercent: null,
      actualProgressPercent: null
    };
  }

  const hasAnyExplicit = explicitCount > 0;

  // Case A: Explicit weight summation equals exactly 100%
  if (hasAnyExplicit && Math.abs(explicitWeightSum - 100) < 0.001) {
    weightControlStatus = "ok";
    rawMilestones.forEach(m => {
      const isExplicit = m.originalWeightPercent !== null;
      let effectiveWeight = 0;
      let source: NormalizedMilestoneDetail["weightSource"] = "informational";
      let isIncluded = false;

      if (isExplicit) {
        effectiveWeight = m.originalWeightPercent!;
        source = "explicit";
        isIncluded = true;
      }

      const effectiveProgress = m.progressPercent === null ? 0 : m.progressPercent;
      const contr = isIncluded ? (effectiveWeight * effectiveProgress) / 100 : 0;
      totalProgressAccumulator += contr;

      details.push({
        ...m,
        effectiveWeightPercent: Math.round(effectiveWeight * 100) / 100,
        weightSource: source,
        isIncludedInProgress: isIncluded,
        completionPercent: m.progressPercent,
        contributionPercent: Math.round(contr * 100) / 100
      });
    });

  // Case B: Explicit weights sum to less than 100%
  } else if (hasAnyExplicit && explicitWeightSum < 100) {
    const remainingWeight = 100 - explicitWeightSum;
    const countOfUnweighted = unweightedMilestones.length;

    if (countOfUnweighted > 0) {
      // Residual → ALL unweighted (with or without progress). Missing fact = 0% contribution.
      weightControlStatus = hasMissingProgress ? "warning" : "ok";
      const calculatedWeightPerMilestone = remainingWeight / countOfUnweighted;

      rawMilestones.forEach(m => {
        const isExplicit = m.originalWeightPercent !== null;
        let effectiveWeight = 0;
        let source: NormalizedMilestoneDetail["weightSource"] = "informational";
        let isIncluded = false;

        if (isExplicit) {
          effectiveWeight = m.originalWeightPercent!;
          source = "explicit";
          isIncluded = true;
        } else {
          effectiveWeight = calculatedWeightPerMilestone;
          source = "calculated";
          isIncluded = true;
        }

        const effectiveProgress = m.progressPercent === null ? 0 : m.progressPercent;
        const contr = isIncluded ? (effectiveWeight * effectiveProgress) / 100 : 0;
        totalProgressAccumulator += contr;

        details.push({
          ...m,
          effectiveWeightPercent: Math.round(effectiveWeight * 100) / 100,
          weightSource: source,
          isIncludedInProgress: isIncluded,
          completionPercent: m.progressPercent,
          contributionPercent: Math.round(contr * 100) / 100
        });
      });
    } else {
      // No unweighted milestones to receive residual — keep explicit weights, do not renormalize.
      weightControlStatus = "warning";
      rawMilestones.forEach(m => {
        const isExplicit = m.originalWeightPercent !== null;
        const effectiveWeight = isExplicit ? m.originalWeightPercent! : 0;
        const effectiveProgress = m.progressPercent === null ? 0 : m.progressPercent;
        const contr = isExplicit ? (effectiveWeight * effectiveProgress) / 100 : 0;
        totalProgressAccumulator += contr;

        details.push({
          ...m,
          effectiveWeightPercent: Math.round(effectiveWeight * 100) / 100,
          weightSource: isExplicit ? "explicit" : "excluded_no_progress",
          isIncludedInProgress: isExplicit,
          completionPercent: m.progressPercent,
          contributionPercent: Math.round(contr * 100) / 100
        });
      });
    }

  // Case C: No explicit weights defined at all
  } else {
    weightControlStatus = hasMissingProgress ? "warning" : "ok";
    const equalWeight = 100 / rawMilestones.length;

    rawMilestones.forEach(m => {
      const effectiveWeight = equalWeight;
      const effectiveProgress = m.progressPercent === null ? 0 : m.progressPercent;
      const contr = (effectiveWeight * effectiveProgress) / 100;
      totalProgressAccumulator += contr;

      details.push({
        ...m,
        effectiveWeightPercent: Math.round(effectiveWeight * 100) / 100,
        weightSource: "equal_fallback",
        isIncludedInProgress: true,
        completionPercent: m.progressPercent,
        contributionPercent: Math.round(contr * 100) / 100
      });
    });
  }

  // Compute actualProgressPercent (progress for completed and current periods only!)
  let actualWeightSum = 0;
  let actualContributionSum = 0;
  let actualCount = 0;

  details.forEach(m => {
    if (m.periodStatus === "completed" || m.periodStatus === "current") {
      actualCount++;
      if (m.isIncludedInProgress) {
        actualWeightSum += m.effectiveWeightPercent;
        actualContributionSum += (m.effectiveWeightPercent * (m.completionPercent ?? 0)) / 100;
      }
    }
  });

  const actualProgressPercent = actualWeightSum > 0 ? (actualContributionSum / actualWeightSum) * 100 : 0;

  return {
    milestones: details,
    weightControlStatus,
    totalProgressPercent: Math.round(totalProgressAccumulator * 10) / 10,
    actualProgressPercent: actualCount > 0 ? Math.round(actualProgressPercent * 10) / 10 : null
  };
};

export const getRawMilestonesListForPeriod = (
  p: Project,
  selectedYear: number,
  selectedQuarter: number | null
) => {
  const norm = getNormalizedMilestonesForYear(p, selectedYear);
  const items = selectedQuarter === null 
    ? norm.milestones 
    : norm.milestones.filter(m => m.quarter === `Q${selectedQuarter}`);

  return items.map(m => ({
    id: m.id,
    title: m.name,
    quarter: m.quarter,
    weight: m.effectiveWeightPercent,
    originalWeightPercent: m.originalWeightPercent,
    effectiveWeightPercent: m.effectiveWeightPercent,
    weightSource: m.weightSource === "excluded_no_progress" ? "calculated" as const : (m.weightSource as any),
    completionPercent: m.completionPercent,
    progressPercent: m.completionPercent
  }));
};

/**
 * Selected Quarter Milestones progress helper.
 * Future quarters relative to assessmentDate are excluded.
 */
export const calculateSelectedQuarterMilestonesProgressForProject = (
  p: Project,
  q: number,
  assessmentYear: number = new Date().getFullYear(),
  assessmentDate: Date | string = new Date()
): number | null => {
  if (!isQuarterInProjectLifecycle(p, q, assessmentYear)) return null;

  const assessDate =
    assessmentDate instanceof Date
      ? assessmentDate
      : (assessmentDate ? parseProjectDate(String(assessmentDate)) : null) || new Date();

  if (!isQuarterApplicableForProject(p, q, assessmentYear, assessDate)) {
    return null;
  }

  const assessDateStr =
    `${assessDate.getFullYear()}-${String(assessDate.getMonth() + 1).padStart(2, "0")}-${String(assessDate.getDate()).padStart(2, "0")}`;

  const norm = getNormalizedMilestonesForYear(p, assessmentYear, assessDateStr);
  if (!norm.milestones || norm.milestones.length === 0) return null;
  if (norm.weightControlStatus === "error") return null;

  const qMilestones = norm.milestones.filter(m => m.quarter === `Q${q}` && m.isIncludedInProgress);
  if (qMilestones.length === 0) return null;

  const planSum = qMilestones.reduce((sum, m) => sum + (m.effectiveWeightPercent || 0), 0);
  const factSum = qMilestones.reduce((sum, m) => sum + (m.contributionPercent || 0), 0);

  if (planSum <= 0) return null;
  return (factSum / planSum) * 100;
};

/**
 * Selected Quarter KPI progress helper.
 * Returns `null` if the quarter doesn't have active description names.
 */
export const calculateSelectedQuarterKpiProgressForProject = (
  p: Project,
  q: number,
  assessmentYear: number = new Date().getFullYear(),
  assessmentDate: Date = new Date()
): number | null => {
  if (!isQuarterApplicableForProject(p, q, assessmentYear, assessmentDate)) return null;
  const rawI = getRawIndicatorsForYear(p, assessmentYear);
  if (!rawI) return null;

  const qKey = `q${q}` as 'q1' | 'q2' | 'q3' | 'q4';
  const namesStr = rawI[`${qKey}names`] || "";
  const plansStr = rawI[`${qKey}plans`] || "";
  const factsStr = rawI[`${qKey}facts`] || "";

  const names = namesStr.split(";").map((s) => s.trim()).filter(Boolean);
  if (names.length === 0 || namesStr.toLowerCase().trim() === "nan") {
    return null;
  }

  const plans = plansStr.split(";").map((s) => s.trim());
  const facts = factsStr.split(";").map((s) => s.trim());

  let totalRawPerformance = 0;
  let calculatedCount = 0;

  names.forEach((name, index) => {
    const planStr = plans[index] || "";
    const factStr = facts[index] || "";

    const performanceResult = calculateSingleIndicatorPerformance(name, planStr, factStr);
    if (performanceResult !== null) {
      totalRawPerformance += performanceResult.performancePercent;
      calculatedCount++;
    }
  });

  return calculatedCount > 0 ? totalRawPerformance / calculatedCount : null;
};

export interface TriadMetrics {
  plan: number;
  fact: number;
  deviation: number;
  hasData: boolean;
}

export const getMilestoneSummaryMetrics = (
  p: Project,
  assessmentYear: number = new Date().getFullYear()
): TriadMetrics => {
  const rawM = getRawMilestonesForYear(p, assessmentYear);
  if (!rawM) return { plan: 0, fact: 0, deviation: 0, hasData: false };
  const quarters = ["q1", "q2", "q3", "q4"] as const;
  let totalPlan = 0;
  let totalFact = 0;
  let hasData = false;

  quarters.forEach((q) => {
    const qIndex = Number(q.replace("q", ""));

    if (!isQuarterInProjectLifecycle(p, qIndex, assessmentYear)) {
      return;
    }

    const namesStr = rawM[`${q}names`] || "";
    const progStr = rawM[`${q}progress`] || "";
    const weightStr = rawM[`${q}weights`] || "";

    const names = namesStr.split(";").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0 || namesStr.toLowerCase() === "nan") {
      return;
    }
    
    hasData = true;

    const progresses = progStr.split(";").map((s) => s.trim());
    const weights = weightStr.split(";").map((s) => s.trim());

    // parse weights
    const parsedWeights = names.map((_, i) => {
      const wStr = weights[i] || "";
      return sanitizeAndParseFloat(wStr);
    });

    const totalWeightsSum = parsedWeights.reduce((sum, w) => sum + w, 0);
    let finalWeights = parsedWeights;
    
    if (totalWeightsSum === 0) {
      finalWeights = names.map(() => (names.length > 0 ? 100 / names.length : 0));
    }

    names.forEach((_, index) => {
      const pStr = progresses[index] || "";
      const percent = sanitizeAndParseFloat(pStr);
      const weight = finalWeights[index] || 0;

      totalPlan += weight;
      totalFact += (weight * percent) / 100;
    });
  });

  const normalizedPlan = totalPlan > 0 ? 100 : 0;
  const normalizedFact = totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0;

  return {
    plan: normalizedPlan,
    fact: normalizedFact,
    deviation: normalizedFact - normalizedPlan,
    hasData: hasData && totalPlan > 0
  };
};

export const getIndicatorSummaryMetrics = (p: Project): TriadMetrics => {
  if (!p._rawIndicatorsNew) return { plan: 100, fact: 0, deviation: -100, hasData: false };
  const quarters = ["q1", "q2", "q3", "q4"] as const;
  let totalFactProgress = 0;
  let indicatorsCount = 0;

  quarters.forEach((q) => {
    const namesStr = p._rawIndicatorsNew?.[`${q}names`] || "";
    const plansStr = p._rawIndicatorsNew?.[`${q}plans`] || "";
    const factsStr = p._rawIndicatorsNew?.[`${q}facts`] || "";

    const names = namesStr.split(";").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0 || namesStr.toLowerCase() === "nan") {
      return;
    }

    const plans = plansStr.split(";").map((s) => s.trim());
    const facts = factsStr.split(";").map((s) => s.trim());

    names.forEach((name, index) => {
      const planStr = plans[index] || "";
      const factStr = facts[index] || "";

      const performanceResult = calculateSingleIndicatorPerformance(name, planStr, factStr);
      if (performanceResult !== null) {
        totalFactProgress += performanceResult.performancePercent;
        indicatorsCount++;
      }
    });
  });

  if (indicatorsCount === 0) {
    return { plan: 100, fact: 0, deviation: -100, hasData: false };
  }

  const averagePlan = 100;
  const averageFact = totalFactProgress / indicatorsCount;

  return {
    plan: averagePlan,
    fact: averageFact,
    deviation: averageFact - averagePlan,
    hasData: true
  };
};

/**
 * Checks if a specific quarter q (1..4) in a certain year is applicable for a project p.
 * Applies:
 * - Today's or custom selected assessmentDate (future quarters relative to assessmentDate are excluded).
 * - startDate and endDate boundaries of the project.
 */
export const isQuarterApplicableForProject = (
  p: Project,
  q: number,
  assessmentYear: number,
  assessmentDate: Date
): boolean => {
  const qStart = new Date(assessmentYear, (q - 1) * 3, 1);
  const qEnd = new Date(assessmentYear, q * 3, 0, 23, 59, 59);

  // Future quarters relative to assessmentDate are NOT applicable.
  if (qStart > assessmentDate) {
    return false;
  }

  // Parse start/end dates. If not specified, default to the year boundaries.
  const pStart = parseProjectDate(p.startDate) || new Date(assessmentYear, 0, 1);
  const pEnd = parseProjectDate(p.deadlineAt || p.endDate) || new Date(assessmentYear, 11, 31);

  // Overlap condition: start not later than end of quarter, end not earlier than start of quarter
  return pStart <= qEnd && pEnd >= qStart;
};

/**
 * Calculates milestone completion percent for department charts with respect to applicable quarters.
 * Uses the same weight model as getNormalizedMilestonesForYear (residual → all unweighted;
 * missing progress → weight kept, contribution 0%). Future / non-applicable quarters excluded.
 */
export const calculateMilestonesProgressForProjectDepts = (
  p: Project,
  assessmentYear: number,
  assessmentDate: Date
): number | null => {
  const assessDateStr =
    assessmentDate instanceof Date && !isNaN(assessmentDate.getTime())
      ? `${assessmentDate.getFullYear()}-${String(assessmentDate.getMonth() + 1).padStart(2, "0")}-${String(assessmentDate.getDate()).padStart(2, "0")}`
      : new Date().toISOString().split("T")[0];

  const norm = getNormalizedMilestonesForYear(p, assessmentYear, assessDateStr);
  if (!norm.milestones || norm.milestones.length === 0) return null;
  if (norm.weightControlStatus === "error") return null;

  let planSum = 0;
  let factSum = 0;

  for (const m of norm.milestones) {
    if (!m.isIncludedInProgress) continue;
    const qNum = parseInt(String(m.quarter).replace("Q", ""), 10);
    if (!isQuarterApplicableForProject(p, qNum, assessmentYear, assessmentDate)) {
      continue;
    }
    planSum += m.effectiveWeightPercent || 0;
    factSum += m.contributionPercent || 0;
  }

  if (planSum <= 0) return null;
  return (factSum / planSum) * 100;
};

/**
 * Calculates KPI/indicator progress for department charts with respect to applicable quarters.
 * Returns raw (can be above 100%) and capped (up to 100%) averages, or null if no indicators exist.
 */
export const calculateKpiProgressForProjectDepts = (
  p: Project,
  assessmentYear: number,
  assessmentDate: Date
): { raw: number; capped: number } | null => {
  const rawI = getRawIndicatorsForYear(p, assessmentYear);
  if (!rawI) return null;

  let totalRawPerformance = 0;
  let totalCappedPerformance = 0;
  let calculatedCount = 0;

  for (let q = 1; q <= 4; q++) {
    if (!isQuarterApplicableForProject(p, q, assessmentYear, assessmentDate)) {
      continue;
    }

    const qKey = `q${q}` as 'q1' | 'q2' | 'q3' | 'q4';
    const namesStr = rawI[`${qKey}names`] || "";
    const plansStr = rawI[`${qKey}plans`] || "";
    const factsStr = rawI[`${qKey}facts`] || "";

    const names = namesStr.split(";").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0 || namesStr.toLowerCase().trim() === "nan") {
      continue;
    }

    const plans = plansStr.split(";").map((s) => s.trim());
    const facts = factsStr.split(";").map((s) => s.trim());

    names.forEach((name, index) => {
      const planStr = plans[index] || "";
      const factStr = facts[index] || "";

      const performanceResult = calculateSingleIndicatorPerformance(name, planStr, factStr);
      if (performanceResult !== null) {
        totalRawPerformance += performanceResult.performancePercent;
        totalCappedPerformance += performanceResult.cappedPerformancePercent;
        calculatedCount++;
      }
    });
  }

  if (calculatedCount === 0) {
    return null;
  }

  return {
    raw: totalRawPerformance / calculatedCount,
    capped: totalCappedPerformance / calculatedCount
  };
};

