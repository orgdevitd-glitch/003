import React, { useState } from "react";
import {
  Sparkles,
  ExternalLink,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Target,
  Users,
  ShieldAlert,
  Activity,
  Map as LucideMap,
  FileText,
} from "lucide-react";
import { Project, ProjectAnalysisResult, ProjectEvaluation } from "../types";
import { AnimatedCircularGauge } from "./AnimatedCircularGauge";
import { AnalysisPanel } from "./AnalysisPanel";
import { 
  formatPercent, 
  formatStatusLabel,
  getTrafficLightColor
} from "../utils/evaluationUtils";
import {
  formatDateSafe,
  parseDateSafe,
} from "../utils/dateUtils";
import { getStageLabel, getStageDarkBadgeClass } from "../utils/projectStageStyles";
import { exportProjectToPDF } from "../utils/pdfExport";
import { useAdvancedAccess } from "./AdvancedAccessContext";
import {
  getProjectCardRiskView,
  getProjectCardProjectStatusView,
  getPcStatusTooltipData,
  getProjectCardRiskExplanation,
  getProjectCompletenessPercent,
  TARGET_COMPLETENESS_PERCENT
} from "../utils/projectRegistryStatus";
import { getYearsForProject } from "../utils/overviewYearFiltering";
import { resolveProjectSelectedYear } from "../utils/projectRegistryStatus";
import { getProjectCardProgressMetrics } from "../utils/projectCardMetrics";
import { getRawMilestonesListForPeriod } from "../utils/projectCalculations";
import { resolveIndicatorDictionaryItem } from "../../server/services/indicatorDictionary";
import { calculateSingleIndicatorPerformance } from "../utils/indicatorPerformance";

const getDaysPlural = (days: number): string => {
  const lastDigit = days % 10;
  const lastTwo = days % 100;
  if (lastTwo >= 11 && lastTwo <= 19) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
};

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

