import { Project, ProjectAnalysisResult, ProjectEvaluation } from '../types';
import { parseDateSafe, formatDateSafe } from './dateUtils';
import { getProjectCardProgressMetrics } from './projectCardMetrics';
import { getRegistryDataQuality } from './projectRegistryMetrics';
import { 
  getProjectCardProjectStatusView, 
  getProjectCardRiskView, 
  getRegistryPcStatusView,
  getPcStatusTooltipData 
} from './projectRegistryStatus';
import { calculateSingleIndicatorPerformance } from './indicatorPerformance';
import { resolveIndicatorDictionaryItem } from '../../server/services/indicatorDictionary';
import { getRawMilestonesListForPeriod } from './projectCalculations';
import { normalizeProjectStage, UNSPECIFIED_PROJECT_STAGE } from './projectStageStyles';

// HTML escaping helper
export const escapeHtml = (value: unknown): string => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Period parser helper
export const parseIndicatorPeriod = (period: string | null | undefined): {
  label: string;
  year: number | null;
  quarter: "Q1" | "Q2" | "Q3" | "Q4" | null;
} => {
  if (!period) {
    return { label: "Без периода", year: null, quarter: null };
  }
  const s = period.trim().toLowerCase();

  // Extract year
  let year: number | null = null;
  const yearMatch = s.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Extract quarter
  let quarter: "Q1" | "Q2" | "Q3" | "Q4" | null = null;
  if (s.includes("q4") || s.includes("4кв") || s.includes("4 кв") || s.includes("iv кв") || s.includes("iv квартал") || s.includes("4 квартал") || s.includes("4-й кв") || s.includes("4-й кварт") || s === "4" || /q\s*4/i.test(s) || /4\s*-?\s*кв/i.test(s) || /iv\s*-?\s*кв/i.test(s) || /iv\s*-?\s*квартал/i.test(s)) {
    quarter = "Q4";
  } else if (s.includes("q3") || s.includes("3кв") || s.includes("3 кв") || s.includes("iii кв") || s.includes("iii квартал") || s.includes("3 квартал") || s.includes("3-й кв") || s.includes("3-й кварт") || s === "3" || /q\s*3/i.test(s) || /3\s*-?\s*кв/i.test(s) || /iii\s*-?\s*кв/i.test(s) || /iii\s*-?\s*квартал/i.test(s)) {
    quarter = "Q3";
  } else if (s.includes("q2") || s.includes("2кв") || s.includes("2 кв") || s.includes("ii кв") || s.includes("ii квартал") || s.includes("2 квартал") || s.includes("2-й кв") || s.includes("2-й кварт") || s === "2" || /q\s*2/i.test(s) || /2\s*-?\s*кв/i.test(s) || /ii\s*-?\s*кв/i.test(s) || /ii\s*-?\s*квартал/i.test(s)) {
    quarter = "Q2";
  } else if (s.includes("q1") || s.includes("1кв") || s.includes("1 кв") || s.includes("i кв") || s.includes("i квартал") || s.includes("1 квартал") || s.includes("1-й кв") || s.includes("1-й кварт") || s === "1" || /q\s*1/i.test(s) || /1\s*-?\s*кв/i.test(s) || /i\s*-?\s*кв/i.test(s) || /i\s*-?\s*квартал/i.test(s)) {
    quarter = "Q1";
  }

  let label = "Без периода";
  if (quarter && year) {
    label = `${quarter} ${year}`;
  } else if (quarter) {
    label = quarter;
  } else if (year) {
    label = String(year);
  }

  return { label, year, quarter };
};

export interface MilestonesDetailsItem {
  id: string;
  name: string;
  quarterText: string;
  weightText: string;
  progressText: string;
  attributedText: string;
  completionPercent: number | null;
}

export interface IndicatorsDetailsItem {
  id: string;
  name: string;
  periodText: string;
  planText: string;
  factText: string;
  progressText: string;
}

