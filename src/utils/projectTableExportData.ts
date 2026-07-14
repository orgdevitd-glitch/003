import { Project, ProjectEvaluation } from '../types';
import { parseDateSafe, formatDateSafe } from './dateUtils';
import { getEvaluationByProjectId } from './evaluationUtils';
import {
  getRegistryPcStatusView,
  getRegistryRiskView,
  getRegistryProjectStatusView
} from './projectRegistryStatus';
import {
  getCurrentQuarterMilestoneMetrics,
  getCurrentQuarterKpiMetrics,
  getRegistryRiskReasons
} from './projectRegistryMetrics';

export const formatVal = (val: string | number | null | undefined) => {
  if (val === null || val === undefined) return "Не заполнено";
  const str = String(val).trim();
  if (str === "" || str === "—" || str.toLowerCase() === "nan") return "Не заполнено";

  const rolesMap: Record<string, string> = {
    "CEO": "Генеральный директор",
    "CFO": "Финансовый директор",
    "CHRO": "Директор по персоналу",
    "CCO": "Коммерческий директор"
  };

  const parts = str.split(/([,;/]+)/);
  const translatedParts = parts.map(part => {
    const trimmed = part.trim();
    if (rolesMap[trimmed]) {
      return rolesMap[trimmed];
    }
    return part;
  });
  return translatedParts.join("");
};

export interface ExportDataResult {
  headers: string[];
  rows: string[][];
}

