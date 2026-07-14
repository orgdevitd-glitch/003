import { Project, ProjectEvaluation } from '../types';
import { parseDateSafe, formatDateSafe } from './dateUtils';
import {
  getMilestoneSummaryMetrics,
  getIndicatorSummaryMetrics,
  getRawMilestonesForYear,
  getRawIndicatorsForYear,
  sanitizeAndParseFloat,
  calculateYearMilestonesProgressForProject,
  getNormalizedMilestonesForYear,
  isQuarterInProjectLifecycle,
  isQuarterActiveForMilestones
} from './projectCalculations';
import { getMilestoneYearCompletionMetricsFromEvaluation } from './evaluationMilestoneMetrics';
import {
  getQuarterPeriodStatus,
  resolveProjectSelectedYear,
  isAssessmentAfterProjectDeadline,
  getLifecycleMilestoneProgressFromEvaluation,
  getLifecycleIndicatorPerformanceFromEvaluation,
  isPeriodIncludedForMode
} from './periodApplicability';
import { getYearsForProject } from './overviewYearFiltering';
import { normalizeProjectStage } from './projectStageStyles';

export { getQuarterPeriodStatus, resolveProjectSelectedYear } from './periodApplicability';
export type { QuarterPeriodStatus, PeriodInclusionMode } from './periodApplicability';

export const TARGET_COMPLETENESS_PERCENT = 90;
export const CRITICAL_COMPLETENESS_PERCENT = 50;

export function getProjectCompletenessPercent(
  evaluation: ProjectEvaluation | null | undefined
): number | null {
  return evaluation?.dataQuality?.completenessPercent ?? null;
}

/**
 * Helper to calculate base and next PC dates using strictly the specified monitoring fields:
 * - lastPcDate
 * - monitoringStart
 * Note: startDate or createdAt must NOT be used.
 */
export function getPcBaseAndNextDate(
  project: Project
): { baseDate: Date; nextPcDate: Date; freqWeeks: number } | null {
  const baseDateStr = project.lastPcDate || project.monitoringStart;
  const baseDate = baseDateStr ? parseDateSafe(baseDateStr) : null;
  const freqWeeks = project.monitoringFrequencyWeeks;

  if (!baseDate || typeof freqWeeks !== 'number' || freqWeeks <= 0) {
    return null;
  }

  const nextPcDate = new Date(baseDate.getTime() + freqWeeks * 7 * 24 * 60 * 60 * 1000);
  return { baseDate, nextPcDate, freqWeeks };
}

/**
 * Gets the PC (progress-control) status view for the registry tab
 */
export function getRegistryPcStatusView(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): 'Своевременно' | 'Просрочен' | 'Недостаточно данных' | 'Не применяется' {
  const status = getProjectMonitoringStatus(project, assessmentDate);
  if (status === 'not_applicable') {
    return 'Не применяется';
  }
  return status;
}

export type ProjectMonitoringStatus = 'Своевременно' | 'Просрочен' | 'Недостаточно данных' | 'not_applicable';

/**
 * PC / monitoring timeliness.
 *
 * Overview block inclusion: only stage "В работе".
 * For "В работе", project is timely (green) when:
 * - assessment is before project start, OR
 * - assessment is after project end (and stage is still not "Завершен"), OR
 * - monitoring start has not yet arrived.
 * Otherwise timeliness is computed from last PC (or monitoring start) + frequency.
 * Missing data for next PC date → "Недостаточно данных".
 */
export function getProjectMonitoringStatus(
  project: Project,
  assessmentDate: string
): ProjectMonitoringStatus {
  const stage = normalizeProjectStage(project.stage, project.status);
  if (stage !== "В работе") {
    return "not_applicable";
  }

  const assessDate = parseDateSafe(assessmentDate) || new Date();
  const assessMidnight = new Date(
    assessDate.getFullYear(),
    assessDate.getMonth(),
    assessDate.getDate()
  ).getTime();

  const pStart = project.startDate ? parseDateSafe(project.startDate) : null;
  const pEndStr = project.deadlineAt || project.endDate;
  const pEnd = pEndStr ? parseDateSafe(pEndStr) : null;

  if (pStart && !isNaN(pStart.getTime())) {
    const startMidnight = new Date(
      pStart.getFullYear(),
      pStart.getMonth(),
      pStart.getDate()
    ).getTime();
    if (assessMidnight < startMidnight) {
      return "Своевременно";
    }
  }

  if (pEnd && !isNaN(pEnd.getTime())) {
    const endMidnight = new Date(
      pEnd.getFullYear(),
      pEnd.getMonth(),
      pEnd.getDate()
    ).getTime();
    if (assessMidnight > endMidnight) {
      // Stage is still "В работе" (not "Завершен") — count as timely in the block.
      return "Своевременно";
    }
  }

  const monStartStr = project.monitoringStart;
  const monStart = monStartStr ? parseDateSafe(monStartStr) : null;

  if (!monStart || isNaN(monStart.getTime())) {
    return "Недостаточно данных";
  }

  const monStartMidnight = new Date(
    monStart.getFullYear(),
    monStart.getMonth(),
    monStart.getDate()
  ).getTime();

  if (monStartMidnight > assessMidnight) {
    return "Своевременно";
  }

  const regularity = project.monitoringFrequencyWeeks;
  if (regularity === undefined || regularity === null || isNaN(regularity) || regularity <= 0) {
    return "Недостаточно данных";
  }

  const lastPcStr = project.lastPcDate;
  const lastPc = lastPcStr ? parseDateSafe(lastPcStr) : null;
  const baseDate = lastPc && !isNaN(lastPc.getTime()) ? lastPc : monStart;

  const baseMidnight = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate()
  ).getTime();
  const nextPcMidnight = baseMidnight + regularity * 7 * 24 * 60 * 60 * 1000;

  if (nextPcMidnight < assessMidnight) {
    return "Просрочен";
  }
  return "Своевременно";
}

