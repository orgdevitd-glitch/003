import { NormalizedProject, NormalizedMilestone, NormalizedIndicator } from "./projectNormalizer";
import { DEFAULT_METHODOLOGY_CONFIG, MethodologyConfig } from "./methodologyConfig";
import { DEFAULT_INDICATOR_DICTIONARY, resolveIndicatorDictionaryItem, IndicatorDictionaryItem } from "./indicatorDictionary";
import { calculateMilestonesWeightModel } from "./milestoneWeightModel";
import { Project } from "../../src/types";
import { calculateUnifiedProjectRisk } from "../../src/utils/projectRegistryStatus";
import { toLegacyProjectView } from "./projectViewAdapter";
import { calculateProjectDataCompleteness } from "../../src/utils/projectCompleteness";
import type { DataIssue } from "./dataValidation";

export type IndicatorEvaluation = {
  id: string;
  name: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  plan: number | null;
  fact: number | null;
  calculationType: "higher_is_better" | "lower_is_better" | "target" | "unknown";
  performancePercent: number | null;
  cappedPerformancePercent: number | null;
  status: "ok" | "attention" | "risk" | "future" | "not_enough_data" | "missing_dictionary";
  explanation: string;
  calculationSource: "dictionary" | "fallback_plan_fact" | "not_calculated";
  calculationReason?: string;
};

export type MilestoneEvaluation = {
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
};

export type ProjectEvaluation = {
  projectId: string;
  assessmentDate: string;

  dataQuality: {
    status: "ok" | "warning" | "error";
    completenessPercent: number | null;
    errorsCount: number;
    warningsCount: number;
    issuesCount: number;
  };

  milestones: {
    status: "ok" | "attention" | "risk" | "not_applicable" | "not_enough_data";
    totalProgressPercent: number | null;
    actualProgressPercent: number | null;
    totalWeightPercent: number | null;
    weightControlStatus: "ok" | "warning" | "error" | "not_applicable";
    milestonesCount: number;
    actualMilestonesCount: number;
    completedMilestonesCount: number;
    overdueMilestonesCount: number;
    milestoneResults?: MilestoneEvaluation[];
  };

  indicators: {
    status: "ok" | "attention" | "risk" | "not_applicable" | "not_enough_data";
    averagePerformancePercent: number | null;
    cappedAveragePerformancePercent: number | null;
    calculatedIndicatorsCount: number;
    skippedFutureIndicatorsCount: number;
    missingDictionaryCount: number;
    indicatorResults: IndicatorEvaluation[];
  };

  monitoring: {
    status: "ok" | "attention" | "overdue" | "not_applicable" | "not_enough_data";
    lastMonitoringDate: string | null;
    nextMonitoringDate: string | null;
    overdueDays: number | null;
  };

  projectHealth: {
    status: "ok" | "attention" | "risk" | "not_enough_data";
    score: number | null;
    mainReasons: string[];
  };

  explanations: string[];
};

export type PortfolioEvaluation = {
  assessmentDate: string;
  totalProjects: number;
  okCount: number;
  attentionCount: number;
  riskCount: number;
  notEnoughDataCount: number;
  dataErrorCount: number;
  averageCompletenessPercent: number | null;
  averageMilestoneProgressPercent: number | null;
  averageActualMilestoneProgressPercent: number | null;
  averageIndicatorPerformancePercent: number | null;
};

export interface EvaluationContext {
  assessmentDate?: Date;
  methodologyConfig?: MethodologyConfig;
  indicatorDictionary?: IndicatorDictionaryItem[];
  /** Import validator issues keyed by projectId — folded into dataQuality */
  importIssuesByProjectId?: Record<string, DataIssue[]>;
}

/**
 * Calculates project details, statuses, milestones progress, indicators performance, isMonitoring overdues,
 * data completeness and general management score.
 */