export function buildProjectCardPdfReportData(options: {
  project: Project;
  analysis: ProjectAnalysisResult | null;
  projectEvaluations?: ProjectEvaluation[] | null;
  assessmentDate?: string;
  selectedYear: number;
  selectedQuarter: number;
}) {
  const { project, analysis, projectEvaluations, assessmentDate, selectedYear, selectedQuarter } = options;

  const dateStr = assessmentDate || new Date().toISOString().split("T")[0];

  // Resolve matching evaluation for the project
  const evaluation = projectEvaluations?.find(e => e.projectId === project.projectId) ?? null;

  // 1. reportMeta
  const reportMeta = {
    docTitle: "Карточка проекта",
    assessmentDateStr: formatDateSafe(dateStr) || "—",
    selectedYear,
    selectedQuarter,
    createdAt: analysis ? formatDateSafe(analysis.createdAt) : null,
  };

  // 2. projectInfo
  const goalsList = Array.isArray(project.goals) 
    ? project.goals.filter(g => g && g.trim() !== "" && g.trim() !== "—") 
    : [];
  const resultImagesList = Array.isArray(project.resultImages) 
    ? project.resultImages.filter(img => img && img.trim() !== "" && img.trim() !== "—") 
    : [];

  const effectiveDeadline = project.deadlineAt || project.endDate;
  const deadlineAtFormatted = effectiveDeadline ? (formatDateSafe(effectiveDeadline) || "Не указан") : "Не указан";

  const projectInfo = {
    projectName: project.projectName || "Без названия",
    projectId: project.projectId,
    stage: normalizeProjectStage(project.stage) || UNSPECIFIED_PROJECT_STAGE,
    projectType: project.projectType || "Не указан",
    priority: project.priority !== undefined && project.priority !== null ? String(project.priority) : "Не указан",
    department: project.department || "Не указано",
    owner: project.projectOwner || project.owner || "Не указан",
    manager: project.projectManager || project.executor || "Не указан",
    sponsor: project.sponsor || "Не заполнен",
    startDate: project.startDate ? formatDateSafe(project.startDate) : "Не указана",
    deadlineAt: deadlineAtFormatted,
    goals: goalsList,
    resultImages: resultImagesList,
    projectDescription: project.projectDescription || "Сведения в паспорте отсутствуют."
  };

  // 3. statusSummary
  const rawStatus = getProjectCardProjectStatusView(project, evaluation, dateStr);
  let rawRisk = getProjectCardRiskView(project, evaluation, dateStr);
  if (rawStatus === "Недостаточно данных") {
    rawRisk = "Недостаточно данных";
  }
  const rawPcStatus = getRegistryPcStatusView(project, evaluation, dateStr);
  const rawDataQuality = getRegistryDataQuality(project, projectEvaluations);

  const statusSummary = {
    status: rawStatus || "Неизвестно",
    risk: rawRisk || "Не определено",
    pcStatus: rawPcStatus || "Нет данных",
    dataQuality: rawDataQuality !== null && rawDataQuality !== undefined ? `${Math.round(rawDataQuality)}%` : "Не определено"
  };

  // 4. progressMetrics
  const metrics = getProjectCardProgressMetrics({
    project,
    evaluation,
    selectedYear,
    selectedQuarter,
    assessmentDate: dateStr
  });

  const getMetricProgressString = (val: number | null): string => {
    if (val === null || val === undefined || isNaN(val)) return "Нет данных";
    return `${Math.round(val)}%`;
  };

  const getMetricSource = (val: number | null, isKpi: boolean): string => {
    if (val === null || val === undefined || isNaN(val)) return "Нет данных";
    if (evaluation) {
      if (isKpi && evaluation.indicators?.indicatorResults && evaluation.indicators.indicatorResults.length > 0) {
        return "server-evaluation";
      }
      if (!isKpi && evaluation.milestones?.milestoneResults && evaluation.milestones.milestoneResults.length > 0) {
        return "server-evaluation";
      }
    }
    return "fallback-расчет";
  };

  const progressMetrics = {
    milestonesQuarterVal: metrics.milestonesQuarterVal,
    milestonesQuarterText: getMetricProgressString(metrics.milestonesQuarterVal),
    milestonesQuarterTitle: metrics.milestonesQuarterTitle || "Расчет прогресса вех за выбранный квартал",
    milestonesQuarterSource: getMetricSource(metrics.milestonesQuarterVal, false),

    indicatorsQuarterVal: metrics.kpiQuarterVal,
    indicatorsQuarterText: getMetricProgressString(metrics.kpiQuarterVal),
    indicatorsQuarterTitle: metrics.kpiQuarterTitle || "Расчет выполнения показателей за выбранный квартал",
    indicatorsQuarterSource: getMetricSource(metrics.kpiQuarterVal, true),

    milestonesYearVal: metrics.milestonesYearVal,
    milestonesYearText: getMetricProgressString(metrics.milestonesYearVal),
    milestonesYearTitle: metrics.milestonesYearTitle || "Расчет прогресса вех за выбранный год",
    milestonesYearSource: getMetricSource(metrics.milestonesYearVal, false),

    indicatorsYearVal: metrics.kpiYearVal,
    indicatorsYearText: getMetricProgressString(metrics.kpiYearVal),
    indicatorsYearTitle: metrics.kpiYearTitle || "Расчет выполнения показателей за выбранный год",
    indicatorsYearSource: getMetricSource(metrics.kpiYearVal, true),
  };

  // 5. milestonesDetails
  const milestonesList: MilestonesDetailsItem[] = [];
  const milestoneWeightsWarning = evaluation?.milestones?.weightControlStatus === "warning";
  const milestoneWeightsError = evaluation?.milestones?.weightControlStatus === "error";
  const milestoneWeightsStatus = evaluation?.milestones?.weightControlStatus || "ok";

  const qStr = `Q${selectedQuarter}`;
  const evaluationMilestones = (evaluation?.milestones?.milestoneResults && Array.isArray(evaluation.milestones.milestoneResults))
    ? evaluation.milestones.milestoneResults.filter(m => m.year === selectedYear && m.quarter === qStr)
    : [];

  if (evaluationMilestones.length > 0) {
    evaluationMilestones.forEach(t => {
      let weightText = "";
      if (t.weightSource === "explicit") {
        weightText = `${t.originalWeightPercent !== null ? t.originalWeightPercent : t.effectiveWeightPercent}%`;
      } else if (t.weightSource === "calculated" || t.weightSource === "equal_fallback") {
        weightText = `${Number(t.effectiveWeightPercent.toFixed(2))}% расчетный`;
      } else if (t.weightSource === "informational") {
        weightText = "Без веса";
      } else if (t.weightSource === "excluded_no_progress") {
        weightText = "Не участвует";
      } else {
        weightText = `${t.effectiveWeightPercent}%`;
      }

      const hasProgress = t.completionPercent !== undefined && t.completionPercent !== null;
      const progressText = hasProgress ? `${t.completionPercent}%` : "Нет данных";

      let attributedText = "";
      if (t.weightSource === "informational" || t.weightSource === "excluded_no_progress") {
        attributedText = "Не влияет";
      } else {
        attributedText = t.contributionPercent !== undefined && t.contributionPercent !== null
          ? `${Number(t.contributionPercent.toFixed(2))}%`
          : "Нет данных";
      }

      milestonesList.push({
        id: t.id || `eval-milestone-${Math.random()}`,
        name: t.name ? String(t.name).trim() : "Не указано",
        quarterText: t.quarter ? `${t.year} ${t.quarter}` : "—",
        weightText,
        progressText,
        attributedText,
        completionPercent: t.completionPercent !== undefined ? t.completionPercent : null
      });
    });
  } else {
    // Fallback from raw milestones
    const rawList = project.milestones || [];
    const tasksMap = new Map<string, any>();
    rawList.forEach((t, i) => {
      const title = t.title ? String(t.title).trim() : "";
      const quarterStr = t.quarter ? String(t.quarter).trim() : "";
      const weight = t.weight !== undefined && t.weight !== null ? Number(t.weight) : 0;
      
      const parsedPeriod = parseIndicatorPeriod(t.quarter);
      let yearVal: number | string = parsedPeriod.year || "unknown";
      if (yearVal === "unknown") {
        const yearMatch = (t.quarter || "").match(/\b(20\d{2})\b/) || 
                          (t.taskId || "").match(/\b(20\d{2})\b/) ||
                          (t.title || "").match(/\b(20\d{2})\b/);
        if (yearMatch) {
          yearVal = parseInt(yearMatch[1], 10);
        } else {
          yearVal = project._dataYear || selectedYear || "unknown";
        }
      }
      (t as any)._extractedYear = yearVal;
      (t as any)._extractedQuarter = parsedPeriod.quarter;

      const key = `${title.toLowerCase()}||${quarterStr.toLowerCase()}||${yearVal}||${weight}`;
      if (!tasksMap.has(key)) {
        tasksMap.set(key, t);
      } else {
        const existing = tasksMap.get(key);
        const existingProgress = existing.progressPercent !== undefined && existing.progressPercent !== null ? existing.progressPercent : -1;
        const tProgress = t.progressPercent !== undefined && t.progressPercent !== null ? t.progressPercent : -1;
        if (tProgress > existingProgress) {
          tasksMap.set(key, t);
        }
      }
    });

    const tasksList = Array.from(tasksMap.values()).sort((a, b) => {
      const qA = a.quarter ? String(a.quarter).trim() : "";
      const qB = b.quarter ? String(b.quarter).trim() : "";
      return qA.localeCompare(qB);
    });

    const filteredTasksList = tasksList.filter(t => (t as any)._extractedYear === selectedYear && ((t as any)._extractedQuarter === qStr || t.quarter === qStr));

    if (filteredTasksList.length > 0) {
      filteredTasksList.forEach((t, i) => {
        const qValue = t.quarter ? String(t.quarter).trim() : "";
        const extYear = (t as any)._extractedYear;
        let quarterText = qValue !== "" ? qValue : "—";
        if (qValue !== "" && extYear && extYear !== "unknown" && !qValue.includes(String(extYear))) {
          quarterText = `${qValue} ${extYear}`;
        }

        const hasWeight = t.weight !== undefined && t.weight !== null;
        const weightText = hasWeight ? `${t.weight}%` : "—";

        const hasProgress = t.progressPercent !== undefined && t.progressPercent !== null;
        const progressText = hasProgress ? `${t.progressPercent}%` : "—";
        
        const attributedText = (hasProgress && hasWeight)
          ? `${((t.weight ?? 0) * (t.progressPercent ?? 0) / 100).toFixed(1)}%`
          : "Нет данных";

        milestonesList.push({
          id: t.taskId || `fallback-milestone-${i}`,
          name: t.title ? String(t.title).trim() : "Не указано",
          quarterText,
          weightText,
          progressText,
          attributedText,
          completionPercent: t.progressPercent !== undefined ? t.progressPercent : null
        });
      });
    } else {
      // Raw-only data fallback
      const rawMilestones = getRawMilestonesListForPeriod(project, selectedYear, selectedQuarter);
      rawMilestones.forEach((t) => {
        const qValue = t.quarter ? String(t.quarter).trim() : "";
        const extYear = selectedYear;
        let quarterText = qValue !== "" ? qValue : "—";
        if (qValue !== "" && extYear && !qValue.includes(String(extYear))) {
          quarterText = `${qValue} ${extYear}`;
        }

        const hasWeight = t.originalWeightPercent !== undefined && t.originalWeightPercent !== null;
        const weightText = hasWeight ? `${t.originalWeightPercent}%` : "—";

        const hasProgress = t.completionPercent !== undefined && t.completionPercent !== null;
        const progressText = hasProgress ? `${t.completionPercent}%` : "—";
        
        const attributedText = (hasProgress && t.weight !== undefined && t.weight !== null)
          ? `${((t.weight ?? 0) * (t.completionPercent ?? 0) / 100).toFixed(1)}%`
          : "Нет данных";

        milestonesList.push({
          id: t.id,
          name: t.title ? String(t.title).trim() : "Не указано",
          quarterText,
          weightText,
          progressText,
          attributedText,
          completionPercent: t.completionPercent
        });
      });
    }
  }

  // 6. indicatorsDetails
  interface StandardizedIndicator {
    id: string;
    name: string;
    period: string | null;
    plan: any;
    fact: any;
    performancePercent: number | null;
    cappedPerformancePercent: number | null;
    year: number | null;
    quarter: "Q1" | "Q2" | "Q3" | "Q4" | null;
  }

  const indicatorMap = new Map<string, StandardizedIndicator>();
  const isEmptyVal = (val: any): boolean => {
    if (val === null || val === undefined) return true;
    if (typeof val === "string" && val.trim() === "") return true;
    return false;
  };

  const normalizeName = (name: string): string => {
    return name.trim().toLowerCase().replace(/\s+/g, " ");
  };

  const registerIndicator = (item: StandardizedIndicator) => {
    const normName = normalizeName(item.name);
    const key = `${normName}||${item.year || "unknown"}||${item.quarter || "unknown"}`;

    if (!indicatorMap.has(key)) {
      indicatorMap.set(key, { ...item });
    } else {
      const existing = indicatorMap.get(key)!;
      if (isEmptyVal(existing.plan) && !isEmptyVal(item.plan)) {
        existing.plan = item.plan;
      }
      if (isEmptyVal(existing.fact) && !isEmptyVal(item.fact)) {
        existing.fact = item.fact;
      }
      if (isEmptyVal(existing.performancePercent) && !isEmptyVal(item.performancePercent)) {
        existing.performancePercent = item.performancePercent;
      }
      if (isEmptyVal(existing.cappedPerformancePercent) && !isEmptyVal(item.cappedPerformancePercent)) {
        existing.cappedPerformancePercent = item.cappedPerformancePercent;
      }
    }
  };

  // 1. Highest Priority: evaluation.indicators.indicatorResults
  if (evaluation?.indicators?.indicatorResults && Array.isArray(evaluation.indicators.indicatorResults)) {
    evaluation.indicators.indicatorResults.forEach((ind, i) => {
      const period = ind.quarter ? `${ind.quarter} ${ind.year || ""}`.trim() : null;
      registerIndicator({
        id: ind.id || `eval-ind-${i}`,
        name: ind.name ? String(ind.name).trim() : "Без названия",
        period,
        plan: ind.plan,
        fact: ind.fact,
        performancePercent: typeof ind.performancePercent === "number" ? ind.performancePercent : null,
        cappedPerformancePercent: typeof ind.cappedPerformancePercent === "number" ? ind.cappedPerformancePercent : null,
        year: ind.year ?? null,
        quarter: ind.quarter ?? null,
      });
    });
  }

  // 2. Medium Priority: project.indicators
  if (Array.isArray(project.indicators)) {
    project.indicators.forEach((ind, i) => {
      const period = ind.period ? String(ind.period).trim() : null;
      const parsed = parseIndicatorPeriod(period);

      let parsedYear = parsed.year;
      if (parsedYear === null && parsed.quarter !== null) {
        parsedYear = project._dataYear || selectedYear;
      }

      registerIndicator({
        id: ind.indicatorId || `proj-ind-${i}`,
        name: ind.name ? String(ind.name).trim() : "Без названия",
        period: parsed.label,
        plan: ind.planValue,
        fact: ind.factValue,
        performancePercent: null,
        cappedPerformancePercent: null,
        year: parsedYear,
        quarter: parsed.quarter,
      });
    });
  }

  // 3. Lowest Priority: project.effects
  const rawEffects = (project as any).effects;
  if (Array.isArray(rawEffects)) {
    rawEffects.forEach((eff: any, i: number) => {
      const period = eff.period ? String(eff.period).trim() : null;
      const parsed = parseIndicatorPeriod(period);

      let parsedYear = parsed.year;
      if (parsedYear === null && parsed.quarter !== null) {
        parsedYear = project._dataYear || selectedYear;
      }

      registerIndicator({
        id: eff.effectId || eff.id || `proj-eff-${i}`,
        name: eff.name || eff.title || "Без названия",
        period: parsed.label,
        plan: eff.planValue ?? eff.plan ?? null,
        fact: eff.factValue ?? eff.fact ?? null,
        performancePercent: typeof eff.performancePercent === "number" ? eff.performancePercent : null,
        cappedPerformancePercent: null,
        year: parsedYear,
        quarter: parsed.quarter,
      });
    });
  }

  const combinedIndicators = Array.from(indicatorMap.values());
  const filteredCombinedIndicators = combinedIndicators.filter(item => {
    return item.year === selectedYear && item.quarter === `Q${selectedQuarter}`;
  });

  const indicatorsList: IndicatorsDetailsItem[] = filteredCombinedIndicators.map(item => {
    const formatValue = (v: any): string => {
      if (v === null || v === undefined || v === "") return "—";
      return String(v);
    };

    let progressStr = "Нет данных";
    const calculatableItem = resolveIndicatorDictionaryItem(item.name, undefined, true);
    const anyDictionaryItem = resolveIndicatorDictionaryItem(item.name, undefined, false);

    if (calculatableItem) {
      const performance = item.performancePercent !== null ? item.performancePercent : item.cappedPerformancePercent;
      
      if (performance !== null && performance !== undefined) {
        const rawVal = Math.round(performance);
        const cappedVal = item.cappedPerformancePercent !== null ? Math.round(item.cappedPerformancePercent) : null;
        if (cappedVal !== null && rawVal > 100) {
          progressStr = `${rawVal}% (ограничено: ${cappedVal}%)`;
        } else {
          progressStr = `${rawVal}%`;
        }
      } else {
        const calcResult = calculateSingleIndicatorPerformance(item.name, item.plan, item.fact);
        if (calcResult !== null) {
          const rawPerformance = calcResult.performancePercent;
          const cappedVal = Math.round(calcResult.cappedPerformancePercent);
          const rawVal = Math.round(rawPerformance);
          if (rawVal > 100) {
            progressStr = `${rawVal}% (ограничено: ${cappedVal}%)`;
          } else {
            progressStr = `${rawVal}%`;
          }
        }
      }
    } else if (anyDictionaryItem) {
      const status = anyDictionaryItem.status || "active";
      if (status === "data_issue") {
        progressStr = "Нет активной методики";
      } else {
        progressStr = "Требует согласования методики";
      }
    } else {
      // unknown KPI fallback
      const performance = item.performancePercent !== null ? item.performancePercent : item.cappedPerformancePercent;
      
      if (performance !== null && performance !== undefined) {
        const rawVal = Math.round(performance);
        const cappedVal = item.cappedPerformancePercent !== null ? Math.round(item.cappedPerformancePercent) : null;
        if (cappedVal !== null && rawVal > 100) {
          progressStr = `${rawVal}% (Базовый расчет plan/fact, ограничено: ${cappedVal}%)`;
        } else {
          progressStr = `${rawVal}% (Базовый расчет plan/fact)`;
        }
      } else {
        const calcResult = calculateSingleIndicatorPerformance(item.name, item.plan, item.fact);
        if (calcResult !== null) {
          const rawPerformance = calcResult.performancePercent;
          const cappedVal = Math.round(calcResult.cappedPerformancePercent);
          const rawVal = Math.round(rawPerformance);
          if (rawVal > 100) {
            progressStr = `${rawVal}% (Базовый расчет plan/fact, ограничено: ${cappedVal}%)`;
          } else {
            progressStr = `${rawVal}% (Базовый расчет plan/fact)`;
          }
        } else {
          // If plan/fact are present but somehow performance isn't computed yet
          if (item.plan !== null && item.plan !== undefined && item.plan !== "" && item.plan !== 0 && item.fact !== null && item.fact !== undefined && item.fact !== "") {
            progressStr = "Базовый расчет plan/fact";
          }
        }
      }
    }

    return {
      id: item.id,
      name: item.name,
      periodText: item.period || `Q${selectedQuarter} ${selectedYear}`,
      planText: formatValue(item.plan),
      factText: formatValue(item.fact),
      progressText: progressStr
    };
  });

  // 7. monitoringInfo
  const tooltipData = getPcStatusTooltipData(project, evaluation, dateStr);
  const monitoringInfo = {
    frequency: project.monitoringFrequencyWeeks ? `${project.monitoringFrequencyWeeks} нед.` : "Не указана",
    monitoringStart: project.monitoringStart ? formatDateSafe(project.monitoringStart) : "Не указана",
    lastPcDate: project.lastPcDate ? formatDateSafe(project.lastPcDate) : "—",
    nextPcDate: tooltipData.explanation.includes("Следующий запланирован до") 
      ? tooltipData.explanation.split("Следующий запланирован до")?.[1]?.replace(/\.$/, "")?.trim() || "—"
      : "—",
    explanation: tooltipData.explanation,
    methodologyDescription: tooltipData.methodologyDescription
  };

  // 8. analysisBlocks (If analysis is present, else default structure)
  const isAiAnalysisFormed = !!analysis;
  let analysisBlocks = null;

  if (analysis) {
    analysisBlocks = {
      createdAt: analysis.createdAt ? formatDateSafe(analysis.createdAt) : "—",
      managementConclusion: analysis.managementConclusion || "—",
      shortAnalysis: {
        dataCompleteness: analysis.shortAnalysis?.dataCompleteness || "—",
        pcTimeliness: analysis.shortAnalysis?.pcTimeliness || "—",
        weightedTaskProgress: analysis.shortAnalysis?.weightedTaskProgress || "—",
        deviation: analysis.shortAnalysis?.deviation || "—",
        indicators: analysis.shortAnalysis?.indicators || "—"
      },
      detailedAnalysis: {
        dataCompleteness: analysis.detailedAnalysis?.dataCompleteness || "—",
        pcTimeliness: analysis.detailedAnalysis?.pcTimeliness || "—",
        lagOrAdvance: analysis.detailedAnalysis?.lagOrAdvance || "—",
        indicators: analysis.detailedAnalysis?.indicators || "—",
        projectProposal: analysis.detailedAnalysis?.projectProposal || "Предложений нет.",
        aiProposal: analysis.detailedAnalysis?.aiProposal || "Предложений нет."
      },
      keyProblems: Array.isArray(analysis.keyProblems) ? analysis.keyProblems : [],
      priorityActions: Array.isArray(analysis.priorityActions) ? analysis.priorityActions : []
    };
  }

  return {
    reportMeta,
    projectInfo,
    statusSummary,
    progressMetrics,
    milestonesDetails: {
      list: milestonesList,
      weightsWarning: milestoneWeightsWarning,
      weightsError: milestoneWeightsError,
      weightsStatus: milestoneWeightsStatus,
    },
    indicatorsDetails: {
      list: indicatorsList
    },
    monitoringInfo,
    isAiAnalysisFormed,
    analysisBlocks
  };
}
