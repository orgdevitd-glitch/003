import { Project, ProjectEvaluation } from '../types';
import { parseDateSafe } from './dateUtils';
import { getYearsForProject, parseYearFromStr } from './overviewYearFiltering';
import { parseRussianDate } from './projectCalculations';
import { normalizeProjectStage } from './projectStageStyles';

export interface CalendarIntervalStatus {
  isValid: boolean;
  error?: 'no_dates' | 'no_start_date' | 'no_end_date' | 'date_error';
  errorText?: string;
}

/**
 * Checks if a project has a valid calendar interval.
 */
export function getProjectCalendarIntervalStatus(p: Project): CalendarIntervalStatus {
  let pStart = parseRussianDate(p.startDate) || parseDateSafe(p.startDate);
  let pEnd = parseRussianDate(p.deadlineAt || p.endDate) || parseDateSafe(p.deadlineAt || p.endDate);

  if (pStart && Number.isNaN(pStart.getTime())) pStart = null;
  if (pEnd && Number.isNaN(pEnd.getTime())) pEnd = null;

  if (!pStart && !pEnd) {
    return { isValid: false, error: 'no_dates', errorText: 'Нет дат' };
  }
  if (pStart && !pEnd) {
    return { isValid: false, error: 'no_end_date', errorText: 'Нет даты завершения' };
  }
  if (!pStart && pEnd) {
    return { isValid: false, error: 'no_start_date', errorText: 'Нет даты начала' };
  }
  if (pStart && pEnd && pStart > pEnd) {
    return { isValid: false, error: 'date_error', errorText: 'Ошибка дат' };
  }

  return { isValid: true };
}

/**
 * Filters projects based on hidden stages.
 */
export function filterRoadmapProjectsByHiddenStages(
  projects: Project[],
  hiddenStages: Set<string>
): Project[] {
  return projects.filter(project => {
    const stage = normalizeProjectStage(project.stage, project.status);
    return !hiddenStages.has(stage);
  });
}

/**
 * Calculates visual start and end dates for a project within a specific selected year.
 * Crops the period to the boundaries of the selected year if the project spans beyond it.
 */
export function getVisualProjectBounds(
  p: Project,
  selectedYear: number,
  assessmentDateStr?: string
): { visualStart: Date; visualEnd: Date } {
  const startOfYear = new Date(selectedYear, 0, 1);
  const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59);

  let pStart = parseRussianDate(p.startDate) || parseDateSafe(p.startDate);
  let pEnd = parseRussianDate(p.deadlineAt || p.endDate) || parseDateSafe(p.deadlineAt || p.endDate);

  if (pStart && Number.isNaN(pStart.getTime())) pStart = null;
  if (pEnd && Number.isNaN(pEnd.getTime())) pEnd = null;

  // Let's resolve the actual start and end dates for the project
  let actualStart = pStart || startOfYear;
  let actualEnd = pEnd || endOfYear;

  // Crop to selectedYear
  const visualStart = actualStart < startOfYear ? startOfYear : actualStart;
  const visualEnd = actualEnd > endOfYear ? endOfYear : actualEnd;

  return {
    visualStart: visualStart > visualEnd ? startOfYear : visualStart,
    visualEnd: visualStart > visualEnd ? endOfYear : visualEnd,
  };
}

/**
 * Checks if a project belongs to a selected year for the Roadmap tab.
 */
export function isProjectInRoadmapYear(
  p: Project,
  ev: ProjectEvaluation | null,
  year: number
): boolean {
  let pStart = parseRussianDate(p.startDate) || parseDateSafe(p.startDate);
  let pEnd = parseRussianDate(p.deadlineAt || p.endDate) || parseDateSafe(p.deadlineAt || p.endDate);

  if (pStart && Number.isNaN(pStart.getTime())) pStart = null;
  if (pEnd && Number.isNaN(pEnd.getTime())) pEnd = null;

  // Check for explicit yearly data/evaluation
  const hasEvaluationData = !!(ev && (
    ev.milestones?.milestoneResults?.some(m => m.year === year) ||
    ev.indicators?.indicatorResults?.some(i => i.year === year)
  ));

  const hasRawByYearData = !!(p._rawByYear?.[year] && (
    Object.values(p._rawByYear[year].milestones || {}).some(v => v !== null && v !== "" && String(v).toLowerCase().trim() !== "nan") ||
    Object.values(p._rawByYear[year].indicators || {}).some(v => v !== null && v !== "" && String(v).toLowerCase().trim() !== "nan")
  ));

  const hasExplicitProjectData = !!(
    (p.milestones && p.milestones.some(m => {
      const mYear = parseYearFromStr(m.taskId) || parseYearFromStr(m.quarter);
      return mYear === year;
    })) ||
    (p.indicators && p.indicators.some(ind => {
      const indYear = parseYearFromStr(ind.indicatorId) || parseYearFromStr(ind.period);
      return indYear === year;
    }))
  );

  if (hasEvaluationData || hasRawByYearData || hasExplicitProjectData) {
    return true;
  }

  // If both exist but startDate > endDate (error case)
  if (pStart && pEnd && pStart > pEnd) {
    return pStart.getFullYear() === year || pEnd.getFullYear() === year;
  }

  // If there is valid startDate and valid endDate and startDate <= endDate
  if (pStart && pEnd && pStart <= pEnd) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    return pStart <= yearEnd && pEnd >= yearStart;
  }

  // If there is only startDate
  if (pStart && !pEnd) {
    return pStart.getFullYear() === year;
  }

  // If there is only endDate
  if (!pStart && pEnd) {
    return pEnd.getFullYear() === year;
  }

  // Default if there is no startDate and no endDate (and no explicit data above):
  if (!pStart && !pEnd) {
    if (p._dataYear === year) return true;
    const createdYear = parseYearFromStr(p.createdAt);
    if (createdYear === year) return true;
  }

  return false;
}