export function buildExcelExportData(
  projects: Project[],
  projectEvaluations: ProjectEvaluation[] | null | undefined,
  assessmentDateStr: string | null | undefined,
  visibleColumnsFromStorage?: string | null
): ExportDataResult {
  // 1. Define active keys
  let activeKeys = [
    'projectName', 'sponsor', 'projectManager', 'projectOwner', 'priority',
    'startDate', 'deadlineAt', 'stage', 'department', 'pcStatus',
    'projectStatus', 'riskLevel', 'tasksProgress', 'kpisProgress'
  ];

  if (visibleColumnsFromStorage) {
    try {
      const parsed = JSON.parse(visibleColumnsFromStorage);
      if (Array.isArray(parsed) && parsed.length > 0) {
        activeKeys = activeKeys.filter(cid => parsed.includes(cid));
      }
    } catch (e) {
      console.error("Failed to parse visible columns from localStorage for Excel export:", e);
    }
  }

  let finalActiveKeys: string[] = [];
  activeKeys.forEach((key) => {
    if (key === 'tasksProgress') {
      finalActiveKeys.push('tasksProgressPlan', 'tasksProgressFact', 'tasksProgressDeviation');
    } else if (key === 'kpisProgress') {
      finalActiveKeys.push('kpisProgressPlan', 'kpisProgressFact', 'kpisProgressDeviation');
    } else {
      finalActiveKeys.push(key);
    }
  });

  const COLUMNS_MAP: { [key: string]: { label: string; getValue: (p: Project) => string | number | null | undefined } } = {
    projectName: {
      label: "Название проекта",
      getValue: (p) => p.projectName
    },
    sponsor: {
      label: "Заказчики",
      getValue: (p) => p.sponsor
    },
    projectManager: {
      label: "Руководитель проекта",
      getValue: (p) => p.projectManager || p.executor
    },
    projectOwner: {
      label: "Владелец проекта",
      getValue: (p) => p.projectOwner || p.owner
    },
    priority: {
      label: "Приоритет",
      getValue: (p) => p.priority !== null && p.priority !== undefined ? p.priority : "Не заполнено"
    },
    startDate: {
      label: "Дата начала",
      getValue: (p) => p.startDate ? formatDateSafe(p.startDate) : null
    },
    deadlineAt: {
      label: "Дата завершения",
      getValue: (p) => p.deadlineAt || p.endDate ? formatDateSafe(p.deadlineAt || p.endDate) : null
    },
    stage: {
      label: "Стадия",
      getValue: (p) => p.stage
    },
    department: {
      label: "Департамент",
      getValue: (p) => p.department
    },
    pcStatus: {
      label: "Статус ПК",
      getValue: (p) => {
        const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
        return getRegistryPcStatusView(p, ev, assessmentDateStr);
      }
    },
    projectStatus: {
      label: "Зона риска",
      getValue: (p) => {
        const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
        const status = getRegistryProjectStatusView(p, ev, assessmentDateStr);
        const riskLevel = getRegistryRiskView(p, ev, assessmentDateStr);
        const reasons = getRegistryRiskReasons(p, projectEvaluations, assessmentDateStr);
        let result = `${status}`;
        if (status !== "Норма" && riskLevel) {
          result += ` (Риск: ${riskLevel.toLowerCase()})`;
        }
        if (reasons.length > 0) {
          result += ` - Причины: ${reasons.join(', ')}`;
        }
        return result;
      }
    },
    riskLevel: {
      label: "Уровень риска",
      getValue: (p) => {
        const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
        return getRegistryRiskView(p, ev, assessmentDateStr);
      }
    },
    tasksProgress: {
      label: "Вехи текущего квартала - процент выполнения",
      getValue: (p) => {
        const mMetrics = getCurrentQuarterMilestoneMetrics(p, projectEvaluations, assessmentDateStr);
        return mMetrics.hasData ? Math.round(mMetrics.fact) + "%" : "Нет данных";
      }
    },
    tasksProgressPlan: {
      label: "Вехи текущего квартала - план",
      getValue: (p) => {
        const mMetrics = getCurrentQuarterMilestoneMetrics(p, projectEvaluations, assessmentDateStr);
        return mMetrics.hasData ? Math.round(mMetrics.plan) + "%" : "Нет данных";
      }
    },
    tasksProgressFact: {
      label: "Вехи текущего квартала - факт",
      getValue: (p) => {
        const mMetrics = getCurrentQuarterMilestoneMetrics(p, projectEvaluations, assessmentDateStr);
        return mMetrics.hasData ? Math.round(mMetrics.fact) + "%" : "Нет данных";
      }
    },
    tasksProgressDeviation: {
      label: "Вехи текущего квартала - отклонение",
      getValue: (p) => {
        const mMetrics = getCurrentQuarterMilestoneMetrics(p, projectEvaluations, assessmentDateStr);
        if (!mMetrics.hasData) return "Нет данных";
        const rounded = Math.round(mMetrics.deviation);
        if (rounded < 0) return `ниже плана на ${Math.abs(rounded)}%`;
        if (rounded > 0) return `выше плана на ${rounded}%`;
        return "соответствует плану";
      }
    },
    kpisProgress: {
      label: "Показатели текущего квартала - процент выполнения",
      getValue: (p) => {
        const iMetrics = getCurrentQuarterKpiMetrics(p, projectEvaluations, assessmentDateStr);
        return iMetrics.hasData ? Math.round(iMetrics.fact) + "%" : "Нет данных";
      }
    },
    kpisProgressPlan: {
      label: "Показатели текущего квартала - план",
      getValue: (p) => {
        const iMetrics = getCurrentQuarterKpiMetrics(p, projectEvaluations, assessmentDateStr);
        return iMetrics.hasData ? Math.round(iMetrics.plan) + "%" : "Нет данных";
      }
    },
    kpisProgressFact: {
      label: "Показатели текущего квартала - факт",
      getValue: (p) => {
        const iMetrics = getCurrentQuarterKpiMetrics(p, projectEvaluations, assessmentDateStr);
        return iMetrics.hasData ? Math.round(iMetrics.fact) + "%" : "Нет данных";
      }
    },
    kpisProgressDeviation: {
      label: "Показатели текущего квартала - отклонение",
      getValue: (p) => {
        const iMetrics = getCurrentQuarterKpiMetrics(p, projectEvaluations, assessmentDateStr);
        if (!iMetrics.hasData) return "Нет данных";
        const rounded = Math.round(iMetrics.deviation);
        if (rounded < 0) return `ниже плана на ${Math.abs(rounded)}%`;
        if (rounded > 0) return `выше плана на ${rounded}%`;
        return "соответствует плану";
      }
    }
  };

  const headers = finalActiveKeys.map(key => COLUMNS_MAP[key].label);
  const rows = projects.map(p => {
    return finalActiveKeys.map(key => {
      const rawValue = COLUMNS_MAP[key].getValue(p);
      return formatVal(rawValue);
    });
  });

  return { headers, rows };
}
