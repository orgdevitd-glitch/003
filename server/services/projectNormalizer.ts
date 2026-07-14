import { 
  analyzeSheetColumns, 
  SheetContractAnalysis, 
  BASE_COLUMNS, 
  ALLOWED_STAGES, 
  ALLOWED_KINDS, 
  ALLOWED_PRIORITIES,
  normalizeHeaderName,
  normalizeRowKeys
} from "./dataContract";
import { 
  splitListCell, 
  parseDateCell, 
  parseIntegerCell, 
  parseNumberCell, 
  parsePercentCell, 
  parseUrlCell,
  parseMilestoneWeightCell
} from "./dataParsing";
import { normalizeProjectStage } from "../../src/utils/projectStageStyles";
import { 
  getQuarterPeriod, 
  getQuarterStatus, 
  getApplicableQuarters, 
  DataIssue, 
  ImportValidationReport 
} from "./dataValidation";

export type NormalizedMilestone = {
  id: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  name: string;
  progressPercent: number | null;
  weightPercent: number | null;
  periodStatus: "past" | "current" | "future";
  isApplicableQuarter: boolean;
  sourceColumns: {
    name: string;
    progress: string;
    weight: string;
  };
};

export type NormalizedIndicator = {
  id: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  name: string;
  plan: number | null;
  fact: number | null;
  periodStatus: "past" | "current" | "future";
  isApplicableQuarter: boolean;
  factStatus: "filled" | "empty_future" | "missing_required" | "not_applicable";
  sourceColumns: {
    name: string;
    plan: string;
    fact: string;
  };
};

export type ApplicableQuarter = {
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  startDate: string;
  endDate: string;
  status: "past" | "current" | "future";
  isApplicable: boolean;
};

export type NormalizedProject = {
  id: string;
  projectId: string;
  sourceRowIndex: number;

  baseInfo: {
    title: string;
    goals: string;
    resultImages: string;
    type: "Проект" | "Программа" | string;
    stage: "Планируется" | "В работе" | "На паузе" | "Завершен" | string;
    priority: 0 | 1 | 2 | null;
    startDate: string | null;
    endDate: string | null;
  };

  people: {
    projectManager: string | null;
    projectAdmin: string | null;
    customers: string[];
    team: string[];
    responsible: string | null;
    owner: string | null;
    monitoringParticipants: string[];
  };

  organization: {
    departments: string[];
  };

  monitoring: {
    startDate: string | null;
    regularityWeeks: number | null;
    lastMonitoringDate: string | null;
    nextMonitoringDate: string | null;
    isMonitoringOverdue: boolean | null;
  };

  links: {
    bitrixUrl: string | null;
  };

  milestones: NormalizedMilestone[];

  indicators: NormalizedIndicator[];

  applicableQuarters: ApplicableQuarter[];

  dataQuality: {
    status: "ok" | "warning" | "error";
    errorsCount: number;
    warningsCount: number;
    issues: DataIssue[];
  };

  source: {
    rawRow: Record<string, unknown>;
    detectedYears: number[];
  };
};

export interface NormalizationContext {
  assessmentDate?: Date;
  detectedYears?: number[];
  columnAnalysis?: SheetContractAnalysis;
  validationReport?: ImportValidationReport;
}

/**
 * Normalizes a single project row from Google Sheets CSV structure
 */