export function isRegistryDataInsufficient(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): boolean {
  if (!evaluation) {
    const pcStatus = getRegistryPcStatusView(project, null, assessmentDate);
    const assessDate = parseDateSafe(assessmentDate) || new Date();
    const assessYear = assessDate.getFullYear();

    const milestoneMetrics = getMilestoneSummaryMetrics(project, assessYear);
    const indicatorMetrics = getIndicatorSummaryMetrics(project);

    const hasPcSignal = pcStatus !== 'Недостаточно данных';
    const hasMilestoneSignal = milestoneMetrics.hasData;
    const hasIndicatorSignal = indicatorMetrics.hasData;

    return !(hasPcSignal || hasMilestoneSignal || hasIndicatorSignal);
  }

  const pcStatus = getRegistryPcStatusView(project, evaluation, assessmentDate);

  const hasMilestoneSignal =
    evaluation.milestones?.actualProgressPercent !== null &&
    evaluation.milestones?.actualProgressPercent !== undefined;

  const hasIndicatorSignal =
    (evaluation.indicators?.cappedAveragePerformancePercent !== null &&
      evaluation.indicators?.cappedAveragePerformancePercent !== undefined) ||
    (evaluation.indicators?.averagePerformancePercent !== null &&
      evaluation.indicators?.averagePerformancePercent !== undefined);

  const hasPcSignal = pcStatus !== 'Недостаточно данных';

  const hasDataQualitySignal =
    evaluation.dataQuality?.completenessPercent !== null &&
    evaluation.dataQuality?.completenessPercent !== undefined;

  return !(
    hasMilestoneSignal ||
    hasIndicatorSignal ||
    hasPcSignal ||
    hasDataQualitySignal
  );
}

const calculateCompletedQuartersMilestonesProgress = (p: Project, assessmentYear: number, assessDate: Date): number | null => {
  const assessDateStr = assessDate.toISOString().split('T')[0];
  const norm = getNormalizedMilestonesForYear(p, assessmentYear, assessDateStr);
  if (!norm.milestones || norm.milestones.length === 0) return null;
  if (norm.weightControlStatus === "error") return null;

  const completedQuarters = [1, 2, 3, 4].filter(q => 
    getQuarterPeriodStatus(assessmentYear, q, assessDate, p.startDate, p.deadlineAt || p.endDate) === "completed"
  );

  const completedMilestones = norm.milestones.filter(m => {
    const qNum = parseInt(m.quarter.replace("Q", ""), 10);
    return completedQuarters.includes(qNum) && m.isIncludedInProgress;
  });

  if (completedMilestones.length === 0) return null;

  const planSum = completedMilestones.reduce((sum, m) => sum + (m.effectiveWeightPercent || 0), 0);
  const factSum = completedMilestones.reduce((sum, m) => sum + (m.contributionPercent || 0), 0);

  if (planSum <= 0) return null;
  return (factSum / planSum) * 100;
};

/** Weighted milestone progress across all project years (raw path; same inclusion modes as evaluation). */
const calculateLifecycleMilestonesProgressFromRaw = (
  p: Project,
  assessDate: Date,
  mode: "actual" | "risk"
): number | null => {
  const assessDateStr = assessDate.toISOString().split("T")[0];
  const years = getYearsForProject(p, null);
  let planSum = 0;
  let factSum = 0;

  for (const year of years) {
    const norm = getNormalizedMilestonesForYear(p, year, assessDateStr);
    if (!norm.milestones?.length || norm.weightControlStatus === "error") continue;

    for (const m of norm.milestones) {
      if (!m.isIncludedInProgress) continue;
      const status = getQuarterPeriodStatus(
        year,
        m.quarter,
        assessDate,
        p.startDate,
        p.deadlineAt || p.endDate
      );
      if (!isPeriodIncludedForMode(status, mode)) continue;
      planSum += m.effectiveWeightPercent || 0;
      factSum += m.contributionPercent || 0;
    }
  }

  if (planSum <= 0) return null;
  return (factSum / planSum) * 100;
};

const countLifecycleOverdueMilestonesFromRaw = (p: Project, assessDate: Date): number => {
  const assessDateStr = assessDate.toISOString().split("T")[0];
  const years = getYearsForProject(p, null);
  let overdue = 0;

  for (const year of years) {
    const norm = getNormalizedMilestonesForYear(p, year, assessDateStr);
    for (const m of norm.milestones || []) {
      if (!m.isIncludedInProgress) continue;
      const status = getQuarterPeriodStatus(
        year,
        m.quarter,
        assessDate,
        p.startDate,
        p.deadlineAt || p.endDate
      );
      if (status !== "completed") continue;
      if (m.completionPercent === null || m.completionPercent < 100) overdue++;
    }
  }
  return overdue;
};