interface ProjectCardProps {
  project: Project;
  onRefresh: () => void;
  evaluation?: ProjectEvaluation | null;
  assessmentDate?: string;
  assessmentDateMode?: "today" | "custom";
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onRefresh,
  evaluation,
  assessmentDate,
  assessmentDateMode,
}) => {
  const { requireAdvancedAccess } = useAdvancedAccess();
  const isDebugMode = typeof window !== "undefined" && (
    new URLSearchParams(window.location.search).get("debug") === "1" ||
    new URLSearchParams(window.location.search).get("debug") === "true" ||
    localStorage.getItem("debugDashboard") === "true" ||
    localStorage.getItem("debugDashboard") === "1"
  );

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ProjectAnalysisResult | null>(
    project.lastAnalysis || null,
  );
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const currentStepRef = React.useRef<number>(0);
  const timerRef = React.useRef<any>(null);
  const isBackendDoneRef = React.useRef(false);
  const backendResultRef = React.useRef<{ success: boolean; analysis?: any; error?: string } | null>(null);
  const stepStartTimeRef = React.useRef<number>(0);

  const clearAnalysisTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  React.useEffect(() => {
    return () => {
      clearAnalysisTimer();
    };
  }, []);

  const handleExportPDF = async () => {
    requireAdvancedAccess("exportProjectCardPdf", async () => {
      setExportingPdf(true);
      setPdfError(null);
      try {
        await exportProjectToPDF(project, analysis, evaluation ? [evaluation] : null, {
          assessmentDate,
          selectedYear,
          selectedQuarter,
        });
      } catch (err: any) {
        setPdfError(
          err.message || "Не удалось сформировать PDF. Попробуйте еще раз.",
        );
      } finally {
        setExportingPdf(false);
      }
    });
  };

  const handleAnalyze = async () => {
    clearAnalysisTimer();
    setAnalyzing(true);
    setError(null);
    setCurrentStep(0);
    currentStepRef.current = 0;
    isBackendDoneRef.current = false;
    backendResultRef.current = null;
    stepStartTimeRef.current = Date.now();

    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const activeDateStr = assessmentDate || evaluation?.assessmentDate || new Date().toISOString().split("T")[0];
    const activeMode = assessmentDateMode || "custom";

    fetch(`/api/projects/${project.projectId}/analyze`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        assessmentDate: activeDateStr, 
        assessmentDateMode: activeMode 
      })
    })
    .then(async (response) => {
      const data = await response.json();
      if (data.success) {
        backendResultRef.current = { success: true, analysis: data.analysis };
        isBackendDoneRef.current = true;
      } else {
        clearAnalysisTimer();
        setError(data.error || "Ошибка при запуске ИИ-анализа");
        setAnalyzing(false);
      }
    })
    .catch((err: any) => {
      clearAnalysisTimer();
      setError(err.message || "Не удалось связаться с сервером");
      setAnalyzing(false);
    });

    const tickInterval = 100;

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - stepStartTimeRef.current;

      let targetDuration = 800; // Normal tempo: 800ms per step
      if (prefersReducedMotion) {
        targetDuration = 40; // Extremely short delay for users who prefer reduced motion
      } else if (isBackendDoneRef.current) {
        targetDuration = 200; // Fast forward pace once backend has successfully resolved
      }

      if (elapsed >= targetDuration) {
        const stepVal = currentStepRef.current;
        if (stepVal < 3) {
          stepStartTimeRef.current = Date.now();
          const nextStep = stepVal + 1;
          currentStepRef.current = nextStep;
          setCurrentStep(nextStep);
        } else {
          // Stay at step index 3 ("Формируем рекомендации") while backend is unresolved
          if (isBackendDoneRef.current) {
            clearAnalysisTimer();
            
            const res = backendResultRef.current;
            if (res) {
              if (res.success) {
                setAnalysis(res.analysis);
                onRefresh();
              } else {
                setError(res.error || "Ошибка при запуске ИИ-анализа");
              }
            }
            setAnalyzing(false);
          }
        }
      }
    }, tickInterval);
  };

  const dateStr = assessmentDate || evaluation?.assessmentDate || new Date().toISOString().split("T")[0];
  const parsedAssessmentDateForQuarter = (dateStr ? parseDateSafe(dateStr) : null) || new Date();
  const defaultQuarter = Math.floor(parsedAssessmentDateForQuarter.getMonth() / 3) + 1;

  const [selectedQuarter, setSelectedQuarter] = useState<number>(defaultQuarter);
  const [selectedYearState, setSelectedYearState] = useState<number | null>(null);

  React.useEffect(() => {
    setSelectedQuarter(defaultQuarter);
  }, [dateStr, defaultQuarter]);

  React.useEffect(() => {
    setSelectedYearState(null);
  }, [project.projectId]);

  const availableYears = React.useMemo(() => {
    return getYearsForProject(project, evaluation);
  }, [project, evaluation]);

  const defaultYear = React.useMemo(() => {
    return resolveProjectSelectedYear(project, evaluation, parsedAssessmentDateForQuarter);
  }, [project, evaluation, parsedAssessmentDateForQuarter]);

  const selectedYear = selectedYearState ?? defaultYear;

  const {
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
  } = getProjectCardProgressMetrics({
    project,
    evaluation,
    selectedYear,
    selectedQuarter,
    assessmentDate
  });

  const milestonesQuarterValWithCheck = milestonesQuarterVal;
  const milestonesYearValWithCheck = milestonesYearVal;

  const riskLevel = getProjectCardRiskView(project, evaluation, dateStr) || "Низкий";
  const registryStatus = getProjectCardProjectStatusView(project, evaluation, dateStr);

  const pcInfo = getPcStatusTooltipData(project, evaluation, dateStr);
  const completenessVal = getProjectCompletenessPercent(evaluation);
  const completenessText = (completenessVal !== undefined && completenessVal !== null) 
    ? `${completenessVal}%` 
    : "Нет данных";

  const pcStatusText = pcInfo.status || "Недостаточно данных";
  const pcStatusColor = pcStatusText === "Своевременно"
    ? "text-emerald-700 bg-emerald-50 border-emerald-100"
    : pcStatusText === "Просрочен"
      ? "text-rose-700 bg-rose-50 border-rose-100"
      : pcStatusText === "Не применяется"
        ? "text-gray-600 bg-gray-50 border-gray-250"
        : "text-amber-700 bg-amber-50 border-amber-100";

  let pcSubTextList: string[] = [];
  if (pcStatusText === "Своевременно") {
    if (pcInfo.nextPcDate && pcInfo.nextPcDate !== "Не удалось рассчитать") {
      pcSubTextList.push(`Следующий ПК: ${pcInfo.nextPcDate}`);
    }
  } else if (pcStatusText === "Просрочен") {
    if (pcInfo.nextPcDate && pcInfo.nextPcDate !== "Не удалось рассчитать") {
      pcSubTextList.push(`Срок: ${pcInfo.nextPcDate}`);
    }
    if (pcInfo.overdueDays !== null && pcInfo.overdueDays > 0) {
      pcSubTextList.push(`Просрочка: ${pcInfo.overdueDays} ${getDaysPlural(pcInfo.overdueDays)}`);
    }
  } else if (pcStatusText === "Не применяется") {
    pcSubTextList.push("Не участвует в расчете ПК");
  } else if (pcInfo.reason) {
    pcSubTextList.push(pcInfo.reason);
  }

  const formatFieldValue = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return "Не заполнено";
    const str = String(val).trim();
    if (str === "" || str === "—" || str.toLowerCase() === "nan") return "Не заполнено";
    return str;
  };

  const formatFieldText = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return "Не указано";
    const str = String(val).trim();
    if (str === "" || str === "—" || str.toLowerCase() === "nan") return "Не указано";
    return str;
  };

  const formatFieldDate = (val: string | null | undefined): string => {
    if (!val) return "Не указано";
    const formatted = formatDateSafe(val);
    if (!formatted || formatted === "—") return "Не указано";
    return formatted;
  };

  const rawList = [
    ...(project.milestones || [])
  ];
  
  const tasksMap = new Map<string, any>();
  rawList.forEach((t) => {
    const title = t.title ? String(t.title).trim() : "";
    const quarter = t.quarter ? String(t.quarter).trim() : "";
    const weight = t.weight !== undefined && t.weight !== null ? Number(t.weight) : 0;
    
    // Extract year and quarter using parseIndicatorPeriod
    const parsedPeriod = parseIndicatorPeriod(t.quarter);
    let yearVal: number | string = parsedPeriod.year || "unknown";
    if (yearVal === "unknown") {
      const yearMatch = (t.taskId || "").match(/\b(20\d{2})\b/) ||
                        (t.title || "").match(/\b(20\d{2})\b/);
      if (yearMatch) {
        yearVal = parseInt(yearMatch[1], 10);
      } else {
        yearVal = project._dataYear || selectedYear || "unknown";
      }
    }
    
    // Attach dynamic property to use in rendering if needed
    (t as any)._extractedYear = yearVal;
    (t as any)._extractedQuarter = parsedPeriod.quarter;

    const key = `${title.toLowerCase()}||${quarter.toLowerCase()}||${yearVal}||${weight}`;
    
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

  const parseToNumber = (val: any): number | null => {
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
  };

  const getPerformancePercent = (item: StandardizedIndicator): {
    percentText: string;
    actualPercent: number | null;
    cappedPercent: number | null;
  } => {
    const calculatableItem = resolveIndicatorDictionaryItem(item.name, undefined, true);
    const anyDictionaryItem = resolveIndicatorDictionaryItem(item.name, undefined, false);

    if (calculatableItem) {
      if (item.performancePercent === null || item.performancePercent === undefined) {
        return {
          percentText: "Нет данных",
          actualPercent: null,
          cappedPercent: null,
        };
      }
      const actualPercent = item.performancePercent;
      const cappedPercent = item.cappedPerformancePercent !== null && item.cappedPerformancePercent !== undefined
        ? item.cappedPerformancePercent
        : Math.min(100, Math.max(0, actualPercent));

      return {
        percentText: `${Math.round(actualPercent)}%`,
        actualPercent,
        cappedPercent,
      };
    } else if (anyDictionaryItem) {
      const status = anyDictionaryItem.status || "active";
      let msg = "Нет активной методики";
      if (anyDictionaryItem.calculationType === "pending" || status === "pending_review" || status === "pending_business_decision") {
        msg = "Требует согласования методики";
      }
      return {
        percentText: msg,
        actualPercent: null,
        cappedPercent: null,
      };
    } else {
      // unknown KPI fallback
      if (item.performancePercent !== null && item.performancePercent !== undefined) {
        const actualPercent = item.performancePercent;
        const cappedPercent = item.cappedPerformancePercent !== null && item.cappedPerformancePercent !== undefined
          ? item.cappedPerformancePercent
          : Math.min(100, Math.max(0, actualPercent));

        return {
          percentText: `${Math.round(actualPercent)}% (Базовый расчет)`,
          actualPercent,
          cappedPercent,
        };
      }

      // Try client-side math
      const calcResult = calculateSingleIndicatorPerformance(item.name, item.plan, item.fact);
      if (calcResult !== null) {
        const actualPercent = calcResult.performancePercent;
        const cappedPercent = calcResult.cappedPerformancePercent;
        return {
          percentText: `${Math.round(actualPercent)}% (Базовый расчет)`,
          actualPercent,
          cappedPercent,
        };
      }

      return {
        percentText: "Базовый расчет plan/fact",
        actualPercent: null,
        cappedPercent: null,
      };
    }
  };

  // Dedup and priority list processing
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
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  };

  const registerIndicator = (item: StandardizedIndicator) => {
    const normName = normalizeName(item.name);
    const key = `${normName}||${item.year || "unknown"}||${item.quarter || "unknown"}`;

    if (!indicatorMap.has(key)) {
      indicatorMap.set(key, { ...item });
    } else {
      const existing = indicatorMap.get(key)!;
      // Merge empty fields from less priority sources
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
        if (availableYears.length === 1) {
          parsedYear = availableYears[0];
        } else if (project._dataYear) {
          parsedYear = project._dataYear;
        }
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
        if (availableYears.length === 1) {
          parsedYear = availableYears[0];
        } else if (project._dataYear) {
          parsedYear = project._dataYear;
        }
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

  const renderCircularGauge = (label: string, value: number | null, plan?: number, title?: string) => {
    return (
      <AnimatedCircularGauge
        label={label}
        value={value}
        idSuffix={`-project-card-${label.replace(/\s+/g, '-').toLowerCase()}`}
        precision={0}
        plan={plan}
        title={title}
      />
    );
  };

  return (
    <div className="w-full max-w-full lg:max-w-[calc(100vw-64px)] xl:max-w-[1600px] 2xl:max-w-[1720px] mx-auto space-y-8 pb-32 animate-soft-enter">
      
      {/* Шапка с названием экрана "Анализ проекта" */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 uppercase">
          Анализ проекта
        </h1>
      </div>

      {/* 1. Основная информация и Сроки */}
      <div className="bg-[#010101] text-white p-5 sm:p-8 md:p-10 rounded-2xl md:rounded-[2rem] shadow-2xl relative overflow-hidden animate-soft-enter">
        <div className="absolute top-0 right-10 opacity-5 scale-150 -translate-y-1/4 translate-x-1/4">
          <LucideMap size={400} />
        </div>
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${
                registryStatus === "Норма"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : registryStatus === "Зона риска"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                    : "border-gray-500/30 bg-gray-500/10 text-gray-400"
              }`}
            >
              Зона риска: {registryStatus}
            </span>
            <span
              className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${
                riskLevel === "Высокий"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  : riskLevel === "Средний"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : riskLevel === "Недостаточно данных"
                      ? "border-gray-500/30 bg-gray-500/10 text-gray-400"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              }`}
            >
              Уровень риска: {riskLevel}
            </span>
            {project.stage && (
              <span className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${getStageDarkBadgeClass(project.stage)}`}>
                Стадия: {getStageLabel(project.stage)}
              </span>
            )}
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight max-w-full break-words">
            {project.projectName}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 bg-white/5 p-6 rounded-2xl border border-white/10 mt-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Заказчик
              </span>
              <span className="text-sm font-medium text-gray-300">
                {formatFieldText(project.sponsor)}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Владелец проекта
              </span>
              <span className="text-sm font-medium text-gray-300">
                {formatFieldText(project.projectOwner || project.owner)}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Руководитель проекта
              </span>
              <span className="text-sm font-medium text-gray-300">
                {formatFieldText(project.projectManager || project.executor)}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Стадия проекта
              </span>
              <span className="text-sm font-medium text-gray-300">
                {formatFieldText(getStageLabel(project.stage))}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Дата начала
              </span>
              <span className="text-sm font-medium text-gray-300">
                {formatFieldDate(project.startDate)}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Дата завершения
              </span>
              <span className="text-sm font-medium text-gray-300">
                {formatFieldDate(project.deadlineAt || project.endDate)}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Заполненность данных
              </span>
              <span className="text-sm font-medium text-gray-350">
                {completenessText}
              </span>
            </div>

            {project.projectUrl && (
              <div className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Ссылка на Bitrix24
                </span>
                <a
                  href={project.projectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#F8BC03] hover:text-[#dab503] transition-colors font-medium text-sm"
                >
                  <ExternalLink size={14} /> Открыть Bitrix24
                </a>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto sm:ml-auto mt-2">
            <button
              onClick={handleExportPDF}
              disabled={exportingPdf}
              className="flex items-center gap-2 bg-[#FBDF4B] text-[#010101] hover:bg-[#F8BC03] transition-all px-4 py-2.5 rounded-xl border border-black/5 cursor-pointer disabled:opacity-50 active:scale-95 shadow-lg interactive-button"
            >
              {exportingPdf ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              <span className="text-xs font-bold uppercase tracking-wider">
                {exportingPdf ? "Формирование..." : "Экспорт PDF"}
              </span>
            </button>
            {pdfError && (
              <p className="text-red-400 text-xs font-semibold animate-pulse">
                {pdfError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Прогресс проекта */}
      <div id="card-project-progress-rates" className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 grid grid-cols-1 lg:grid-cols-12 gap-8 transition-all hover:shadow-xs animate-soft-enter animate-delay-75">
        
        {/* Left Column (Management block) */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <Target size={22} />
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none block mb-1">Прогресс проекта</span>
                <h3 className="text-xl font-black text-slate-900 leading-none">Сводные показатели</h3>
              </div>
            </div>
            <p className="text-sm text-gray-500 font-medium mt-1 leading-relaxed">
              Сводные показатели завершенности по выбранному проекту на текущий отчетный период.
            </p>
          </div>
          
          {/* Year Switcher */}
          {availableYears.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Выберите год:</span>
              <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-fit shrink-0 flex-wrap gap-1">
                {availableYears.map((year) => (
                  <button
                    key={year}
                    id={`btn-select-project-year-${year}`}
                    onClick={() => setSelectedYearState(year)}
                    className={`px-4.5 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer interactive-button ${
                      selectedYear === year
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quarter Switcher */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Выберите отчетный период:</span>
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-fit shrink-0">
              {[1, 2, 3, 4].map((q) => (
                <button
                  key={q}
                  id={`btn-select-project-q${q}`}
                  onClick={() => setSelectedQuarter(q)}
                  className={`px-4 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer interactive-button ${
                    selectedQuarter === q
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  Q{q}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Right Column (Metrics Block) */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          
          {/* Group 1: Квартальный отчет (Операционный трек) */}
          <div key={selectedQuarter} id="project-progress-group-quarter" className="bg-slate-50/40 p-5 rounded-3xl border border-slate-200/50 flex flex-col gap-4 animate-quarter-transition">
            <div className="flex items-center justify-between border-b border-slate-200/40 pb-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Операционный трек</span>
              <span className="px-2.5 py-0.5 text-[9px] bg-indigo-50 text-indigo-700 rounded-md font-black uppercase tracking-wide">Квартал Q{selectedQuarter}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {renderCircularGauge(`Вехи Q${selectedQuarter}`, milestonesQuarterValWithCheck, milestonesQuarterPlan, milestonesQuarterTitle)}
              {renderCircularGauge(`Показатели (Q${selectedQuarter})`, kpiQuarterVal, kpiQuarterPlan, kpiQuarterTitle)}
            </div>
          </div>

          {/* Group 2: Годовой статус (Стратегический трек) */}
          <div id="project-progress-group-year" className="bg-emerald-50/10 p-5 rounded-3xl border border-emerald-100/30 flex flex-col gap-4 transition-all duration-300">
            <div className="flex items-center justify-between border-b border-emerald-100/20 pb-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Стратегический трек</span>
              <span className="px-2.5 py-0.5 text-[9px] bg-emerald-50 text-emerald-800 rounded-md font-black uppercase tracking-wide">Год {selectedYear}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {renderCircularGauge(`Вехи ${selectedYear}`, milestonesYearValWithCheck, milestonesYearPlan, milestonesYearTitle)}
              {renderCircularGauge("Показатели (Год)", kpiYearVal, kpiYearPlan, kpiYearTitle)}
            </div>
          </div>
        </div>
      </div>

      {/* Цели и результаты проекта */}
      <section className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-6 animate-soft-enter animate-delay-150">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
          <Target size={18} className="text-[#F8BC03]" /> Цели и результаты проекта
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Цели проекта
              </p>
              {project.goals && project.goals.length > 0 && project.goals.some(g => g && g.trim() !== "" && g.trim() !== "—") ? (
                <ul className="space-y-1.5">
                  {project.goals.map((g, i) => (
                    <li
                      key={i}
                      className="text-xs sm:text-sm font-medium text-gray-800 flex gap-2"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-700 mt-2 shrink-0" />
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs sm:text-sm font-medium text-gray-400">
                  Цели проекта не указаны
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Образы результатов
              </p>
              {project.resultImages && project.resultImages.length > 0 && project.resultImages.some(img => img && img.trim() !== "" && img.trim() !== "—") ? (
                <ul className="space-y-1.5">
                  {project.resultImages.map((img, i) => (
                    <li
                      key={i}
                      className="text-xs sm:text-sm font-medium text-gray-800 flex gap-2"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-700 mt-2 shrink-0" />
                      <span>{img}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs sm:text-sm font-medium text-gray-400">
                  Образы результатов не указаны
                </p>
              )}
            </div>
          </div>
          <div className="lg:col-span-1 border-t lg:border-t-0 lg:border-l border-gray-100 pt-6 lg:pt-0 lg:pl-8 animate-soft-enter animate-delay-225">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users size={14} className="text-[#F8BC03]" /> Дополнительные участники
            </h4>
            {(() => {
              const hasAdmin = project.projectAdmin && String(project.projectAdmin).trim() !== "" && String(project.projectAdmin).trim() !== "—" && String(project.projectAdmin).trim().toLowerCase() !== "не заполнено";
              const hasResp = project.responsible && String(project.responsible).trim() !== "" && String(project.responsible).trim() !== "—" && String(project.responsible).trim().toLowerCase() !== "не заполнено";
              const hasTeam = project.projectTeam && String(project.projectTeam).trim() !== "" && String(project.projectTeam).trim() !== "—" && String(project.projectTeam).trim().toLowerCase() !== "не заполнено";
              const hasAny = hasAdmin || hasResp || hasTeam;

              if (!hasAny) {
                return (
                  <p className="text-xs font-medium text-gray-400">
                    Дополнительные участники не указаны
                  </p>
                );
              }

              return (
                <div className="space-y-4">
                  {hasAdmin && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Администратор проекта
                      </p>
                      <p className="text-xs font-bold text-gray-900">
                        {formatFieldValue(project.projectAdmin)}
                      </p>
                    </div>
                  )}
                  {hasResp && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Ответственный
                      </p>
                      <p className="text-xs font-bold text-gray-900">
                        {formatFieldValue(project.responsible)}
                      </p>
                    </div>
                  )}
                  {hasTeam && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Команда проекта
                      </p>
                      <p className="text-xs font-medium text-gray-750 whitespace-normal leading-tight">
                        {formatFieldValue(project.projectTeam)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Блок Детализация выполнения */}
      <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden animate-soft-enter animate-delay-225">
        {/* Шапка */}
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
            <TrendingUp size={18} className="text-[#F8BC03]" /> Детализация выполнения
          </h3>
        </div>

        {/* Содержимое таблиц */}
        <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6 bg-gray-50/10">
          {/* Левая таблица: Вехи */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col min-h-[300px]">
            <div className="bg-gray-50/55 p-4 border-b border-gray-100 flex items-center justify-between min-h-[56px]">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Вехи
              </h4>
            </div>
            
            {evaluation && evaluation.milestones && (
              <>
                {evaluation.milestones.weightControlStatus === "warning" && (
                  <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 text-xs text-amber-800 font-medium flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                    <span>Сумма весов по вехам проекта меньше 100%. Остаток веса не распределен.</span>
                  </div>
                )}
                {evaluation.milestones.weightControlStatus === "error" && (
                  <div className="bg-rose-50 border-b border-rose-100 px-4 py-2.5 text-xs text-rose-800 font-medium flex items-center gap-2">
                    <ShieldAlert size={14} className="text-rose-500 shrink-0" />
                    <span>Сумма весов по вехам проекта превышает 100%. Проверьте заполнение весов.</span>
                  </div>
                )}
              </>
            )}

            <div className="overflow-x-auto w-full custom-scrollbar flex-1">
              <table className="w-full text-left text-sm border-collapse min-w-[500px] table-fixed">
                <thead>
                  <tr className="bg-gray-50/30 border-b border-gray-100">
                    <th className="w-[18%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Период
                    </th>
                    <th className="w-[42%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Название вехи
                    </th>
                    <th className="w-[12%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider font-sans">
                      Вес
                    </th>
                    <th className="w-[16%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider font-sans">
                      Факт
                    </th>
                    <th className="w-[12%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider font-sans">
                      Вклад
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(() => {
                    const evaluationMilestones = (evaluation?.milestones?.milestoneResults && Array.isArray(evaluation.milestones.milestoneResults))
                      ? evaluation.milestones.milestoneResults.filter(m => m.year === selectedYear && (!selectedQuarter || m.quarter === `Q${selectedQuarter}`))
                      : [];

                    if (evaluationMilestones.length > 0) {
                      return evaluationMilestones.map((t) => {
                        const quarterText = t.quarter ? `${t.year} ${t.quarter}` : "—";
                        const titleText = t.name ? String(t.name).trim() : "Не указано";
                        
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
                        const progressVal = t.completionPercent || 0;
                        const progressText = hasProgress ? `${progressVal}%` : "Нет данных";

                        let attributedText = "";
                        if (t.weightSource === "informational" || t.weightSource === "excluded_no_progress") {
                          attributedText = "Не влияет";
                        } else {
                          attributedText = t.contributionPercent !== undefined && t.contributionPercent !== null
                            ? `${Number(t.contributionPercent.toFixed(2))}%`
                            : "Нет данных";
                        }

                        return (
                          <tr
                            key={t.id}
                            className="hover:bg-gray-50/30 transition-colors"
                          >
                            <td className="px-4 py-3 font-semibold text-gray-600 text-xs truncate">
                              {quarterText}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900 text-xs">
                              <div
                                className="line-clamp-2 whitespace-normal break-words leading-relaxed"
                                title={titleText}
                              >
                                {titleText}
                                {t.weightSource === "informational" && (
                                  <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-gray-50 text-gray-500 border border-gray-100 uppercase tracking-wider">
                                    Информационная
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-gray-900 text-xs font-sans whitespace-nowrap">
                              {weightText}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1 justify-center max-w-[100px]">
                                <span className="font-bold text-gray-900 text-xs leading-none font-sans">
                                  {progressText}
                                </span>
                                {hasProgress && progressVal > 0 && (
                                  <div className="w-full bg-gray-150 h-1 rounded-full overflow-hidden">
                                    <div
                                      className="bg-blue-500 h-full transition-all duration-300"
                                      style={{ width: `${Math.min(100, Math.max(0, progressVal))}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-blue-600 text-xs font-sans whitespace-nowrap">
                              {attributedText}
                            </td>
                          </tr>
                        );
                      });
                    }

                    let filteredTasksList = tasksList;
                    if (selectedQuarter) {
                      const qStr = `Q${selectedQuarter}`;
                      filteredTasksList = filteredTasksList.filter(t => (t as any)._extractedYear === selectedYear && ((t as any)._extractedQuarter === qStr || t.quarter === qStr));
                    } else {
                      filteredTasksList = filteredTasksList.filter(t => (t as any)._extractedYear === selectedYear);
                    }

                    if (filteredTasksList.length > 0) {
                      return filteredTasksList.map((t) => {
                        const qValue = t.quarter ? String(t.quarter).trim() : "";
                        const extYear = (t as any)._extractedYear;
                        let quarterText = qValue !== "" ? qValue : "—";
                        if (qValue !== "" && extYear && extYear !== "unknown" && !qValue.includes(String(extYear))) {
                          quarterText = `${qValue} ${extYear}`;
                        }
                        const titleText = t.title ? String(t.title).trim() : "Не указано";
                        const hasWeight = t.weight !== undefined && t.weight !== null;
                        const weightText = hasWeight ? `${t.weight}%` : "—";
                        const hasProgress = t.progressPercent !== undefined && t.progressPercent !== null;
                        const progressVal = t.progressPercent || 0;
                        const progressText = hasProgress ? `${progressVal}%` : "—";
                        const attributedText = (hasProgress && hasWeight)
                          ? `${((t.weight ?? 0) * (t.progressPercent ?? 0) / 100).toFixed(1)}%`
                          : "Нет данных";

                        return (
                          <tr
                            key={t.taskId}
                            className="hover:bg-gray-50/30 transition-colors"
                          >
                            <td className="px-4 py-3 font-semibold text-gray-600 text-xs truncate">
                              {quarterText}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900 text-xs">
                              <div
                                className="line-clamp-2 whitespace-normal break-words leading-relaxed"
                                title={titleText}
                              >
                                {titleText}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-gray-900 text-xs font-sans">
                              {weightText}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1 justify-center max-w-[100px]">
                                <span className="font-bold text-gray-900 text-xs leading-none font-sans">
                                  {progressText}
                                </span>
                                {hasProgress && progressVal > 0 && (
                                  <div className="w-full bg-gray-150 h-1 rounded-full overflow-hidden">
                                    <div
                                      className="bg-blue-500 h-full transition-all duration-300"
                                      style={{ width: `${Math.min(100, Math.max(0, progressVal))}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-blue-600 text-xs font-sans">
                              {attributedText}
                            </td>
                          </tr>
                        );
                      });
                    }

                    // Raw-only data fallback
                    const rawMilestones = getRawMilestonesListForPeriod(project, selectedYear, selectedQuarter);
                    return rawMilestones.map((t) => {
                      const qValue = t.quarter ? String(t.quarter).trim() : "";
                      const extYear = selectedYear;
                      let quarterText = qValue !== "" ? qValue : "—";
                      if (qValue !== "" && extYear && !qValue.includes(String(extYear))) {
                        quarterText = `${qValue} ${extYear}`;
                      }
                      const titleText = t.title ? String(t.title).trim() : "Не указано";
                      
                      const hasWeight = t.originalWeightPercent !== undefined && t.originalWeightPercent !== null;
                      const weightText = hasWeight ? `${t.originalWeightPercent}%` : "—";
                      
                      const hasProgress = t.completionPercent !== undefined && t.completionPercent !== null;
                      const progressVal = t.completionPercent || 0;
                      const progressText = hasProgress ? `${progressVal}%` : "—";
                      const attributedText = (hasProgress && t.weight !== undefined && t.weight !== null)
                        ? `${((t.weight ?? 0) * (t.completionPercent ?? 0) / 100).toFixed(1)}%`
                        : "Нет данных";

                      return (
                        <tr
                          key={t.id}
                          className="hover:bg-gray-50/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-semibold text-gray-600 text-xs truncate">
                            {quarterText}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 text-xs">
                            <div
                              className="line-clamp-2 whitespace-normal break-words leading-relaxed"
                              title={titleText}
                            >
                              {titleText}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-900 text-xs font-sans">
                            {weightText}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1 justify-center max-w-[100px]">
                              <span className="font-bold text-gray-900 text-xs leading-none font-sans">
                                {progressText}
                              </span>
                              {hasProgress && progressVal > 0 && (
                                <div className="w-full bg-gray-150 h-1 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full transition-all duration-300"
                                    style={{ width: `${Math.min(100, Math.max(0, progressVal))}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-blue-600 text-xs font-sans">
                            {attributedText}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                  {(() => {
                    const evaluationMilestones = (evaluation?.milestones?.milestoneResults && Array.isArray(evaluation.milestones.milestoneResults))
                      ? evaluation.milestones.milestoneResults.filter(m => m.year === selectedYear && (!selectedQuarter || m.quarter === `Q${selectedQuarter}`))
                      : [];

                    let fallbackMilestonesCount = 0;
                    if (evaluationMilestones.length === 0) {
                      let filteredTasksList = tasksList;
                      if (selectedQuarter) {
                        const qStr = `Q${selectedQuarter}`;
                        filteredTasksList = filteredTasksList.filter(t => (t as any)._extractedYear === selectedYear && ((t as any)._extractedQuarter === qStr || t.quarter === qStr));
                      } else {
                        filteredTasksList = filteredTasksList.filter(t => (t as any)._extractedYear === selectedYear);
                      }
                      
                      if (filteredTasksList.length > 0) {
                        fallbackMilestonesCount = filteredTasksList.length;
                      } else {
                        const rawMilestones = getRawMilestonesListForPeriod(project, selectedYear, selectedQuarter);
                        fallbackMilestonesCount = rawMilestones.length;
                      }
                    }

                    const length = evaluationMilestones.length > 0
                      ? evaluationMilestones.length
                      : fallbackMilestonesCount;
                    
                    if (length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-12 text-center text-xs text-gray-400 font-semibold uppercase tracking-wider"
                          >
                            По проекту нет данных по вехам
                          </td>
                        </tr>
                      );
                    }
                    return null;
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Правая таблица: Показатели */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col min-h-[300px]">
            <div className="bg-gray-50/55 p-4 border-b border-gray-100 flex items-center justify-between min-h-[56px]">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#fbbf24] rounded-full" /> Показатели
              </h4>
            </div>
            <div className="overflow-x-auto w-full custom-scrollbar flex-1">
              <table className="w-full text-left text-sm border-collapse min-w-[500px] table-fixed">
                <thead>
                  <tr className="bg-gray-50/30 border-b border-gray-100">
                    <th className="w-[18%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Период
                    </th>
                    <th className="w-[42%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Название показателя
                    </th>
                    <th className="w-[12%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider font-sans">
                      План
                    </th>
                    <th className="w-[12%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider font-sans">
                      Факт
                    </th>
                    <th className="w-[16%] px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider font-sans">
                      Выполнение
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredCombinedIndicators.map((item, i) => {
                    const { percentText, actualPercent, cappedPercent } = getPerformancePercent(item);
                    const displayPercentVal = cappedPercent !== null ? Math.min(100, Math.max(0, cappedPercent)) : 0;
                    const progressColor = cappedPercent !== null 
                      ? (cappedPercent >= 100 ? "bg-[#10b981]" : cappedPercent >= 90 ? "bg-[#f59e0b]" : "bg-[#ef4444]")
                      : "bg-gray-300";

                    const periodText = item.period ? String(item.period).trim() : "—";
                    const nameText = item.name ? String(item.name).trim() : "Не указано";
                    const planText = item.plan !== null && item.plan !== undefined && String(item.plan).trim() !== "" ? String(item.plan).trim() : "—";
                    const factText = item.fact !== null && item.fact !== undefined && String(item.fact).trim() !== "" ? String(item.fact).trim() : "—";

                    return (
                      <tr
                        key={`${item.id || "ind"}-${i}`}
                        className="hover:bg-gray-50/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-semibold text-gray-600 text-xs truncate">
                          {periodText}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 text-xs">
                          <div
                            className="line-clamp-2 whitespace-normal break-words leading-relaxed"
                            title={nameText}
                          >
                            {nameText}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800 text-xs font-sans">
                          {planText}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800 text-xs font-sans">
                          {factText}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 justify-center max-w-[100px]">
                            <span className={`font-bold text-xs leading-none font-sans ${percentText !== "Нет данных" && actualPercent !== null ? (actualPercent >= 100 ? "text-emerald-600" : actualPercent >= 90 ? "text-amber-600" : "text-rose-600") : "text-gray-500"}`}>
                              {percentText}
                            </span>
                            {cappedPercent !== null && cappedPercent > 0 && (
                              <div className="w-full bg-gray-150 h-1 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${progressColor} transition-all duration-300`}
                                  style={{ width: `${displayPercentVal}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCombinedIndicators.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-xs text-gray-400 font-semibold uppercase tracking-wider"
                      >
                        По выбранному периоду нет данных по показателям
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Нижний ряд служебных карточек */}
      <div id="project-card-services-grid" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Блок Мониторинг ПК */}
        <div id="wrapper-monitoring-pc" className="animate-soft-enter animate-delay-300">
          <section className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between min-h-[250px] h-full interactive-card">
            <div>
              <div className="flex items-center gap-2 border-b border-gray-50 pb-3">
                <Activity size={18} className="text-[#F8BC03] shrink-0" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 font-sans">
                  Мониторинг ПК
                </h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 my-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    Факт последнего ПК
                  </p>
                  <p className="text-xs font-bold text-gray-800">
                    {project.lastPcDate
                      ? formatDateSafe(project.lastPcDate)
                      : "Нет ПК"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    Регулярность ПК
                  </p>
                  <p className="text-xs font-bold text-gray-800 font-sans">
                    {project.monitoringFrequencyWeeks
                      ? `${project.monitoringFrequencyWeeks} нед.`
                      : "Не указана"}
                  </p>
                </div>
              </div>
            </div>
            
            <div className={`p-3 rounded-2xl border ${pcStatusColor} flex items-center justify-between`}>
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider opacity-60">Статус ПК</p>
                <p className="text-xs font-black">{pcStatusText}</p>
              </div>
              <div className="text-right">
                {pcSubTextList.map((st, i) => (
                  <p key={i} className="text-xs font-extrabold leading-tight">
                    {st}
                  </p>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Блок Риски */}
        <div id="wrapper-risks" className="animate-soft-enter animate-delay-300">
          <section className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between min-h-[250px] h-full interactive-card">
            <div>
              <div className="flex items-center gap-2 border-b border-gray-50 pb-3">
                <ShieldAlert size={18} className="text-rose-500 shrink-0" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 font-sans">
                  Риски
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4 my-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Зона риска
                  </span>
                  <span className={`inline-flex items-center justify-center w-full px-2 py-1 rounded-xl text-xs font-black border ${
                    registryStatus === "Норма"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : registryStatus === "Зона риска"
                        ? "bg-rose-50 text-rose-700 border-rose-100"
                        : "bg-gray-50 text-gray-600 border-gray-100"
                  }`}>
                    {registryStatus}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Уровень риска
                  </span>
                  <span className={`inline-flex items-center justify-center w-full px-2 py-1 rounded-xl text-xs font-black border ${
                    riskLevel === "Высокий"
                      ? "bg-rose-50 text-rose-700 border-rose-100"
                      : riskLevel === "Средний"
                        ? "bg-orange-55 text-orange-700 border-orange-100"
                        : riskLevel === "Недостаточно данных"
                          ? "bg-gray-50 text-gray-600 border-gray-100"
                          : "bg-emerald-50 text-emerald-700 border-emerald-100"
                  }`}>
                    {riskLevel}
                  </span>
                </div>
              </div>

              <div className="text-xs text-gray-600 font-medium leading-relaxed bg-gray-50 p-2.5 rounded-2xl border border-gray-100/50">
                <span className="font-extrabold text-gray-800 block mb-0.5 text-[10px] uppercase tracking-wider">
                  Причина статуса:
                </span>
                <span className="line-clamp-2 leading-snug" title={getProjectCardRiskExplanation(project, evaluation, dateStr)}>
                  {getProjectCardRiskExplanation(project, evaluation, dateStr)}
                </span>
              </div>
            </div>

            {project.risks && project.risks.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Риски из проекта ({project.risks.length})
                </span>
                <ul className="space-y-1 max-h-[50px] overflow-y-auto custom-scrollbar">
                  {project.risks.map((r) => (
                    <li key={r.riskId} className="flex gap-1.5 text-xs font-medium text-gray-700 leading-tight">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                      <span className="truncate" title={r.title}>{r.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        {/* Блок ИИ-анализ проекта */}
        <div id="wrapper-ai-analysis" className="animate-soft-enter animate-delay-300">
          <section className="bg-slate-900 border border-slate-800 text-white p-5 rounded-3xl shadow-sm flex flex-col justify-between min-h-[250px] h-full relative overflow-hidden interactive-card">
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] scale-150 pointer-events-none">
              <Sparkles size={100} className="text-[#F8BC03]" />
            </div>

            <div>
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Sparkles size={18} className="text-[#F8BC03] shrink-0" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#F8BC03] font-sans">
                  ИИ-анализ проекта
                </h3>
              </div>
              
              <div className="my-3">
                <p className="text-xs text-slate-300 font-medium leading-relaxed">
                  Система проанализирует параметры выполнения проекта, выявит критические точки и сформирует экспертный вывод с рекомендациями.
                </p>
              </div>

              {error && (
                <div className="mt-2 bg-rose-500/15 border border-rose-500/25 p-3 rounded-xl flex items-start gap-2.5 text-rose-200 text-xs leading-normal animate-soft-enter">
                  <AlertTriangle size={15} className="text-rose-455 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block text-rose-300">
                      Не удалось выполнить анализ. Попробуйте еще раз.
                    </span>
                    <span className="text-[10px] text-rose-400/80 mt-1 block break-all">
                      ({error})
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-auto">
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-lg select-none ${
                  analyzing 
                    ? 'bg-slate-800 text-slate-500 border border-slate-755/50 cursor-not-allowed'
                    : 'bg-[#F8BC03] text-[#011] hover:bg-[#dab503] cursor-pointer interactive-button active:scale-[0.98]'
                }`}
              >
                {analyzing ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-[#F8BC03] shrink-0" />
                    <span>Анализируем...</span>
                  </>
                ) : (
                  <>
                    Запустить <Sparkles size={13} className="shrink-0" />
                  </>
                )}
              </button>
            </div>
          </section>
        </div>

      </div>

      {/* Пошаговый процесс ИИ-анализа — на всю ширину под карточками */}
      {analyzing && (
        <div id="ai-analysis-steps-wide" className="bg-slate-900 border border-slate-800 text-white p-6 sm:p-7 rounded-3xl shadow-sm relative overflow-hidden animate-soft-enter mt-6">
          <div className="absolute -right-4 -bottom-4 opacity-[0.03] scale-150 pointer-events-none">
            <Sparkles size={120} className="text-[#F8BC03]" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <Loader2 size={18} className="animate-spin text-[#F8BC03] shrink-0" />
                <h3 className="text-base font-bold uppercase tracking-wider text-[#F8BC03] font-sans">
                  Анализ выполняется
                </h3>
              </div>
              <p className="text-xs text-slate-400 font-medium leading-relaxed mt-0.5">
                Проверяем параметры проекта и формируем рекомендации
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              "Проверяем план и факт",
              "Оцениваем сроки проекта",
              "Анализируем мониторинг ПК",
              "Формируем рекомендации"
            ].map((step, idx) => {
              const isPending = idx > currentStep;
              const isActive = idx === currentStep;
              const isCompleted = idx < currentStep;

              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl transition-all duration-300 ${
                    isActive
                      ? "bg-slate-800 border border-slate-700/60 shadow-lg text-white"
                      : isCompleted
                      ? "bg-slate-950/40 opacity-90 text-slate-300 border border-transparent"
                      : "opacity-30 text-slate-500 border border-transparent"
                  }`}
                >
                  {/* Indicator */}
                  <div className="shrink-0">
                    {isCompleted ? (
                      <div className="w-5.5 h-5.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="w-5.5 h-5.5 rounded-full bg-[#F8BC03]/10 border border-[#F8BC03]/30 text-[#F8BC03] flex items-center justify-center">
                        <Loader2 size={11} className="animate-spin" />
                      </div>
                    ) : (
                      <div className="w-5.5 h-5.5 rounded-full border border-slate-800 bg-slate-950/40 flex items-center justify-center" />
                    )}
                  </div>

                  {/* Text */}
                  <span className={`text-[11px] sm:text-xs font-semibold leading-relaxed ${isActive ? "text-[#F8BC03]" : "text-slate-300"}`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Управленческая диагностика API (Серверная методология) */}
      {isDebugMode && evaluation && (
        <section className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#011] flex items-center gap-1.5">
              <Activity size={18} className="text-[#3b82f6]" /> Методологическая диагностика
            </h3>
            <span className="bg-emerald-100 text-emerald-800 text-[8.5px] px-1.5 py-0.5 rounded font-bold tracking-wide uppercase">SERVER</span>
          </div>

          <div className="space-y-3.5 text-xs font-sans">
            {/* Методологический статус */}
            <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-2xl border border-gray-100">
              <div>
                <span className="text-gray-400 font-bold uppercase text-[8px] tracking-wider block">Методологический статус</span>
                <span className={`inline-block font-bold mt-1 px-2 py-0.5 rounded text-[10px] ${
                  evaluation.projectHealth.status === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                  evaluation.projectHealth.status === 'attention' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                  evaluation.projectHealth.status === 'risk' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                  'bg-gray-50 text-gray-500 border border-gray-100'
                }`}>
                  {formatStatusLabel(evaluation.projectHealth.status)}
                </span>
              </div>
            </div>

            {/* Main Factors/Reasons */}
            <div className="space-y-1">
              <span className="text-gray-400 font-bold uppercase text-[8px] tracking-wider block">Анализ причин весов & отклонений:</span>
              {evaluation.projectHealth.mainReasons.length > 0 ? (
                <ul className="list-disc list-inside space-y-1 text-gray-700 font-medium leading-relaxed pl-1">
                  {evaluation.projectHealth.mainReasons.map((reason, idx) => (
                    <li key={idx} className="whitespace-normal break-words">{reason}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-emerald-600 font-bold block text-[11px]">Факторы риска не обнаружены, проект выполняется штатно.</span>
              )}
            </div>

            {/* Submetrics list */}
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <span className="font-bold text-gray-700 block">Методологические метрики:</span>
              
              <div className="space-y-2 text-[11px] font-medium text-gray-600">
                {/* Milestones Total */}
                <div className="flex justify-between items-center">
                  <span>Выполнение вех (всего):</span>
                  <strong className="text-gray-950 font-bold">{formatPercent(evaluation.milestones.totalProgressPercent)}</strong>
                </div>

                {/* Milestones Actual */}
                <div className="flex justify-between items-center">
                  <span>Выполнение вех (актуальные):</span>
                  <strong className="text-indigo-700 font-bold">{formatPercent(evaluation.milestones.actualProgressPercent)}</strong>
                </div>

                {/* Indicator performance */}
                <div className="flex justify-between items-center">
                  <span>Выполнение по показателям:</span>
                  <strong className="text-cyan-700 font-bold">{formatPercent(evaluation.indicators.cappedAveragePerformancePercent)}</strong>
                </div>

                {/* Data Quality Completeness */}
                <div className="flex justify-between items-center">
                  <span>Заполненность данных:</span>
                  <strong className="text-emerald-700 font-bold">{formatPercent(evaluation.dataQuality.completenessPercent)}</strong>
                </div>

                {/* Weight Control Status */}
                <div className="flex justify-between items-center">
                  <span>Контроль весов по вехам:</span>
                  <strong className={evaluation.milestones.weightControlStatus === 'error' ? 'text-rose-600 font-bold' : 'text-gray-700'}>
                    {formatStatusLabel(evaluation.milestones.weightControlStatus)}
                  </strong>
                </div>

                {/* Monitoring status */}
                <div className="flex justify-between items-center">
                  <span>Статус мониторинга ПК:</span>
                  <strong className={pcStatusText === "Просрочен" ? "text-rose-600 font-bold" : "text-gray-700"}>
                    {pcStatusText}
                  </strong>
                </div>
              </div>
            </div>

            {/* Explanations */}
            {evaluation.explanations.length > 0 && (
              <div className="border-t border-gray-100 pt-3 space-y-1">
                <span className="text-gray-400 font-bold uppercase text-[8px] tracking-wider block">Методологические пояснения:</span>
                <ul className="list-disc list-inside space-y-1 text-gray-500 font-medium pl-1 text-[11px] leading-relaxed">
                  {evaluation.explanations.map((exp, idx) => (
                    <li key={idx} className="whitespace-normal break-words">{exp}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Основной блок анализа */}
      {analysis && !analyzing && (
        <div id="ai-analysis-full" className="pt-8">
          <AnalysisPanel analysis={analysis} />
        </div>
      )}
    </div>
  );
};
