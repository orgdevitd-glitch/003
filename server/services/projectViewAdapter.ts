import { Project, ProjectTask, ProjectIndicator, ProjectStatus, TaskStatus } from "../../src/types";
import { NormalizedProject, NormalizedMilestone, NormalizedIndicator } from "./projectNormalizer";
import { ProjectEvaluation } from "./projectEvaluationService";

/**
 * Adapter to map a NormalizedProject back into legacy Project structure for front-end compatibility
 */
export function toLegacyProjectView(normalized: NormalizedProject): Project {
  // Map stage to legacy ProjectStatus
  let mappedStatus: ProjectStatus = "unknown";
  const stage = normalized.baseInfo.stage;
  
  if (stage === "В работе") {
    mappedStatus = "active";
  } else if (stage === "Завершен") {
    mappedStatus = "completed";
  } else if (stage === "На паузе") {
    mappedStatus = "waiting";
  } else if (stage === "Планируется") {
    mappedStatus = "unknown";
  }

  // Convert milestones
  const legacyMilestones: ProjectTask[] = normalized.milestones.map(m => {
    let ptStatus: TaskStatus = "Не указан";
    if (m.progressPercent === 100) {
      ptStatus = "Завершена";
    } else if (m.progressPercent === 0) {
      ptStatus = "Ждёт выполнения";
    } else if (m.progressPercent !== null) {
      ptStatus = "Выполняется";
    }

    return {
      taskId: m.id,
      title: m.name,
      status: ptStatus,
      quarter: m.quarter,
      weight: m.weightPercent,
      progressPercent: m.progressPercent,
      isMilestone: true
    };
  });

  // Convert indicators
  const legacyIndicators: ProjectIndicator[] = normalized.indicators.map(ind => {
    return {
      indicatorId: ind.id,
      name: ind.name,
      planValue: ind.plan,
      factValue: ind.fact,
      period: `${ind.quarter} ${ind.year}`,
      unit: null,
      comment: null
    };
  });

  const rawRow = normalized.source.rawRow as Record<string, string>;
  const fallbackYear = new Date().getFullYear();
  const dataYear = normalized.source.detectedYears[0] || fallbackYear;
  const detectedYears = normalized.source.detectedYears && normalized.source.detectedYears.length > 0
    ? normalized.source.detectedYears
    : [fallbackYear];

  const _rawByYear: Record<number, any> = {};
  for (const year of detectedYears) {
    _rawByYear[year] = {
      milestones: {
        q1names: rawRow[`Вехи ${year} Q1`] || rawRow["Вехи Q1"] || null,
        q1progress: rawRow[`% выполнения Вехи ${year} Q1`] || rawRow["% выполнения Вехи Q1"] || null,
        q1weights: rawRow[`Вес вехи ${year} Q1`] || rawRow["Вес вехи Q1"] || null,
        q2names: rawRow[`Вехи ${year} Q2`] || rawRow["Вехи Q2"] || null,
        q2progress: rawRow[`% выполнения Вехи ${year} Q2`] || rawRow["% выполнения Вехи Q2"] || null,
        q2weights: rawRow[`Вес вехи ${year} Q2`] || rawRow["Вес вехи Q2"] || null,
        q3names: rawRow[`Вехи ${year} Q3`] || rawRow["Вехи Q3"] || null,
        q3progress: rawRow[`% выполнения Вехи ${year} Q3`] || rawRow["% выполнения Вехи Q3"] || null,
        q3weights: rawRow[`Вес вехи ${year} Q3`] || rawRow["Вес вехи Q3"] || null,
        q4names: rawRow[`Вехи ${year} Q4`] || rawRow["Вехи Q4"] || null,
        q4progress: rawRow[`% выполнения Вехи ${year} Q4`] || rawRow["% выполнения Вехи Q4"] || null,
        q4weights: rawRow[`Вес вехи ${year} Q4`] || rawRow["Вес вехи Q4"] || null,
      },
      indicators: {
        q1names: rawRow[`Показатели проекта ${year} Q1`] || rawRow["Показатели проекта Q1"] || null,
        q1plans: rawRow[`План Показатели проекта ${year} Q1`] || rawRow["План Показатели проекта Q1"] || null,
        q1facts: rawRow[`Факт Показатели проекта ${year} Q1`] || rawRow["Факт Показатели проекта Q1"] || null,
        q2names: rawRow[`Показатели проекта ${year} Q2`] || rawRow["Показатели проекта Q2"] || null,
        q2plans: rawRow[`План Показатели проекта ${year} Q2`] || rawRow["План Показатели проекта Q2"] || null,
        q2facts: rawRow[`Факт Показатели проекта ${year} Q2`] || rawRow["Факт Показатели проекта Q2"] || null,
        q3names: rawRow[`Показатели проекта ${year} Q3`] || rawRow["Показатели проекта Q3"] || null,
        q3plans: rawRow[`План Показатели проекта ${year} Q3`] || rawRow["План Показатели проекта Q3"] || null,
        q3facts: rawRow[`Факт Показатели проекта ${year} Q3`] || rawRow["Факт Показатели проекта Q3"] || null,
        q4names: rawRow[`Показатели проекта ${year} Q4`] || rawRow["Показатели проекта Q4"] || null,
        q4plans: rawRow[`План Показатели проекта ${year} Q4`] || rawRow["План Показатели проекта Q4"] || null,
        q4facts: rawRow[`Факт Показатели проекта ${year} Q4`] || rawRow["Факт Показатели проекта Q4"] || null,
      }
    };
  }

  // Compile legacy representation
  const legacyProj: any = {
    id: normalized.id,
    projectId: normalized.id,
    projectName: normalized.baseInfo.title,
    projectUrl: rawRow["Ссылка на проект"] || normalized.links.bitrixUrl || "",
    projectDescription: "",
    resultImages: normalized.baseInfo.resultImages ? [normalized.baseInfo.resultImages] : [],
    status: mappedStatus,
    stage: normalized.baseInfo.stage,
    owner: normalized.people.owner || "",
    executor: normalized.people.projectManager || "",
    coExecutors: normalized.people.team,
    observers: normalized.people.monitoringParticipants,
    sponsor: normalized.people.customers.join("; ") || "",
    projectManager: normalized.people.projectManager || "",
    projectOwner: normalized.people.owner || "",
    responsible: normalized.people.responsible || "",
    projectAdmin: normalized.people.projectAdmin || "",
    projectTeam: normalized.people.team.join("; ") || "",
    projectType: normalized.baseInfo.type,
    monitoringStart: normalized.monitoring.startDate || "",
    createdAt: normalized.baseInfo.startDate || "",
    startDate: normalized.baseInfo.startDate || "",
    deadlineAt: normalized.baseInfo.endDate || "",
    endDate: normalized.baseInfo.endDate || "",
    lastPcDate: normalized.monitoring.lastMonitoringDate || null,
    monitoringFrequencyWeeks: normalized.monitoring.regularityWeeks,
    goals: normalized.baseInfo.goals ? [normalized.baseInfo.goals] : [],
    linkedGoals: rawRow["Связанные цели компании"] ? rawRow["Связанные цели компании"].split(";").map((s: string) => s.trim()) : [],
    resourceValue: rawRow["Объем ресурсов"] || null,
    resourceLevel: rawRow["Уровень ресурсов"] || rawRow["Уровень обеспеченности ресурсами"] || null,
    itResourceLevel: rawRow["Объем ресурсов ИТ"] || null,
    rice: rawRow["RICE"] ? parseFloat(rawRow["RICE"]) : null,
    roi: rawRow["ROI, %"] || rawRow["ROI"] ? parseFloat(String(rawRow["ROI, %"] || rawRow["ROI"])) : null,
    priority: normalized.baseInfo.priority,
    department: normalized.organization.departments.join("; "),
    manager: normalized.people.projectManager, // Added for front-end explicit adapter mapping compatibility

    tasks: [],
    milestones: legacyMilestones,
    indicators: legacyIndicators,
    risks: rawRow["Риски и ограничения"] ? [{
      riskId: "R-1",
      title: rawRow["Риски и ограничения"],
      severity: "medium"
    }] : [],
    
    _dataYear: dataYear,
    _rawQuarters: {
      q1plan: rawRow[`Вес вехи ${dataYear} Q1`] || rawRow["Вес вехи Q1"] || null,
      q1fact: rawRow[`Вес вехи ${dataYear} Q1`] || rawRow["Вес вехи Q1"] || null,
      q2plan: rawRow[`Вес вехи ${dataYear} Q2`] || rawRow["Вес вехи Q2"] || null,
      q2fact: rawRow[`Вес вехи ${dataYear} Q2`] || rawRow["Вес вехи Q2"] || null,
      q3plan: rawRow[`Вес вехи ${dataYear} Q3`] || rawRow["Вес вехи Q3"] || null,
      q3fact: rawRow[`Вес вехи ${dataYear} Q3`] || rawRow["Вес вехи Q3"] || null,
      q4plan: rawRow[`Вес вехи ${dataYear} Q4`] || rawRow["Вес вехи Q4"] || null,
      q4fact: rawRow[`Вес вехи ${dataYear} Q4`] || rawRow["Вес вехи Q4"] || null,
    },
    _rawMilestonesNew: {
      q1names: rawRow[`Вехи ${dataYear} Q1`] || rawRow["Вехи Q1"] || null,
      q1progress: rawRow[`% выполнения Вехи ${dataYear} Q1`] || rawRow["% выполнения Вехи Q1"] || null,
      q1weights: rawRow[`Вес вехи ${dataYear} Q1`] || rawRow["Вес вехи Q1"] || null,
      q2names: rawRow[`Вехи ${dataYear} Q2`] || rawRow["Вехи Q2"] || null,
      q2progress: rawRow[`% выполнения Вехи ${dataYear} Q2`] || rawRow["% выполнения Вехи Q2"] || null,
      q2weights: rawRow[`Вес вехи ${dataYear} Q2`] || rawRow["Вес вехи Q2"] || null,
      q3names: rawRow[`Вехи ${dataYear} Q3`] || rawRow["Вехи Q3"] || null,
      q3progress: rawRow[`% выполнения Вехи ${dataYear} Q3`] || rawRow["% выполнения Вехи Q3"] || null,
      q3weights: rawRow[`Вес вехи ${dataYear} Q3`] || rawRow["Вес вехи Q3"] || null,
      q4names: rawRow[`Вехи ${dataYear} Q4`] || rawRow["Вехи Q4"] || null,
      q4progress: rawRow[`% выполнения Вехи ${dataYear} Q4`] || rawRow["% выполнения Вехи Q4"] || null,
      q4weights: rawRow[`Вес вехи ${dataYear} Q4`] || rawRow["Вес вехи Q4"] || null,
    },
    _rawIndicatorsNew: {
      q1names: rawRow[`Показатели проекта ${dataYear} Q1`] || rawRow["Показатели проекта Q1"] || null,
      q1plans: rawRow[`План Показатели проекта ${dataYear} Q1`] || rawRow["План Показатели проекта Q1"] || null,
      q1facts: rawRow[`Факт Показатели проекта ${dataYear} Q1`] || rawRow["Факт Показатели проекта Q1"] || null,
      q2names: rawRow[`Показатели проекта ${dataYear} Q2`] || rawRow["Показатели проекта Q2"] || null,
      q2plans: rawRow[`План Показатели проекта ${dataYear} Q2`] || rawRow["План Показатели проекта Q2"] || null,
      q2facts: rawRow[`Факт Показатели проекта ${dataYear} Q2`] || rawRow["Факт Показатели проекта Q2"] || null,
      q3names: rawRow[`Показатели проекта ${dataYear} Q3`] || rawRow["Показатели проекта Q3"] || null,
      q3plans: rawRow[`План Показатели проекта ${dataYear} Q3`] || rawRow["План Показатели проекта Q3"] || null,
      q3facts: rawRow[`Факт Показатели проекта ${dataYear} Q3`] || rawRow["Факт Показатели проекта Q3"] || null,
      q4names: rawRow[`Показатели проекта ${dataYear} Q4`] || rawRow["Показатели проекта Q4"] || null,
      q4plans: rawRow[`План Показатели проекта ${dataYear} Q4`] || rawRow["План Показатели проекта Q4"] || null,
      q4facts: rawRow[`Факт Показатели проекта ${dataYear} Q4`] || rawRow["Факт Показатели проекта Q4"] || null,
    },
    _rawMonitoring: {
      plannedNextPcPattern: rawRow["Плановая дата следующего ПК"] || rawRow["Дата начала мониторинга"] || null,
      pcStatusPattern: rawRow["Статус мониторинга ПК"] || null,
      frequencyWeeksRaw: rawRow["Регулярность мониторинга, недель"] || rawRow["Регулярность мониторинга (1 раз в количество недель)"] || null,
      monitoringStartRaw: rawRow["Дата начала мониторинга"] || null,
      lastPcDateRaw: rawRow["Дата последнего ПК"] || rawRow["Дата последнего мониторинга"] || null,
    },
    _rawAnalysisComment: rawRow["Комментарий для анализа"] || "",
    _rawByYear: _rawByYear
  };

  return legacyProj as Project;
}