export interface UnifiedRiskResult {
  riskLevel: 'Низкий' | 'Средний' | 'Высокий' | 'Недостаточно данных';
  registryStatus: 'Норма' | 'Зона риска' | 'Недостаточно данных';
  reasons: string[];
  reasonsText: string;
  details: {
    milestoneActualProgressForRisk: number | null;
    indicatorsCappedPerformanceForRisk: number | null;
    totalOverdueMilestones: number;
    pcOverdueDays: number;
    pcStatus: 'Своевременно' | 'Просрочен' | 'Недостаточно данных' | 'Не применяется';
    isDeadlineOverdue: boolean;
    completenessPercent: number | null;
    errorsCount: number;
    hasWeightControlError: boolean;
  };
  eligibleMilestonePeriods: Array<{ year: number; quarter: number }>;
  eligibleIndicatorPeriods: Array<{ year: number; quarter: number }>;
  ignoredFuturePeriods: Array<{ year: number; quarter: number; type: 'milestone' | 'indicator' }>;
  ignoredCurrentPeriods: Array<{ year: number; quarter: number; type: 'milestone' | 'indicator' }>;
}

export function calculateUnifiedProjectRisk(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string,
  useRegistryThresholds: boolean = true
): UnifiedRiskResult {
  const assessDate = parseDateSafe(assessmentDate) || new Date();

  const highThreshold = useRegistryThresholds ? 10 : 25;
  const medThreshold = useRegistryThresholds ? 5 : 10;

  // 1. Determine years to process
  const detectedYears: number[] = [];
  if (project._rawByYear) {
    Object.keys(project._rawByYear).forEach(y => {
      const parsedY = Number(y);
      if (!isNaN(parsedY)) detectedYears.push(parsedY);
    });
  }
  if (detectedYears.length === 0) {
    const currentY = assessDate.getFullYear();
    detectedYears.push(project._dataYear || currentY);
  }

  const eligibleMilestonePeriods: Array<{ year: number; quarter: number }> = [];
  const eligibleIndicatorPeriods: Array<{ year: number; quarter: number; names: string[]; plans: string[]; facts: string[] }> = [];
  
  const ignoredFuturePeriods: Array<{ year: number; quarter: number; type: 'milestone' | 'indicator' }> = [];
  const ignoredCurrentPeriods: Array<{ year: number; quarter: number; type: 'milestone' | 'indicator' }> = [];

  const pStartStr = project.startDate;
  const pEndStr = project.deadlineAt || project.endDate;

  // Process Milestones
  detectedYears.forEach(year => {
    const rawM = getRawMilestonesForYear(project, year);
    for (let q = 1; q <= 4; q++) {
      const qKey = `q${q}` as 'q1' | 'q2' | 'q3' | 'q4';
      const namesStr = rawM ? (rawM[`${qKey}names`] || "") : "";

      const names = namesStr.split(";").map(s => s.trim()).filter(Boolean);
      if (names.length === 0 || namesStr.toLowerCase() === "nan") {
        continue;
      }

      const status = getQuarterPeriodStatus(year, q, assessDate, pStartStr, pEndStr);

      if (status === "outside_project_period") {
        continue;
      }
      if (status === "future") {
        ignoredFuturePeriods.push({ year, quarter: q, type: 'milestone' });
        continue;
      }
      if (status === "current") {
        ignoredCurrentPeriods.push({ year, quarter: q, type: 'milestone' });
        continue;
      }

      // Completed
      eligibleMilestonePeriods.push({
        year,
        quarter: q
      });
    }
  });

  // Process Indicators
  detectedYears.forEach(year => {
    const rawI = getRawIndicatorsForYear(project, year);
    for (let q = 1; q <= 4; q++) {
      const qKey = `q${q}` as 'q1' | 'q2' | 'q3' | 'q4';
      const namesStr = rawI ? (rawI[`${qKey}names`] || "") : "";
      const plansStr = rawI ? (rawI[`${qKey}plans`] || "") : "";
      const factsStr = rawI ? (rawI[`${qKey}facts`] || "") : "";

      const names = namesStr.split(";").map(s => s.trim()).filter(Boolean);
      if (names.length === 0 || namesStr.toLowerCase() === "nan") {
        continue;
      }

      const status = getQuarterPeriodStatus(year, q, assessDate, pStartStr, pEndStr);

      if (status === "outside_project_period") {
        continue;
      }
      if (status === "future") {
        ignoredFuturePeriods.push({ year, quarter: q, type: 'indicator' });
        continue;
      }
      if (status === "current") {
        ignoredCurrentPeriods.push({ year, quarter: q, type: 'indicator' });
        continue;
      }

      // Completed
      const plans = plansStr.split(";").map(s => s.trim());
      const facts = factsStr.split(";").map(s => s.trim());

      eligibleIndicatorPeriods.push({
        year,
        quarter: q,
        names,
        plans,
        facts
      });
    }
  });

  // Calculate Milestone Actual Progress & Overdue Milestones & Milestone Risk
  // selectedYear is clamped to the project's real year range (display / in-lifecycle slices).
  // After deadline, risk uses lifecycle-weighted progress — selectedYear is display-only then.
  const selectedYear = resolveProjectSelectedYear(project, evaluation, assessmentDate);
  const afterDeadline = isAssessmentAfterProjectDeadline(project, assessmentDate);

  const normMilestones = getNormalizedMilestonesForYear(project, selectedYear, assessmentDate);
  const isMilestonesError = evaluation?.milestones?.weightControlStatus === "error" || normMilestones.weightControlStatus === "error";

  let milestonesYearVal: number | null = null;
  if (isMilestonesError) {
    milestonesYearVal = null;
  } else if (evaluation?.milestones?.milestoneResults && evaluation.milestones.milestoneResults.length > 0) {
    const yMetrics = getMilestoneYearCompletionMetricsFromEvaluation(
      evaluation,
      selectedYear,
      assessmentDate,
      project.startDate,
      project.deadlineAt || project.endDate,
      "actual"
    );
    if (yMetrics.hasData) {
      milestonesYearVal = yMetrics.fact;
    }
  }
  if (milestonesYearVal === null && !isMilestonesError && evaluation?.milestones?.actualProgressPercent !== undefined && evaluation?.milestones?.actualProgressPercent !== null) {
    milestonesYearVal = evaluation.milestones.actualProgressPercent;
  }
  if (milestonesYearVal === null && !isMilestonesError) {
    milestonesYearVal = calculateYearMilestonesProgressForProject(project, selectedYear);
  }

  const startDateObj = project.startDate ? parseDateSafe(project.startDate) : null;
  const endDateObj = (project.deadlineAt || project.endDate) ? parseDateSafe(project.deadlineAt || project.endDate) : null;
  const isCompleted = project.status === 'completed' || project.status === 'cancelled' || project.stage === 'Завершен' || project.stage === 'completed';

  let milestoneActualProgressForRisk: number | null = null;
  let totalOverdueMilestones = 0;
  let milestonesRisk: 'Низкий' | 'Средний' | 'Высокий' = 'Низкий';

  const isStartDateValid = startDateObj !== null && !isNaN(startDateObj.getTime());
  const isEndDateValid = endDateObj !== null && !isNaN(endDateObj.getTime());
  const hasValidDates = isStartDateValid && isEndDateValid;

  if (isCompleted) {
    milestoneActualProgressForRisk = null;
    totalOverdueMilestones = 0;
    milestonesRisk = 'Низкий';
  } else if (isMilestonesError) {
    milestoneActualProgressForRisk = null;
    totalOverdueMilestones = 0;
    milestonesRisk = 'Низкий';
  } else if (hasValidDates) {
    if (assessDate < startDateObj!) {
      milestoneActualProgressForRisk = null;
      totalOverdueMilestones = 0;
      milestonesRisk = 'Низкий';
    } else if (afterDeadline || assessDate > endDateObj!) {
      // Lifecycle-weighted progress across ALL applicable years (not a single year).
      // Prefer evaluation weights; fall back to raw multi-year normalization when evaluation is absent.
      const lifecycle = getLifecycleMilestoneProgressFromEvaluation(
        evaluation,
        assessmentDate,
        project.startDate,
        project.deadlineAt || project.endDate,
        "risk"
      );
      milestoneActualProgressForRisk =
        lifecycle.progressPercent !== null
          ? lifecycle.progressPercent
          : calculateLifecycleMilestonesProgressFromRaw(project, assessDate, "risk");

      if (evaluation?.milestones?.milestoneResults) {
        totalOverdueMilestones = evaluation.milestones.milestoneResults.filter(m => {
          if (!m.isIncludedInProgress) return false;
          const st = getQuarterPeriodStatus(
            m.year,
            m.quarter,
            assessDate,
            project.startDate,
            project.deadlineAt || project.endDate
          );
          if (st !== "completed") return false;
          return m.completionPercent === null || m.completionPercent < 100;
        }).length;
      } else {
        totalOverdueMilestones = countLifecycleOverdueMilestonesFromRaw(project, assessDate);
      }

      if (milestoneActualProgressForRisk !== null && milestoneActualProgressForRisk < 100) {
        const deviation = 100 - milestoneActualProgressForRisk;
        if (deviation >= highThreshold) {
          milestonesRisk = 'Высокий';
        } else if (deviation >= medThreshold) {
          milestonesRisk = 'Средний';
        }
      }
      if (totalOverdueMilestones > 0 && useRegistryThresholds) {
        milestonesRisk = 'Высокий';
      }
    } else {
      // In-lifecycle: risk uses completed quarters only within selectedYear
      const completedQuarters = [1, 2, 3, 4].filter(q => 
        getQuarterPeriodStatus(selectedYear, q, assessDate, project.startDate, project.deadlineAt || project.endDate) === "completed"
      );

      if (completedQuarters.length === 0) {
        milestoneActualProgressForRisk = 100;
        totalOverdueMilestones = 0;
        milestonesRisk = 'Низкий';
      } else {
        let planSum = 0;
        let factSum = 0;
        let hasData = false;

        if (!isMilestonesError && evaluation?.milestones?.milestoneResults && evaluation.milestones.milestoneResults.length > 0) {
          const completedQuarterResults = evaluation.milestones.milestoneResults.filter(m => {
            if (m.year !== selectedYear) return false;
            if (!m.isIncludedInProgress) return false;
            const qNum = parseInt(m.quarter.replace("Q", ""), 10);
            return completedQuarters.includes(qNum);
          });

          if (completedQuarterResults.length > 0) {
            planSum = completedQuarterResults.reduce((sum, m) => sum + (m.effectiveWeightPercent || 0), 0);
            factSum = completedQuarterResults.reduce((sum, m) => sum + (m.contributionPercent || 0), 0);
            hasData = planSum > 0;
          }
        }

        if (hasData) {
          milestoneActualProgressForRisk = (factSum / planSum) * 100;
        } else if (!isMilestonesError) {
          const rawProgress = calculateCompletedQuartersMilestonesProgress(project, selectedYear, assessDate);
          if (rawProgress !== null) {
            milestoneActualProgressForRisk = rawProgress;
          } else {
            milestoneActualProgressForRisk = 100;
          }
        } else {
          milestoneActualProgressForRisk = null;
        }

        if (evaluation?.milestones?.milestoneResults) {
          totalOverdueMilestones = evaluation.milestones.milestoneResults.filter(m => {
            if (m.year !== selectedYear) return false;
            const qNum = parseInt(m.quarter.replace("Q", ""), 10);
            if (!completedQuarters.includes(qNum)) return false;
            return m.completionPercent === null || m.completionPercent < 100;
          }).length;
        } else {
          const norm = getNormalizedMilestonesForYear(project, selectedYear, assessmentDate);
          totalOverdueMilestones = norm.milestones.filter(m => {
            const qNum = parseInt(m.quarter.replace("Q", ""), 10);
            if (!completedQuarters.includes(qNum)) return false;
            return m.completionPercent === null || m.completionPercent < 100;
          }).length;
        }

        if (milestoneActualProgressForRisk !== null && milestoneActualProgressForRisk < 100) {
          const deviation = 100 - milestoneActualProgressForRisk;
          if (deviation >= highThreshold) {
            milestonesRisk = 'Высокий';
          } else if (deviation >= medThreshold) {
            milestonesRisk = 'Средний';
          }
        }
        if (totalOverdueMilestones > 0 && useRegistryThresholds) {
          milestonesRisk = 'Высокий';
        }
      }
    }
  } else {
    // Dates are missing or invalid, treat as data quality issue, not milestone lag
    milestoneActualProgressForRisk = null;
    totalOverdueMilestones = 0;
    milestonesRisk = 'Низкий';
  }

  // Indicator (показатель) risk: completed periods only; never include future even with early fact
  let indicatorsCappedPerformanceForRisk: number | null = null;
  const lifecycleIndicators = getLifecycleIndicatorPerformanceFromEvaluation(
    evaluation,
    assessmentDate,
    project.startDate,
    project.deadlineAt || project.endDate,
    "risk",
    { useCapped: true }
  );
  if (lifecycleIndicators.calculatedCount > 0) {
    indicatorsCappedPerformanceForRisk = lifecycleIndicators.cappedAveragePercent;
  } else {
    // Raw eligible completed periods only (no unfiltered evaluation average fallback)
    let eligibleIndicatorsCount = 0;
    let eligibleIndicatorsCappedSum = 0;

    eligibleIndicatorPeriods.forEach(p => {
      p.names.forEach((name, index) => {
        const planVal = sanitizeAndParseFloat(p.plans[index]);
        if (!(planVal > 0)) return;

        const qKey = `Q${p.quarter}` as "Q1" | "Q2" | "Q3" | "Q4";
        const evalInd = evaluation?.indicators?.indicatorResults?.find(
          r => r.name === name && r.year === p.year && r.quarter === qKey
        );
        if (!evalInd || evalInd.cappedPerformancePercent === null) return;
        if (evalInd.status === "missing_dictionary" || evalInd.status === "future" || evalInd.calculationType === "unknown") {
          return;
        }
        eligibleIndicatorsCount++;
        eligibleIndicatorsCappedSum += evalInd.cappedPerformancePercent;
      });
    });

    indicatorsCappedPerformanceForRisk =
      eligibleIndicatorsCount > 0 ? eligibleIndicatorsCappedSum / eligibleIndicatorsCount : null;
  }

  // 1. PC Status Check
  const pcStatus = getRegistryPcStatusView(project, evaluation, assessmentDate);
  let pcOverdueDays = 0;
  if (pcStatus === 'Просрочен') {
    const dates = getPcBaseAndNextDate(project);
    if (dates) {
      const nextPcMidnight = new Date(dates.nextPcDate.getFullYear(), dates.nextPcDate.getMonth(), dates.nextPcDate.getDate()).getTime();
      const assessMidnight = new Date(assessDate.getFullYear(), assessDate.getMonth(), assessDate.getDate()).getTime();
      if (nextPcMidnight < assessMidnight) {
        const diffMs = assessMidnight - nextPcMidnight;
        pcOverdueDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      }
    }
  }

  let pcRisk: 'Низкий' | 'Средний' | 'Высокий' = 'Низкий';
  if (pcStatus === 'Просрочен') {
    if (pcOverdueDays >= 8) {
      pcRisk = 'Высокий';
    } else if (pcOverdueDays >= 1) {
      pcRisk = 'Средний';
    }
  }

  // 3. Indicators Deviation Check
  let indicatorsRisk: 'Низкий' | 'Средний' | 'Высокий' = 'Низкий';
  if (indicatorsCappedPerformanceForRisk !== null && indicatorsCappedPerformanceForRisk < 100) {
    const deviation = 100 - indicatorsCappedPerformanceForRisk;
    if (deviation >= highThreshold) {
      indicatorsRisk = 'Высокий';
    } else if (deviation >= medThreshold) {
      indicatorsRisk = 'Средний';
    }
  }

  // 4. Deadline Check
  let isDeadlineOverdue = false;
  const deadlineStr = project.deadlineAt || project.endDate;
  const deadlineDate = deadlineStr ? parseDateSafe(deadlineStr) : null;
  if (deadlineDate && (project.status !== 'completed' && project.status !== 'cancelled' && project.stage !== 'Завершен' && project.stage !== 'completed')) {
    const deadlineMidnight = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate()).getTime();
    const assessMidnight = new Date(assessDate.getFullYear(), assessDate.getMonth(), assessDate.getDate()).getTime();
    if (deadlineMidnight < assessMidnight) {
      isDeadlineOverdue = true;
    }
  }

  // 5. Completeness Check
  const completeness = getProjectCompletenessPercent(evaluation);
  let completenessRisk: 'Низкий' | 'Средний' | 'Высокий' = 'Низкий';
  const epsilon = 0.05;
  if (completeness !== null) {
    if (completeness < CRITICAL_COMPLETENESS_PERCENT - epsilon) {
      completenessRisk = 'Высокий';
    } else if (completeness < TARGET_COMPLETENESS_PERCENT - epsilon) {
      completenessRisk = 'Средний';
    }
  }

  // 6. Data Quality Errors / Weight Errors
  const hasCriticalErrors = (evaluation?.dataQuality?.errorsCount && evaluation.dataQuality.errorsCount > 0) || evaluation?.dataQuality?.status === 'error';
  const hasWeightControlError = evaluation?.milestones?.weightControlStatus === 'error' || normMilestones.weightControlStatus === 'error';

  // Overall Risk Level
  let riskLevel: 'Низкий' | 'Средний' | 'Высокий' | 'Недостаточно данных' = 'Низкий';
  const isInsufficient = isRegistryDataInsufficient(project, evaluation, assessmentDate);

  if (isInsufficient) {
    riskLevel = 'Недостаточно данных';
  } else {
    if (
      pcRisk === 'Высокий' ||
      milestonesRisk === 'Высокий' ||
      indicatorsRisk === 'Высокий' ||
      isDeadlineOverdue ||
      hasCriticalErrors ||
      hasWeightControlError ||
      completenessRisk === 'Высокий'
    ) {
      riskLevel = 'Высокий';
    } else if (
      pcRisk === 'Средний' ||
      milestonesRisk === 'Средний' ||
      indicatorsRisk === 'Средний' ||
      completenessRisk === 'Средний'
    ) {
      riskLevel = 'Средний';
    } else if (!hasValidDates) {
      riskLevel = 'Недостаточно данных';
    }
  }

  // Overall Registry Status
  let registryStatus: 'Норма' | 'Зона риска' | 'Недостаточно данных' = 'Норма';
  if (isInsufficient) {
    registryStatus = 'Недостаточно данных';
  } else {
    const hasWeightError = evaluation?.milestones?.weightControlStatus === 'error' || normMilestones.weightControlStatus === 'error';
    const hasKpiLow = indicatorsCappedPerformanceForRisk !== null && indicatorsCappedPerformanceForRisk < 90;
    const hasMilestoneLow = milestoneActualProgressForRisk !== null && milestoneActualProgressForRisk < 90;

    if (
      riskLevel === 'Средний' ||
      riskLevel === 'Высокий' ||
      pcStatus === 'Просрочен' ||
      isDeadlineOverdue ||
      hasWeightError ||
      hasKpiLow ||
      hasMilestoneLow
    ) {
      registryStatus = 'Зона риска';
    } else if (!hasValidDates) {
      registryStatus = 'Недостаточно данных';
    }
  }

  // Reasons List
  const reasons: string[] = [];
  if (!hasValidDates) {
    reasons.push('отсутствуют или некорректно заполнены даты начала/окончания проекта');
  }
  if (pcStatus === 'Просрочен') {
    reasons.push('просрочен Проектный комитет (ПК)');
  }
  if (totalOverdueMilestones > 0) {
    reasons.push('просрочены актуальные вехи');
  }
  if (milestoneActualProgressForRisk !== null && milestoneActualProgressForRisk < 100) {
    const deviation = 100 - milestoneActualProgressForRisk;
    if (deviation >= 5) {
      reasons.push(`отставание по актуальным вехам составляет ${deviation.toFixed(1)}%`);
    }
  }
  if (indicatorsCappedPerformanceForRisk !== null && indicatorsCappedPerformanceForRisk < 100) {
    const deviation = 100 - indicatorsCappedPerformanceForRisk;
    if (deviation >= 5) {
      reasons.push(`отклонение по показателям эффективности составляет ${deviation.toFixed(1)}%`);
    }
  }
  if (isDeadlineOverdue) {
    reasons.push('пройдена плановая дата завершения проекта при неактивной/незавершенной стадии');
  }
  if (completeness !== null && completeness < TARGET_COMPLETENESS_PERCENT - epsilon) {
    reasons.push(`заполненность данных проекта составляет ${completeness}%, что ниже целевого уровня ${TARGET_COMPLETENESS_PERCENT}%`);
  }
  if (evaluation?.dataQuality?.errorsCount && evaluation.dataQuality.errorsCount > 0) {
    reasons.push('зафиксированы критические ошибки валидации данных');
  }
  if (hasWeightControlError) {
    reasons.push('сумма заданных весов вех превышает допустимые 100%');
  }

  let reasonsText = 'Факторы риска не обнаружены, проект выполняется штатно.';
  if (reasons.length > 0) {
    const joined = reasons.join(', ');
    reasonsText = joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
  }

  return {
    riskLevel,
    registryStatus,
    reasons,
    reasonsText,
    details: {
      milestoneActualProgressForRisk,
      indicatorsCappedPerformanceForRisk,
      totalOverdueMilestones,
      pcOverdueDays,
      pcStatus,
      isDeadlineOverdue,
      completenessPercent: completeness,
      errorsCount: evaluation?.dataQuality?.errorsCount || 0,
      hasWeightControlError
    },
    eligibleMilestonePeriods: eligibleMilestonePeriods.map(p => ({ year: p.year, quarter: p.quarter })),
    eligibleIndicatorPeriods: eligibleIndicatorPeriods.map(p => ({ year: p.year, quarter: p.quarter })),
    ignoredFuturePeriods,
    ignoredCurrentPeriods
  };
}