/**
 * Compiles a sorted array of all unique available years across the project portfolio,
 * incorporating fallback logic if years are empty.
 */
export function getYearsForRoadmap(
  projects: Project[],
  projectEvaluations?: ProjectEvaluation[] | null,
  assessmentDateStr?: string
): number[] {
  const potentialYears = new Set<number>();

  projects.forEach(p => {
    const ev = projectEvaluations?.find(e => e.projectId === p.projectId) || null;
    const pYears = getYearsForProject(p, ev);
    pYears.forEach(y => potentialYears.add(y));

    const hasOtherDates = !!(p.startDate || p.deadlineAt || p.endDate || (p.milestones && p.milestones.length > 0) || (p.indicators && p.indicators.length > 0));
    if (!hasOtherDates && p.createdAt) {
      const createdDate = parseDateSafe(p.createdAt);
      if (createdDate && !Number.isNaN(createdDate.getTime())) {
        potentialYears.add(createdDate.getFullYear());
      }
    }
  });

  const years = new Set<number>();
  potentialYears.forEach(year => {
    const hasAnyProject = projects.some(p => {
      const ev = projectEvaluations?.find(e => e.projectId === p.projectId) || null;
      return isProjectInRoadmapYear(p, ev, year);
    });
    if (hasAnyProject) {
      years.add(year);
    }
  });

  // If still empty, add year of assessmentDate if available, otherwise current year
  if (years.size === 0) {
    if (assessmentDateStr) {
      const assessDate = parseDateSafe(assessmentDateStr);
      if (assessDate && !Number.isNaN(assessDate.getTime())) {
        years.add(assessDate.getFullYear());
      }
    }
    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }
  }

  return Array.from(years).sort((a, b) => a - b);
}

/**
 * Filters and sorts projects for the roadmap of a specific year.
 */
export function getRoadmapTimelineProjects(
  projects: Project[],
  projectEvaluations: ProjectEvaluation[] | null | undefined,
  selectedYear: number
): Project[] {
  return projects
    .filter(p => {
      const ev = projectEvaluations?.find(e => e.projectId === p.projectId) || null;
      return isProjectInRoadmapYear(p, ev, selectedYear);
    })
    .sort((a, b) => {
      const aDate = parseDateSafe(a.startDate || a.createdAt);
      const bDate = parseDateSafe(b.startDate || b.createdAt);
      const aTime = aDate ? aDate.getTime() : 0;
      const bTime = bDate ? bDate.getTime() : 0;
      return aTime - bTime;
    });
}

/**
 * Calculates calendar progress inside the visual subset of the year (between visualStart and visualEnd).
 */
export function getVisualCalendarProgressPercent(
  visualStart: Date,
  visualEnd: Date,
  assessmentDateStr?: string | Date | null,
  p?: Project
): number | null {
  if (p) {
    const status = getProjectCalendarIntervalStatus(p);
    if (!status.isValid) return null;
  }

  if (!assessmentDateStr) return null;
  const parsedAssess = typeof assessmentDateStr === 'string'
    ? parseDateSafe(assessmentDateStr)
    : assessmentDateStr;

  if (!parsedAssess || Number.isNaN(parsedAssess.getTime())) return null;

  const assessTime = parsedAssess.getTime();
  const sTime = visualStart.getTime();
  const eTime = visualEnd.getTime();

  if (Number.isNaN(sTime) || Number.isNaN(eTime)) return null;

  if (assessTime < sTime) return 0;
  if (assessTime > eTime) return 100;

  if (eTime <= sTime) {
    return assessTime >= eTime ? 100 : 0;
  }

  const progress = ((assessTime - sTime) / (eTime - sTime)) * 100;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

/**
 * Maps roadmap project health status to a localized risk level string.
 */
export function mapRoadmapHealthStatusToRiskLabel(healthStatus: string | undefined | null): string {
  if (healthStatus === "risk") {
    return "Высокий";
  }
  if (healthStatus === "attention") {
    return "Средний";
  }
  if (healthStatus === "ok") {
    return "Низкий";
  }
  return "Недостаточно данных";
}