export function normalizeProjectRow(
  rawRow: Record<string, string>,
  sourceRowIndex: number, // 2-based typically
  context: NormalizationContext
): NormalizedProject {
  const row = normalizeRowKeys(rawRow);
  const assessmentDate = context.assessmentDate || new Date();
  
  // Resolve columns and table structures
  const columns = context.columnAnalysis || analyzeSheetColumns(Object.keys(row));
  const detectedYears = context.detectedYears || columns.detectedYears;

  // 1. PROJECT ID & NAME
  const rawId = row["ID"] || row["ID проекта"] || row["ИД проекта"] || "";
  const idResult = parseIntegerCell(rawId);
  const projectIdStr = idResult.value !== null ? String(idResult.value) : (String(rawId).trim() || "N/A");

  const title = String(row["Название"] || row["Название проекта"] || "").trim();
  const goals = String(row["Цели проекта"] || row["Цель проекта"] || "").trim();
  const resultImages = String(row["Образы результатов"] || "").trim();
  
  const rawStage = String(row["Стадия"] || row["Стадия проекта"] || "").trim();
  const rawStatus = String(row["Статус"] || row["Статус проекта"] || "").trim();
  const stage = normalizeProjectStage(rawStage, rawStatus);
  const type = String(row["Вид"] || row["Вид проекта"] || "").trim();

  // Priority mapping
  const rawPriority = row["Приоритет"] || "";
  const priorityResult = parseIntegerCell(rawPriority);
  let priority: 0 | 1 | 2 | null = null;
  if (priorityResult.value === 0 || priorityResult.value === 1 || priorityResult.value === 2) {
    priority = priorityResult.value;
  }

  // Dates
  const startDateStr = parseDateCell(row["Дата начала"] || row["Дата начала проекта"] || "").value;
  const endDateStr = parseDateCell(row["Дата завершения"] || row["Дата окончания проекта"] || "").value;

  const startDateObj = startDateStr ? new Date(startDateStr) : null;
  const endDateObj = endDateStr ? new Date(endDateStr) : null;

  // People Lists
  const projectManager = String(row["Руководитель проекта"] || "").trim() || null;
  const projectAdmin = String(row["Администратор проекта"] || "").trim() || null;
  const responsible = String(row["Ответственный"] || "").trim() || null;
  const owner = String(row["Владелец проекта"] || "").trim() || null;

  const customers = splitListCell(row["Заказчики"] || row["Заказчик"] || "").value || [];
  const team = splitListCell(row["Команда проекта"] || "").value || [];
  const monitoringParticipants = splitListCell(row["Обязательные участники Мониторинга"] || "").value || [];

  // Organization
  const departments = splitListCell(row["Департамент"] || "").value || [];

  // Monitoring fields
  const monStartStr = parseDateCell(row["Дата начала мониторинга"] || "").value;
  const monFreqWeeks = parseIntegerCell(row["Регулярность мониторинга (1 раз в количество недель)"] || row["Регулярность мониторинга, недель"] || "").value;
  const monLastStr = parseDateCell(row["Дата последнего мониторинга"] || row["Дата последнего ПК"] || "").value;

  // Calculate next monitoring date and overdue flag
  let nextMonitoringDate: string | null = null;
  let isMonitoringOverdue: boolean | null = null;

  const monLastObj = monLastStr ? new Date(monLastStr) : null;
  const monStartObj = monStartStr ? new Date(monStartStr) : null;

  if (monLastObj && monFreqWeeks && monFreqWeeks > 0) {
    const nextObj = new Date(monLastObj.getTime() + monFreqWeeks * 7 * 24 * 60 * 60 * 1000);
    nextMonitoringDate = nextObj.toISOString().split("T")[0];
    isMonitoringOverdue = assessmentDate.getTime() > nextObj.getTime();
  } else if (!monLastObj && monStartObj) {
    nextMonitoringDate = monStartStr;
    isMonitoringOverdue = assessmentDate.getTime() > monStartObj.getTime();
  }

  // Bitrix url
  const bitrixUrl = parseUrlCell(row["Ссылка на проект"] || "").value;

  // Applicable Quarters Calculations
  const applicableQuartersShort = getApplicableQuarters(startDateObj, endDateObj, detectedYears);
  
  const applicableQuarters: ApplicableQuarter[] = [];
  for (const yr of detectedYears) {
    for (const qtr of ["Q1", "Q2", "Q3", "Q4"] as const) {
      const { start, end } = getQuarterPeriod(yr, qtr);
      const qStatus = getQuarterStatus(yr, qtr, assessmentDate);
      const isApplicable = applicableQuartersShort.some(aq => aq.year === yr && aq.quarter === qtr);

      applicableQuarters.push({
        year: yr,
        quarter: qtr,
        startDate: start.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
        status: qStatus,
        isApplicable
      });
    }
  }

  // Milestones normalized
  const milestones: NormalizedMilestone[] = [];
  for (const yr of detectedYears) {
    for (const qtr of ["Q1", "Q2", "Q3", "Q4"] as const) {
      const qKey = `${yr} ${qtr}`;
      const group = columns.quarterGroups[qKey] || {};

      const mColName = group.milestonesCol || `Вехи ${yr} ${qtr}`;
      const pColName = group.progressCol || `% выполнения Вехи ${yr} ${qtr}`;
      const wColName = group.weightCol || `Вес вехи ${yr} ${qtr}`;

      const mRaw = row[mColName] || "";
      const pRaw = row[pColName] || "";
      const wRaw = row[wColName] || "";

      if (mRaw.trim()) {
        const mItems = splitListCell(mRaw, { preserveEmpty: true }).value || [];
        const pItems = splitListCell(pRaw, { preserveEmpty: true }).value || [];
        const wItems = splitListCell(wRaw, { preserveEmpty: true }).value || [];

        mItems.forEach((mName, mIdx) => {
          const pStr = pItems[mIdx] || "";
          const wStr = wItems[mIdx] || "";

          const pVal = parsePercentCell(pStr).value;
          const wVal = parseMilestoneWeightCell(wStr).value;

          const periodStatus = getQuarterStatus(yr, qtr, assessmentDate);
          const isApplicableQuarter = applicableQuartersShort.some(aq => aq.year === yr && aq.quarter === qtr);

          milestones.push({
            id: `M-${projectIdStr}-${yr}-${qtr}-${mIdx + 1}`,
            year: yr,
            quarter: qtr as "Q1" | "Q2" | "Q3" | "Q4",
            name: mName,
            progressPercent: pVal,
            weightPercent: wVal,
            periodStatus,
            isApplicableQuarter,
            sourceColumns: {
              name: mColName,
              progress: pColName,
              weight: wColName
            }
          });
        });
      }
    }
  }

  // Indicators normalized
  const indicators: NormalizedIndicator[] = [];
  for (const yr of detectedYears) {
    for (const qtr of ["Q1", "Q2", "Q3", "Q4"] as const) {
      const qKey = `${yr} ${qtr}`;
      const group = columns.quarterGroups[qKey] || {};

      const iColName = group.indicatorsCol || `Показатели проекта ${yr} ${qtr}`;
      const plColName = group.planCol || `План Показатели проекта ${yr} ${qtr}`;
      const fColName = group.factCol || `Факт Показатели проекта ${yr} ${qtr}`;

      const iRaw = row[iColName] || "";
      const plRaw = row[plColName] || "";
      const fRaw = row[fColName] || "";

      if (iRaw.trim()) {
        const iItems = splitListCell(iRaw, { preserveEmpty: true }).value || [];
        const plItems = splitListCell(plRaw, { preserveEmpty: true }).value || [];
        const fItems = splitListCell(fRaw, { preserveEmpty: true }).value || [];

        iItems.forEach((iName, iIdx) => {
          const plStr = plItems[iIdx] || "";
          const fStr = fItems[iIdx] || "";

          const plVal = parseNumberCell(plStr).value;
          const fVal = parseNumberCell(fStr).value;

          const periodStatus = getQuarterStatus(yr, qtr, assessmentDate);
          const isApplicableQuarter = applicableQuartersShort.some(aq => aq.year === yr && aq.quarter === qtr);

          // factStatus determination rule
          let factStatus: "filled" | "empty_future" | "missing_required" | "not_applicable" = "not_applicable";
          if (!isApplicableQuarter) {
            factStatus = "not_applicable";
          } else if (fVal !== null) {
            factStatus = "filled";
          } else {
            if (periodStatus === "future") {
              factStatus = "empty_future";
            } else if (periodStatus === "past") {
              factStatus = "missing_required";
            } else {
              // current period
              const isProjectActive = stage === "В работе";
              const isProjectStarted = startDateObj && startDateObj.getTime() <= assessmentDate.getTime();
              if (isProjectActive && isProjectStarted) {
                factStatus = "missing_required";
              } else {
                factStatus = "empty_future";
              }
            }
          }

          indicators.push({
            id: `IND-${projectIdStr}-${yr}-${qtr}-${iIdx + 1}`,
            year: yr,
            quarter: qtr as "Q1" | "Q2" | "Q3" | "Q4",
            name: iName,
            plan: plVal,
            fact: fVal,
            periodStatus,
            isApplicableQuarter,
            factStatus,
            sourceColumns: {
              name: iColName,
              plan: plColName,
              fact: fColName
            }
          });
        });
      }
    }
  }

  // Row relative issues list
  const issues = context.validationReport
    ? context.validationReport.issues.filter(iss => iss.rowIndex === sourceRowIndex)
    : [];

  const errorsCount = issues.filter(iss => iss.severity === "error").length;
  const warningsCount = issues.filter(iss => iss.severity === "warning").length;
  
  let status: "ok" | "warning" | "error" = "ok";
  if (errorsCount > 0) {
    status = "error";
  } else if (warningsCount > 0) {
    status = "warning";
  }

  const dataQuality = {
    status,
    errorsCount,
    warningsCount,
    issues
  };

  const castRow = row as unknown as Record<string, unknown>;

  return {
    id: projectIdStr,
    projectId: projectIdStr,
    sourceRowIndex,
    baseInfo: {
      title,
      goals,
      resultImages,
      type,
      stage,
      priority,
      startDate: startDateStr,
      endDate: endDateStr
    },
    people: {
      projectManager,
      projectAdmin,
      customers,
      team,
      responsible,
      owner,
      monitoringParticipants
    },
    organization: {
      departments
    },
    monitoring: {
      startDate: monStartStr,
      regularityWeeks: monFreqWeeks,
      lastMonitoringDate: monLastStr,
      nextMonitoringDate,
      isMonitoringOverdue
    },
    links: {
      bitrixUrl
    },
    milestones,
    indicators,
    applicableQuarters,
    dataQuality,
    source: {
      rawRow: castRow,
      detectedYears
    }
  };
}

