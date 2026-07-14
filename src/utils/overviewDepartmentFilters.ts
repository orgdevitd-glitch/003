/**
 * Departments excluded from Overview blocks:
 * - «Аналитика по департаментам»
 * - «Выполнение по департаментам»
 *
 * Elsewhere on the Overview tab these projects still participate.
 * If a project lists multiple departments and any is excluded, the whole project is skipped in those two blocks.
 */
export const OVERVIEW_EXCLUDED_DEPARTMENT_NAMES = [
  "HAFF 51",
  "Производство",
  "Партнеры. Производство."
] as const;

const excludedNormalized = new Set(
  OVERVIEW_EXCLUDED_DEPARTMENT_NAMES.map(n => n.trim().toLowerCase())
);

export function parseProjectDepartmentList(department: string | null | undefined): string[] {
  const raw = (department || "").trim();
  if (!raw) return [];
  return raw.split(";").map(s => s.trim()).filter(Boolean);
}

export function isOverviewExcludedDepartmentName(name: string | null | undefined): boolean {
  const key = String(name || "").trim().toLowerCase();
  return key.length > 0 && excludedNormalized.has(key);
}

/** True when the project must be omitted from the two Overview department visualizations. */
export function shouldExcludeProjectFromOverviewDepartmentCharts(
  department: string | null | undefined
): boolean {
  return parseProjectDepartmentList(department).some(isOverviewExcludedDepartmentName);
}