export function evaluateProject(
  project: NormalizedProject,
  context: EvaluationContext = {}
): ProjectEvaluation {
  const assessmentDate = context.assessmentDate || new Date();
  const config = context.methodologyConfig || DEFAULT_METHODOLOGY_CONFIG;
  const dictionary = context.indicatorDictionary || DEFAULT_INDICATOR_DICTIONARY;

  const mainReasons: string[] = [];
  const explanations: string[] = [];

  // ==========================================
  // 1. DATA QUALITY & COMPLETENESS
  // ==========================================
  const completenessDetails = calculateProjectDataCompleteness(project, assessmentDate);
  const completenessPercent = completenessDetails.completenessPercent;

  const importIssues = context.importIssuesByProjectId?.[String(project.projectId)] || [];
  const importErrors = importIssues.filter(i => i.severity === "error");
  const importWarnings = importIssues.filter(i => i.severity === "warning");

  const completenessErrorCount =
    completenessPercent < 50
      ? completenessDetails.missingFields.length + completenessDetails.invalidFields.length
      : 0;
  const completenessWarningCount =
    completenessPercent >= 50 && completenessPercent < 90
      ? completenessDetails.missingFields.length + completenessDetails.invalidFields.length
      : 0;

  const errorsCount = completenessErrorCount + importErrors.length;
  const warningsCount = completenessWarningCount + importWarnings.length;
  const issuesCount =
    completenessDetails.missingFields.length +
    completenessDetails.invalidFields.length +
    importIssues.length;

  let rawStatus: "ok" | "warning" | "error" = "ok";
  if (importErrors.length > 0 || completenessPercent < 50) {
    rawStatus = "error";
  } else if (importWarnings.length > 0 || completenessPercent < 90) {
    rawStatus = "warning";
  }

  const dataQualityEval = {
    status: rawStatus,
    completenessPercent,
    errorsCount,
    warningsCount,
    issuesCount,
    completenessDetails,
    importErrorsCount: importErrors.length,
    importWarningsCount: importWarnings.length
  };

  if (importErrors.length > 0) {
    mainReasons.push(`Ошибки импорта данных (${importErrors.length})`);
    importErrors.slice(0, 5).forEach(issue => {
      explanations.push(`[Импорт] ${issue.code}: ${issue.message}`);
    });
  } else if (rawStatus === "error") {
    mainReasons.push(`Низкая заполненность данных (${completenessPercent}%)`);
  } else if (rawStatus === "warning") {
    mainReasons.push(`Неполное заполнение данных (${completenessPercent}%)`);
  }

  completenessDetails.userVisibleReasons.forEach(reason => {
    explanations.push(reason);
  });

  // ==========================================
  // 2. MILESTONES EVALUATION
  // ==========================================
  let milestonesEval: ProjectEvaluation["milestones"];

  if (project.milestones.length === 0) {
    milestonesEval = {
      status: "not_applicable",
      totalProgressPercent: null,
      actualProgressPercent: null,
      totalWeightPercent: null,
      weightControlStatus: "not_applicable",
      milestonesCount: 0,
      actualMilestonesCount: 0,
      completedMilestonesCount: 0,
      overdueMilestonesCount: 0,
      milestoneResults: []
    };
    explanations.push("Вехи отсутствуют в проекте.");
  } else {
    // Run the new milestones weight model
    const modelResult = calculateMilestonesWeightModel(project.milestones);

    let actualCount = 0;
    let completedCount = 0;
    let overdueCount = 0;

    for (const m of project.milestones) {
      if (m.progressPercent === 100) {
        completedCount++;
      }
      if (m.periodStatus === "past" || m.periodStatus === "current") {
        actualCount++;
        if (m.periodStatus === "past" && (m.progressPercent === null || m.progressPercent < 100)) {
          overdueCount++;
        }
      }
    }

    if (overdueCount > 0) {
      mainReasons.push(`Просрочено вех (${overdueCount})`);
      explanations.push(`Найдены просроченные вехи в прошлых периодах: ${overdueCount} шт.`);
    }

    let mStatus: ProjectEvaluation["milestones"]["status"] = "ok";
    let isWeightSumValid = true;

    if (modelResult.weightStatus === "error_over_100") {
      mStatus = "not_enough_data";
      mainReasons.push("Ошибка весов вех");
      explanations.push("Сумма весов по вехам проекта превышает 100%. Проверьте заполнение весов.");
      isWeightSumValid = false;
    } else if (
      modelResult.weightStatus === "warning_under_100_unallocated" ||
      modelResult.weightStatus === "warning_missing_progress"
    ) {
      explanations.push(modelResult.description);
    }

    let totalProgressPercent = modelResult.totalProgressPercent;
    let actualProgressPercent: number | null = null;

    if (modelResult.weightStatus === "error_over_100") {
      totalProgressPercent = null;
      actualProgressPercent = null;
    } else {
      if (actualCount > 0) {
        let actualWeightSum = 0;
        let actualContributionSum = 0;

        for (const m of modelResult.milestones) {
          const origMilestone = project.milestones.find(om => om.id === m.id);
          if (origMilestone && (origMilestone.periodStatus === "past" || origMilestone.periodStatus === "current")) {
            actualWeightSum += m.effectiveWeightPercent;
            actualContributionSum += (m.effectiveWeightPercent * (m.completionPercent ?? 0)) / 100;
          }
        }

        actualProgressPercent = actualWeightSum > 0 ? (actualContributionSum / actualWeightSum) * 100 : 0;
      }

      // Milestones Status
      if (actualCount === 0) {
        mStatus = "ok"; // No past or current milestones yet, future only
      } else {
        const actProgress = actualProgressPercent ?? 0;
        const deviation = 100 - actProgress;

        if (deviation > config.thresholds.attentionMaxDeviationPercent) {
          mStatus = "risk";
        } else if (deviation > config.thresholds.okMaxDeviationPercent) {
          mStatus = "attention";
        }

        if (overdueCount > 0) {
          if (deviation > config.thresholds.attentionMaxDeviationPercent) {
            mStatus = "risk";
          } else if (deviation > config.thresholds.okMaxDeviationPercent) {
            mStatus = "attention";
          } else {
            mStatus = "attention"; // Any overdue milestone means at least attention
          }
        }
      }
    }

    const totalWeightSumOfModel = modelResult.weightStatus === "error_over_100" 
      ? null 
      : modelResult.milestones.reduce((acc, m) => acc + m.effectiveWeightPercent, 0);

    milestonesEval = {
      status: mStatus,
      totalProgressPercent: totalProgressPercent !== null ? Math.round(totalProgressPercent * 10) / 10 : null,
      actualProgressPercent: actualProgressPercent !== null ? Math.round(actualProgressPercent * 10) / 10 : null,
      totalWeightPercent: totalWeightSumOfModel !== null ? Math.round(totalWeightSumOfModel * 10) / 10 : null,
      weightControlStatus: (modelResult.weightStatus === "error_over_100"
        ? "error"
        : modelResult.weightStatus === "warning_under_100_unallocated" ||
            modelResult.weightStatus === "warning_missing_progress"
          ? "warning"
          : modelResult.weightStatus === "no_milestones"
            ? "not_applicable"
            : "ok") as "ok" | "warning" | "error" | "not_applicable",
      milestonesCount: project.milestones.length,
      actualMilestonesCount: actualCount,
      completedMilestonesCount: completedCount,
      overdueMilestonesCount: overdueCount,
      milestoneResults: modelResult.milestones
    };
  }

  // ==========================================
  // 3. INDICATORS EVALUATION
  // ==========================================
  const indicatorResults: IndicatorEvaluation[] = [];
  let skippedFutureCount = 0;
  let missingDictCount = 0;
  let calculatedCount = 0;

  let sumPerformance = 0;
  let sumCappedPerformance = 0;

  const indsList = project.indicators;

  if (indsList.length === 0) {
    explanations.push("Показатели результатов не заданы в контракте.");
  }

  for (const ind of indsList) {
    const calculatableItem = resolveIndicatorDictionaryItem(ind.name, dictionary, true);
    const anyDictionaryItem = resolveIndicatorDictionaryItem(ind.name, dictionary, false);

    const resolvedType = (calculatableItem ? calculatableItem.calculationType : "unknown") as "unknown" | "higher_is_better" | "lower_is_better" | "target";

    const isFuture = ind.periodStatus === "future";
    const plan = ind.plan;
    const fact = ind.fact;

    // Future показатели are never aggregated — even with early fact (methodology: date-strict).
    // Early fact may be stored for detail display but must not enter averages / risk.
    if (isFuture) {
      skippedFutureCount++;
      let displayPerformance: number | null = null;
      let displayCapped: number | null = null;
      if (calculatableItem && plan !== null && plan !== 0 && fact !== null) {
        if (resolvedType === "higher_is_better") {
          displayPerformance = (fact / plan) * 100;
        } else if (resolvedType === "lower_is_better") {
          displayPerformance = fact === 0 ? 100 : (plan / fact) * 100;
        } else if (resolvedType === "target") {
          const dev = Math.abs((fact - plan) / plan);
          displayPerformance = Math.max(0, 100 - dev * 100);
        }
        displayCapped = displayPerformance !== null ? Math.min(100, Math.max(0, displayPerformance)) : null;
      }
      indicatorResults.push({
        id: ind.id,
        name: ind.name,
        year: ind.year,
        quarter: ind.quarter,
        plan,
        fact,
        calculationType: resolvedType,
        performancePercent: displayPerformance,
        cappedPerformancePercent: displayCapped,
        status: "future",
        explanation:
          fact !== null
            ? `Период (${ind.quarter} ${ind.year}) ещё не наступил относительно даты оценки. Досрочный факт сохранён для отображения, но не входит в агрегаты и риск.`
            : `Плановый период (${ind.quarter} ${ind.year}) ещё не наступил.`,
        calculationSource: displayPerformance !== null ? "dictionary" : "not_calculated"
      });
      continue;
    }

    if (calculatableItem) {
      if (plan === null || plan === 0) {
        indicatorResults.push({
          id: ind.id,
          name: ind.name,
          year: ind.year,
          quarter: ind.quarter,
          plan,
          fact,
          calculationType: resolvedType,
          performancePercent: null,
          cappedPerformancePercent: null,
          status: "not_enough_data",
          explanation: plan === 0 ? "План равен 0 (деление невозможно)." : "Плановое значение не заполнено.",
          calculationSource: "not_calculated"
        });
        continue;
      }

      if (fact === null) {
        indicatorResults.push({
          id: ind.id,
          name: ind.name,
          year: ind.year,
          quarter: ind.quarter,
          plan,
          fact,
          calculationType: resolvedType,
          performancePercent: null,
          cappedPerformancePercent: null,
          status: "not_enough_data",
          explanation: "Фактическое значение показателя за прошедший период отсутствует.",
          calculationSource: "not_calculated"
        });
        continue;
      }

      // Calculation formulas for active dictionary KPI
      let performance = 100;
      if (resolvedType === "higher_is_better") {
        performance = (fact / plan) * 100;
      } else if (resolvedType === "lower_is_better") {
        performance = fact === 0 ? 100 : (plan / fact) * 100;
      } else if (resolvedType === "target") {
        const dev = Math.abs((fact - plan) / plan);
        performance = Math.max(0, 100 - dev * 100);
      }

      const capped = Math.min(100, Math.max(0, performance));

      let indStatus: IndicatorEvaluation["status"] = "ok";
      const deviation = 100 - capped;

      if (deviation > config.thresholds.attentionMaxDeviationPercent) {
        indStatus = "risk";
      } else if (deviation > config.thresholds.okMaxDeviationPercent) {
        indStatus = "attention";
      }

      calculatedCount++;
      sumPerformance += performance;
      sumCappedPerformance += capped;

      const readableTypeRu = resolvedType === "higher_is_better" ? "прямой" : resolvedType === "lower_is_better" ? "обратный" : "целевой";

      indicatorResults.push({
        id: ind.id,
        name: ind.name,
        year: ind.year,
        quarter: ind.quarter,
        plan,
        fact,
        calculationType: resolvedType,
        performancePercent: Math.round(performance * 10) / 10,
        cappedPerformancePercent: Math.round(capped * 10) / 10,
        status: indStatus,
        explanation: `Выполнение по типу "${readableTypeRu}": ${performance.toFixed(1)}% (план: ${plan}, факт: ${fact}).`,
        calculationSource: "dictionary"
      });
      continue;
    }

    if (anyDictionaryItem) {
      // Exist in dictionary, but disabled/pending/has data issues
      const itemStatus = anyDictionaryItem.status || "active";
      const itemMethod = anyDictionaryItem.calculationType;
      let explanation = "Показатель есть в справочнике, но методика не активна / требует согласования.";
      if (itemMethod === "disabled" || itemStatus === "disabled") {
        explanation = "Показатель отключен в справочнике методологии.";
      } else if (itemStatus === "data_issue") {
        explanation = "Показатель приостановлен в справочнике из-за проблем с качеством данных.";
      } else if (itemMethod === "pending" || itemStatus === "pending_review" || itemStatus === "pending_business_decision") {
        explanation = "Показатель требует согласования методики расчета.";
      }

      indicatorResults.push({
        id: ind.id,
        name: ind.name,
        year: ind.year,
        quarter: ind.quarter,
        plan,
        fact,
        calculationType: "unknown",
        performancePercent: null,
        cappedPerformancePercent: null,
        status: "not_enough_data",
        explanation,
        calculationSource: "not_calculated",
        calculationReason: itemMethod === "pending" || itemStatus === "pending_review" || itemStatus === "pending_business_decision" ? "pending" : (itemStatus === "data_issue" ? "data_issue" : "disabled")
      });
      continue;
    }

    // Not found in dictionary at all -> fallback plan/fact calculation if possible
    if (plan !== null && plan > 0 && fact !== null) {
      const performance = (fact / plan) * 100;
      const capped = Math.min(100, Math.max(0, performance));

      let indStatus: IndicatorEvaluation["status"] = "ok";
      const deviation = 100 - capped;

      if (deviation > config.thresholds.attentionMaxDeviationPercent) {
        indStatus = "risk";
      } else if (deviation > config.thresholds.okMaxDeviationPercent) {
        indStatus = "attention";
      }

      calculatedCount++;
      sumPerformance += performance;
      sumCappedPerformance += capped;

      indicatorResults.push({
        id: ind.id,
        name: ind.name,
        year: ind.year,
        quarter: ind.quarter,
        plan,
        fact,
        calculationType: "unknown",
        performancePercent: Math.round(performance * 10) / 10,
        cappedPerformancePercent: Math.round(capped * 10) / 10,
        status: indStatus,
        explanation: "Базовый расчет без методики: факт / план × 100.",
        calculationSource: "fallback_plan_fact"
      });
    } else {
      missingDictCount++;
      let errorReason = "отсутствия плановых или фактических значений";
      if (plan === 0) {
        errorReason = "деления на ноль (план = 0)";
      }
      indicatorResults.push({
        id: ind.id,
        name: ind.name,
        year: ind.year,
        quarter: ind.quarter,
        plan,
        fact,
        calculationType: "unknown",
        performancePercent: null,
        cappedPerformancePercent: null,
        status: "missing_dictionary",
        explanation: `Показатель "${ind.name}" отсутствует в справочнике методологии и не может быть рассчитан по причине ${errorReason}.`,
        calculationSource: "not_calculated"
      });
    }
  }

  const averagePerformancePercent = calculatedCount > 0 ? (sumPerformance / calculatedCount) : null;
  const cappedAveragePerformancePercent = calculatedCount > 0 ? (sumCappedPerformance / calculatedCount) : null;

  // Indicators block status
  let indicatorsBlockStatus: ProjectEvaluation["indicators"]["status"] = "ok";

  if (indsList.length === 0) {
    indicatorsBlockStatus = "not_applicable";
  } else if (missingDictCount > 0) {
    indicatorsBlockStatus = "not_enough_data";
    mainReasons.push(`Неизвестные показатели в справочнике (${missingDictCount})`);
    explanations.push(`Показатели переведены в режим ручной проверки по причине отсутствия формулы для ${missingDictCount} значений.`);
  } else if (calculatedCount === 0) {
    indicatorsBlockStatus = "not_enough_data";
    explanations.push("Показатели не имеют числовых планов/фактов для вычисления.");
  } else {
    // Determine from average capped performance
    const cappedAvg = cappedAveragePerformancePercent ?? 100;
    const deviation = 100 - cappedAvg;

    if (deviation > config.thresholds.attentionMaxDeviationPercent) {
      indicatorsBlockStatus = "risk";
      mainReasons.push(`Низкое выполнение показателей (${cappedAvg.toFixed(1)}%)`);
    } else if (deviation > config.thresholds.okMaxDeviationPercent) {
      indicatorsBlockStatus = "attention";
      mainReasons.push(`Снижено выполнение показателей (${cappedAvg.toFixed(1)}%)`);
    }
  }

  const indicatorsEval = {
    status: indicatorsBlockStatus,
    averagePerformancePercent: averagePerformancePercent !== null ? Math.round(averagePerformancePercent * 10) / 10 : null,
    cappedAveragePerformancePercent: cappedAveragePerformancePercent !== null ? Math.round(cappedAveragePerformancePercent * 10) / 10 : null,
    calculatedIndicatorsCount: calculatedCount,
    skippedFutureIndicatorsCount: skippedFutureCount,
    missingDictionaryCount: missingDictCount,
    indicatorResults
  };

  // ==========================================
  // 4. MONITORING REVIEW
  // ==========================================
  let monitoringEval: ProjectEvaluation["monitoring"];

  const mon = project.monitoring;
  const projectStartStr = project.baseInfo.startDate;
  const projectStart = projectStartStr ? new Date(projectStartStr) : null;

  const isCompleted = project.baseInfo.stage === "Завершен";

  if (isCompleted) {
    monitoringEval = {
      status: "not_applicable",
      lastMonitoringDate: mon.lastMonitoringDate,
      nextMonitoringDate: null,
      overdueDays: null
    };
    explanations.push("Мониторинг завершен, так как проект закрыт.");
  } else if (projectStart && assessmentDate.getTime() < projectStart.getTime()) {
    monitoringEval = {
      status: "not_applicable",
      lastMonitoringDate: null,
      nextMonitoringDate: null,
      overdueDays: null
    };
    explanations.push("Мониторинг не требуется: плановый старт проекта ещё не наступил.");
  } else if (mon.regularityWeeks === null || (!mon.lastMonitoringDate && !mon.startDate)) {
    monitoringEval = {
      status: "not_enough_data",
      lastMonitoringDate: mon.lastMonitoringDate,
      nextMonitoringDate: mon.nextMonitoringDate,
      overdueDays: null
    };
    explanations.push("Отсутствует регулярность мониторинга или дата начала.");
  } else {
    const nextDateStr = mon.nextMonitoringDate;
    if (!nextDateStr) {
      monitoringEval = {
        status: "not_enough_data",
        lastMonitoringDate: mon.lastMonitoringDate,
        nextMonitoringDate: null,
        overdueDays: null
      };
    } else {
      const nextDate = new Date(nextDateStr + "T23:59:59");
      
      const diffMs = assessmentDate.getTime() - nextDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)); // Whole overdue days

      let monStatus: "ok" | "attention" | "overdue" = "ok";
      let overdueDays: number | null = null;

      if (diffDays > 0) {
        monStatus = "overdue";
        overdueDays = diffDays;
        mainReasons.push(`Просрочка ПК на ${diffDays} дн.`);
        explanations.push(`Очередной мониторинг должен был состояться ${nextDateStr}. Просрочка: ${diffDays} дней.`);
      } else {
        const remainingDays = Math.abs(diffDays);
        if (remainingDays <= config.monitoringAttentionDaysThreshold) {
          monStatus = "attention";
          explanations.push(`Мониторинг запланирован через ${remainingDays} дней (${nextDateStr}).`);
        }
      }

      monitoringEval = {
        status: monStatus,
        lastMonitoringDate: mon.lastMonitoringDate,
        nextMonitoringDate: nextDateStr,
        overdueDays
      };
    }
  }

  // ==========================================
  // 5. COMBINED STATE HEALTH SCORE (Unified Risk Logic)
  // ==========================================
  const compatibleProject = toLegacyProjectView(project);
  compatibleProject._rawByYear = (project as any)._rawByYear || (project.source?.rawRow as any)?._rawByYear || undefined;

  const tempEvaluation: ProjectEvaluation = {
    projectId: project.projectId,
    assessmentDate: assessmentDate.toISOString().split('T')[0],
    dataQuality: dataQualityEval,
    milestones: milestonesEval,
    indicators: indicatorsEval,
    monitoring: monitoringEval,
    projectHealth: { status: "ok", score: 100, mainReasons: [] },
    explanations: []
  };

  const unifiedRisk = calculateUnifiedProjectRisk(compatibleProject, tempEvaluation, tempEvaluation.assessmentDate, false);

  let healthStatus: ProjectEvaluation["projectHealth"]["status"] = "ok";
  if (dataQualityEval.status === "error") {
    // Critical import/completeness errors must not silently stay as "ok"
    healthStatus = "not_enough_data";
  } else if (unifiedRisk.riskLevel === "Высокий") {
    healthStatus = "risk";
  } else if (unifiedRisk.riskLevel === "Средний") {
    healthStatus = "attention";
  } else if (unifiedRisk.riskLevel === "Недостаточно данных") {
    healthStatus = "not_enough_data";
  }

  let score: number | null = 100;
  if (healthStatus === "not_enough_data") {
    score = null;
    mainReasons.push("Недостаточно данных для оценки здоровья");
  } else {
    // Calculable score algorithm starting at 100
    // Subtract based on actual milestones deviation (factor: 0.4)
    if (unifiedRisk.details.milestoneActualProgressForRisk !== null) {
      const dev = 100 - unifiedRisk.details.milestoneActualProgressForRisk;
      score -= dev * 0.4;
    }
    // Subtract based on KPI capping deviation (factor: 0.4)
    if (unifiedRisk.details.indicatorsCappedPerformanceForRisk !== null) {
      const dev = 100 - unifiedRisk.details.indicatorsCappedPerformanceForRisk;
      score -= dev * 0.4;
    }

    // Subtract for overdue monitoring
    if (unifiedRisk.details.pcStatus === "Просрочен") {
      score -= 15;
    }

    // Subtract for data errors
    if (unifiedRisk.details.errorsCount > 0) {
      score -= 15;
    }

    // Boundary cap
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Fill in mainReasons from unifiedRisk
    if (unifiedRisk.reasons.length > 0) {
      unifiedRisk.reasons.forEach(r => {
        const capitalized = r.charAt(0).toUpperCase() + r.slice(1);
        mainReasons.push(capitalized);
      });
    }
  }

  if (healthStatus === "ok") {
    explanations.push("Проект реализуется в соответствии с плановыми показателями и регламентом.");
  }

  return {
    projectId: project.id,
    assessmentDate: assessmentDate.toISOString().split("T")[0],
    dataQuality: dataQualityEval,
    milestones: milestonesEval,
    indicators: indicatorsEval,
    monitoring: monitoringEval,
    projectHealth: {
      status: healthStatus,
      score,
      mainReasons: mainReasons.length > 0 ? mainReasons : ["Показатели в норме"]
    },
    explanations
  };
}