/**
 * Normalizes an array of raw project rows
 */
export function normalizeProjectRows(
  rawRows: Record<string, string>[],
  context: NormalizationContext
): NormalizedProject[] {
  const rawHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const rows = (rawRows || []).map(row => normalizeRowKeys(row, rawHeaders));
  const assessmentDate = context.assessmentDate || new Date();
  
  // Resolve unified structures for speed
  const sampleRowKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const columnAnalysis = context.columnAnalysis || analyzeSheetColumns(sampleRowKeys);
  const detectedYears = context.detectedYears || columnAnalysis.detectedYears;

  const validContext: NormalizationContext = {
    assessmentDate,
    columnAnalysis,
    detectedYears,
    validationReport: context.validationReport
  };

  const normalized = rows.map((row, idx) => {
    const rowIndex = idx + 2; // Assuming row 1 is header
    return normalizeProjectRow(row, rowIndex, validContext);
  });

  // Logging normalization stats as requested
  const totalMilestones = normalized.reduce((acc, p) => acc + p.milestones.length, 0);
  const totalIndicators = normalized.reduce((acc, p) => acc + p.indicators.length, 0);

  console.log(`[Normalizer Log]
  - Количество нормализованных проектов: ${normalized.length}
  - Количество вех: ${totalMilestones}
  - Количество показателей: ${totalIndicators}
  - Найденные годы: ${JSON.stringify(detectedYears)}
  - Дата оценки: ${assessmentDate.toISOString()}`);

  return normalized;
}
