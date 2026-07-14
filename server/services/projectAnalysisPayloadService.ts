import { Project, ProjectEvaluation } from "../../src/types";
import {
  getProjectCardProjectStatusView,
  getProjectCardRiskView,
  getProjectCardRiskExplanation,
  getPcStatusTooltipData,
  getQuarterPeriodStatus
} from "../../src/utils/projectRegistryStatus";
import { getProjectCardProgressMetrics } from "../../src/utils/projectCardMetrics";
import { calculateProjectDataCompleteness } from "../../src/utils/projectCompleteness";

export interface ProjectAnalysisPayload {
  schemaVersion: "project-analysis-payload-v1";
  assessmentDate: string;
  assistantEvidenceBrief: string;
  assessmentContext: {
    assessmentDate: string;
    assessmentDateMode: "today" | "custom" | "server_fallback";
    generatedAt: string;
    currentQuarter: "Q1" | "Q2" | "Q3" | "Q4";
    currentYear: number;
    analysisRule: string;
  };
  projectSnapshot: {
    projectId: string;
    projectName: string;
    projectUrl?: string;
    stage?: string;
    priority?: number | null;
    department?: string | null;
    sponsor?: string;
    projectOwner?: string;
    projectManager?: string;
    projectAdmin?: string;
    responsible?: string;
    projectTeam?: string;
    startDate?: string;
    endDate?: string;
    deadlineAt?: string;
    goals?: string[];
    resultImages?: string[];
    resourceLevel?: string | null;
    resourceValue?: string | null;
    itResourceLevel?: string | null;
    rice?: number | null;
    roi?: number | null;
  };
  dashboardSnapshot: {
    projectStatus: string | null;
    riskLevel: string | null;
    riskExplanation: string | null;
    milestonesProgressPercent: number | null;
    indicatorsProgressPercent: number | null;
    dataCompletenessPercent: number | null;
    pcStatus: string | null;
    mainRisk: string | null;
  };
  milestonesSnapshot: {
    milestones: Array<{
      quarter: string | null;
      name: string;
      weightPercent: number | null;
      factProgressPercent: number | null;
      creditedWeightPercent: number | null;
      status: string | null;
    }>;
    quarterSummary: Array<{
      quarter: string;
      planWeightPercent: number;
      factWeightPercent: number;
      deviationPercent: number;
      status: "ok" | "attention" | "risk" | "not_enough_data";
    }>;
  };
  indicatorsSnapshot: {
    indicators: Array<{
      period: string;
      name: string;
      plan: any;
      fact: any;
      performancePercent: number | null;
      cappedPerformancePercent: number | null;
      deviation: number | null;
      status: string | null;
      explanation: string | null;
    }>;
  };
  monitoringSnapshot: {
    lastPcDate: string | null;
    monitoringFrequencyWeeks: number | null;
    nextPcDate: string | null;
    assessmentDate: string;
    overdueDays: number | null;
    status: string;
    explanation: string;
  };
  riskSnapshot: {
    projectStatus: string | null;
    riskLevel: string | null;
    riskExplanation: string | null;
    manualRisks: Array<{
      title: string;
      description?: string;
      severity: string;
      owner?: string;
      recommendation?: string;
    }>;
  };
  dataQualitySnapshot: {
    completenessPercent: number | null;
    status: string;
    errorsCount: number;
    warningsCount: number;
    issuesCount: number;
    mainReasons: string[];
    explanations: string[];
    missingSignificantFields: string[];
    invalidFields?: Array<{ field: string; reason: string }>;
    humanReadableIssues: string[];
  };
  analysisInsights: {
    mainRiskSource: string | null;
    topMilestoneIssues: Array<{
      quarter: string | null;
      name: string;
      weightPercent: number | null;
      factProgressPercent: number | null;
      creditedWeightPercent: number | null;
      uncreditedWeightPercent: number | null;
      reason: string;
    }>;
    topIndicatorIssues: Array<{
      period: string | null;
      name: string;
      plan: number | string | null;
      fact: number | string | null;
      performancePercent: number | null;
      deviation: number | string | null;
      reason: string;
    }>;
    currentPeriodIssues: Array<{
      type: "milestone" | "indicator" | "pc" | "data";
      title: string;
      reason: string;
    }>;
    goalImpact: string | null;
    dataConsistencyNotes: string[];
  };
  sourceLimitations: string[];
  cardSnapshot: {
    header: {
      projectName: string;
      projectStatus: string | null;
      riskLevel: string | null;
      stage: string;
      sponsor?: string;
      projectOwner?: string;
      projectManager?: string;
      projectAdmin?: string;
      responsible?: string;
      projectTeam?: string;
      startDate?: string;
      endDate?: string;
      dataCompletenessPercent: number | null;
      projectUrl?: string;
    };
    projectProgress: {
      milestonesProgressPercent: number | null;
      indicatorsProgressPercent: number | null;
    };
    goalsAndResults: {
      goals: string[];
      resultImages: string[];
      projectAdmin?: string;
      responsible?: string;
      projectTeam?: string;
    };
    milestonesDetails: Array<{
      quarter: string | null;
      name: string;
      weightPercent: number | null;
      factProgressPercent: number | null;
      creditedWeightPercent: number | null;
      uncreditedWeightPercent: number | null;
      isProblematic: boolean;
      problemReason: string | null;
      periodStatus: "past" | "current" | "future" | "unknown";
      isDueAsOfAssessmentDate: boolean;
      isFutureAsOfAssessmentDate: boolean;
    }>;
    indicatorsDetails: Array<{
      period: string;
      name: string;
      plan: any;
      fact: any;
      performancePercent: number | null;
      deviation: number | null;
      isProblematic: boolean;
      problemReason: string | null;
      periodStatus: "past" | "current" | "future" | "unknown";
      isDueAsOfAssessmentDate: boolean;
      isFutureAsOfAssessmentDate: boolean;
    }>;
    monitoring: {
      lastPcDate: string | null;
      monitoringFrequencyWeeks: number | null;
      status: string;
      nextPcDate: string | null;
      overdueDays: number | null;
      explanation: string;
    };
    risks: {
      projectStatus: string | null;
      riskLevel: string | null;
      riskExplanation: string | null;
      manualRisks: Array<{
        title: string;
        description?: string;
        severity: string;
        owner?: string;
        recommendation?: string;
      }>;
    };
  };
  projectContentContext: {
    projectName: string;
    goals: string[];
    resultImages: string[];
    milestoneNames: string[];
    indicatorNames: string[];
    inferredProjectTheme: string | null;
    aiUsePotentialContext: string[];
  };
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePeriod(p: string | null | undefined): string {
  if (!p) return "Без периода";
  const s = String(p).trim().toLowerCase();
  
  if (s.includes("q1") || s.includes("1кв") || s.includes("1 кв") || s.includes("i кв") || s.includes("1 квартал") || s.includes("1-й кв") || s === "1") {
    return "Q1";
  }
  if (s.includes("q2") || s.includes("2кв") || s.includes("2 кв") || s.includes("ii кв") || s.includes("2 квартал") || s.includes("2-й кв") || s === "2") {
    return "Q2";
  }
  if (s.includes("q3") || s.includes("3кв") || s.includes("3 кв") || s.includes("iii кв") || s.includes("3 квартал") || s.includes("3-й кв") || s === "3") {
    return "Q3";
  }
  if (s.includes("q4") || s.includes("4кв") || s.includes("4 кв") || s.includes("iv кв") || s.includes("4 квартал") || s.includes("4-й кв") || s === "4") {
    return "Q4";
  }
  
  if (/q\s*1/i.test(s) || /1\s*-?\s*кв/i.test(s)) return "Q1";
  if (/q\s*2/i.test(s) || /2\s*-?\s*кв/i.test(s)) return "Q2";
  if (/q\s*3/i.test(s) || /3\s*-?\s*кв/i.test(s)) return "Q3";
  if (/q\s*4/i.test(s) || /4\s*-?\s*кв/i.test(s)) return "Q4";
  
  return "Без периода";
}

function parseToNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    if (isNaN(val)) return null;
    return val;
  }
  const str = String(val).trim();
  if (str === "" || str === "—" || str.toLowerCase() === "nan") return null;
  const sanitized = str.replace(/\s/g, "").replace(/,/g, ".").replace(/%/g, "");
  const parsed = parseFloat(sanitized);
  if (isNaN(parsed)) return null;
  return parsed;
}