/**
 * Evaluates an array of NormalizedProjects and returns their evaluations
 */
export function evaluateProjects(
  projects: NormalizedProject[],
  context: EvaluationContext = {}
): ProjectEvaluation[] {
  const assessmentDate = context.assessmentDate || new Date();
  
  const validContext = {
    assessmentDate,
    methodologyConfig: context.methodologyConfig || DEFAULT_METHODOLOGY_CONFIG,
    indicatorDictionary: context.indicatorDictionary || DEFAULT_INDICATOR_DICTIONARY
  };

  return projects.map(p => evaluateProject(p, validContext));
}

/**
 * Calculates global statistics and averages over evaluated project portfolio
 */
export function calculatePortfolioEvaluation(
  projects: NormalizedProject[],
  evaluations: ProjectEvaluation[],
  context: EvaluationContext = {}
): PortfolioEvaluation {
  const assessmentDate = context.assessmentDate || new Date();

  let okCount = 0;
  let attentionCount = 0;
  let riskCount = 0;
  let notEnoughDataCount = 0;
  let dataErrorCount = 0;

  let sumCompleteness = 0;
  let countCompleteness = 0;

  let sumMilestoneProgress = 0;
  let countMilestoneProgress = 0;

  let sumActualProgress = 0;
  let countActualProgress = 0;

  let sumIndicatorPerformance = 0;
  let countIndicatorPerformance = 0;

  evaluations.forEach(e => {
    // Count states
    if (e.projectHealth.status === "ok") {
      okCount++;
    } else if (e.projectHealth.status === "attention") {
      attentionCount++;
    } else if (e.projectHealth.status === "risk") {
      riskCount++;
    } else if (e.projectHealth.status === "not_enough_data") {
      notEnoughDataCount++;
    }

    if (e.dataQuality.status === "error") {
      dataErrorCount++;
      // Quarantine: exclude projects with critical data/import errors from portfolio averages
      return;
    }

    // Completeness percent
    if (e.dataQuality.completenessPercent !== null) {
      sumCompleteness += e.dataQuality.completenessPercent;
      countCompleteness++;
    }

    // Milestones total progress
    if (e.milestones.totalProgressPercent !== null) {
      sumMilestoneProgress += e.milestones.totalProgressPercent;
      countMilestoneProgress++;
    }

    // Milestones actual progress (scaled)
    if (e.milestones.actualProgressPercent !== null) {
      sumActualProgress += e.milestones.actualProgressPercent;
      countActualProgress++;
    }

    // Indicators average performance (uncapped)
    const indPerf = e.indicators.averagePerformancePercent !== null 
      ? e.indicators.averagePerformancePercent 
      : e.indicators.cappedAveragePerformancePercent;
    if (indPerf !== null) {
      sumIndicatorPerformance += indPerf;
      countIndicatorPerformance++;
    }
  });

  return {
    assessmentDate: assessmentDate.toISOString().split("T")[0],
    totalProjects: projects.length,
    okCount,
    attentionCount,
    riskCount,
    notEnoughDataCount,
    dataErrorCount,
    averageCompletenessPercent: countCompleteness > 0 ? Math.round(sumCompleteness / countCompleteness) : null,
    averageMilestoneProgressPercent: countMilestoneProgress > 0 ? Math.round(sumMilestoneProgress / countMilestoneProgress) : null,
    averageActualMilestoneProgressPercent: countActualProgress > 0 ? Math.round(sumActualProgress / countActualProgress) : null,
    averageIndicatorPerformancePercent: countIndicatorPerformance > 0 ? Math.round(sumIndicatorPerformance / countIndicatorPerformance) : null
  };
}
