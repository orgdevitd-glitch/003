import { Project } from '../types';
import { parseDateSafe } from './dateUtils';
import { parseRussianDate } from './projectCalculations';

/**
 * Checks if a project's deadline is overdue relative to the assessment date.
 * 
 * Rules:
 * 1. Effective deadline is project.deadlineAt || project.endDate.
 * 2. If both are empty or invalid, it is not overdue.
 * 3. If effectiveDeadline < assessmentDate, then it's overdue (provided the project status is not 'completed').
 * 4. All checks should be calculated relative to assessmentDate (no new Date() usage).
 */
export function isProjectDeadlineOverdue(project: Project, assessmentDate?: string): boolean {
  if (project.status === 'completed') {
    return false;
  }

  const deadlineStr = project.deadlineAt || project.endDate;
  if (!deadlineStr) {
    return false;
  }

  const deadlineDate = parseRussianDate(deadlineStr) || parseDateSafe(deadlineStr);
  if (!deadlineDate || Number.isNaN(deadlineDate.getTime())) {
    return false;
  }

  if (!assessmentDate) {
    return false;
  }

  const parsedAssess = parseDateSafe(assessmentDate);
  if (!parsedAssess || Number.isNaN(parsedAssess.getTime())) {
    return false;
  }

  const dYear = deadlineDate.getFullYear();
  const dMonth = deadlineDate.getMonth();
  const dDay = deadlineDate.getDate();

  const aYear = parsedAssess.getFullYear();
  const aMonth = parsedAssess.getMonth();
  const aDay = parsedAssess.getDate();

  const dCompare = new Date(dYear, dMonth, dDay);
  const aCompare = new Date(aYear, aMonth, aDay);

  return dCompare < aCompare;
}
