import React, { useState, useEffect } from 'react';
import { Layers, Clock, CheckCircle2, CalendarOff, Target, ListChecks, Award, X, Info, ShieldAlert, FileWarning, HelpCircle, Activity } from 'lucide-react';
import { Stats, Project, PortfolioEvaluation, ImportValidationReport, ProjectEvaluation } from '../types';
import { normalizeProjectStage, PROJECT_STAGE_COLORS, PROJECT_STAGE_LABELS, STAGE_COLOR_MAP, UNSPECIFIED_PROJECT_STAGE } from '../utils/projectStageStyles';
import { AnimatedCircularGauge } from './AnimatedCircularGauge';
import { DataSourceStatus } from './DataSourceStatus';
import { ImportDiagnosticsPanel } from './ImportDiagnosticsPanel';
import { getRegistryPcStatusView, getProjectMonitoringStatus } from '../utils/projectRegistryStatus';
import {
  calculateMilestonesProgressForProjectDepts,
  calculateKpiProgressForProjectDepts,
  parseRussianDate
} from '../utils/projectCalculations';
import { parseDateSafe } from '../utils/dateUtils';
import { isProjectInYear, getYearsForProject } from '../utils/overviewYearFiltering';
import { resolveYearWithinAvailableYears, resolveEffectiveAssessmentDateForSelectedYear } from '../utils/periodApplicability';
import { computePortfolioProgressAggregates } from '../utils/overviewPortfolioAggregates';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { formatPercentLabel, getTrafficLightColor, getEvaluationByProjectId } from '../utils/evaluationUtils';
import { 
  getMilestoneYearCompletionMetricsFromEvaluation
} from '../utils/evaluationMilestoneMetrics';
import {
  getIndicatorYearCompletionMetricsFromEvaluation
} from '../utils/evaluationIndicatorMetrics';
import { shouldExcludeProjectFromOverviewDepartmentCharts } from '../utils/overviewDepartmentFilters';


interface OverviewProps {
  stats: Stats;
  projects: Project[];
  portfolioEvaluation?: PortfolioEvaluation | null;
  importReport?: ImportValidationReport | null;
  isDebugMode?: boolean;
  assessmentDate?: string;
  projectEvaluations?: ProjectEvaluation[] | null;
  selectedYearExternal?: number | null;
  onSelectedYearChange?: (year: number | null) => void;
  selectedQuarterExternal?: number;
  onSelectedQuarterChange?: (quarter: number) => void;
}

