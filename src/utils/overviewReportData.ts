import { Project, ProjectEvaluation } from '../types';
import { normalizeProjectStage } from './projectStageStyles';
import { getProjectMonitoringStatus } from './projectRegistryStatus';
import { getEvaluationByProjectId } from './evaluationUtils';
import {
  calculateMilestonesProgressForProjectDepts,
  calculateKpiProgressForProjectDepts
} from './projectCalculations';
import { parseDateSafe } from './dateUtils';
import { isProjectInYear, getYearsForProject } from './overviewYearFiltering';
import { resolveYearWithinAvailableYears, resolveEffectiveAssessmentDateForSelectedYear } from './periodApplicability';
import { computePortfolioProgressAggregates } from './overviewPortfolioAggregates';
import { getMilestoneYearCompletionMetricsFromEvaluation } from './evaluationMilestoneMetrics';
import { getIndicatorYearCompletionMetricsFromEvaluation } from './evaluationIndicatorMetrics';
import { shouldExcludeProjectFromOverviewDepartmentCharts } from './overviewDepartmentFilters';

export function buildOverviewPdfReportData(options: {
  projects: Project[];
  projectEvaluations?: ProjectEvaluation[] | null;
  assessmentDate: string;
  selectedYear?: number;
  selectedQuarter?: number;
}) {
  const { projects, projectEvaluations, assessmentDate } = options;

  // 1. Calculate available years and determine selectedYear
  const availableYears = (() => {
    const yearsSet = new Set<number>();
    projects.forEach(p => {
      const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
      getYearsForProject(p, ev).forEach(y => yearsSet.add(y));
    });
    return Array.from(yearsSet).sort();
  })();

  const defaultYear = resolveYearWithinAvailableYears(availableYears, assessmentDate);

  const selectedYear = options.selectedYear ?? defaultYear;

  // 2. Determine selectedQuarter
  const defaultQuarter = (() => {
    const parsed = assessmentDate ? parseDateSafe(assessmentDate) : null;
    if (parsed) {
      const month = parsed.getMonth(); // 0-indexed
      if (month < 3) return 1;
      if (month < 6) return 2;
      if (month < 9) return 3;
      return 4;
    }
    return 2;
  })();

  const selectedQuarter = options.selectedQuarter ?? defaultQuarter;

  // 3. Assessment date for period applicability relative to selected year
  const effectiveAssessmentDate = resolveEffectiveAssessmentDateForSelectedYear(
    selectedYear,
    assessmentDate
  );

  const parsedEffectiveAssessmentDate = parseDateSafe(effectiveAssessmentDate) || new Date();

  // 4. Filter projects for the selected year
  const projectsInSelectedYear = projects.filter(p => {
    const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
    return isProjectInYear(p, ev, selectedYear);
  });

  // 5. Calculate Stage levels
  let plannedCount = 0;
  let inWorkCount = 0;
  let onPauseCount = 0;
  let stoppedCount = 0;
  let completedCount = 0;
  let unspecifiedCount = 0;

  projectsInSelectedYear.forEach((p) => {
    const norm = normalizeProjectStage(p.stage, p.status);
    if (norm === "Планируется") plannedCount++;
    else if (norm === "В работе") inWorkCount++;
    else if (norm === "На паузе") onPauseCount++;
    else if (norm === "Остановлен") stoppedCount++;
    else if (norm === "Завершен") completedCount++;
    else unspecifiedCount++;
  });

  const stageCounts = {
    planned: plannedCount,
    inWork: inWorkCount,
    onPause: onPauseCount,
    stopped: stoppedCount,
    completed: completedCount,
    unspecified: unspecifiedCount,
    total: projectsInSelectedYear.length
  };

  // 6. Calculate project Priorities distribution
  let p0count = 0;
  let p1count = 0;
  let p2count = 0;

  projectsInSelectedYear.forEach((p) => {
    const rawPriority = p.priority;
    if (rawPriority === 0 || String(rawPriority) === "0") p0count++;
    else if (rawPriority === 1 || String(rawPriority) === "1") p1count++;
    else p2count++;
  });

  const priorityCounts = {
    p0: p0count,
    p1: p1count,
    p2: p2count
  };

  // 7. Portfolio Progress averages — same helper as Overview UI
  const portfolioProgress = computePortfolioProgressAggregates({
    projectsInSelectedYear,
    projectEvaluations,
    selectedYear,
    selectedQuarter,
    assessmentDate: parsedEffectiveAssessmentDate
  });

  // 8. Calculate Department Analytics
  const deptDataMap: Record<string, {
    department: string;
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
        deptDataMap[deptKey] = {
          department: deptKey,
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
          kpiProgressCount: 0
        };
      }

      const item = deptDataMap[deptKey];

      // Priorities count
      const rawPriority = p.priority;
      if (rawPriority === 0 || String(rawPriority) === "0") {
        item.p0++;
      } else if (rawPriority === 1 || String(rawPriority) === "1") {
        item.p1++;
      } else {
        item.p2++;
      }

      // Stage counts
      const norm = normalizeProjectStage(p.stage, p.status);
      if (norm === "Планируется") item.stagePlanned++;
      else if (norm === "В работе") item.stageInWork++;
      else if (norm === "На паузе") item.stageOnPause++;
      else if (norm === "Остановлен") item.stageStopped++;
      else if (norm === "Завершен") item.stageCompleted++;
      else item.stageUnspecified++;

      // Timeliness counts (same semantics as Overview: В работе only via getProjectMonitoringStatus)
      const evaluation = getEvaluationByProjectId(projectEvaluations, p.projectId);
      const monStatus = getProjectMonitoringStatus(p, effectiveAssessmentDate);
      if (monStatus === "Своевременно") {
        item.timely++;
      } else if (monStatus === "Просрочен") {
        item.overdue++;
      } else if (monStatus === "Недостаточно данных") {
        item.insufficient++;
      }

      // Tasks Progress Accumulation
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

      // Показатели Progress Accumulation
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
          item.kpiProgressCount++;
        }
      } else {
        const indicatorVal = calculateKpiProgressForProjectDepts(p, selectedYear, parsedEffectiveAssessmentDate);
        if (indicatorVal !== null) {
          item.kpiProgressSum += indicatorVal.raw;
          item.kpiProgressCount++;
        }
      }
    });
  });

  const departmentAnalytics = Object.values(deptDataMap).map(item => ({
    ...item,
    avgTasksProgress: item.tasksProgressCount > 0 ? Number((item.tasksProgressSum / item.tasksProgressCount).toFixed(1)) : null,
    avgKpiProgress: item.kpiProgressCount > 0 ? Number((item.kpiProgressSum / item.kpiProgressCount).toFixed(1)) : null
  }));

  return {
    selectedYear,
    selectedQuarter,
    effectiveAssessmentDate,
    projectsInSelectedYear,
    stageCounts,
    priorityCounts,
    portfolioProgress,
    departmentAnalytics
  };
}