/**
 * Gets the Risk view level (Низкий, Средний, Высокий) for the registry tab based on project parameters
 */
export function getRegistryRiskView(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): 'Низкий' | 'Средний' | 'Высокий' | 'Недостаточно данных' {
  const result = calculateUnifiedProjectRisk(project, evaluation, assessmentDate, true);
  return result.riskLevel;
}

/**
 * Gets the overall managerial project status view (Норма, Зона риска, Недостаточно данных)
 */
export function getRegistryProjectStatusView(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): 'Норма' | 'Зона риска' | 'Недостаточно данных' {
  const result = calculateUnifiedProjectRisk(project, evaluation, assessmentDate, true);
  return result.registryStatus;
}

/**
 * Gets the Risk view level (Низкий, Средний, Высокий) for the project card using project card thresholds
 */
export function getProjectCardRiskView(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): 'Низкий' | 'Средний' | 'Высокий' | 'Недостаточно данных' {
  const result = calculateUnifiedProjectRisk(project, evaluation, assessmentDate, false);
  return result.riskLevel;
}

/**
 * Gets the overall managerial project status view (Норма, Зона риска, Недостаточно данных) for the project card using project card thresholds
 */
export function getProjectCardProjectStatusView(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): 'Норма' | 'Зона риска' | 'Недостаточно данных' {
  const result = calculateUnifiedProjectRisk(project, evaluation, assessmentDate, false);
  return result.registryStatus;
}

