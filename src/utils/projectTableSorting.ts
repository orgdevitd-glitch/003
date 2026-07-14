import { Project } from '../types';
import { parseProjectDate } from './projectCalculations';

/**
 * Returns a sort value (Date object or null) for a specific date field in a Project.
 * For the 'deadlineAt' field, it falls back to the effective deadline: 'deadlineAt || endDate'.
 */
export function getProjectDateSortValue(
  project: Project,
  field: 'startDate' | 'deadlineAt'
): Date | null {
  if (field === 'startDate') {
    return parseProjectDate(project.startDate);
  }
  if (field === 'deadlineAt') {
    const effectiveDeadline = project.deadlineAt || project.endDate;
    return parseProjectDate(effectiveDeadline);
  }
  return null;
}

/**
 * Compares two nullable Date values for sorting.
 * Rules:
 * - Real calendar dates are compared chronologically.
 * - Null or invalid dates always go to the END of the list, regardless of the sorting direction (asc or desc).
 */
export function compareNullableDates(
  aDate: Date | null,
  bDate: Date | null,
  direction: 'asc' | 'desc'
): number {
  const aValid = aDate && !Number.isNaN(aDate.getTime());
  const bValid = bDate && !Number.isNaN(bDate.getTime());

  // If both are invalid/null, they are equal
  if (!aValid && !bValid) {
    return 0;
  }

  // If only one is invalid/null, it must go to the end of the list in both asc and desc modes.
  if (!aValid) {
    return 1; // Put a after b
  }
  if (!bValid) {
    return -1; // Put b after a (a before b)
  }

  // Both are valid, sort chronologically
  const aTime = aDate.getTime();
  const bTime = bDate.getTime();

  if (aTime < bTime) {
    return direction === 'asc' ? -1 : 1;
  }
  if (aTime > bTime) {
    return direction === 'asc' ? 1 : -1;
  }
  return 0;
}
