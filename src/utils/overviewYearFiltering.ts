import { Project, ProjectEvaluation } from '../types';
import { parseRussianDate } from './projectCalculations';
import { parseDateSafe } from './dateUtils';

export const parseYearFromStr = (str?: string | null): number | null => {
  if (!str) return null;
  const ruMatch = str.match(/\b\d{1,2}\.\d{1,2}\.(20\d{2})\b/);
  if (ruMatch) return parseInt(ruMatch[1], 10);
  const isoMatch = str.match(/\b(20\d{2})-\d{1,2}-\d{1,2}\b/);
  if (isoMatch) return parseInt(isoMatch[1], 10);
  const genMatch = str.match(/\b(20\d{2})\b/);
  if (genMatch) return parseInt(genMatch[1], 10);
  return null;
};

export const isProjectInYear = (p: Project, ev: ProjectEvaluation | null, year: number): boolean => {
  const pStartDate = parseRussianDate(p.startDate) || parseDateSafe(p.startDate);
  const pEndDate = parseRussianDate(p.deadlineAt || p.endDate) || parseDateSafe(p.deadlineAt || p.endDate);

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  // Rule 3: Если есть явные данные выбранного года: проект попадает в выбранный год независимо от дат.
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

  // Rule 1: Если есть валидная дата начала и валидная дата завершения:
  // проект попадает в год, если период проекта пересекает выбранный год.
  if (pStartDate && pEndDate) {
    return pStartDate <= yearEnd && pEndDate >= yearStart;
  }

  // Rule 2: Если есть дата начала, но нет валидной даты завершения: проект попадает только в год даты начала, если у проекта нет явных данных выбранного года.
  if (pStartDate && !pEndDate) {
    const startYear = pStartDate.getFullYear();
    return startYear === year;
  }

  // No start date, but has end date
  if (!pStartDate && pEndDate) {
    return pEndDate >= yearStart;
  }

  // Default if there is no startDate and no endDate (and no explicit data above):
  if (!pStartDate && !pEndDate) {
    if (p._dataYear === year) return true;
    const createdYear = parseYearFromStr(p.createdAt);
    if (createdYear === year) return true;
  }

  return false;
};

export const getYearsForProject = (p: Project, ev?: ProjectEvaluation | null): number[] => {
  const years = new Set<number>();

  const startYear = parseYearFromStr(p.startDate);
  const endYear = parseYearFromStr(p.deadlineAt || p.endDate);

  if (startYear !== null && endYear !== null && startYear <= endYear) {
    for (let y = startYear; y <= endYear; y++) {
      years.add(y);
    }
  } else {
    if (startYear !== null) years.add(startYear);
    if (endYear !== null) years.add(endYear);
  }

  if (ev) {
    if (ev.milestones?.milestoneResults) {
      ev.milestones.milestoneResults.forEach(m => {
        if (m.year) years.add(m.year);
      });
    }
    if (ev.indicators?.indicatorResults) {
      ev.indicators.indicatorResults.forEach(i => {
        if (i.year) years.add(i.year);
      });
    }
  }

  if (p._rawByYear) {
    Object.keys(p._rawByYear).forEach(yStr => {
      const y = parseInt(yStr, 10);
      if (!isNaN(y)) {
        const milestonesHasData = Object.values(p._rawByYear?.[y]?.milestones || {}).some(v => v !== null && v !== "" && String(v).toLowerCase().trim() !== "nan");
        const indicatorsHasData = Object.values(p._rawByYear?.[y]?.indicators || {}).some(v => v !== null && v !== "" && String(v).toLowerCase().trim() !== "nan");
        if (milestonesHasData || indicatorsHasData) {
          years.add(y);
        }
      }
    });
  }

  if (p.milestones) {
    p.milestones.forEach(m => {
      const mYear = parseYearFromStr(m.taskId) || parseYearFromStr(m.quarter);
      if (mYear !== null) years.add(mYear);
    });
  }

  if (p.indicators) {
    p.indicators.forEach(ind => {
      const indYear = parseYearFromStr(ind.indicatorId) || parseYearFromStr(ind.period);
      if (indYear !== null) years.add(indYear);
    });
  }

  if (years.size === 0) {
    if (p._dataYear) {
      years.add(p._dataYear);
    } else {
      years.add(new Date().getFullYear());
    }
  }

  return Array.from(years).sort((a, b) => a - b);
};