export interface PcStatusTooltipInfo {
  title: string;
  status: 'Своевременно' | 'Просрочен' | 'Недостаточно данных' | 'Не применяется';
  statusLabel: string;
  statusBadgeClass: string;
  startDate: string;
  frequency: string;
  lastPcDate: string;
  nextPcDate: string;
  overdueDays: number | null;
  reason: string | null;
  explanation: string;
  methodologyTitle: string;
  methodologyDescription: string;
  bullets: string[];
}

export function getPcStatusTooltipData(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): PcStatusTooltipInfo {
  const monStatus = getProjectMonitoringStatus(project, assessmentDate);
  const status = monStatus === 'not_applicable' ? 'Не применяется' : monStatus;
  const dates = getPcBaseAndNextDate(project);
  
  const formattedStart = project.monitoringStart ? formatDateSafe(project.monitoringStart) : '—';
  const formattedFrequency = project.monitoringFrequencyWeeks ? `${project.monitoringFrequencyWeeks} нед.` : 'Не указана';
  const formattedLastPc = project.lastPcDate ? formatDateSafe(project.lastPcDate) : '—';
  
  let formattedNextPc = 'Не применяется';
  let overdueDays: number | null = null;
  let reason: string | null = null;
  
  if (status !== 'Не применяется' && dates) {
    formattedNextPc = dates.nextPcDate.toLocaleDateString('ru-RU');
    
    if (status === 'Просрочен') {
      const assessDate = parseDateSafe(assessmentDate) || new Date();
      const nextPcMidnight = new Date(dates.nextPcDate.getFullYear(), dates.nextPcDate.getMonth(), dates.nextPcDate.getDate()).getTime();
      const assessMidnight = new Date(assessDate.getFullYear(), assessDate.getMonth(), assessDate.getDate()).getTime();
      const diffMs = assessMidnight - nextPcMidnight;
      overdueDays = diffMs > 0 ? Math.ceil(diffMs / (24 * 60 * 60 * 1000)) : 0;
    }
  } else {
    if (status === 'Не применяется') {
      formattedNextPc = 'Не рассчитывается';
      
      let isMonLaterThanEnd = false;
      if (project.monitoringStart && project.endDate) {
        const monStart = parseDateSafe(project.monitoringStart);
        const pEnd = parseDateSafe(project.endDate);
        if (monStart && pEnd) {
          const monStartMidnight = new Date(monStart.getFullYear(), monStart.getMonth(), monStart.getDate()).getTime();
          const endMidnight = new Date(pEnd.getFullYear(), pEnd.getMonth(), pEnd.getDate()).getTime();
          if (monStartMidnight > endMidnight) {
            isMonLaterThanEnd = true;
          }
        }
      }
      
      if (isMonLaterThanEnd) {
        reason = 'Дата начала мониторинга позже даты завершения проекта.';
      } else {
        reason = 'Проект не участвует в расчете своевременности ПК: в блок включаются только проекты со стадией «В работе».';
      }
    } else {
      reason = 'Некорректно заполнены или отсутствуют дата начала мониторинга или регулярность ПК.';
    }
  }
  
  const statusBadgeClass = 
    status === 'Своевременно' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
    status === 'Просрочен' ? 'bg-red-50 text-red-700 border-red-100' :
    status === 'Не применяется' ? 'bg-gray-50 text-gray-600 border-gray-200' :
    'bg-orange-50 text-orange-700 border border-orange-100';

  let explanation = '';
  if (status === 'Своевременно') {
    explanation = dates
      ? `Аудит мониторинга проекта проводится регулярно и в срок. Следующий запланирован до ${formattedNextPc}.`
      : 'Проект со стадией «В работе» считается своевременным на выбранную дату оценки (старт проекта / мониторинг ещё не наступили, либо срок завершения пройден при незакрытой стадии).';
  } else if (status === 'Просрочен') {
    const daysWord = overdueDays === 1 ? 'день' : (overdueDays && overdueDays % 10 >= 2 && overdueDays % 10 <= 4 && (overdueDays % 100 < 10 || overdueDays % 100 >= 20) ? 'дня' : 'дней');
    explanation = `Очередной аудит мониторинга проекта просрочен на ${overdueDays || 0} ${daysWord}. Срок проведения истек ${formattedNextPc}.`;
  } else if (status === 'Не применяется') {
    if (reason) {
      explanation = reason;
    } else {
      explanation = 'Проект не участвует в расчете своевременности ПК: в блок включаются только проекты со стадией «В работе».';
    }
  } else {
    explanation = 'Параметры проведения аудита не заполнены (отсутствует периодичность или плановые отчетные даты).';
  }
    
  return {
    title: 'Статус ПК (Проектный комитет)',
    status,
    statusLabel: `Статус: ${status}`,
    statusBadgeClass,
    startDate: formattedStart,
    frequency: formattedFrequency,
    lastPcDate: formattedLastPc,
    nextPcDate: formattedNextPc,
    overdueDays,
    reason,
    explanation,
    methodologyTitle: 'Методология Проектный комитет',
    methodologyDescription: 'Мониторинг осуществляется по дате начала мониторинга и периодичности в течение жизненного цикла проекта.',
    bullets: [
      'Участие в расчете: только внутри жизненного цикла проекта (от даты начала до даты завершения).',
      'Дата начала мониторинга: должна наступить для начала проверок.',
      'Не применяется: проект вне рамок применимости мониторинга (показывается "Не применяется", в графики первой вкладки не попадает).',
      'Своевременно: плановый срок еще не наступил.',
      'Просрочен: плановый срок очередного мониторинга уже наступил, а отчет отсутствует.',
      'Недостаточно данных: нет ключевых дат для расчета.'
    ]
  };
}

