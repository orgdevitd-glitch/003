import { ProjectEvaluation, NormalizedProject } from '../types';

/**
 * Finds the project evaluation object by its projectId
 */
export function getEvaluationByProjectId(
  projectEvaluations: ProjectEvaluation[] | undefined | null,
  projectId: string
): ProjectEvaluation | null {
  if (!projectEvaluations || !Array.isArray(projectEvaluations)) return null;
  return projectEvaluations.find(e => e.projectId === projectId) || null;
}

/**
 * Finds the normalized project object by its projectId
 */
export function getNormalizedProjectById(
  normalizedProjects: NormalizedProject[] | undefined | null,
  projectId: string
): NormalizedProject | null {
  if (!normalizedProjects || !Array.isArray(normalizedProjects)) return null;
  return normalizedProjects.find(p => p.projectId === projectId) || null;
}

/**
 * Formats a numeric percent value uniformly, handling null/undefined safely
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
}

/**
 * Formats nullable/undefined values as a string or empty placeholder
 */
export function formatNullable(value: any | null | undefined, placeholder: string = '-'): string {
  if (value === null || value === undefined || value === '') return placeholder;
  return String(value);
}

/**
 * Translates health/data/monitoring status names into standard Russian labels
 */
export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return '-';
  const clean = status.toLowerCase().trim();
  switch (clean) {
    case 'ok':
      return 'В норме';
    case 'attention':
      return 'Требует внимания';
    case 'risk':
      return 'Зона риска';
    case 'not_enough_data':
      return 'Недостаточно данных';
    case 'warning':
      return 'Предупреждение';
    case 'error':
      return 'Ошибка';
    case 'not_applicable':
      return 'Не применимо';
    case 'overdue':
      return 'Просрочено';
    default:
      return status;
  }
}

/**
 * Returns Tailwind CSS color class tones corresponding to statuses
 */
export function getStatusTone(status: string | null | undefined): {
  bg: string;
  text: string;
  border: string;
  fill: string;
} {
  const fallback = {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-600 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-700',
    fill: 'fill-zinc-400'
  };
  
  if (!status) return fallback;
  const clean = status.toLowerCase().trim();
  
  switch (clean) {
    case 'ok':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/20',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800/50',
        fill: 'fill-emerald-500'
      };
    case 'attention':
    case 'warning':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/20',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800/50',
        fill: 'fill-amber-500'
      };
    case 'risk':
    case 'error':
    case 'overdue':
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/20',
        text: 'text-rose-700 dark:text-rose-400',
        border: 'border-rose-200 dark:border-rose-800/50',
        fill: 'fill-rose-500'
      };
    case 'not_enough_data':
      return {
        bg: 'bg-sky-50 dark:bg-sky-950/20',
        text: 'text-sky-700 dark:text-sky-400',
        border: 'border-sky-200 dark:border-sky-805/50',
        fill: 'fill-sky-500'
      };
    case 'not_applicable':
    default:
      return fallback;
  }
}

/**
 * Calculates and formats a percentage string for pie charts, skipping zero values.
 * e.g., formatPercentLabel(2, 5) -> "40%", formatPercentLabel(1, 3) -> "33.3%"
 */
export function formatPercentLabel(value: number | null | undefined, total: number | null | undefined): string {
  if (value === null || value === undefined || !total || value <= 0) return '';
  const pct = (value / total) * 100;
  if (pct <= 0) return '';
  const formatted = pct.toFixed(1);
  return formatted.endsWith('.0') ? `${Math.round(pct)}%` : `${formatted}%`;
}

export interface ProjectStatusTooltipInfo {
  title: string;
  statusLabel: string;
  statusBadgeClass: string;
  riskLabel: string;
  riskBadgeClass: string;
  explanation: string;
  methodologyTitle: string;
  methodologyDescription: string;
  bullet1: string;
  bullet2: string;
  bullet3: string;
}

/**
 * Generates exact localized tooltip content and styling classes for the Project Status tooltip
 */
export function getProjectStatusTooltipData(
  status: string,
  risk: string
): ProjectStatusTooltipInfo {
  const normStatus = status === 'Норма' ? 'Норма' : (status === 'Зона риска' ? 'Зона риска' : 'Недостаточно данных');
  
  let normRisk = 'Низкий';
  const cleanRisk = (risk || '').toLowerCase().trim();
  if (cleanRisk === 'высокий' || cleanRisk === 'high') {
    normRisk = 'Высокий';
  } else if (cleanRisk === 'средний' || cleanRisk === 'medium') {
    normRisk = 'Средний';
  }

  let explanation = '';
  if (normStatus === 'Норма') {
    explanation = 'Проект выполняется без критичных отклонений на выбранную дату оценки.';
  } else if (normStatus === 'Зона риска') {
    explanation = 'Зафиксированы факторы риска: просрочки, отклонения по вехам или показателям, либо ошибки данных.';
  } else {
    explanation = 'Недостаточно корректных данных, чтобы надежно оценить состояние проекта.';
  }

  const statusBadgeClass = 
    normStatus === 'Норма' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
    normStatus === 'Зона риска' ? 'bg-red-50 text-red-700 border-red-100' :
    'bg-gray-50 text-gray-500 border-gray-100';

  const riskBadgeClass =
    normRisk === 'Высокий' ? 'bg-red-50 text-red-700 border-red-100' :
    normRisk === 'Средний' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
    'bg-emerald-50 text-emerald-700 border-emerald-100';

  return {
    title: 'Зона риска',
    statusLabel: `Статус: ${normStatus}`,
    statusBadgeClass,
    riskLabel: `Риск: ${normRisk}`,
    riskBadgeClass,
    explanation,
    methodologyTitle: 'Методология зоны риска',
    methodologyDescription: 'Зона риска проекта рассчитывается на выбранную дату оценки. Будущие кварталы, где факт еще не должен быть заполнен, не ухудшают оценку. Итоговая оценка учитывает риск, статус ПК, актуальное выполнение вех, актуальное выполнение показателей и качество заполнения данных.',
    bullet1: 'Норма: низкий риск и достаточно данных для оценки.',
    bullet2: 'Зона риска: средний или высокий риск, просрочки, критичные отклонения или ошибки данных.',
    bullet3: 'Недостаточно данных: не хватает данных для надежного расчета.'
  };
}

/**
 * Returns a traffic light color according to the percentage value
 */
export function getTrafficLightColor(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || typeof percent !== 'number' || isNaN(percent)) {
    return '#94a3b8'; // серый для отсутствующих данных
  }
  if (percent < 20) {
    return '#111827'; // черный
  }
  if (percent >= 20 && percent <= 50) {
    return '#ef4444'; // красный
  }
  if (percent > 50 && percent <= 60) {
    return '#f97316'; // оранжевый
  }
  if (percent > 60 && percent < 80) {
    return '#eab308'; // желтый
  }
  return '#22c55e'; // зеленый
}