export const Overview: React.FC<OverviewProps> = ({ 
  stats, 
  projects, 
  portfolioEvaluation, 
  importReport, 
  isDebugMode: isDebugModeProp, 
  assessmentDate,
  projectEvaluations,
  selectedYearExternal,
  onSelectedYearChange,
  selectedQuarterExternal,
  onSelectedQuarterChange
}) => {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [activeZoomChart, setActiveZoomChart] = useState<string | null>(null);

  const selectedQuarter = React.useMemo(() => {
    if (selectedQuarterExternal !== undefined && selectedQuarterExternal !== null) {
      return selectedQuarterExternal;
    }
    const date = (assessmentDate ? parseDateSafe(assessmentDate) : null) || new Date();
    const month = date.getMonth();
    if (month < 3) return 1;
    if (month < 6) return 2;
    if (month < 9) return 3;
    return 4;
  }, [selectedQuarterExternal, assessmentDate]);

  const [hiddenStatuses, setHiddenStatuses] = useState<string[]>([]);
  const [hiddenPriorities, setHiddenPriorities] = useState<string[]>([]);

  const [chart1ShowMilestones, setChart1ShowMilestones] = useState(true);
  const [chart1ShowKpis, setChart1ShowKpis] = useState(true);
  const [chart1Sort, setChart1Sort] = useState<string>('none');

  const [chart2ShowMilestones, setChart2ShowMilestones] = useState(true);
  const [chart2ShowKpis, setChart2ShowKpis] = useState(true);
  const [chart2Sort, setChart2Sort] = useState<string>('none');

  const handleToggleChart1Milestones = () => {
    if (chart1ShowMilestones && !chart1ShowKpis) return;
    setChart1ShowMilestones(!chart1ShowMilestones);
  };

  const handleToggleChart1Kpis = () => {
    if (!chart1ShowMilestones && chart1ShowKpis) return;
    setChart1ShowKpis(!chart1ShowKpis);
  };

  const handleToggleChart2Milestones = () => {
    if (chart2ShowMilestones && !chart2ShowKpis) return;
    setChart2ShowMilestones(!chart2ShowMilestones);
  };

  const handleToggleChart2Kpis = () => {
    if (!chart2ShowMilestones && chart2ShowKpis) return;
    setChart2ShowKpis(!chart2ShowKpis);
  };

  const isDebugMode = isDebugModeProp ?? (
    typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('debug') === '1' || 
      localStorage?.getItem('debugDashboard') === 'true'
    )
  );
  
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveZoomChart(null);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // --- YEAR SELECTION AND FILTERING UTILITIES ---
  const availableYears = React.useMemo(() => {
    const yearsSet = new Set<number>();
    projects.forEach(p => {
      const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
      getYearsForProject(p, ev).forEach(y => yearsSet.add(y));
    });
    return Array.from(yearsSet).sort();
  }, [projects, projectEvaluations]);

  const defaultYear = React.useMemo(() => {
    return resolveYearWithinAvailableYears(availableYears, assessmentDate);
  }, [availableYears, assessmentDate]);

  const selectedYear = selectedYearExternal ?? defaultYear;

  React.useEffect(() => {
    if (selectedYearExternal === null && onSelectedYearChange) {
      onSelectedYearChange(defaultYear);
    }
  }, [selectedYearExternal, defaultYear, onSelectedYearChange]);

  const projectsInSelectedYear = React.useMemo(() => {
    return projects.filter(p => {
      const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
      return isProjectInYear(p, ev, selectedYear);
    });
  }, [projects, projectEvaluations, selectedYear]);

  const effectiveAssessmentDate = React.useMemo(() => {
    return resolveEffectiveAssessmentDateForSelectedYear(selectedYear, assessmentDate);
  }, [selectedYear, assessmentDate]);

  const parsedEffectiveAssessmentDate = React.useMemo(() => {
    return parseDateSafe(effectiveAssessmentDate) || new Date();
  }, [effectiveAssessmentDate]);

  const isMobile = windowWidth < 768;

  // 1) Stage distribution: known stages + "Стадия не указана" (never drop unknown / empty)
  let plannedCount = 0;
  let inWorkCount = 0;
  let onPauseCount = 0;
  let stoppedCount = 0;
  let completedCount = 0;
  let unspecifiedStageCount = 0;

  projectsInSelectedYear.forEach((p) => {
    const norm = normalizeProjectStage(p.stage, p.status);
    if (norm === "Планируется") plannedCount++;
    else if (norm === "В работе") inWorkCount++;
    else if (norm === "На паузе") onPauseCount++;
    else if (norm === "Остановлен") stoppedCount++;
    else if (norm === "Завершен") completedCount++;
    else unspecifiedStageCount++;
  });

  const missingMonitoringCount = projectsInSelectedYear.filter(
    p => !p.lastPcDate || p.lastPcDate.trim() === "" || p.lastPcDate.trim().toLowerCase() === "nan"
  ).length;

  const portfolioProgress = computePortfolioProgressAggregates({
    projectsInSelectedYear,
    projectEvaluations,
    selectedYear,
    selectedQuarter,
    assessmentDate: parsedEffectiveAssessmentDate
  });
  const avgSelectedMilestonesProgress = portfolioProgress.selectedMilestones;
  const avgSelectedKpiProgress = portfolioProgress.selectedIndicators;
  const avgYearMilestonesProgress = portfolioProgress.yearMilestones;
  const avgYearKpiProgress = portfolioProgress.yearIndicators;


  // Pie Chart 1: Structure by Statuses
  const allStatuses = [
    { name: 'Планируется', value: plannedCount, color: STAGE_COLOR_MAP['Планируется'] },
    { name: 'В работе', value: inWorkCount, color: STAGE_COLOR_MAP['В работе'] },
    { name: 'На паузе', value: onPauseCount, color: STAGE_COLOR_MAP['На паузе'] },
    { name: 'Остановлен', value: stoppedCount, color: STAGE_COLOR_MAP['Остановлен'] },
    { name: 'Завершен', value: completedCount, color: STAGE_COLOR_MAP['Завершен'] },
    { name: UNSPECIFIED_PROJECT_STAGE, value: unspecifiedStageCount, color: STAGE_COLOR_MAP[UNSPECIFIED_PROJECT_STAGE] }
  ].filter(d => d.value > 0);

  const statusChartData = allStatuses.filter(item => !hiddenStatuses.includes(item.name));
  const visibleStatusesCount = statusChartData.reduce((sum, item) => sum + item.value, 0);

  const handleToggleStatus = (name: string) => {
    if (hiddenStatuses.includes(name)) {
      setHiddenStatuses(hiddenStatuses.filter(n => n !== name));
    } else {
      const activeCount = allStatuses.filter(item => !hiddenStatuses.includes(item.name)).length;
      if (activeCount > 1) {
        setHiddenStatuses([...hiddenStatuses, name]);
      }
    }
  };

  // Pie Chart 2: Project Priorities
  let p0count = 0;
  let p1count = 0;
  let p2count = 0;

  projectsInSelectedYear.forEach((p) => {
    const rawPriority = p.priority;
    if (rawPriority === 0 || String(rawPriority) === "0") p0count++;
    else if (rawPriority === 1 || String(rawPriority) === "1") p1count++;
    else p2count++; // default/safe-fallback to 2
  });

  const allPriorities = [
    { name: 'Нулевой приоритет', value: p0count, color: '#111827' },
    { name: 'Первый приоритет', value: p1count, color: '#fbbf24' },
    { name: 'Второй приоритет', value: p2count, color: '#cbd5e1' }
  ].filter(d => d.value > 0);

  const priorityChartData = allPriorities.filter(item => !hiddenPriorities.includes(item.name));
  const visiblePrioritiesCount = priorityChartData.reduce((sum, item) => sum + item.value, 0);

  const handleTogglePriority = (name: string) => {
    if (hiddenPriorities.includes(name)) {
      setHiddenPriorities(hiddenPriorities.filter(n => n !== name));
    } else {
      const activeCount = allPriorities.filter(item => !hiddenPriorities.includes(item.name)).length;
      if (activeCount > 1) {
        setHiddenPriorities([...hiddenPriorities, name]);
      }
    }
  };

  // --- DEPARTMENT ANALYTICS ACCUMULATION ---
  const deptDataMap: Record<string, {
    department: string;
    shortName: string;
    p0: number;
    p1: number;
    p2: number;
    stagePlanned: number;
    stageInWork: number;
    stageOnPause: number;
    stageStopped: number;
    stageCompleted: number;
    stageUnspecified: number;
    timely: number;
    overdue: number;
    insufficient: number;
    tasksProgressSum: number;
    tasksProgressCount: number;
    kpiProgressSum: number;
    kpiProgressRawSum: number;
    kpiProgressCount: number;
  }> = {};

  projectsInSelectedYear.forEach((p) => {
    if (shouldExcludeProjectFromOverviewDepartmentCharts(p.department)) {
      return;
    }

    const deptString = (p.department || "").trim();
    const depts = deptString === "" ? ["Не указано"] : deptString.split(";").map(s => s.trim()).filter(Boolean);
    
    depts.forEach((deptKey) => {
      if (!deptDataMap[deptKey]) {
        // Create short department name for fallback tick display
        let short = deptKey;
        if (short.includes(":")) {
          short = short.split(":")[1].trim();
        }
        if (short.length > 20) {
          short = short.substring(0, 18) + "...";
        }

        deptDataMap[deptKey] = {
          department: deptKey,
          shortName: short,
          p0: 0,
          p1: 0,
          p2: 0,
          stagePlanned: 0,
          stageInWork: 0,
          stageOnPause: 0,
          stageStopped: 0,
          stageCompleted: 0,
          stageUnspecified: 0,
          timely: 0,
          overdue: 0,
          insufficient: 0,
          tasksProgressSum: 0,
          tasksProgressCount: 0,
          kpiProgressSum: 0,
          kpiProgressRawSum: 0,
          kpiProgressCount: 0
        };
      }

      const item = deptDataMap[deptKey];

      // 1) Priorities count
      const rawPriority = p.priority;
      if (rawPriority === 0 || String(rawPriority) === "0") {
        item.p0++;
      } else if (rawPriority === 1 || String(rawPriority) === "1") {
        item.p1++;
      } else {
        item.p2++;
      }

      // 2) Stage counts
      const norm = normalizeProjectStage(p.stage, p.status);
      if (norm === "Планируется") item.stagePlanned++;
      else if (norm === "В работе") item.stageInWork++;
      else if (norm === "На паузе") item.stageOnPause++;
      else if (norm === "Остановлен") item.stageStopped++;
      else if (norm === "Завершен") item.stageCompleted++;
      else item.stageUnspecified++;

      // 3) Timeliness counts
      const evaluation = getEvaluationByProjectId(projectEvaluations, p.projectId);
      const monStatus = getProjectMonitoringStatus(p, effectiveAssessmentDate);
      if (monStatus === "Своевременно") {
        item.timely++;
      } else if (monStatus === "Просрочен") {
        item.overdue++;
      } else if (monStatus === "Недостаточно данных") {
        item.insufficient++;
      }

      // 4) Tasks Progress Accumulation
      let milestoneVal: number | null = null;
      if (evaluation) {
        const yMetrics = getMilestoneYearCompletionMetricsFromEvaluation(
          evaluation,
          selectedYear,
          parsedEffectiveAssessmentDate,
          p.startDate,
          p.deadlineAt || p.endDate,
          "actual"
        );
        milestoneVal = yMetrics.hasData ? yMetrics.fact : null;
      } else {
        milestoneVal = calculateMilestonesProgressForProjectDepts(p, selectedYear, parsedEffectiveAssessmentDate);
      }

      if (milestoneVal !== null) {
        item.tasksProgressSum += milestoneVal;
        item.tasksProgressCount++;
      }

      // 5) Показатели Progress Accumulation
      if (evaluation?.indicators?.indicatorResults) {
        const iMetrics = getIndicatorYearCompletionMetricsFromEvaluation(
          evaluation,
          selectedYear,
          parsedEffectiveAssessmentDate,
          p.startDate,
          p.deadlineAt || p.endDate,
          "actual"
        );
        if (iMetrics.hasData) {
          item.kpiProgressSum += iMetrics.fact;
          item.kpiProgressRawSum += iMetrics.rawFact;
          item.kpiProgressCount++;
        }
      } else {
        const indicatorVal = calculateKpiProgressForProjectDepts(p, selectedYear, parsedEffectiveAssessmentDate);
        if (indicatorVal !== null) {
          item.kpiProgressSum += indicatorVal.raw;
          item.kpiProgressRawSum += indicatorVal.raw;
          item.kpiProgressCount++;
        }
      }
    });
  });

  const chartDataList = Object.values(deptDataMap).map(item => ({
    ...item,
    avgTasksProgress: item.tasksProgressCount > 0 ? Number((item.tasksProgressSum / item.tasksProgressCount).toFixed(1)) : 0,
    avgKpiProgress: item.kpiProgressCount > 0 ? Number((item.kpiProgressSum / item.kpiProgressCount).toFixed(1)) : 0,
    rawKpiProgress: item.kpiProgressCount > 0 ? Number((item.kpiProgressRawSum / item.kpiProgressCount).toFixed(1)) : 0
  }));

  const chartDataUnifiedList = chartDataList.filter(item => item.tasksProgressCount > 0 || item.kpiProgressCount > 0);
  const halfUnified = Math.ceil(chartDataUnifiedList.length / 2);
  const firstHalfUnified = chartDataUnifiedList.slice(0, halfUnified);
  const secondHalfUnified = chartDataUnifiedList.slice(halfUnified);

  const sortData = (data: typeof chartDataUnifiedList, sortKey: string) => {
    const listCopy = [...data];
    if (sortKey === 'milestones-desc') {
      return listCopy.sort((a, b) => b.avgTasksProgress - a.avgTasksProgress);
    }
    if (sortKey === 'milestones-asc') {
      return listCopy.sort((a, b) => a.avgTasksProgress - b.avgTasksProgress);
    }
    if (sortKey === 'kpis-desc') {
      return listCopy.sort((a, b) => b.avgKpiProgress - a.avgKpiProgress);
    }
    if (sortKey === 'kpis-asc') {
      return listCopy.sort((a, b) => a.avgKpiProgress - b.avgKpiProgress);
    }
    return listCopy;
  };

  const sortedFirstHalf = sortData(firstHalfUnified, chart1Sort);
  const sortedSecondHalf = sortData(secondHalfUnified, chart2Sort);

  // Common Tooltips
  const CustomPrioTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const deptName = payload[0].payload.department;
      return (
        <div id="prio-chart-tooltip" className="bg-white p-3.5 rounded-2xl shadow-xl border border-gray-100 text-xs font-semibold space-y-1.5 min-w-[210px] z-50">
          <p className="font-extrabold text-slate-800 mb-1 border-b border-gray-50 pb-1">{deptName}</p>
          {payload.map((p: any, i: number) => (
            <div key={i} className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
                <span className="text-gray-500 font-medium">{p.name}:</span>
              </div>
              <span className="font-extrabold text-slate-950">{p.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomStageTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const deptName = payload[0].payload.department;
      return (
        <div id="stage-chart-tooltip" className="bg-white p-3.5 rounded-2xl shadow-xl border border-gray-100 text-xs font-semibold space-y-1.5 min-w-[210px] z-50">
          <p className="font-extrabold text-slate-800 mb-1 border-b border-gray-50 pb-1">{deptName}</p>
          {payload.map((p: any, i: number) => (
            <div key={i} className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
                <span className="text-gray-500 font-medium">{p.name}:</span>
              </div>
              <span className="font-extrabold text-slate-950">{p.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomMonitorTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const deptName = payload[0].payload.department;
      return (
        <div id="monitor-chart-tooltip" className="bg-white p-3.5 rounded-2xl shadow-xl border border-gray-100 text-xs font-semibold space-y-1.5 min-w-[210px] z-50">
          <p className="font-extrabold text-slate-800 mb-1 border-b border-gray-50 pb-1">{deptName}</p>
          {payload.map((p: any, i: number) => (
            <div key={i} className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
                <span className="text-gray-500 font-medium">{p.name}:</span>
              </div>
              <span className="font-extrabold text-slate-950">{p.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomProgressTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const deptName = payload[0].payload.department;
      return (
        <div id="progress-chart-tooltip" className="bg-white p-3.5 rounded-2xl shadow-xl border border-gray-100 text-xs font-semibold space-y-1.5 min-w-[210px] z-50">
          <p className="font-extrabold text-slate-800 mb-1 border-b border-gray-50 pb-1">{deptName}</p>
          {payload.map((p: any, i: number) => {
            const isKpi = p.dataKey === 'avgKpiProgress';
            const displayVal = (isKpi && p.payload.rawKpiProgress !== undefined) ? p.payload.rawKpiProgress : p.value;
            return (
              <div key={i} className="flex justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
                  <span className="text-gray-500 font-medium">{p.name}:</span>
                </div>
                <span className="font-extrabold text-slate-950">{displayVal}%</span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div id="portfolio-overview-container" className="space-y-6 print:space-y-4 fade-in">
      
      {/* Debug mode: Advanced Diagnostics Status & List Panels */}
      {isDebugMode && importReport && (
        <div className="space-y-6">
          <DataSourceStatus 
            importReport={importReport} 
            assessmentDate={portfolioEvaluation?.assessmentDate || ''} 
          />
          <ImportDiagnosticsPanel importReport={importReport} />
        </div>
      )}

      {/* Executive Portfolio Evaluation (Calculated Server-Side by ProjectEvaluationService) */}
      {isDebugMode && portfolioEvaluation && (
        <div id="executive-portfolio-assessment" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-100 dark:border-zinc-850 pb-4 gap-4">
            <div className="space-y-1">
              <h2 className="text-md font-extrabold text-zinc-950 dark:text-zinc-50 uppercase tracking-tight flex items-center gap-2">
                <Activity className="w-5 h-5 text-zinc-800 dark:text-zinc-400" />
                Управленческая оценка портфеля проектов
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                Интегральные показатели успешности портфеля, рассчитанные по методологии на актуальную дату: <strong>{portfolioEvaluation.assessmentDate}</strong>
              </p>
            </div>
            <div className="shrink-0 flex items-center bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-850">
              <span className="text-xs text-zinc-400 dark:text-zinc-505 font-medium mr-2">Всего в управлении:</span>
              <span className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">{portfolioEvaluation.totalProjects} проектов</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Status counts sub-grid */}
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Группировка здоровья проектов</h3>
              <div className="grid grid-cols-2 gap-3">
                {/* В норме */}
                <div className="p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/20 dark:bg-emerald-950/5 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 block">В норме</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-550 block">Статус без рисков</span>
                  </div>
                  <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{portfolioEvaluation.okCount}</span>
                </div>

                {/* Требует внимания */}
                <div className="p-3.5 rounded-xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/20 dark:bg-amber-950/5 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-amber-800 dark:text-amber-400 block">Внимания</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-550 block">Есть отклонения</span>
                  </div>
                  <span className="text-2xl font-black text-amber-700 dark:text-amber-400">{portfolioEvaluation.attentionCount}</span>
                </div>

                {/* Зона риска */}
                <div className="p-3.5 rounded-xl border border-rose-100 dark:border-rose-900/30 bg-rose-50/20 dark:bg-rose-950/5 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-rose-800 dark:text-rose-400 block">Зона риска</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-550 block">Критичный трек</span>
                  </div>
                  <span className="text-2xl font-black text-rose-700 dark:text-rose-400">{portfolioEvaluation.riskCount}</span>
                </div>

                {/* Недостаточно данных */}
                <div className="p-3.5 rounded-xl border border-sky-100 dark:border-sky-900/30 bg-sky-50/20 dark:bg-sky-950/5 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-sky-800 dark:text-sky-400 block">Мало данных</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-550 block">Нет вех или показателей</span>
                  </div>
                  <span className="text-2xl font-black text-sky-700 dark:text-sky-400">{portfolioEvaluation.notEnoughDataCount}</span>
                </div>
              </div>

              {/* Data quality error projects */}
              {portfolioEvaluation.dataErrorCount > 0 && (
                <div className="p-3 rounded-lg border border-rose-100 dark:border-rose-950/40 bg-rose-50/30 dark:bg-rose-950/10 text-rose-800 dark:text-rose-400 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>Проекты с критическими ошибками импорта:</span>
                  </div>
                  <strong className="font-extrabold">{portfolioEvaluation.dataErrorCount} шт.</strong>
                </div>
              )}
            </div>

            {/* Performance Averages side */}
            <div className="lg:col-span-7 space-y-4">
              <h3 className="text-[11px] font-bold text-zinc-400 dark:text-zinc-505 uppercase tracking-wider">Интегральные показатели выполнения (% от максимума)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Completeness Rate */}
                <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-805/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1">
                      Средняя полнота контракта
                    </span>
                    <span className="font-extrabold text-zinc-900 dark:text-zinc-100 font-mono">
                      {portfolioEvaluation.averageCompletenessPercent !== null ? `${portfolioEvaluation.averageCompletenessPercent.toFixed(1)}%` : '-'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${portfolioEvaluation.averageCompletenessPercent ?? 0}%` }}
                    />
                  </div>
                </div>

                {/* Total Milestone progress */}
                <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-805/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                      Общее выполнение по вехам
                    </span>
                    <span className="font-extrabold text-zinc-900 dark:text-zinc-100 font-mono">
                      {portfolioEvaluation.averageMilestoneProgressPercent !== null ? `${portfolioEvaluation.averageMilestoneProgressPercent.toFixed(1)}%` : '-'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${portfolioEvaluation.averageMilestoneProgressPercent ?? 0}%` }}
                    />
                  </div>
                </div>

                {/* Actual Milestone progress */}
                <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-805/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                      Выполнение актуальных вех (факт)
                    </span>
                    <span className="font-extrabold text-indigo-700 dark:text-indigo-400 font-mono">
                      {portfolioEvaluation.averageActualMilestoneProgressPercent !== null ? `${portfolioEvaluation.averageActualMilestoneProgressPercent.toFixed(1)}%` : '-'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all"
                      style={{ width: `${portfolioEvaluation.averageActualMilestoneProgressPercent ?? 0}%` }}
                    />
                  </div>
                </div>

                {/* Indicator KPI performance */}
                <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-855/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                      Успеваемость по показателям
                    </span>
                    <span className="font-extrabold text-cyan-600 dark:text-cyan-400 font-mono">
                      {portfolioEvaluation.averageIndicatorPerformancePercent !== null ? `${portfolioEvaluation.averageIndicatorPerformancePercent.toFixed(1)}%` : '-'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all"
                      style={{ width: `${portfolioEvaluation.averageIndicatorPerformancePercent ?? 0}%` }}
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Качество данных / Ошибки импорта Google Таблицы */}
      {isDebugMode && importReport && (importReport.issues.length > 0 || importReport.errorsCount > 0 || importReport.warningsCount > 0) && (
        <div id="data-import-report-banner" className="bg-amber-50/50 border border-amber-200/60 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between border-b border-amber-100 pb-3 gap-4">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <h3 className="text-sm font-black text-amber-900 uppercase tracking-wider leading-none">Диагностика источника Google Таблиц</h3>
                <p className="text-[11px] text-amber-700/80 font-medium mt-1">
                  Обнаружены методологические замечания по заполнению контракта в {importReport.projectCount} импортированных строках.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="bg-rose-100 text-rose-800 text-[9px] px-2.5 py-1 rounded-md font-black uppercase tracking-wider">
                Ошибок: {importReport.errorsCount}
              </span>
              <span className="bg-amber-100 text-amber-800 text-[9px] px-2.5 py-1 rounded-md font-black uppercase tracking-wider">
                Предупреждений: {importReport.warningsCount}
              </span>
            </div>
          </div>

          <div className="max-h-[180px] overflow-y-auto divide-y divide-amber-100/50 pr-2">
            {importReport.issues.slice(0, 10).map((issue, idx) => (
              <div key={idx} className="py-2.5 flex items-start gap-3 text-xs leading-relaxed font-sans">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest shrink-0 mt-0.5 ${
                  issue.severity === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  Строка {issue.rowIndex}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-extrabold text-[#011] block truncate">{issue.projectName}</span>
                  <span className="text-gray-500 font-medium text-[11px]">Поле: <strong className="font-mono text-gray-700">{issue.field}</strong> • {issue.message}</span>
                </div>
              </div>
            ))}
            {importReport.issues.length > 10 && (
              <p className="py-2.5 text-center text-[10px] text-amber-700/70 font-black uppercase tracking-widest">
                показаны первые 10 замечаний из {importReport.issues.length}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 1) Horizontal line of independent large cards with a responsive grid */}
      <div id="overview-metrics-grid-stages" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 animate-soft-enter">
        
        {/* Card 1: Всего проектов */}
        <div id="card-total-projects" className="bg-white p-5 rounded-3xl shadow-xs border border-gray-100 flex flex-col justify-between h-[120px] interactive-card">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest leading-none">Всего проектов</span>
            <div className="p-2 rounded-lg bg-gray-50 text-gray-700">
              <Layers size={16} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 leading-none">{projectsInSelectedYear.length}</h2>
          </div>
        </div>

        {/* Card 2: Планируется */}
        <div id="card-planned-stage" className="bg-[#eff6ff] p-5 rounded-3xl shadow-xs border border-blue-100 flex flex-col justify-between h-[120px] interactive-card">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black text-blue-600 uppercase tracking-widest leading-none">Планируется</span>
            <div className="p-2 rounded-lg bg-blue-100/60 text-blue-600">
              <Clock size={16} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 leading-none">{plannedCount}</h2>
          </div>
        </div>

        {/* Card 3: В работе */}
        <div id="card-active-stage" className="bg-[#fef9c3] p-5 rounded-3xl shadow-xs border border-yellow-200 flex flex-col justify-between h-[120px] interactive-card">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black text-yellow-700 uppercase tracking-widest leading-none">В работе</span>
            <div className="p-2 rounded-lg bg-yellow-101 text-yellow-700">
              <Target size={16} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 leading-none">{inWorkCount}</h2>
          </div>
        </div>

        {/* Card 4: На паузе */}
        <div id="card-paused-stage" className="bg-[#f3f4f6] p-5 rounded-3xl shadow-xs border border-gray-200 flex flex-col justify-between h-[120px] interactive-card">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest leading-none">На паузе</span>
            <div className="p-2 rounded-lg bg-gray-200/60 text-gray-600">
              <CalendarOff size={16} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 leading-none">{onPauseCount}</h2>
          </div>
        </div>

        {/* Card 5: Остановлен */}
        <div id="card-stopped-stage" className="bg-[#fff1f2] p-5 rounded-3xl shadow-xs border border-red-100 flex flex-col justify-between h-[120px] interactive-card">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black uppercase tracking-widest leading-none" style={{ color: STAGE_COLOR_MAP["Остановлен"] }}>Остановлен</span>
            <div className="p-2 rounded-lg bg-red-100/60" style={{ color: STAGE_COLOR_MAP["Остановлен"] }}>
              <X size={16} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 leading-none">{stoppedCount}</h2>
          </div>
        </div>

        {/* Card 6: Завершен */}
        <div id="card-completed-stage" className="bg-[#f0fdf4] p-5 rounded-3xl shadow-xs border border-emerald-100 flex flex-col justify-between h-[120px] interactive-card">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black text-emerald-700 uppercase tracking-widest leading-none">Завершен</span>
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 leading-none">{completedCount}</h2>
          </div>
        </div>

        {/* Card 7: Стадия не указана */}
        <div id="card-unspecified-stage" className="bg-slate-50 p-5 rounded-3xl shadow-xs border border-slate-200 flex flex-col justify-between h-[120px] interactive-card">
          <div className="flex justify-between items-start">
            <span className="text-xs font-black text-slate-600 uppercase tracking-widest leading-none">Стадия не указана</span>
            <div className="p-2 rounded-lg bg-slate-200/60 text-slate-600">
              <HelpCircle size={16} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 leading-none">{unspecifiedStageCount}</h2>
          </div>
        </div>

      </div>

      {/* 2) Secondary row containing "Прогресс портфеля" properties */}
      <div id="overview-metrics-grid-secondary" className="grid grid-cols-1 gap-6 pt-1 font-sans">
        
        {/* Card Right: Прогресс портфеля с исправленным текстом и масштабным дизайном */}
        <div id="card-progress-rates" className="bg-white p-8 rounded-3xl shadow-xs border border-gray-100 grid grid-cols-1 lg:grid-cols-12 gap-8 transition-all hover:shadow-sm">
          
          {/* Left Column (Management block) */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                  <Target size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none block mb-1">Реноме компании</span>
                  <h3 className="text-xl font-black text-slate-900 leading-none">Прогресс портфеля</h3>
                </div>
              </div>
              <p className="text-sm text-gray-500 font-medium mt-1 leading-relaxed">
                Сводные показатели завершенности по всем проектам компании на текущий отчетный период.
              </p>
            </div>
            
            {/* Year & Quarter Switchers */}
            <div className="flex flex-col gap-4">
              {availableYears.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Выберите год:</span>
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-fit shrink-0 flex-wrap gap-1">
                    {availableYears.map((year) => (
                      <button
                        key={year}
                        id={`btn-select-year-${year}`}
                        onClick={() => onSelectedYearChange?.(year)}
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

              <div className="flex flex-col gap-2.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Выберите отчетный период:</span>
                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-fit shrink-0">
                  {[1, 2, 3, 4].map((q) => (
                    <button
                      key={q}
                      id={`btn-select-q${q}`}
                      onClick={() => onSelectedQuarterChange?.(q)}
                      className={`px-4.5 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer interactive-button ${
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
          </div>
          
          {/* Right Column (Metrics Block) */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            
            {/* Group 1: Квартальный отчет (Операционный трек) */}
            <div key={selectedQuarter} id="progress-group-quarter" className="bg-slate-50/40 p-5 rounded-3xl border border-slate-200/50 flex flex-col gap-4 animate-quarter-transition">
              <div className="flex items-center justify-between border-b border-slate-200/40 pb-2">
                <span className="text-[10px] font-black text-slate-550 uppercase tracking-widest">Операционный трек</span>
                <span className="px-2.5 py-0.5 text-[9px] bg-indigo-50 text-indigo-700 rounded-md font-black uppercase tracking-wide">Квартал Q{selectedQuarter}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <AnimatedCircularGauge
                  label={`Вехи Q${selectedQuarter}`}
                  value={avgSelectedMilestonesProgress}
                  idSuffix="-q-milestones"
                  precision={1}
                />
                <AnimatedCircularGauge
                  label={`Показатели (Q${selectedQuarter})`}
                  value={avgSelectedKpiProgress}
                  idSuffix="-q-kpi"
                  precision={1}
                />
              </div>
            </div>

            {/* Group 2: Годовой статус (Стратегический трек) */}
            <div id="progress-group-year" className="bg-emerald-50/10 p-5 rounded-3xl border border-emerald-100/30 flex flex-col gap-4 transition-all duration-300">
               <div className="flex items-center justify-between border-b border-emerald-100/20 pb-2">
                <span className="text-[10px] font-black text-slate-550 uppercase tracking-widest">Стратегический трек</span>
                <span className="px-2.5 py-0.5 text-[9px] bg-emerald-50 text-emerald-750 rounded-md font-black uppercase tracking-wide">Год {selectedYear}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <AnimatedCircularGauge
                  label={`Вехи ${selectedYear}`}
                  value={avgYearMilestonesProgress}
                  idSuffix="-year-milestones"
                  precision={1}
                />
                <AnimatedCircularGauge
                  label="Показатели (Год)"
                  value={avgYearKpiProgress}
                  idSuffix="-year-kpi"
                  precision={1}
                />
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* 3) Graphics Layout (Pie charts block) */}
      <div id="overview-charts-grid" className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 font-sans">
        
        {/* Chart 1: Structure by Statuses */}
        <div id="pie-portfolio-structure" 
             className="bg-white p-6 rounded-3xl shadow-xs border border-gray-100 flex flex-col h-[400px]">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#011] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              Структура портфеля по статусам
              <div className="relative group inline-block normal-case tracking-normal">
                <Info size={14} className="text-slate-400 hover:text-slate-600 cursor-help transition-colors" />
                <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white text-xs font-normal rounded-xl shadow-xl z-50 border border-slate-800 pointer-events-none">
                  Отображает процентное соотношение и количество всех проектов портфеля, распределенных по четырем текущим жизненным стадиям.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                </div>
              </div>
            </span>
            <Layers size={14} className="text-gray-400" />
          </h3>
          <div className="flex-1 min-h-0 w-full relative mt-4 flex flex-col justify-between">
             <div className="h-[250px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                      <Pie
                         data={statusChartData}
                         cx="50%"
                         cy="50%"
                         innerRadius={isMobile ? 50 : 70}
                         outerRadius={isMobile ? 75 : 95}
                         paddingAngle={5}
                         dataKey="value"
                         label={({ value }) => formatPercentLabel(value, visibleStatusesCount)}
                         labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                      >
                         {statusChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                         ))}
                      </Pie>
                      <RechartsTooltip 
                         contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }} 
                         itemStyle={{ fontWeight: 'bold' }}
                      />
                   </PieChart>
                </ResponsiveContainer>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                   <p className="text-2xl font-black text-slate-800">{visibleStatusesCount}</p>
                   <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Проектов</p>
                </div>
             </div>

             {/* Custom Interactive Legend */}
             <div className="flex justify-center gap-x-5 gap-y-1.5 flex-wrap pt-2 select-none">
               {allStatuses.map((item) => {
                 const isHidden = hiddenStatuses.includes(item.name);
                 return (
                   <button
                     key={item.name}
                     onClick={() => handleToggleStatus(item.name)}
                     className={`flex items-center gap-1.5 transition-all duration-300 ease-out cursor-pointer p-1.5 px-3 rounded-xl hover:scale-102 hover:bg-slate-50 active:scale-98 select-none border ${
                       isHidden 
                         ? 'opacity-45 grayscale-[40%] text-slate-400 line-through bg-transparent border-transparent' 
                         : 'opacity-100 font-bold text-slate-700 bg-slate-50 border-slate-100/75'
                     }`}
                   >
                     <span 
                       className="w-2.5 h-2.5 rounded-full inline-block shrink-0" 
                       style={{ backgroundColor: isHidden ? '#94a3b8' : item.color }} 
                     />
                     <span className="text-[11.5px] tracking-tight">{item.name} ({item.value})</span>
                   </button>
                 );
               })}
             </div>
          </div>
        </div>

        {/* Chart 2: Project Priorities */}
        <div id="pie-project-priorities" 
             className="bg-white p-6 rounded-3xl shadow-xs border border-gray-100 flex flex-col h-[400px]">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#011] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              Приоритеты проектов
              <div className="relative group inline-block normal-case tracking-normal">
                <Info size={14} className="text-slate-400 hover:text-slate-600 cursor-help transition-colors" />
                <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white text-xs font-normal rounded-xl shadow-xl z-50 border border-slate-800 pointer-events-none">
                  Группировка проектов по уровню важности: Нулевой (наивысший стратегический приоритет), Первый (высокий операционный) и Второй (линейные улучшения).
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                </div>
              </div>
            </span>
            <Clock size={14} className="text-gray-400" />
          </h3>
          <div className="flex-1 min-h-0 w-full relative mt-4 flex flex-col justify-between">
             <div className="h-[250px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                      <Pie
                         data={priorityChartData}
                         cx="50%"
                         cy="50%"
                         innerRadius={isMobile ? 50 : 70}
                         outerRadius={isMobile ? 75 : 95}
                         paddingAngle={5}
                         dataKey="value"
                         nameKey="name"
                         label={({ value }) => formatPercentLabel(value, visiblePrioritiesCount)}
                         labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                      >
                         {priorityChartData.map((entry, index) => (
                            <Cell key={`cell-priority-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                         ))}
                      </Pie>
                      <RechartsTooltip 
                         contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }} 
                         itemStyle={{ fontWeight: 'bold' }}
                      />
                   </PieChart>
                </ResponsiveContainer>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                   <p className="text-2xl font-black text-slate-800">{visiblePrioritiesCount}</p>
                   <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Всего</p>
                </div>
             </div>

             {/* Custom Interactive Legend */}
             <div className="flex justify-center gap-x-5 gap-y-1.5 flex-wrap pt-2 select-none">
               {allPriorities.map((item) => {
                 const isHidden = hiddenPriorities.includes(item.name);
                 return (
                   <button
                     key={item.name}
                     onClick={() => handleTogglePriority(item.name)}
                     className={`flex items-center gap-1.5 transition-all duration-300 ease-out cursor-pointer p-1.5 px-3 rounded-xl hover:scale-102 hover:bg-slate-50 active:scale-98 select-none border ${
                       isHidden 
                         ? 'opacity-45 grayscale-[40%] text-slate-400 line-through bg-transparent border-transparent' 
                         : 'opacity-100 font-bold text-slate-700 bg-slate-50 border-slate-100/75'
                     }`}
                   >
                     <span 
                       className="w-2.5 h-2.5 rounded-full inline-block shrink-0" 
                       style={{ backgroundColor: isHidden ? '#94a3b8' : item.color }} 
                     />
                     <span className="text-[11.5px] tracking-tight">{item.name} ({item.value})</span>
                   </button>
                 );
               })}
             </div>
          </div>
        </div>

      </div>

      {/* 4) Departmental Analytics Section (3 vertical BarCharts based on requirements) */}
      <div id="departmental-analytics-section" className="space-y-6 pt-4 border-t border-gray-100 font-sans">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight leading-none mb-1.5 uppercase">Аналитика по департаментам</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Группировка и сравнение показателей в разрезе отделов</p>
        </div>

        <div id="dept-barcharts-grid" className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* BarChart 1: Приоритеты проектов по подразделениям */}
          <div id="dept-priority-chart-card" 
               onClick={() => setActiveZoomChart('deptPriority')}
               className="bg-white p-5 rounded-3xl shadow-xs border border-gray-100 flex flex-col h-[520px] cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                Приоритеты по отделам
                <div className="relative group inline-block normal-case tracking-normal">
                  <Info size={14} className="text-slate-400 hover:text-slate-600 cursor-help transition-colors" />
                  <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white text-xs font-normal rounded-xl shadow-xl z-50 border border-slate-800 pointer-events-none">
                    Показывает распределение проектов по приоритетам внутри каждого департамента. Если проект указан в нескольких департаментах через ;, он учитывается в каждом из них. Поэтому сумма значений по департаментам может быть больше общего количества проектов.
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                  </div>
                </div>
              </span>
              <Clock size={14} className="text-slate-400" />
            </h4>
            <div className="flex-1 min-h-0 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataList} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis 
                    dataKey="shortName" 
                    tick={{ fill: '#6b7280', fontSize: 9, fontWeight: 600 }} 
                    axisLine={{ stroke: '#e5e7eb' }} 
                    tickLine={false} 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                  />
                  <YAxis 
                    allowDecimals={false} 
                    tick={{ fill: '#6b7280', fontSize: 9, fontWeight: 600 }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <RechartsTooltip content={<CustomPrioTooltip />} cursor={{ fill: '#f9fafb' }} />
                  <Legend 
                    verticalAlign="top"
                    iconType="circle" 
                    iconSize={8}
                    wrapperStyle={{ paddingBottom: '20px' }}
                    formatter={(value) => <span className="text-[10px] text-slate-600 font-bold">{value}</span>}
                  />
                  <Bar dataKey="p0" name="Нулевой приоритет (0)" fill="#111827" stackId="priority-stack" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="p1" name="Первый приоритет (1)" fill="#fbbf24" stackId="priority-stack" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="p2" name="Второй приоритет (2)" fill="#cbd5e1" stackId="priority-stack" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* BarChart 2: Стадии проектов по подразделениям */}
          <div id="dept-stage-chart-card" 
               onClick={() => setActiveZoomChart('deptStage')}
               className="bg-white p-5 rounded-3xl shadow-xs border border-gray-100 flex flex-col h-[520px] cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                Стадии проектов по отделам
                <div className="relative group inline-block normal-case tracking-normal">
                  <Info size={14} className="text-slate-400 hover:text-slate-600 cursor-help transition-colors" />
                  <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white text-xs font-normal rounded-xl shadow-xl z-50 border border-slate-800 pointer-events-none">
                    Показывает распределение проектов по стадиям внутри каждого департамента. Если проект указан в нескольких департаментах через ;, он учитывается в каждом из них. Поэтому сумма значений по департаментам может быть больше общего количества проектов.
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                  </div>
                </div>
              </span>
              <Layers size={14} className="text-slate-400" />
            </h4>
            <div className="flex-1 min-h-0 w-full mt-4">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartDataList} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                   <XAxis 
                     dataKey="shortName" 
                     tick={{ fill: '#6b7280', fontSize: 9, fontWeight: 600 }} 
                     axisLine={{ stroke: '#e5e7eb' }} 
                     tickLine={false} 
                     angle={-45}
                     textAnchor="end"
                     height={100}
                     interval={0}
                   />
                   <YAxis 
                     allowDecimals={false} 
                     tick={{ fill: '#6b7280', fontSize: 9, fontWeight: 600 }} 
                     axisLine={false} 
                     tickLine={false} 
                   />
                   <RechartsTooltip content={<CustomStageTooltip />} cursor={{ fill: '#f9fafb' }} />
                   <Legend 
                      verticalAlign="top"
                      iconType="circle" 
                      iconSize={8}
                      wrapperStyle={{ paddingBottom: '20px' }}
                      formatter={(value) => <span className="text-[10px] text-slate-600 font-bold">{value}</span>}
                   />
                   <Bar dataKey="stagePlanned" name="Планируется" fill={STAGE_COLOR_MAP['Планируется']} stackId="stage-stack" />
                   <Bar dataKey="stageInWork" name="В работе" fill={STAGE_COLOR_MAP['В работе']} stackId="stage-stack" />
                   <Bar dataKey="stageOnPause" name="На паузе" fill={STAGE_COLOR_MAP['На паузе']} stackId="stage-stack" />
                   <Bar dataKey="stageStopped" name="Остановлен" fill={STAGE_COLOR_MAP['Остановлен']} stackId="stage-stack" />
                   <Bar dataKey="stageCompleted" name="Завершен" fill={STAGE_COLOR_MAP['Завершен']} stackId="stage-stack" />
                   <Bar dataKey="stageUnspecified" name={UNSPECIFIED_PROJECT_STAGE} fill={STAGE_COLOR_MAP[UNSPECIFIED_PROJECT_STAGE]} stackId="stage-stack" radius={[4, 4, 0, 0]} />
                 </BarChart>
               </ResponsiveContainer>
             </div>
          </div>

          {/* BarChart 3: Своевременность мониторинга по департаментам */}
          <div id="dept-timeliness-chart-card" 
               onClick={() => setActiveZoomChart('deptTimeliness')}
               className="bg-white p-5 rounded-3xl shadow-xs border border-gray-100 flex flex-col h-[520px] cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                Своевременность мониторинга
                <div className="relative group inline-block normal-case tracking-normal">
                  <Info size={14} className="text-slate-400 hover:text-slate-600 cursor-help transition-colors" />
                  <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white text-xs font-normal rounded-xl shadow-xl z-50 border border-slate-800 pointer-events-none">
                    В блок входят все проекты со стадией «В работе». Проект считается своевременным, если дата начала проекта ещё не наступила, дата завершения уже прошла (при стадии не «Завершен»), либо дата начала мониторинга ещё не наступила. Иначе своевременность считается по дате последнего ПК и периодичности. Если данных для следующей даты мониторинга недостаточно — категория «Недостаточно данных».
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                  </div>
                </div>
              </span>
              <CheckCircle2 size={14} className="text-slate-400" />
            </h4>
            <div className="flex-1 min-h-0 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataList} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis 
                    dataKey="shortName" 
                    tick={{ fill: '#6b7280', fontSize: 9, fontWeight: 600 }} 
                    axisLine={{ stroke: '#e5e7eb' }} 
                    tickLine={false} 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                  />
                  <YAxis 
                    allowDecimals={false} 
                    tick={{ fill: '#6b7280', fontSize: 9, fontWeight: 600 }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <RechartsTooltip content={<CustomMonitorTooltip />} cursor={{ fill: '#f9fafb' }} />
                  <Legend 
                    verticalAlign="top"
                    iconType="circle" 
                    iconSize={8}
                    wrapperStyle={{ paddingBottom: '20px' }}
                    formatter={(value) => <span className="text-[10px] text-slate-600 font-bold">{value}</span>}
                  />
                  <Bar dataKey="timely" name="Своевременно" fill="#10b981" stackId="timeliness-stack" />
                  <Bar dataKey="overdue" name="Просрочен" fill="#f43f5e" stackId="timeliness-stack" />
                  <Bar dataKey="insufficient" name="Недостаточно данных" fill="#9ca3af" stackId="timeliness-stack" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>

      {/* 5) Progress Analytics Section (2 Horizontal BarCharts side-by-side using Tailwind grid grid-cols-1 lg:grid-cols-2 gap-6) */}
      <div id="progress-analytics-section" className="space-y-6 pt-6 border-t border-gray-100 font-sans">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight leading-none mb-1.5 uppercase">Выполнение по департаментам</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Средний прогресс по вехам и ключевым числовым показателям</p>
        </div>

        <div id="progress-barcharts-grid" className="grid grid-cols-1 gap-6">

          {/* BarChart 4: Выполнение по департаментам (среднее по департаменту) */}
          <div id="dept-unified-progress-card" 
               className="bg-white p-5 rounded-3xl shadow-xs border border-gray-100 flex flex-col min-h-[580px] transition-all">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center justify-between mb-4">
              <span className="flex items-center gap-1.5">
                Выполнение по департаментам
                <div className="relative group inline-block normal-case tracking-normal">
                  <Info size={14} className="text-slate-400 hover:text-slate-600 cursor-help transition-colors" />
                  <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white text-xs font-normal rounded-xl shadow-xl z-50 border border-slate-800 pointer-events-none font-sans">
                    Показывает среднее актуальное выполнение вех и показателей по проектам департамента на выбранную дату оценки. Учитываются только применимые прошедшие и текущие кварталы проекта с учетом дат начала и завершения.
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                  </div>
                </div>
              </span>
              <div className="flex items-center gap-1.5 font-sans">
                <ListChecks size={14} className="text-indigo-500" />
                <Award size={14} className="text-cyan-500" />
              </div>
            </h4>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
              {/* Group 1 */}
              <div 
                onClick={() => setActiveZoomChart('deptProgress1')}
                className="flex flex-col h-full min-h-0 border-r border-gray-50 pr-4 lg:border-r lg:pr-4 cursor-pointer hover:bg-slate-50/40 p-2 rounded-2xl transition-all"
                title="Нажмите на график, чтобы увеличить"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase font-black tracking-wider text-slate-400">Группа 1 ({firstHalfUnified.length} подр.)</div>
                </div>

                {/* Control Panel 1 */}
                <div 
                  onClick={(e) => e.stopPropagation()} 
                  className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-slate-50/70 p-2 rounded-xl border border-slate-100/80"
                >
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] uppercase font-black tracking-wide text-slate-400 mr-1 select-none">Показать:</span>
                    <button
                      onClick={() => handleToggleChart1Milestones()}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold transition-all ${
                        chart1ShowMilestones 
                          ? 'bg-[#4f46e5] text-white shadow-xs' 
                          : 'bg-white text-slate-400 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      Вехи
                    </button>
                    <button
                      onClick={() => handleToggleChart1Kpis()}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold transition-all ${
                        chart1ShowKpis 
                          ? 'bg-[#0891b2] text-white shadow-xs' 
                          : 'bg-white text-slate-400 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      Показатели
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[9px] uppercase font-black tracking-wide text-slate-400 select-none">Сорт:</span>
                    <select
                      value={chart1Sort}
                      onChange={(e) => setChart1Sort(e.target.value)}
                      className="bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-600 py-0.5 px-1 focus:outline-hidden cursor-pointer"
                    >
                      <option value="none">Без сортировки</option>
                      <option value="milestones-desc">Вехи ↓</option>
                      <option value="milestones-asc">Вехи ↑</option>
                      <option value="kpis-desc">Показатели ↓</option>
                      <option value="kpis-asc">Показатели ↑</option>
                    </select>
                  </div>
                </div>

                <div className="flex-1 min-h-0 w-full animate-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={sortedFirstHalf} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                      <XAxis 
                        type="number"
                        domain={[0, 100]} 
                        tickFormatter={(val) => `${val}%`}
                        tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }} 
                        axisLine={{ stroke: '#e5e7eb' }} 
                        tickLine={false} 
                      />
                      <YAxis 
                        type="category"
                        dataKey="shortName" 
                        tick={{ fill: '#374151', fontSize: 9, fontWeight: 700 }} 
                        axisLine={false} 
                        tickLine={false} 
                        width={100}
                      />
                      <RechartsTooltip content={<CustomProgressTooltip />} cursor={{ fill: '#f9fafb' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      {chart1ShowMilestones && <Bar dataKey="avgTasksProgress" name="Вехи" fill="#4f46e5" radius={[0, 4, 4, 0]} />}
                      {chart1ShowKpis && <Bar dataKey="avgKpiProgress" name="Показатели" fill="#0891b2" radius={[0, 4, 4, 0]} />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Group 2 */}
              <div 
                onClick={() => setActiveZoomChart('deptProgress2')}
                className="flex flex-col h-full min-h-0 pl-0 lg:pl-4 cursor-pointer hover:bg-slate-50/40 p-2 rounded-2xl transition-all"
                title="Нажмите на график, чтобы увеличить"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase font-black tracking-wider text-slate-400">Группа 2 ({secondHalfUnified.length} подр.)</div>
                </div>

                {/* Control Panel 2 */}
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-slate-50/70 p-2 rounded-xl border border-slate-100/80"
                >
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] uppercase font-black tracking-wide text-slate-400 mr-1 select-none">Показать:</span>
                    <button
                      onClick={() => handleToggleChart2Milestones()}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold transition-all ${
                        chart2ShowMilestones 
                          ? 'bg-[#4f46e5] text-white shadow-xs' 
                          : 'bg-white text-slate-400 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      Вехи
                    </button>
                    <button
                      onClick={() => handleToggleChart2Kpis()}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold transition-all ${
                        chart2ShowKpis 
                          ? 'bg-[#0891b2] text-white shadow-xs' 
                          : 'bg-white text-slate-400 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      Показатели
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[9px] uppercase font-black tracking-wide text-slate-400 select-none">Сорт:</span>
                    <select
                      value={chart2Sort}
                      onChange={(e) => setChart2Sort(e.target.value)}
                      className="bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-600 py-0.5 px-1 focus:outline-hidden cursor-pointer"
                    >
                      <option value="none">Без сортировки</option>
                      <option value="milestones-desc">Вехи ↓</option>
                      <option value="milestones-asc">Вехи ↑</option>
                      <option value="kpis-desc">Показатели ↓</option>
                      <option value="kpis-asc">Показатели ↑</option>
                    </select>
                  </div>
                </div>

                <div className="flex-1 min-h-0 w-full animate-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={sortedSecondHalf} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                      <XAxis 
                        type="number"
                        domain={[0, 100]} 
                        tickFormatter={(val) => `${val}%`}
                        tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }} 
                        axisLine={{ stroke: '#e5e7eb' }} 
                        tickLine={false} 
                      />
                      <YAxis 
                        type="category"
                        dataKey="shortName" 
                        tick={{ fill: '#374151', fontSize: 9, fontWeight: 700 }} 
                        axisLine={false} 
                        tickLine={false} 
                        width={100}
                      />
                      <RechartsTooltip content={<CustomProgressTooltip />} cursor={{ fill: '#f9fafb' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      {chart2ShowMilestones && <Bar dataKey="avgTasksProgress" name="Вехи" fill="#4f46e5" radius={[0, 4, 4, 0]} />}
                      {chart2ShowKpis && <Bar dataKey="avgKpiProgress" name="Показатели" fill="#0891b2" radius={[0, 4, 4, 0]} />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 6) Fullscreen Chart Zoom Modal Overlay */}
      {activeZoomChart && activeZoomChart !== 'status' && activeZoomChart !== 'priority' && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 sm:p-6 animate-modal-overlay-fade"
          onClick={() => setActiveZoomChart(null)}
        >
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-[1000px] max-h-[92vh] overflow-y-auto p-6 sm:p-8 relative flex flex-col font-sans animate-modal-content-zoom"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button 
              onClick={() => setActiveZoomChart(null)}
              className="absolute top-4 right-4 p-2.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors border border-gray-100 interactive-button"
              aria-label="Закрыть"
            >
              <X size={20} />
            </button>

            {/* Content Switch */}
            {activeZoomChart === 'deptPriority' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-[#4f46e5] bg-indigo-50 px-2.5 py-1 rounded-full">Увеличенный масштаб</span>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mt-2 mb-1">
                    <Clock size={20} className="text-[#4f46e5]" />
                    Приоритеты проектов по отделам
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Показывает распределение проектов по приоритетам внутри каждого департамента. Если проект указан в нескольких департаментах через ;, он учитывается в каждом из них. Поэтому сумма значений по департаментам может быть больше общего количества проектов.
                  </p>
                </div>
                <div className="flex-1 w-full overflow-x-auto mt-2">
                  <div className="w-[900px] h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartDataList} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={true} horizontal={true} />
                        <XAxis 
                          dataKey="department" 
                          tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                          angle={-45}
                          textAnchor="end"
                          height={120}
                          interval={0}
                        />
                        <YAxis 
                          allowDecimals={false} 
                          tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                        />
                        <RechartsTooltip content={<CustomPrioTooltip />} cursor={{ fill: '#f1f5f9' }} />
                        <Legend 
                          verticalAlign="top"
                          iconType="circle" 
                          iconSize={10}
                          wrapperStyle={{ paddingBottom: '20px' }}
                          formatter={(value) => <span className="text-xs text-slate-800 font-extrabold">{value}</span>}
                        />
                        <Bar dataKey="p0" name="Нулевой приоритет (0)" fill="#111827" stackId="priority-stack" />
                        <Bar dataKey="p1" name="Первый приоритет (1)" fill="#fbbf24" stackId="priority-stack" />
                        <Bar dataKey="p2" name="Второй приоритет (2)" fill="#cbd5e1" stackId="priority-stack" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeZoomChart === 'deptStage' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-[#4f46e5] bg-indigo-50 px-2.5 py-1 rounded-full">Увеличенный масштаб</span>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mt-2 mb-1">
                    <Layers size={20} className="text-[#4f46e5]" />
                    Стадии проектов по департаментам
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Показывает распределение проектов по стадиям внутри каждого департамента. Если проект указан в нескольких департаментах через ;, он учитывается в каждом из них. Поэтому сумма значений по департаментам может быть больше общего количества проектов.
                  </p>
                </div>
                <div className="flex-1 w-full overflow-x-auto mt-2">
                  <div className="w-[900px] h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartDataList} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={true} horizontal={true} />
                        <XAxis 
                          dataKey="department" 
                          tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                          angle={-45}
                          textAnchor="end"
                          height={120}
                          interval={0}
                        />
                        <YAxis 
                          allowDecimals={false} 
                          tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                        />
                        <RechartsTooltip content={<CustomStageTooltip />} cursor={{ fill: '#f1f5f9' }} />
                        <Legend 
                          verticalAlign="top"
                          iconType="circle" 
                          iconSize={10}
                          wrapperStyle={{ paddingBottom: '20px' }}
                          formatter={(value) => <span className="text-xs text-slate-800 font-extrabold">{value}</span>}
                        />
                        <Bar dataKey="stagePlanned" name="Планируется" fill={STAGE_COLOR_MAP['Планируется']} stackId="stage-stack" />
                        <Bar dataKey="stageInWork" name="В работе" fill={STAGE_COLOR_MAP['В работе']} stackId="stage-stack" />
                        <Bar dataKey="stageOnPause" name="На паузе" fill={STAGE_COLOR_MAP['На паузе']} stackId="stage-stack" />
                        <Bar dataKey="stageStopped" name="Остановлен" fill={STAGE_COLOR_MAP['Остановлен']} stackId="stage-stack" />
                        <Bar dataKey="stageCompleted" name="Завершен" fill={STAGE_COLOR_MAP['Завершен']} stackId="stage-stack" />
                        <Bar dataKey="stageUnspecified" name={UNSPECIFIED_PROJECT_STAGE} fill={STAGE_COLOR_MAP[UNSPECIFIED_PROJECT_STAGE]} stackId="stage-stack" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeZoomChart === 'deptTimeliness' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-[#4f46e5] bg-indigo-50 px-2.5 py-1 rounded-full">Увеличенный масштаб</span>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mt-2 mb-1">
                    <CheckCircle2 size={20} className="text-[#10b981]" />
                    Своевременность мониторинга по департаментам
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    В блок входят все проекты со стадией «В работе». Проект считается своевременным, если дата начала проекта ещё не наступила, дата завершения уже прошла (при стадии не «Завершен»), либо дата начала мониторинга ещё не наступила. Иначе своевременность считается по дате последнего ПК и периодичности. Если данных для следующей даты мониторинга недостаточно — категория «Недостаточно данных».
                  </p>
                </div>
                <div className="flex-1 w-full overflow-x-auto mt-2">
                  <div className="w-[900px] h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartDataList} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={true} horizontal={true} />
                        <XAxis 
                          dataKey="department" 
                          tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                          angle={-45}
                          textAnchor="end"
                          height={120}
                          interval={0}
                        />
                        <YAxis 
                          allowDecimals={false} 
                          tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                        />
                        <RechartsTooltip content={<CustomMonitorTooltip />} cursor={{ fill: '#f1f5f9' }} />
                        <Legend 
                          verticalAlign="top"
                          iconType="circle" 
                          iconSize={10}
                          wrapperStyle={{ paddingBottom: '20px' }}
                          formatter={(value) => <span className="text-xs text-slate-800 font-extrabold">{value}</span>}
                        />
                        <Bar dataKey="timely" name="Своевременно" fill="#10b981" stackId="timeliness-stack" />
                        <Bar dataKey="overdue" name="Просрочен" fill="#f43f5e" stackId="timeliness-stack" />
                        <Bar dataKey="insufficient" name="Недостаточно данных" fill="#9ca3af" stackId="timeliness-stack" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeZoomChart === 'deptProgress1' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-[#4f46e5] bg-indigo-50 px-2.5 py-1 rounded-full">Увеличенный масштаб</span>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mt-2 mb-1">
                    <ListChecks size={20} className="text-[#4f46e5]" />
                    Выполнение по департаментам (Группа 1)
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Показывает среднее актуальное выполнение вех и показателей по проектам департаментов Группы 1 на выбранную дату оценки. Учитываются только применимые прошедшие и текущие кварталы проекта с учетом дат начала и завершения.
                  </p>
                </div>

                {/* Controls in Zoom Modal */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400 mr-2">Показать:</span>
                    <button
                      onClick={() => handleToggleChart1Milestones()}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        chart1ShowMilestones 
                          ? 'bg-[#4f46e5] text-white shadow-xs' 
                          : 'bg-white text-slate-500 hover:bg-slate-100/70 border border-slate-200'
                      }`}
                    >
                      Вехи
                    </button>
                    <button
                      onClick={() => handleToggleChart1Kpis()}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        chart1ShowKpis 
                          ? 'bg-[#0891b2] text-white shadow-xs' 
                          : 'bg-white text-slate-500 hover:bg-slate-100/70 border border-slate-200'
                      }`}
                    >
                      Показатели
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">Сортировка:</span>
                    <select
                      value={chart1Sort}
                      onChange={(e) => setChart1Sort(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 py-1.5 px-3 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer animate-none"
                    >
                      <option value="none">Без сортировки</option>
                      <option value="milestones-desc">Вехи по убыванию</option>
                      <option value="milestones-asc">Вехи по возрастанию</option>
                      <option value="kpis-desc">Показатели по убыванию</option>
                      <option value="kpis-asc">Показатели по возрастанию</option>
                    </select>
                  </div>
                </div>

                <div className="flex-1 w-full overflow-x-auto mt-2 animate-none">
                  <div className="w-[900px] h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={sortedFirstHalf} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={true} horizontal={true} />
                        <XAxis 
                          type="number"
                          domain={[0, 100]} 
                          tickFormatter={(val) => `${val}%`}
                          tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                        />
                        <YAxis 
                          type="category"
                          dataKey="department" 
                          tick={{ fill: '#1e293b', fontSize: 10, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                          width={230}
                        />
                        <RechartsTooltip content={<CustomProgressTooltip />} cursor={{ fill: '#f1f5f9' }} />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        {chart1ShowMilestones && <Bar dataKey="avgTasksProgress" name="Вехи" fill="#4f46e5" radius={[0, 6, 6, 0]} />}
                        {chart1ShowKpis && <Bar dataKey="avgKpiProgress" name="Показатели" fill="#0891b2" radius={[0, 6, 6, 0]} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeZoomChart === 'deptProgress2' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-black tracking-widest text-[#4f46e5] bg-indigo-50 px-2.5 py-1 rounded-full">Увеличенный масштаб</span>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mt-2 mb-1">
                    <ListChecks size={20} className="text-[#4f46e5]" />
                    Выполнение по департаментам (Группа 2)
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Показывает среднее актуальное выполнение вех и показателей по проектам департаментов Группы 2 на выбранную дату оценки. Учитываются только применимые прошедшие и текущие кварталы проекта с учетом дат начала и завершения.
                  </p>
                </div>

                {/* Controls in Zoom Modal */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400 mr-2">Показать:</span>
                    <button
                      onClick={() => handleToggleChart2Milestones()}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        chart2ShowMilestones 
                          ? 'bg-[#4f46e5] text-white shadow-xs' 
                          : 'bg-white text-slate-500 hover:bg-slate-100/70 border border-slate-200'
                      }`}
                    >
                      Вехи
                    </button>
                    <button
                      onClick={() => handleToggleChart2Kpis()}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        chart2ShowKpis 
                          ? 'bg-[#0891b2] text-white shadow-xs' 
                          : 'bg-white text-slate-500 hover:bg-slate-100/70 border border-slate-200'
                      }`}
                    >
                      Показатели
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">Сортировка:</span>
                    <select
                      value={chart2Sort}
                      onChange={(e) => setChart2Sort(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 py-1.5 px-3 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer animate-none"
                    >
                      <option value="none">Без сортировки</option>
                      <option value="milestones-desc">Вехи по убыванию</option>
                      <option value="milestones-asc">Вехи по возрастанию</option>
                      <option value="kpis-desc">Показатели по убыванию</option>
                      <option value="kpis-asc">Показатели по возрастанию</option>
                    </select>
                  </div>
                </div>

                <div className="flex-1 w-full overflow-x-auto mt-2 animate-none">
                  <div className="w-[900px] h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={sortedSecondHalf} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={true} horizontal={true} />
                        <XAxis 
                          type="number"
                          domain={[0, 100]} 
                          tickFormatter={(val) => `${val}%`}
                          tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                        />
                        <YAxis 
                          type="category"
                          dataKey="department" 
                          tick={{ fill: '#1e293b', fontSize: 10, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                          tickLine={true} 
                          width={230}
                        />
                        <RechartsTooltip content={<CustomProgressTooltip />} cursor={{ fill: '#f1f5f9' }} />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        {chart2ShowMilestones && <Bar dataKey="avgTasksProgress" name="Вехи" fill="#4f46e5" radius={[0, 6, 6, 0]} />}
                        {chart2ShowKpis && <Bar dataKey="avgKpiProgress" name="Показатели" fill="#0891b2" radius={[0, 6, 6, 0]} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-6 pt-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400 font-semibold">
              <span>* Отображаются полные наименования департаментов</span>
              <span>Клавиша Esc или клик вне области закрывают окно</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