export function getRiskExplanation(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): string {
  const result = calculateUnifiedProjectRisk(project, evaluation, assessmentDate, true);
  return result.reasonsText;
}

export function getProjectCardRiskExplanation(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): string {
  const result = calculateUnifiedProjectRisk(project, evaluation, assessmentDate, false);
  return result.reasonsText;
}

export interface RiskTooltipInfo {
  title: string;
  risk: 'Низкий' | 'Средний' | 'Высокий' | 'Недостаточно данных';
  riskLabel: string;
  riskBadgeClass: string;
  explanation: string;
  methodologyTitle: string;
  methodologyDescription: string;
  bullets: string[];
}

export function getRiskTooltipData(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): RiskTooltipInfo {
  const risk = getRegistryRiskView(project, evaluation, assessmentDate);
  const explanation = getRegistryRiskView(project, evaluation, assessmentDate) === 'Недостаточно данных' 
    ? 'Недостаточно данных для оценки риска.' 
    : getRiskExplanation(project, evaluation, assessmentDate);
  
  const riskBadgeClass =
    risk === 'Высокий' ? 'bg-red-50 text-red-700 border-red-100' :
    risk === 'Средний' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
    risk === 'Недостаточно данных' ? 'bg-gray-50 text-gray-500 border border-gray-150' :
    'bg-emerald-50 text-emerald-700 border border-emerald-100';

  return {
    title: 'Уровень риска',
    risk,
    riskLabel: `Риск: ${risk}`,
    riskBadgeClass,
    explanation,
    methodologyTitle: 'Методология риска',
    methodologyDescription: 'Уровень риска проекта рассчитывается на основе регулярности Проектного комитета (ПК), выполнения актуальных вех и показателей, соблюдения плановых сроков и качества ведения данных. Оценка выполняется на выбранную дату оценки.',
    bullets: [
      'Низкий: нет критичных отклонений, Проектный комитет своевременен, данные заполнены корректно.',
      'Средний: умеренные отклонения по вехам или показателям (5-9.99%), просрочка ПК до 7 дней.',
      'Высокий: критичные просрочки ПК (8+ дней), сильные отклонения (10%+), просрочен срок проекта при незавершенной стадии или ошибки в весах вех.'
    ]
  };
}