function parsePeriodYearQuarter(
  periodStr: string | null | undefined,
  fallbackYear?: number | null
): { year: number | null; quarter: "Q1" | "Q2" | "Q3" | "Q4" | null } {
  if (!periodStr) {
    return { year: fallbackYear ?? null, quarter: null };
  }
  const raw = String(periodStr).trim().toUpperCase();
  const yearMatch = raw.match(/(20\d{2})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : (fallbackYear ?? null);
  const norm = normalizePeriod(periodStr);
  const quarter = (norm === "Q1" || norm === "Q2" || norm === "Q3" || norm === "Q4") ? norm : null;
  return { year, quarter };
}

function getPeriodStatus(
  periodStr: string | null | undefined,
  currentQuarter: "Q1" | "Q2" | "Q3" | "Q4",
  options?: {
    year?: number | null;
    assessmentDate?: string;
    projectStartDate?: string | null;
    projectEndDate?: string | null;
    currentYear?: number;
  }
): { periodStatus: "past" | "current" | "future" | "unknown"; isDueAsOfAssessmentDate: boolean; isFutureAsOfAssessmentDate: boolean } {
  const parsed = parsePeriodYearQuarter(periodStr, options?.year);
  if (!parsed.quarter) {
    return {
      periodStatus: "unknown",
      isDueAsOfAssessmentDate: false,
      isFutureAsOfAssessmentDate: false
    };
  }

  const year = parsed.year ?? options?.currentYear ?? null;
  if (year != null && options?.assessmentDate) {
    const status = getQuarterPeriodStatus(
      year,
      parsed.quarter,
      options.assessmentDate,
      options.projectStartDate,
      options.projectEndDate ?? undefined
    );
    if (status === "outside_project_period") {
      return {
        periodStatus: "unknown",
        isDueAsOfAssessmentDate: false,
        isFutureAsOfAssessmentDate: false
      };
    }
    if (status === "future") {
      return {
        periodStatus: "future",
        isDueAsOfAssessmentDate: false,
        isFutureAsOfAssessmentDate: true
      };
    }
    if (status === "current") {
      return {
        periodStatus: "current",
        isDueAsOfAssessmentDate: true,
        isFutureAsOfAssessmentDate: false
      };
    }
    return {
      periodStatus: "past",
      isDueAsOfAssessmentDate: true,
      isFutureAsOfAssessmentDate: false
    };
  }

  // Legacy fallback when year is unknown: compare quarter index only within the assessment year.
  const quarterNumbers: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
  const itemVal = quarterNumbers[parsed.quarter] || 1;
  const currentVal = quarterNumbers[currentQuarter] || 1;

  if (itemVal < currentVal) {
    return {
      periodStatus: "past",
      isDueAsOfAssessmentDate: true,
      isFutureAsOfAssessmentDate: false
    };
  } else if (itemVal === currentVal) {
    return {
      periodStatus: "current",
      isDueAsOfAssessmentDate: true,
      isFutureAsOfAssessmentDate: false
    };
  }
  return {
    periodStatus: "future",
    isDueAsOfAssessmentDate: false,
    isFutureAsOfAssessmentDate: true
  };
}

function translateFieldName(field: string): string {
  const map: Record<string, string> = {
    projectName: "Наименование проекта",
    stage: "Стадия",
    priority: "Приоритет",
    sponsor: "Спонсор",
    projectOwner: "Владелец проекта",
    projectManager: "Руководитель проекта",
    projectAdmin: "Администратор проекта",
    responsible: "Ответственный",
    projectTeam: "Команда проекта",
    startDate: "Дата старта",
    deadlineAt: "Дата финиша / Срок",
    goals: "Цели",
    resultImages: "Образы результатов",
    lastPcDate: "Дата последнего ПК",
    monitoringFrequencyWeeks: "Регулярность ПК",
    milestones: "Вехи",
    indicators: "Показатели"
  };
  return map[field] || "Неописанное поле данных";
}

export function getProblematicSignificantFields(project: Project, assessmentDate?: Date | string | null): {
  missingFields: string[];
  invalidFields: Array<{ field: string; reason: string }>;
} {
  const result = calculateProjectDataCompleteness(project, assessmentDate);
  
  // Map from projectCompleteness labels to projectAnalysisPayloadService labels
  const labelMap: Record<string, string> = {
    "Название": "Наименование проекта",
    "Цели проекта": "Цели",
    "Образы результатов": "Образы результатов",
    "Дата начала": "Дата старта",
    "Дата завершения": "Дата финиша / Срок",
    "Стадия": "Стадия",
    "Вид": "Вид проекта",
    "Руководитель проекта": "Руководитель проекта",
    "Администратор проекта": "Администратор проекта",
    "Заказчики": "Спонсор",
    "Команда проекта": "Команда проекта",
    "Приоритет": "Приоритет",
    "Ответственный": "Ответственный",
    "Дата начала мониторинга": "Дата начала мониторинга",
    "Регулярность мониторинга": "Регулярность ПК",
    "Обязательные участники Мониторинга": "Обязательные участники Мониторинга",
    "Владелец проекта": "Владелец проекта",
    "Департамент": "Департамент",
    "Дата последнего мониторинга": "Дата последнего ПК"
  };

  const missingFields = result.missingFields.map(field => labelMap[field] || field);

  const invalidFields = result.invalidFields.map(field => {
    const mappedField = labelMap[field] || field;
    let reason = `Некорректное значение поля: ${mappedField}`;
    for (const r of result.userVisibleReasons) {
      const lowerR = r.toLowerCase();
      const lowerF = field.toLowerCase();
      const lowerMapped = mappedField.toLowerCase();
      if (lowerR.includes(lowerF) || lowerR.includes(lowerMapped) || (field === "Дата начала" && lowerR.includes("даты начала")) || (field === "Дата завершения" && lowerR.includes("даты завершения"))) {
        reason = r;
        break;
      }
    }
    return { field: mappedField, reason };
  });

  return {
    missingFields,
    invalidFields
  };
}

function getSignificantCompletenessPercent(project: Project, assessmentDate?: string): number {
  const result = calculateProjectDataCompleteness(project, assessmentDate);
  return result.completenessPercent;
}

export function buildProjectAnalysisPayload(params: {
  project: Project;
  evaluation?: ProjectEvaluation | null;
  assessmentDate: string;
  assessmentDateMode?: "today" | "custom" | "server_fallback";
}): ProjectAnalysisPayload {
  const { project, evaluation, assessmentDate, assessmentDateMode = "server_fallback" } = params;

  const completenessResult = calculateProjectDataCompleteness(project, assessmentDate);
  const isLastPcMissingOrInvalid = completenessResult.missingFields.includes("Дата последнего мониторинга") || 
                                   completenessResult.invalidFields.includes("Дата последнего мониторинга");

  const [yearStr, monthStr] = assessmentDate.split("-");
  const currentYear = parseInt(yearStr, 10) || new Date().getFullYear();
  const monthNum = parseInt(monthStr, 10) || 1;
  let currentQuarter: "Q1" | "Q2" | "Q3" | "Q4" = "Q1";
  if (monthNum >= 4 && monthNum <= 6) currentQuarter = "Q2";
  else if (monthNum >= 7 && monthNum <= 9) currentQuarter = "Q3";
  else if (monthNum >= 10 && monthNum <= 12) currentQuarter = "Q4";

  const assessmentContext = {
    assessmentDate,
    assessmentDateMode,
    generatedAt: new Date().toISOString(),
    currentQuarter,
    currentYear,
    analysisRule: "Анализ выполняется на дату оценки в режиме карточки проекта (project-card thresholds). Будущие периоды после даты оценки не считаются отставанием без отдельного фактического основания."
  };

  const selectedQuarterNum =
    currentQuarter === "Q1" ? 1 : currentQuarter === "Q2" ? 2 : currentQuarter === "Q3" ? 3 : 4;
  const cardProgress = getProjectCardProgressMetrics({
    project,
    evaluation,
    selectedYear: currentYear,
    selectedQuarter: selectedQuarterNum,
    assessmentDate
  });

  // 1. Project Snapshot
  const projectSnapshot = {
    projectId: project.projectId,
    projectName: project.projectName,
    projectUrl: project.projectUrl,
    stage: project.stage,
    priority: project.priority ?? null,
    department: project.department ?? null,
    sponsor: project.sponsor,
    projectOwner: project.projectOwner,
    projectManager: project.projectManager,
    projectAdmin: project.projectAdmin,
    responsible: project.responsible,
    projectTeam: project.projectTeam,
    startDate: project.startDate,
    endDate: project.endDate,
    deadlineAt: project.deadlineAt,
    goals: project.goals ?? [],
    resultImages: project.resultImages ?? [],
    resourceLevel: project.resourceLevel ?? null,
    resourceValue: project.resourceValue ?? null,
    itResourceLevel: project.itResourceLevel ?? null,
    rice: project.rice ?? null,
    roi: project.roi ?? null,
  };

  // 2. Compute components for Dashboard and Main Risk (aligned with Project Card)
  const projectStatus = getProjectCardProjectStatusView(project, evaluation, assessmentDate);
  const riskLevel = getProjectCardRiskView(project, evaluation, assessmentDate);
  const riskExplanation = getProjectCardRiskExplanation(project, evaluation, assessmentDate);
  const milestonesProgressPercent =
    cardProgress.milestonesQuarterVal ??
    evaluation?.milestones?.actualProgressPercent ??
    null;
  const indicatorsProgressPercent =
    cardProgress.kpiQuarterVal ??
    evaluation?.indicators?.cappedAveragePerformancePercent ??
    evaluation?.indicators?.averagePerformancePercent ??
    null;
  const dataCompletenessPercent = evaluation?.dataQuality?.completenessPercent ?? getSignificantCompletenessPercent(project, assessmentDate);
  
  const pcInfo = getPcStatusTooltipData(project, evaluation, assessmentDate);
  const pcStatus = pcInfo ? pcInfo.status : "Недостаточно данных";

  // Detailed logic to categorize prime/main risks
  let mainRisk: string | null = null;
  if (pcStatus === 'Просрочен') {
    mainRisk = "Проектный комитет просрочен";
  } else if (milestonesProgressPercent !== null && milestonesProgressPercent < 90) {
    mainRisk = "Существенное отставание по вехам проекта";
  } else if (indicatorsProgressPercent !== null && indicatorsProgressPercent < 90) {
    mainRisk = "Существенное отставание по показателям";
  } else if (evaluation?.dataQuality && evaluation.dataQuality.status === 'error') {
    mainRisk = "Критические ошибки ведения данных";
  } else if (riskLevel === 'Высокий') {
    mainRisk = "Высокий уровень управленческого риска";
  } else if (riskLevel === 'Средний') {
    mainRisk = "Умеренный уровень управленческого риска";
  } else {
    mainRisk = "Нет критических рисков";
  }

  const dashboardSnapshot = {
    projectStatus,
    riskLevel,
    riskExplanation,
    milestonesProgressPercent,
    indicatorsProgressPercent,
    dataCompletenessPercent,
    pcStatus,
    mainRisk
  };

  // 3. Milestones Snapshot — prefer evaluation weight model results
  const periodStatusOptions = {
    assessmentDate,
    projectStartDate: project.startDate,
    projectEndDate: project.deadlineAt || project.endDate,
    currentYear
  };

  const milestonesData = (evaluation?.milestones?.milestoneResults?.length
    ? evaluation.milestones.milestoneResults.map((m) => {
        const weightPercent = typeof m.effectiveWeightPercent === "number" ? m.effectiveWeightPercent : null;
        const factProgressPercent = typeof m.completionPercent === "number" ? m.completionPercent : null;
        const creditedWeightPercent = typeof m.contributionPercent === "number" ? m.contributionPercent : null;
        return {
          quarter: `${m.year} ${m.quarter}`,
          year: m.year,
          name: m.name ? String(m.name).trim() : "Без названия",
          weightPercent,
          factProgressPercent,
          creditedWeightPercent,
          status: null as string | null
        };
      })
    : (project.milestones || []).map((m) => {
        const quarter = m.quarter ? normalizePeriod(m.quarter) : null;
        const weightPercent = typeof m.weight === "number" ? m.weight : null;
        const factProgressPercent = typeof m.progressPercent === "number" ? m.progressPercent : null;
        const creditedWeightPercent =
          weightPercent !== null && factProgressPercent !== null
            ? (weightPercent * factProgressPercent) / 100
            : null;
        const parsed = parsePeriodYearQuarter(m.quarter, currentYear);
        return {
          quarter,
          year: parsed.year,
          name: m.title ? String(m.title).trim() : "Без названия",
          weightPercent,
          factProgressPercent,
          creditedWeightPercent,
          status: m.status ?? null
        };
      })
  );

  // Quarter summary
  const quarterSummaryMap = new Map<string, { plan: number; fact: number }>();
  const activeQuarters = ["Q1", "Q2", "Q3", "Q4"];
  activeQuarters.forEach(q => quarterSummaryMap.set(q, { plan: 0, fact: 0 }));

  let hasWeightInMilestones = false;
  milestonesData.forEach(md => {
    if (md.quarter && quarterSummaryMap.has(md.quarter)) {
      const current = quarterSummaryMap.get(md.quarter)!;
      if (md.weightPercent !== null) {
        current.plan += md.weightPercent;
        hasWeightInMilestones = true;
      }
      if (md.creditedWeightPercent !== null) {
        current.fact += md.creditedWeightPercent;
      }
    }
  });

  const quarterSummary = activeQuarters.map(q => {
    const values = quarterSummaryMap.get(q)!;
    const planWeightPercent = values.plan;
    const factWeightPercent = values.fact;
    const deviationPercent = factWeightPercent - planWeightPercent;

    let status: "ok" | "attention" | "risk" | "not_enough_data" = "not_enough_data";
    if (planWeightPercent > 0) {
      if (deviationPercent >= 0) {
        status = "ok";
      } else if (deviationPercent >= -10) {
        status = "attention";
      } else {
        status = "risk";
      }
    }

    return {
      quarter: q,
      planWeightPercent,
      factWeightPercent,
      deviationPercent,
      status
    };
  });

  // 4. Indicators Snapshot with priorities and deduplication
  const indicatorsMap = new Map<string, {
    period: string;
    name: string;
    plan: any;
    fact: any;
    performancePercent: number | null;
    cappedPerformancePercent: number | null;
    status: string | null;
    explanation: string | null;
  }>();

  // Helper helper to register/merge indicators
  const registerIndicator = (item: {
    name: string;
    period: string | null;
    plan: any;
    fact: any;
    performancePercent: number | null;
    cappedPerformancePercent: number | null;
    status: string | null;
    explanation: string | null;
  }) => {
    const normName = normalizeName(item.name);
    const normPeriod = normalizePeriod(item.period);
    const key = `${normName}||${normPeriod}`;

    if (!indicatorsMap.has(key)) {
      indicatorsMap.set(key, {
        period: normPeriod,
        name: item.name.trim(),
        plan: item.plan,
        fact: item.fact,
        performancePercent: item.performancePercent,
        cappedPerformancePercent: item.cappedPerformancePercent,
        status: item.status,
        explanation: item.explanation
      });
    } else {
      const existing = indicatorsMap.get(key)!;
      if (existing.plan === null || existing.plan === undefined || existing.plan === "") {
        existing.plan = item.plan;
      }
      if (existing.fact === null || existing.fact === undefined || existing.fact === "") {
        existing.fact = item.fact;
      }
      if (existing.performancePercent === null || existing.performancePercent === undefined) {
        existing.performancePercent = item.performancePercent;
      }
      if (existing.cappedPerformancePercent === null || existing.cappedPerformancePercent === undefined) {
        existing.cappedPerformancePercent = item.cappedPerformancePercent;
      }
      if (!existing.status && item.status) {
        existing.status = item.status;
      }
      if (!existing.explanation && item.explanation) {
        existing.explanation = item.explanation;
      }
    }
  };

  // Priority 1: evaluation.indicators.indicatorResults
  if (evaluation?.indicators?.indicatorResults && Array.isArray(evaluation.indicators.indicatorResults)) {
    evaluation.indicators.indicatorResults.forEach((ind) => {
      const period = ind.quarter ? `${ind.quarter} ${ind.year || ""}`.trim() : null;
      registerIndicator({
        name: ind.name || "Без названия",
        period,
        plan: ind.plan,
        fact: ind.fact,
        performancePercent: ind.performancePercent,
        cappedPerformancePercent: ind.cappedPerformancePercent,
        status: ind.status,
        explanation: ind.explanation
      });
    });
  }

  // Priority 2: project.indicators
  if (Array.isArray(project.indicators)) {
    project.indicators.forEach((ind) => {
      registerIndicator({
        name: ind.name || "Без названия",
        period: ind.period ? String(ind.period).trim() : null,
        plan: ind.planValue ?? ind.planValue ?? null,
        fact: ind.factValue ?? ind.factValue ?? null,
        performancePercent: null,
        cappedPerformancePercent: null,
        status: null,
        explanation: ind.comment || null
      });
    });
  }

  // Priority 3: project.effects
  const rawEffects = (project as any).effects;
  if (Array.isArray(rawEffects)) {
    rawEffects.forEach((eff) => {
      registerIndicator({
        name: eff.name || eff.title || "Без названия",
        period: eff.period ? String(eff.period).trim() : null,
        plan: eff.planValue ?? eff.plan ?? null,
        fact: eff.factValue ?? eff.fact ?? null,
        performancePercent: typeof eff.performancePercent === "number" ? eff.performancePercent : null,
        cappedPerformancePercent: null,
        status: null,
        explanation: null
      });
    });
  }

  const indicatorsList = Array.from(indicatorsMap.values()).map(item => {
    let performancePercent = item.performancePercent;
    if (performancePercent === null) {
      const planNum = parseToNumber(item.plan);
      const factNum = parseToNumber(item.fact);
      if (planNum !== null && planNum !== 0 && factNum !== null) {
        performancePercent = (factNum / planNum) * 100;
      }
    }

    const deviation = performancePercent !== null ? performancePercent - 100 : null;
    let status = item.status;
    if (!status && performancePercent !== null) {
      if (performancePercent >= 100) {
        status = "ok";
      } else if (performancePercent >= 90) {
        status = "attention";
      } else {
        status = "risk";
      }
    }

    return {
      period: item.period,
      name: item.name,
      plan: item.plan,
      fact: item.fact,
      performancePercent,
      cappedPerformancePercent: item.cappedPerformancePercent ?? (performancePercent !== null ? Math.min(100, Math.max(0, performancePercent)) : null),
      deviation,
      status: status || "not_enough_data",
      explanation: item.explanation
    };
  });

  // 5. Monitoring Snapshot
  const monitoringSnapshot = {
    lastPcDate: project.lastPcDate ? String(project.lastPcDate).trim() : null,
    monitoringFrequencyWeeks: project.monitoringFrequencyWeeks ?? null,
    nextPcDate: pcInfo ? pcInfo.nextPcDate : null,
    assessmentDate,
    overdueDays: pcInfo ? pcInfo.overdueDays : null,
    status: pcStatus,
    explanation: pcInfo ? pcInfo.explanation : "Нет данных по Проектному комитету."
  };

  // 6. Risk Snapshot
  const manualRisks = Array.isArray(project.risks) ? project.risks.map(r => ({
    title: r.title ? String(r.title).trim() : "Без названия",
    description: r.description ? String(r.description).trim() : undefined,
    severity: r.severity ? String(r.severity).trim() : "medium",
    owner: r.owner ? String(r.owner).trim() : undefined,
    recommendation: r.recommendation ? String(r.recommendation).trim() : undefined
  })) : [];

  const riskSnapshot = {
    projectStatus,
    riskLevel,
    riskExplanation,
    manualRisks
  };

  // 7. Data Quality Snapshot
  const completenessPercent = dataCompletenessPercent;
  
  const { missingFields: rawMissingFields, invalidFields: rawInvalidFields } = getProblematicSignificantFields(project, assessmentDate);
  const filteredMissingFields = rawMissingFields.filter(f => {
    const lower = f.toLowerCase();
    return !lower.includes("ресурс") && !lower.includes("rice") && !lower.includes("roi") && !lower.includes("задач");
  });
  const filteredInvalidFields = rawInvalidFields.filter(f => {
    const lower = f.field.toLowerCase();
    return !lower.includes("ресурс") && !lower.includes("rice") && !lower.includes("roi") && !lower.includes("задач");
  });

  const humanReadableIssues: string[] = [];
  if (evaluation?.explanations && evaluation.explanations.length > 0) {
    evaluation.explanations.forEach(exp => {
      const lower = exp.toLowerCase();
      if (!lower.includes("ресурс") && !lower.includes("rice") && !lower.includes("roi") && !lower.includes("задач") && !lower.includes("вех") && !lower.includes("показател")) {
        humanReadableIssues.push(exp);
      }
    });
  }
  filteredMissingFields.forEach(field => {
    humanReadableIssues.push(`Отсутствует обязательное поле: ${field}`);
  });
  filteredInvalidFields.forEach(inf => {
    humanReadableIssues.push(`Некорректное значение поля ${inf.field}: ${inf.reason}`);
  });
  if (humanReadableIssues.length === 0) {
    const errCount = evaluation?.dataQuality?.errorsCount ?? 0;
    const warnCount = evaluation?.dataQuality?.warningsCount ?? 0;
    if (errCount > 0) {
      humanReadableIssues.push(`Обнаружено критических ошибок в данных: ${errCount}`);
    }
    if (warnCount > 0) {
      humanReadableIssues.push(`Обнаружено предупреждений в данных: ${warnCount}`);
    }
  }

  const dataQualitySnapshot = {
    completenessPercent,
    status: evaluation?.dataQuality?.status ?? (completenessPercent !== null ? (completenessPercent >= 90 ? "ok" : completenessPercent >= 50 ? "warning" : "error") : "warning"),
    errorsCount: evaluation?.dataQuality?.errorsCount ?? 0,
    warningsCount: evaluation?.dataQuality?.warningsCount ?? 0,
    issuesCount: evaluation?.dataQuality?.issuesCount ?? 0,
    mainReasons: evaluation?.projectHealth?.mainReasons ?? [],
    explanations: (evaluation?.explanations ?? []).filter(e => {
      const l = e.toLowerCase();
      return !l.includes("ресурс") && !l.includes("rice") && !l.includes("roi") && !l.includes("задач");
    }),
    missingSignificantFields: filteredMissingFields,
    invalidFields: filteredInvalidFields,
    humanReadableIssues
  };

  // 8. Source Limitations
  const sourceLimitations: string[] = [];
  if (!evaluation) {
    sourceLimitations.push("Отсутствует сохраненный расчет оценки (evaluation) проекта на текущую дату.");
  }
  if (!project.milestones || project.milestones.length === 0) {
    sourceLimitations.push("Нет данных по вехам проекта.");
  }
  if (indicatorsList.length === 0) {
    sourceLimitations.push("Нет данных по показателям проекта.");
  }
  if (isLastPcMissingOrInvalid) {
    sourceLimitations.push("Невозможно полностью оценить своевременность проведение Проектного комитета, так как отсутствует или невалидна дата последнего ПК.");
  }
  if (!project.goals || project.goals.length === 0) {
    sourceLimitations.push("Отсутствуют ключевые цели проекта.");
  }
  if (!project.resultImages || project.resultImages.length === 0) {
    sourceLimitations.push("Отсутствуют образы результатов проекта.");
  }

  // == ANALYSIS INSIGHTS COMPUTATION ==
  // 1. mainRiskSource
  let mainRiskSource: string | null = null;
  if (pcStatus === 'Просрочен') {
    mainRiskSource = "ПК";
  } else if (milestonesProgressPercent !== null && milestonesProgressPercent < 90) {
    mainRiskSource = "Вехи";
  } else if (indicatorsProgressPercent !== null && indicatorsProgressPercent < 90) {
    mainRiskSource = "Показатели";
  } else if ((dataCompletenessPercent !== null && dataCompletenessPercent < 90) || (evaluation?.dataQuality && evaluation.dataQuality.status === 'error')) {
    mainRiskSource = "Данные";
  } else if (manualRisks.length > 0) {
    mainRiskSource = "Риски";
  }

  // 2. topMilestoneIssues (Max 5 elements)
  const milestoneIssuesCandidate = milestonesData.filter((m) => {
    const statusInfo = getPeriodStatus(m.quarter, currentQuarter, {
      ...periodStatusOptions,
      year: (m as { year?: number | null }).year
    });
    if (!statusInfo.isDueAsOfAssessmentDate) return false;

    const w = m.weightPercent ?? 0;
    if (w <= 0) return false;
    const progress = m.factProgressPercent;
    const isLessThan100 = progress === null || progress === undefined || progress < 100;
    return isLessThan100;
  }).map((m) => {
    const weightPercent = m.weightPercent;
    const factProgressPercent = m.factProgressPercent;
    const creditedWeightPercent = m.creditedWeightPercent;
    const uncreditedWeightPercent = weightPercent !== null 
      ? weightPercent - (creditedWeightPercent ?? 0) 
      : null;

    let reason = "Вес указан, но зачтенный вес ниже планового.";
    if (factProgressPercent === null || factProgressPercent === undefined) {
      reason = "Не указан факт выполнения при наличии веса.";
    } else if (factProgressPercent === 0) {
      reason = "Нулевой факт выполнения при наличии веса.";
    } else if (factProgressPercent < 100) {
      reason = "Частичный факт выполнения при наличии веса.";
    }

    return {
      quarter: m.quarter,
      name: m.name,
      weightPercent,
      factProgressPercent,
      creditedWeightPercent,
      uncreditedWeightPercent,
      reason
    };
  });

  milestoneIssuesCandidate.sort((a, b) => {
    const uncredA = a.uncreditedWeightPercent ?? 0;
    const uncredB = b.uncreditedWeightPercent ?? 0;
    if (uncredB !== uncredA) {
      return uncredB - uncredA;
    }
    const wA = a.weightPercent ?? 0;
    const wB = b.weightPercent ?? 0;
    return wB - wA;
  });

  const topMilestoneIssues = milestoneIssuesCandidate.slice(0, 5);

  // 3. topIndicatorIssues (Max 5 elements)
  const indicatorIssuesCandidate = indicatorsList.filter((ind) => {
    const statusInfo = getPeriodStatus(ind.period, currentQuarter, periodStatusOptions);
    if (!statusInfo.isDueAsOfAssessmentDate) return false;

    const planVal = ind.plan;
    const hasPlan = planVal !== null && planVal !== undefined && String(planVal).trim() !== "" && String(planVal).trim() !== "—";
    if (!hasPlan) return false;

    const factVal = ind.fact;
    const factNum = parseToNumber(factVal);
    const hasFact = factVal !== null && factVal !== undefined && String(factVal).trim() !== "" && String(factVal).trim() !== "—";

    const isLessThan100 = ind.performancePercent !== null && ind.performancePercent < 100;
    const factMissing = !hasFact;
    const factIsZero = factNum === 0;
    const isNegativeDeviation = (ind.deviation !== null && ind.deviation < 0);

    return isLessThan100 || factMissing || factIsZero || isNegativeDeviation;
  }).map((ind) => {
    const factVal = ind.fact;
    const factNum = parseToNumber(factVal);
    const hasFact = factVal !== null && factVal !== undefined && String(factVal).trim() !== "" && String(factVal).trim() !== "—";
    
    let reason = "Выполнение ниже 100%.";
    if (!hasFact) {
      reason = "Факт отсутствует при наличии плана.";
    } else if (factNum === 0) {
      reason = "Нулевой факт при наличии плана.";
    } else if (ind.performancePercent !== null && ind.performancePercent < 100) {
      reason = "Факт ниже плана.";
    }

    return {
      period: ind.period,
      name: ind.name,
      plan: ind.plan,
      fact: ind.fact,
      performancePercent: ind.performancePercent,
      deviation: ind.deviation,
      reason
    };
  });

  indicatorIssuesCandidate.sort((a, b) => {
    const aFactNum = parseToNumber(a.fact);
    const bFactNum = parseToNumber(b.fact);
    const aMissingOrZero = (a.fact === null || a.fact === undefined || String(a.fact).trim() === "" || String(a.fact).trim() === "—" || aFactNum === 0) ? 1 : 0;
    const bMissingOrZero = (b.fact === null || b.fact === undefined || String(b.fact).trim() === "" || String(b.fact).trim() === "—" || bFactNum === 0) ? 1 : 0;

    if (bMissingOrZero !== aMissingOrZero) {
      return bMissingOrZero - aMissingOrZero;
    }

    const devA = a.deviation !== null ? a.deviation : 0;
    const devB = b.deviation !== null ? b.deviation : 0;
    if (devA !== devB) {
      return devA - devB;
    }

    const perfA = a.performancePercent !== null ? a.performancePercent : 999999;
    const perfB = b.performancePercent !== null ? b.performancePercent : 999999;
    return perfA - perfB;
  });

  const topIndicatorIssues = indicatorIssuesCandidate.slice(0, 5);

  // 4. currentPeriodIssues
  const currentPeriodIssues: Array<{
    type: "milestone" | "indicator" | "pc" | "data";
    title: string;
    reason: string;
  }> = [];

  topMilestoneIssues.forEach((m) => {
    const parsed = parsePeriodYearQuarter(m.quarter, (m as { year?: number | null }).year ?? currentYear);
    const isCurrentPeriod =
      parsed.quarter === currentQuarter &&
      (parsed.year == null || parsed.year === currentYear);
    if (isCurrentPeriod) {
      currentPeriodIssues.push({
        type: "milestone",
        title: `Веха: ${m.name}`,
        reason: m.reason
      });
    }
  });

  topIndicatorIssues.forEach((ind) => {
    const parsed = parsePeriodYearQuarter(ind.period, currentYear);
    const isCurrentPeriod =
      parsed.quarter === currentQuarter &&
      (parsed.year == null || parsed.year === currentYear);
    if (isCurrentPeriod) {
      currentPeriodIssues.push({
        type: "indicator",
        title: `Показатель: ${ind.name}`,
        reason: ind.reason
      });
    }
  });

  if (pcStatus === 'Просрочен') {
    currentPeriodIssues.push({
      type: "pc",
      title: "Проектный комитет просрочен",
      reason: pcInfo ? pcInfo.explanation : "Дата Проектного комитета просрочена."
    });
  }

  const { missingFields: rawMissingFieldsForPeriod, invalidFields: rawInvalidFieldsForPeriod } = getProblematicSignificantFields(project, assessmentDate);
  const missingFields = rawMissingFieldsForPeriod.filter(f => {
    const lower = f.toLowerCase();
    return !lower.includes("ресурс") && !lower.includes("rice") && !lower.includes("roi") && !lower.includes("задач");
  });
  const invalidFields = rawInvalidFieldsForPeriod.filter(f => {
    const lower = f.field.toLowerCase();
    return !lower.includes("ресурс") && !lower.includes("rice") && !lower.includes("roi") && !lower.includes("задач");
  });
  if (missingFields.length > 0) {
    currentPeriodIssues.push({
      type: "data",
      title: "Пробелы в обязательных данных",
      reason: `Отсутствуют значимые поля: ${missingFields.join(", ")}.`
    });
  }
  if (invalidFields.length > 0) {
    currentPeriodIssues.push({
      type: "data",
      title: "Некорректные данные",
      reason: `Присутствуют некорректные поля: ${invalidFields.map(f => `${f.field} (${f.reason})`).join("; ")}.`
    });
  }

  // 5. goalImpact
  let goalImpact: string | null = null;
  const hasGoalsOrImages = (projectSnapshot.goals && projectSnapshot.goals.length > 0) || (projectSnapshot.resultImages && projectSnapshot.resultImages.length > 0);
  const hasLag = topMilestoneIssues.length > 0 || topIndicatorIssues.length > 0;
  if (hasGoalsOrImages && hasLag) {
    goalImpact = "Текущее отставание по вехам или показателям может повлиять на достижение заявленных целей и образов результатов проекта.";
  }

  // 6. dataConsistencyNotes
  const dataConsistencyNotes: string[] = [];

  const milestoneHasWeightNoFact = (project.milestones || []).some(m => {
    const hasWeight = typeof m.weight === 'number' && m.weight > 0;
    const hasProgress = m.progressPercent !== null && m.progressPercent !== undefined;
    return hasWeight && !hasProgress;
  });
  if (milestoneHasWeightNoFact) {
    dataConsistencyNotes.push("Обнаружены вехи проекта, для которых указаны плановые веса, но отсутствует фактический прогресс выполнения.");
  }

  const indicatorHasPlanNoFact = indicatorsList.some(ind => {
    const planVal = ind.plan;
    const hasPlan = planVal !== null && planVal !== undefined && String(planVal).trim() !== "" && String(planVal).trim() !== "—";
    const factVal = ind.fact;
    const hasFact = factVal !== null && factVal !== undefined && String(factVal).trim() !== "" && String(factVal).trim() !== "—";
    return hasPlan && !hasFact;
  });
  if (indicatorHasPlanNoFact) {
    dataConsistencyNotes.push("Содержатся ключевые показатели, у которых заполнены плановые цели, но отсутствуют фактические значения выполнения.");
  }

  if (isLastPcMissingOrInvalid) {
    dataConsistencyNotes.push("Оценка своевременности Проектного комитета (ПК) усложнена из-за отсутствия или невалидности зафиксированной даты последнего мониторинга.");
  }

  if (missingFields.length > 0) {
    dataConsistencyNotes.push(`В карточке проекта не заполнены значимые поля: ${missingFields.join(", ")}.`);
  }



  const analysisInsights = {
    mainRiskSource,
    topMilestoneIssues,
    topIndicatorIssues,
    currentPeriodIssues,
    goalImpact,
    dataConsistencyNotes
  };

  // == CARD SNAPSHOT ==
  const cardSnapshot = {
    header: {
      projectName: project.projectName,
      projectStatus,
      riskLevel,
      stage: project.stage || "Черновик",
      sponsor: project.sponsor,
      projectOwner: project.projectOwner,
      projectManager: project.projectManager,
      projectAdmin: project.projectAdmin,
      responsible: project.responsible,
      projectTeam: project.projectTeam,
      startDate: project.startDate,
      endDate: project.endDate,
      dataCompletenessPercent,
      projectUrl: project.projectUrl
    },
    projectProgress: {
      milestonesProgressPercent,
      indicatorsProgressPercent
    },
    goalsAndResults: {
      goals: project.goals ?? [],
      resultImages: project.resultImages ?? [],
      projectAdmin: project.projectAdmin,
      responsible: project.responsible,
      projectTeam: project.projectTeam
    },
    milestonesDetails: milestonesData.map((m) => {
      const weightPercent = m.weightPercent;
      const factProgressPercent = m.factProgressPercent;
      const creditedWeightPercent = m.creditedWeightPercent;
      const uncreditedWeightPercent = weightPercent !== null 
        ? weightPercent - (creditedWeightPercent ?? 0) 
        : null;

      const statusInfo = getPeriodStatus(m.quarter, currentQuarter, {
        ...periodStatusOptions,
        year: (m as { year?: number | null }).year
      });

      let isProblematic = (factProgressPercent === null && (weightPercent ?? 0) > 0) ||
                            (factProgressPercent !== null && factProgressPercent < 100) ||
                            (uncreditedWeightPercent !== null && uncreditedWeightPercent > 0);

      if (statusInfo.isFutureAsOfAssessmentDate) {
        isProblematic = false;
      }

      let problemReason: string | null = null;
      if (isProblematic) {
        if (factProgressPercent === null) {
          problemReason = "Отсутствует факт выполнения при наличии веса вехи.";
        } else if (factProgressPercent === 0) {
          problemReason = "Нулевой факт выполнения при наличии веса.";
        } else if (factProgressPercent < 100) {
          problemReason = `Частичный факт выполнения (${factProgressPercent}%).`;
        } else if (uncreditedWeightPercent !== null && uncreditedWeightPercent > 0) {
          problemReason = `Имеется незачтенный вес (${uncreditedWeightPercent.toFixed(1)}%).`;
        }
      }

      return {
        quarter: m.quarter,
        name: m.name,
        weightPercent,
        factProgressPercent,
        creditedWeightPercent,
        uncreditedWeightPercent,
        isProblematic,
        problemReason,
        periodStatus: statusInfo.periodStatus,
        isDueAsOfAssessmentDate: statusInfo.isDueAsOfAssessmentDate,
        isFutureAsOfAssessmentDate: statusInfo.isFutureAsOfAssessmentDate
      };
    }),
    indicatorsDetails: indicatorsList.map((ind) => {
      const planNum = parseToNumber(ind.plan);
      const factNum = parseToNumber(ind.fact);
      const hasPlan = planNum !== null;
      const hasFact = factNum !== null;
      const performancePercent = ind.performancePercent;
      const deviation = ind.deviation;

      const statusInfo = getPeriodStatus(ind.period, currentQuarter, periodStatusOptions);

      let isProblematic = (hasPlan && !hasFact) ||
                            (hasPlan && factNum === 0 && planNum !== 0) ||
                            (hasPlan && hasFact && factNum < planNum) ||
                            (performancePercent !== null && performancePercent < 100);

      if (statusInfo.isFutureAsOfAssessmentDate) {
        isProblematic = false;
      }

      let problemReason: string | null = null;
      if (isProblematic) {
        if (!hasFact) {
          problemReason = "Факт отсутствует при наличии плана.";
        } else if (factNum === 0 && planNum !== 0) {
          problemReason = "Нулевой факт при наличии плана.";
        } else if (hasPlan && hasFact && factNum < planNum) {
          problemReason = "Уровень факта ниже запланированного значения.";
        } else if (performancePercent !== null && performancePercent < 100) {
          problemReason = `Целевой процент выполнения не достигнут (${performancePercent.toFixed(1)}%).`;
        }
      }

      return {
        period: ind.period,
        name: ind.name,
        plan: ind.plan,
        fact: ind.fact,
        performancePercent,
        deviation,
        isProblematic,
        problemReason,
        periodStatus: statusInfo.periodStatus,
        isDueAsOfAssessmentDate: statusInfo.isDueAsOfAssessmentDate,
        isFutureAsOfAssessmentDate: statusInfo.isFutureAsOfAssessmentDate
      };
    }),
    monitoring: {
      lastPcDate: monitoringSnapshot.lastPcDate,
      monitoringFrequencyWeeks: monitoringSnapshot.monitoringFrequencyWeeks,
      status: monitoringSnapshot.status,
      nextPcDate: monitoringSnapshot.nextPcDate,
      overdueDays: monitoringSnapshot.overdueDays,
      explanation: monitoringSnapshot.explanation
    },
    risks: {
      projectStatus,
      riskLevel,
      riskExplanation,
      manualRisks
    }
  };

  // == PROJECT CONTENT CONTEXT ==
  const combinedWords = [
    project.projectName || "",
    ...(project.goals ?? []),
    ...(project.resultImages ?? []),
    ...milestonesData.map(m => m.name),
    ...indicatorsList.map(i => i.name)
  ].join(" ").toLowerCase();

  let inferredProjectTheme: string | null = null;
  let aiUsePotentialContext: string[] = [];

  if (combinedWords.includes("проектн") || combinedWords.includes("управлен") || combinedWords.includes("портфел") || combinedWords.includes("gpm") || combinedWords.includes("pm") || combinedWords.includes("проджект") || combinedWords.includes("прожект") || combinedWords.includes("планирован") || combinedWords.includes("вех") || combinedWords.includes("pmо") || combinedWords.includes("офис") || combinedWords.includes("команд") || combinedWords.includes("pm-") || combinedWords.includes("project management")) {
    inferredProjectTheme = "проектное управление";
    aiUsePotentialContext = [
      "подготовка шаблонов проектных документов",
      "помощь в формировании статусов проектов",
      "подготовка выводов по ПК",
      "анализ вех и показателей проектного портфеля"
    ];

    if (combinedWords.includes("ии-помощник по старту проекта") || combinedWords.includes("помощник по старту")) {
      aiUsePotentialContext.push("ИИ-помощник для старта проекта.");
    }
    if (combinedWords.includes("ии-помощник по мониторингу") || combinedWords.includes("помощник по мониторинг")) {
      aiUsePotentialContext.push("ИИ-помощник для мониторинга проекта.");
    }
    if (combinedWords.includes("ии-помощник по завершению проекта") || combinedWords.includes("помощник по завершению")) {
      aiUsePotentialContext.push("ИИ-помощник для завершения проекта.");
    }
    if (combinedWords.includes("шаблоны проектной документации") || combinedWords.includes("шаблон")) {
      aiUsePotentialContext.push("Подготовка шаблонов проектной документации.");
    }
    if (combinedWords.includes("статусы проектов") || combinedWords.includes("статус")) {
      aiUsePotentialContext.push("Формирование черновиков статусов проектов.");
    }
    if (combinedWords.includes("Проектный комитет") || combinedWords.includes("пк")) {
      aiUsePotentialContext.push("Подготовка выводов по ПК.");
    }
    if (combinedWords.includes("итоговый отчет по портфелю проектов") || combinedWords.includes("итоговый отчет")) {
      aiUsePotentialContext.push("Подготовка итогового отчета по портфелю проектов.");
    }

    // Clean up duplicates (e.g. if generic matches are similar to specific ones, we can normalize them)
    const uniqueList: string[] = [];
    const seen = new Set<string>();
    for (const item of aiUsePotentialContext) {
      const normalized = item.toLowerCase().replace(/[.,ё]/g, "").replace("ии-", "ии").trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueList.push(item);
      }
    }
    aiUsePotentialContext = uniqueList;
  } else if (combinedWords.includes("база знан") || combinedWords.includes("вики") || combinedWords.includes("wiki") || combinedWords.includes("знани") || combinedWords.includes("статьи") || combinedWords.includes("библиотек") || combinedWords.includes("справк") || combinedWords.includes("справочн") || combinedWords.includes("knowledge")) {
    inferredProjectTheme = "база знаний";
    aiUsePotentialContext = [
      "генерация черновиков статей",
      "классификация материалов",
      "поиск и краткие выжимки"
    ];
  } else if (combinedWords.includes("отчетн") || combinedWords.includes("дашборд") || combinedWords.includes("сводк") || combinedWords.includes("отчет") || combinedWords.includes("dashboard") || combinedWords.includes("аналитик") || combinedWords.includes("презентац") || combinedWords.includes("срез")) {
    inferredProjectTheme = "отчетность";
    aiUsePotentialContext = [
      "подготовка сводок",
      "выявление отклонений",
      "формирование пояснений к статусам"
    ];
  } else if (combinedWords.includes("мониторинг") || combinedWords.includes("контрол") || combinedWords.includes("проектный комитет") || combinedWords.includes("трекинг") || combinedWords.includes("отслеж") || combinedWords.includes("индикатор") || combinedWords.includes("параметр") || combinedWords.includes("контролир") || combinedWords.includes("tracker")) {
    inferredProjectTheme = "мониторинг";
    aiUsePotentialContext = [
      "автоматическое отслеживание прогресса по вехам",
      "прогнозирование рисков отставания",
      "интеллектуальный анализ отклонений показателей"
    ];
  } else if (combinedWords.includes("автоматизац") || combinedWords.includes("интеграц") || combinedWords.includes("робот") || combinedWords.includes("скрипт") || combinedWords.includes("b24") || combinedWords.includes("bitrix") || combinedWords.includes("битрикс") || combinedWords.includes("интегрир")) {
    inferredProjectTheme = "автоматизация процесса";
    aiUsePotentialContext = [
      "интеллектуальное назначение ответственных и задач",
      "оптимизация и интеллектуальная маршрутизация процессов",
      "автоматическое распознавание документов и извлечение данных"
    ];
  } else if (combinedWords.includes("обучен") || combinedWords.includes("курс") || combinedWords.includes("учебн") || combinedWords.includes("школ") || combinedWords.includes("академи") || combinedWords.includes("семинар") || combinedWords.includes("тренинг") || combinedWords.includes("аттестац") || combinedWords.includes("проверк") || combinedWords.includes("тест") || combinedWords.includes("усвоен") || combinedWords.includes("класс") || combinedWords.includes("лектор") || combinedWords.includes("education") || combinedWords.includes("learning")) {
    inferredProjectTheme = "обучение";
    aiUsePotentialContext = [
      "генерация учебных материалов",
      "подготовка тестов",
      "проверка усвоения знаний"
    ];
  }

  const projectContentContext = {
    projectName: project.projectName,
    goals: project.goals ?? [],
    resultImages: project.resultImages ?? [],
    milestoneNames: milestonesData.map(m => m.name),
    indicatorNames: indicatorsList.map(i => i.name),
    inferredProjectTheme,
    aiUsePotentialContext
  };

  // == ASSISTANT EVIDENCE BRIEF ==
  const overdueOrLeeway = cardSnapshot.monitoring.overdueDays !== null
    ? (cardSnapshot.monitoring.overdueDays > 0
        ? `просрочка ${cardSnapshot.monitoring.overdueDays} дн.`
        : `запас ${Math.abs(cardSnapshot.monitoring.overdueDays)} дн.`)
    : "нет данных";

  const milestoneLines = topMilestoneIssues.length > 0
    ? topMilestoneIssues.map((m, idx) => {
        const qStr = m.quarter ? m.quarter : "Без периода";
        const wt = m.weightPercent !== null ? `${m.weightPercent}%` : "нет";
        const fact = m.factProgressPercent !== null ? `${m.factProgressPercent}%` : "нет";
        const cred = m.creditedWeightPercent !== null ? `${m.creditedWeightPercent}%` : "нет";
        const uncred = m.uncreditedWeightPercent !== null ? `${m.uncreditedWeightPercent}%` : "нет";
        return `${idx + 1}. ${qStr}, ${m.name}: вес ${wt}, факт ${fact}, зачтено ${cred}, незачтенный вес ${uncred}, причина ${m.reason}`;
      }).join("\n")
    : "Проблемные вехи: не выявлены по переданным данным.";

  const indicatorLines = topIndicatorIssues.length > 0
    ? topIndicatorIssues.map((ind, idx) => {
        const pStr = ind.period ? ind.period : "Без периода";
        const pl = ind.plan !== null ? ind.plan : "нет";
        const fc = ind.fact !== null ? ind.fact : "нет";
        const perf = ind.performancePercent !== null ? `${ind.performancePercent.toFixed(1)}%` : "нет";
        const dev = ind.deviation !== null ? `${ind.deviation > 0 ? "+" : ""}${ind.deviation.toFixed(1)}%` : "нет";
        return `${idx + 1}. ${pStr}, ${ind.name}: план ${pl}, факт ${fc}, выполнение ${perf}, отклонение ${dev}, причина ${ind.reason}`;
      }).join("\n")
    : "Проблемные показатели: не выявлены по переданным данным.";

  const rawGoals: any = cardSnapshot.goalsAndResults.goals;
  const goalsArr = Array.isArray(rawGoals)
    ? rawGoals
    : (typeof rawGoals === 'string' && rawGoals.trim() !== ''
       ? rawGoals.split(';').map(g => g.trim())
       : []);

  const goalsCleanString = goalsArr.length > 0
    ? goalsArr.map((g: any) => `"${g}"`).join(", ")
    : "отсутствуют";

  const rawResults: any = cardSnapshot.goalsAndResults.resultImages;
  const resultsArr = Array.isArray(rawResults)
    ? rawResults
    : (typeof rawResults === 'string' && rawResults.trim() !== ''
       ? rawResults.split(';').map(r => r.trim())
       : []);

  const resultsCleanString = resultsArr.length > 0
    ? resultsArr.map((r: any) => `"${r}"`).join(", ")
    : "отсутствуют";

  let aiBriefPart = "";
  if (projectContentContext.aiUsePotentialContext && projectContentContext.aiUsePotentialContext.length > 0) {
    aiBriefPart = "Предметный потенциал применения ИИ:\n" + projectContentContext.aiUsePotentialContext.map(s => `- ${s}`).join("\n");
  } else {
    aiBriefPart = "Предметный потенциал применения ИИ: недостаточно данных для точного определения.";
  }

  const milestonesSection = topMilestoneIssues.length > 0
    ? `Проблемные вехи:\n${milestoneLines}`
    : milestoneLines;

  const indicatorsSection = topIndicatorIssues.length > 0
    ? `Проблемные показатели:\n${indicatorLines}`
    : indicatorLines;

  const dataQualityBriefLines: string[] = [
    "Заполненность и ограничения данных:",
    `- Критических ошибок: ${dataQualitySnapshot.errorsCount}, Предупреждений: ${dataQualitySnapshot.warningsCount}`
  ];

  if (dataQualitySnapshot.humanReadableIssues && dataQualitySnapshot.humanReadableIssues.length > 0) {
    dataQualitySnapshot.humanReadableIssues.forEach(issue => {
      dataQualityBriefLines.push(`- Замечание: ${issue}`);
    });
  } else {
    dataQualityBriefLines.push("- Замечания к качеству данных отсутствуют");
  }

  const dataQualityBriefSection = dataQualityBriefLines.join("\n");

  const assistantEvidenceBrief = [
    `Проект: ${cardSnapshot.header.projectName || "Без названия"}`,
    "",
    "Контекст даты оценки:",
    `- Дата оценки: ${assessmentDate}`,
    `- Режим даты: ${assessmentDateMode}`,
    `- Текущий период анализа: ${currentQuarter} ${currentYear}`,
    "- Правило: будущие периоды после даты оценки не считать отставанием без отдельного фактического основания.",
    "",
    "Расчетный статус:",
    `- Зона риска: ${cardSnapshot.header.projectStatus || "не указана"}`,
    `- Уровень риска: ${cardSnapshot.header.riskLevel || "не указан"}`,
    `- Главный источник риска: ${analysisInsights.mainRiskSource || "не определен"}`,
    "",
    "ПК:",
    `- Последний ПК: ${cardSnapshot.monitoring.lastPcDate || "нет данных"}`,
    `- Плановая дата следующего ПК: ${cardSnapshot.monitoring.nextPcDate || "нет данных"}`,
    `- Статус ПК: ${cardSnapshot.monitoring.status || "нет данных"}`,
    `- Просрочка / запас времени: ${overdueOrLeeway}`,
    "",
    milestonesSection,
    "",
    indicatorsSection,
    "",
    "Цели и образы результатов:",
    `- Цели: ${goalsCleanString}`,
    `- Образы результатов: ${resultsCleanString}`,
    "",
    dataQualityBriefSection,
    "",
    aiBriefPart
  ].join("\n");

  return {
    schemaVersion: "project-analysis-payload-v1",
    assessmentDate,
    assistantEvidenceBrief,
    assessmentContext,
    projectSnapshot,
    dashboardSnapshot,
    milestonesSnapshot: {
      milestones: milestonesData,
      quarterSummary
    },
    indicatorsSnapshot: {
      indicators: indicatorsList
    },
    monitoringSnapshot,
    riskSnapshot,
    dataQualitySnapshot,
    analysisInsights,
    sourceLimitations,
    cardSnapshot,
    projectContentContext
  };
}