export interface ProjectStatusTooltipInfo {
  title: string;
  status: 'Норма' | 'Зона риска' | 'Недостаточно данных';
  statusLabel: string;
  statusBadgeClass: string;
  explanation: string;
  methodologyTitle: string;
  methodologyDescription: string;
  bullets: string[];
}

export function getProjectStatusTooltipData(
  project: Project,
  evaluation: ProjectEvaluation | null | undefined,
  assessmentDate: string
): ProjectStatusTooltipInfo {
  const status = getRegistryProjectStatusView(project, evaluation, assessmentDate);
  
  let explanation = '';
  if (status === 'Норма') {
    explanation = 'Проект выполняется без критичных отклонений на выбранную дату оценки.';
    if (!evaluation) {
      explanation += ' Статус рассчитан по доступным данным проекта, так как расчетная оценка проекта отсутствует.';
    }
  } else if (status === 'Зона риска') {
    const riskExplanation = getRiskExplanation(project, evaluation, assessmentDate);
    explanation = `Проект находится в зоне риска. ${riskExplanation}`;
    if (!evaluation) {
      explanation += ' Статус рассчитан по доступным данным проекта, так как расчетная оценка проекта отсутствует.';
    }
  } else {
    explanation = 'Недостаточно корректных данных, чтобы надежно оценить состояние проекта.';
  }

  const statusBadgeClass =
    status === 'Норма' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
    status === 'Зона риска' ? 'bg-red-50 text-red-700 border-red-100' :
    'bg-gray-50 text-gray-500 border border-gray-150 text-gray-800';

  return {
    title: 'Зона риска',
    status,
    statusLabel: `Статус: ${status}`,
    statusBadgeClass,
    explanation,
    methodologyTitle: 'Методология зоны риска',
    methodologyDescription: 'Зона риска проекта рассчитывается на выбранную дату оценки. Будущие кварталы, где факт еще не должен быть заполнен, не ухудшают оценку. Итоговая оценка учитывает риск, статус ПК, актуальное выполнение вех, актуальное выполнение показателей и качество заполнения данных.',
    bullets: [
      'Норма: низкий риск и достаточно данных для оценки.',
      'Зона риска: средний или высокий риск, просрочки, критичные отклонения или ошибки данных.',
      'Недостаточно данных: не хватает данных для надежного расчета.'
    ]
  };
}
