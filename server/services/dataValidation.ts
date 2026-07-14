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
  isEmptyWeightValue,
  ParseResult 
} from "./dataParsing";
import { normalizeProjectStage } from "../../src/utils/projectStageStyles";

export interface DataIssue {
  severity: "error" | "warning";
  rowIndex: number; // 1-based index (e.g. excel row line)
  projectId: string;
  projectName: string;
  field: string;
  code: string;
  message: string;
}

export interface ProjectRowValidationResult {
  isValid: boolean;
  projectId: string;
  projectName: string;
  issues: DataIssue[];
  logicalEmpties: { field: string; message: string }[];
}

export interface ImportValidationReport {
  structureStatus: "ok" | "warning" | "error";
  rowCount: number;
  projectCount: number;
  errorsCount: number;
  warningsCount: number;
  issues: DataIssue[];
  columnAnalysis: SheetContractAnalysis;
  rowsWithErrors: number[];    // 1-based row indices
  rowsWithWarnings: number[];  // 1-based row indices
  detectedYears: number[];
  assessmentDate: string;      // ISO string
}

export interface ValidationContext {
  assessmentDate: Date;
  detectedYears: number[];
  columnAnalysis: SheetContractAnalysis;
}

/**
 * Returns quarter start and end dates
 */
export function getQuarterPeriod(year: number, quarter: string): { start: Date; end: Date } {
  const qClean = quarter.toUpperCase();
  let startMonth = 0;
  let endMonth = 2;
  let endDay = 31;

  if (qClean === "Q2") {
    startMonth = 3;
    endMonth = 5;
    endDay = 30;
  } else if (qClean === "Q3") {
    startMonth = 6;
    endMonth = 8;
    endDay = 30;
  } else if (qClean === "Q4") {
    startMonth = 9;
    endMonth = 11;
    endDay = 31;
  }

  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, endMonth, endDay, 23, 59, 59, 999));
  
  return { start, end };
}

/**
 * Computes status of a quarter relative to reference date
 */
export function getQuarterStatus(year: number, quarter: string, assessmentDate: Date): "past" | "current" | "future" {
  const { start, end } = getQuarterPeriod(year, quarter);
  if (assessmentDate.getTime() < start.getTime()) {
    return "future";
  }
  if (assessmentDate.getTime() > end.getTime()) {
    return "past";
  }
  return "current";
}

/**
 * Checks if a quarter overlaps with project date range
 */
export function getApplicableQuarters(
  startDate: Date | null,
  endDate: Date | null,
  detectedYears: number[]
): { year: number; quarter: string }[] {
  if (!startDate) {
    return [];
  }

  const applicable: { year: number; quarter: string }[] = [];
  const quarters = ["Q1", "Q2", "Q3", "Q4"];

  for (const year of detectedYears) {
    for (const quarter of quarters) {
      const { start, end } = getQuarterPeriod(year, quarter);

      // Start of project is not after end of quarter
      const startCondition = startDate.getTime() <= end.getTime();
      
      // End of project is not before start of quarter
      let endCondition = true;
      if (endDate) {
        endCondition = endDate.getTime() >= start.getTime();
      }

      if (startCondition && endCondition) {
        applicable.push({ year, quarter });
      }
    }
  }

  return applicable;
}

/**
 * Validates a single project row
 */
export function validateProjectRow(
  rawRow: Record<string, string>,
  rowIndex: number, // 1-based
  context: ValidationContext
): ProjectRowValidationResult {
  const row = normalizeRowKeys(rawRow);
  const issues: DataIssue[] = [];
  const logicalEmpties: { field: string; message: string }[] = [];
  const assessmentDate = context.assessmentDate;

  // 1. PROJECT ID & NAME (vital fields)
  // Let's resolve the ID column in the row
  const rawId = row["ID"] || row["ID проекта"] || row["ИД проекта"] || "";
  const rawName = row["Название"] || row["Название проекта"] || "";

  let projectIdStr = String(rawId).trim();
  let projectNameStr = String(rawName).trim();

  // Parse ID
  let parsedIdNum: number | null = null;
  if (!projectIdStr) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: "N/A",
      projectName: projectNameStr || "Без названия",
      field: "ID",
      code: "ID_MISSING",
      message: "ID проекта отсутствует"
    });
  } else {
    const idResult = parseIntegerCell(projectIdStr);
    if (idResult.status === "error" || idResult.value === null) {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: projectIdStr,
        projectName: projectNameStr || "Без названия",
        field: "ID",
        code: "ID_INVALID_FORMAT",
        message: `ID должен быть положительным целым числом. Найдено: "${projectIdStr}"`
      });
    } else if (idResult.value <= 0) {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: projectIdStr,
        projectName: projectNameStr || "Без названия",
        field: "ID",
        code: "ID_NOT_POSITIVE",
        message: `ID должен быть положительным целым числом. Найдено: ${idResult.value}`
      });
    } else {
      parsedIdNum = idResult.value;
    }
  }

  const displayProjectId = parsedIdNum !== null ? String(parsedIdNum) : (projectIdStr || "N/A");

  // Parse Name
  if (!projectNameStr) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: "Без названия",
      field: "Название",
      code: "NAME_MISSING",
      message: "Название проекта отсутствует"
    });
  }

  // 2. CORE FIELDS
  const rawGoals = row["Цели проекта"] || row["Цель проекта"] || "";
  if (!rawGoals.trim()) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Цели проекта",
      code: "GOALS_MISSING",
      message: "Цели проекта не заполнены"
    });
  }

  const rawOutcomes = row["Образы результатов"] || "";
  if (!rawOutcomes.trim()) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Образы результатов",
      code: "OUTCOMES_MISSING",
      message: "Образы результатов не заполнены"
    });
  }

  // 3. DATES PARSING & CHECKS
  const rawStartDate = row["Дата начала"] || row["Дата начала проекта"] || "";
  const rawEndDate = row["Дата завершения"] || row["Дата окончания проекта"] || "";

  const startDateResult = parseDateCell(rawStartDate);
  const endDateResult = parseDateCell(rawEndDate);

  let startDateObj: Date | null = null;
  let endDateObj: Date | null = null;

  if (startDateResult.status === "error" || !startDateResult.value) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Дата начала",
      code: "START_DATE_INVALID",
      message: startDateResult.errors[0] || "Дата начала отсутствует или не заполнена корректно"
    });
  } else {
    startDateObj = new Date(startDateResult.value);
  }

  if (endDateResult.status === "error" || !endDateResult.value) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Дата завершения",
      code: "END_DATE_INVALID",
      message: endDateResult.errors[0] || "Дата завершения отсутствует или не заполнена корректно"
    });
  } else {
    endDateObj = new Date(endDateResult.value);
  }

  if (startDateObj && endDateObj) {
    if (endDateObj.getTime() < startDateObj.getTime()) {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Дата завершения",
        code: "END_DATE_BEFORE_START",
        message: `Дата завершения (${rawEndDate}) не может быть раньше даты начала (${rawStartDate})`
      });
    }
  }

  const projectStarted = startDateObj && startDateObj.getTime() <= assessmentDate.getTime();

  // 4. STATUTORY DIRECTORIES
  const rawStage = row["Стадия"] || row["Стадия проекта"] || "";
  const cleanStage = rawStage.trim();
  const normalizedStage = normalizeProjectStage(cleanStage);
  if (!cleanStage) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Стадия",
      code: "STAGE_MISSING",
      message: "Стадия проекта не заполнена"
    });
  } else if (!ALLOWED_STAGES.includes(normalizedStage as any)) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Стадия",
      code: "STAGE_INVALID",
      message: `Недопустимая стадия "${rawStage}". Допустимые значения: ${ALLOWED_STAGES.join(", ")}`
    });
  }

  const rawKind = row["Вид"] || row["Вид проекта"] || "";
  const cleanKind = rawKind.trim();
  if (!cleanKind) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Вид",
      code: "KIND_MISSING",
      message: "Вид проекта не заполнен"
    });
  } else if (!ALLOWED_KINDS.includes(cleanKind as any)) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Вид",
      code: "KIND_INVALID",
      message: `Недопустимый вид "${rawKind}". Допустимые значения: ${ALLOWED_KINDS.join(", ")}`
    });
  }

  const rawPriority = row["Приоритет"] || "";
  const cleanPriority = rawPriority.trim();
  if (!cleanPriority) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Приоритет",
      code: "PRIORITY_MISSING",
      message: "Приоритет не заполнен"
    });
  } else if (!ALLOWED_PRIORITIES.includes(cleanPriority as any)) {
    issues.push({
      severity: "error",
      rowIndex,
      projectId: displayProjectId,
      projectName: projectNameStr,
      field: "Приоритет",
      code: "PRIORITY_INVALID",
      message: `Недопустимый приоритет "${rawPriority}". Допустимые значения: ${ALLOWED_PRIORITIES.join(", ")}`
    });
  }

  const rawUrl = row["Ссылка на проект"] || "";
  if (rawUrl.trim()) {
    const urlResult = parseUrlCell(rawUrl);
    if (urlResult.status === "error") {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Ссылка на проект",
        code: "URL_INVALID",
        message: urlResult.errors[0]
      });
    }
  }

  // 5. STAGE COMPLIANCE RELATIVE TO ASSESSMENT BOUNDARY DATE
  if (startDateObj && ALLOWED_STAGES.includes(normalizedStage as any)) {
    const startMs = startDateObj.getTime();
    const assessMs = assessmentDate.getTime();

    if (normalizedStage === "Планируется") {
      if (startMs <= assessMs) {
        issues.push({
          severity: "warning",
          rowIndex,
          projectId: displayProjectId,
          projectName: projectNameStr,
          field: "Стадия",
          code: "STAGE_PLANNING_DATE_PAST",
          message: `Для стадии "Планируется" дата начала должно быть в будущем относительно даты оценки (${assessmentDate.toLocaleDateString("ru-RU")})`
        });
      }
    } else if (normalizedStage === "В работе") {
      if (startMs > assessMs) {
        issues.push({
          severity: "warning",
          rowIndex,
          projectId: displayProjectId,
          projectName: projectNameStr,
          field: "Стадия",
          code: "STAGE_ACTIVE_DATE_FUTURE",
          message: `Для стадии "В работе" дата начала должна быть не позже даты оценки (${assessmentDate.toLocaleDateString("ru-RU")})`
        });
      }
      if (endDateObj && endDateObj.getTime() < assessMs) {
        issues.push({
          severity: "warning",
          rowIndex,
          projectId: displayProjectId,
          projectName: projectNameStr,
          field: "Стадия",
          code: "STAGE_ACTIVE_DATE_EXPIRED",
          message: `Для стадии "В работе" дата завершения (${rawEndDate}) не должна быть в прошлом относительно даты оценки`
        });
      }
    } else if (normalizedStage === "На паузе") {
      if (startMs > assessMs) {
        issues.push({
          severity: "warning",
          rowIndex,
          projectId: displayProjectId,
          projectName: projectNameStr,
          field: "Стадия",
          code: "STAGE_PAUSE_DATE_FUTURE",
          message: `Для стадии "На паузе" дата начала должна быть не позже даты оценки`
        });
      }
    } else if (normalizedStage === "Завершен") {
      if (endDateObj && endDateObj.getTime() > assessMs) {
        issues.push({
          severity: "warning",
          rowIndex,
          projectId: displayProjectId,
          projectName: projectNameStr,
          field: "Стадия",
          code: "STAGE_COMPLETED_DATE_FUTURE",
          message: `Для стадии "Завершен" дата завершения должна быть не позже даты оценки`
        });
      }
    }
  }

  // 6. MONITORING CONTROLS
  const rawMonStart = row["Дата начала мониторинга"] || "";
  const monStartResult = parseDateCell(rawMonStart);
  let monStartObj: Date | null = null;

  if (rawMonStart.trim()) {
    if (monStartResult.status === "error") {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Дата начала мониторинга",
        code: "MONITORING_START_INVALID",
        message: monStartResult.errors[0]
      });
    } else if (monStartResult.value) {
      monStartObj = new Date(monStartResult.value);
    }
  }

  const rawMonFreq = row["Регулярность мониторинга (1 раз в количество недель)"] || row["Регулярность мониторинга, недель"] || "";
  if (rawMonFreq.trim()) {
    const monFreqResult = parseIntegerCell(rawMonFreq);
    if (monFreqResult.status === "error" || monFreqResult.value === null) {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Регулярность мониторинга",
        code: "MONITORING_FREQUENCY_INVALID",
        message: `Регулярность мониторинга должна быть положительным целым числом. Найдено: "${rawMonFreq}"`
      });
    } else if (monFreqResult.value <= 0) {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Регулярность мониторинга",
        code: "MONITORING_FREQUENCY_NOT_POSITIVE",
        message: `Регулярность мониторинга должна быть положительным числом (> 0). Найдено: ${monFreqResult.value}`
      });
    }
  }

  const rawMonLast = row["Дата последнего мониторинга"] || row["Дата последнего ПК"] || "";
  const monLastResult = parseDateCell(rawMonLast);
  let monLastObj: Date | null = null;

  if (rawMonLast.trim()) {
    if (monLastResult.status === "error") {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Дата последнего мониторинга",
        code: "LAST_MONITORING_DATE_INVALID",
        message: monLastResult.errors[0]
      });
    } else if (monLastResult.value) {
      monLastObj = new Date(monLastResult.value);
    }
  }

  // Validation checks for last monitoring date based on applicability
  const monFreqParsed = parseIntegerCell(rawMonFreq);
  const monFreqValid = rawMonFreq.trim() !== "" && monFreqParsed.status !== "error" && monFreqParsed.value !== null && monFreqParsed.value > 0;
  const monStartValid = monStartObj !== null;

  let isLastPcApplicable = false;
  if (monStartValid && monFreqValid) {
    const monStartMidnight = new Date(Date.UTC(monStartObj!.getFullYear(), monStartObj!.getMonth(), monStartObj!.getDate(), 0, 0, 0, 0));
    const assessmentMidnight = new Date(Date.UTC(assessmentDate.getFullYear(), assessmentDate.getMonth(), assessmentDate.getDate(), 0, 0, 0, 0));

    if (monStartMidnight.getTime() <= assessmentMidnight.getTime()) {
      const regularityWeeks = monFreqParsed.value!;
      const firstPlannedPcMidnight = new Date(monStartMidnight.getTime() + regularityWeeks * 7 * 24 * 60 * 60 * 1000);
      if (assessmentMidnight.getTime() >= firstPlannedPcMidnight.getTime()) {
        isLastPcApplicable = true;
      }
    }
  }

  if (isLastPcApplicable) {
    const isMissingOrInvalid = !rawMonLast.trim() || monLastResult.status === "error";
    if (isMissingOrInvalid) {
      issues.push({
        severity: "warning",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Дата последнего мониторинга",
        code: "LAST_MONITORING_DATE_MISSING",
        message: "Дата последнего мониторинга отсутствует, хотя первый плановый ПК уже должен был пройти"
      });
    }
  } else {
    // If last PC is not applicable (e.g. project hasn't started yet or first PC is in the future),
    // last monitoring date can be empty
    if (!rawMonLast.trim()) {
      logicalEmpties.push({
        field: "Дата последнего мониторинга",
        message: "Проект еще не начался или первый плановый ПК еще не должен был пройти, дата последнего мониторинга может отсутствовать"
      });
    }
  }

  if (monLastObj) {
    if (monStartObj && monLastObj.getTime() < monStartObj.getTime()) {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Дата последнего мониторинга",
        code: "LAST_MON_BEFORE_MON_START",
        message: `Дата последнего мониторинга (${rawMonLast}) не может быть раньше даты начала мониторинга (${rawMonStart})`
      });
    }
    if (monLastObj.getTime() > assessmentDate.getTime()) {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Дата последнего мониторинга",
        code: "LAST_MON_IN_FUTURE",
        message: `Дата последнего мониторинга (${rawMonLast}) не может быть позже текущей даты оценки`
      });
    }
  }

  // 7. QUARTERLY APPLICABILITY
  const applicableQuarters = getApplicableQuarters(startDateObj, endDateObj, context.detectedYears);

  // Collect all milestones weights to sum later
  let hasAnyMilestonesOverall = false;
  let totalMilestonesWeightSum = 0;

  // Let's iterate over ALL detected years and quarters
  const quartersList = ["Q1", "Q2", "Q3", "Q4"];
  for (const year of context.detectedYears) {
    for (const quarter of quartersList) {
      const qKey = `${year} ${quarter}`;
      const isApplicable = applicableQuarters.some(aq => aq.year === year && aq.quarter === quarter);
      const qStatus = getQuarterStatus(year, quarter, assessmentDate);

      // We resolve column names using columnAnalysis
      const companions = context.columnAnalysis.quarterGroups[qKey] || {};

      // A. Milestones
      const mCol = companions.milestonesCol ? row[companions.milestonesCol] : "";
      const pCol = companions.progressCol ? row[companions.progressCol] : "";
      const wCol = companions.weightCol ? row[companions.weightCol] : "";

      const milestonesParsed = splitListCell(mCol, { preserveEmpty: true });
      const progressParsed = splitListCell(pCol, { preserveEmpty: true });
      const weightsParsed = splitListCell(wCol, { preserveEmpty: true });

      const mCount = milestonesParsed.value ? milestonesParsed.value.length : 0;
      const pCount = progressParsed.value ? progressParsed.value.length : 0;
      const wCount = weightsParsed.value ? weightsParsed.value.length : 0;

      // Handle warnings on list separation
      if (milestonesParsed.status === "warning") {
        issues.push({
          severity: "warning",
          rowIndex,
          projectId: displayProjectId,
          projectName: projectNameStr,
          field: companions.milestonesCol || `Вехи ${year} ${quarter}`,
          code: "LIST_FORMAT_SEPARATOR_WARNING",
          message: `${companions.milestonesCol}: ${milestonesParsed.warnings[0]}`
        });
      }

      const hasMilestonesFilled = mCol && mCol.trim().length > 0;
      const hasProgressFilled = pCol && pCol.trim().length > 0;
      const hasWeightFilled = wCol && wCol.trim().length > 0;

      if (isApplicable) {
        if (hasMilestonesFilled) {
          hasAnyMilestonesOverall = true;

          // 1) Verify presence of progress
          if (!hasProgressFilled) {
            issues.push({
              severity: "error",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.progressCol || `% выполнения Вехи ${year} ${quarter}`,
              code: "MILESTONE_PROGRESS_MISSING",
              message: `Для вех ${qKey} не указан % выполнения`
            });
          }

          // 2) Verify matching counts
          if (hasProgressFilled && mCount !== pCount) {
            issues.push({
              severity: "error",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.progressCol || `% выполнения Вехи ${year} ${quarter}`,
              code: "MILESTONE_PROGRESS_COUNT_MISMATCH",
              message: `Количество вех (${mCount}) не совпадает с количеством значений % выполнения (${pCount}) в ${qKey}`
            });
          }
          if (hasWeightFilled && wCount > mCount) {
            issues.push({
              severity: "error",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.weightCol || `Вес вехи ${year} ${quarter}`,
              code: "MILESTONE_WEIGHT_COUNT_MISMATCH",
              message: `Количество весов вехи (${wCount}) больше количества вех (${mCount}) в ${qKey}`
            });
          } else if (hasWeightFilled && wCount < mCount) {
            issues.push({
              severity: "warning",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.weightCol || `Вес вехи ${year} ${quarter}`,
              code: "MILESTONE_WEIGHT_COUNT_MISMATCH",
              message: `Количество весов вехи (${wCount}) меньше количества вех (${mCount}) в ${qKey}. Недостающие веса считаются пустыми.`
            });
          }

          // 3) Parse and sum weights
          if (hasWeightFilled) {
            weightsParsed.value.forEach((elementRaw, elIdx) => {
              if (isEmptyWeightValue(elementRaw)) {
                return;
              }
              const weightParseResult = parsePercentCell(elementRaw);
              if (weightParseResult.status === "error" || weightParseResult.value === null) {
                issues.push({
                  severity: "error",
                  rowIndex,
                  projectId: displayProjectId,
                  projectName: projectNameStr,
                  field: companions.weightCol || `Вес вехи ${year} ${quarter}`,
                  code: "MILESTONE_WEIGHT_INVALID",
                  message: `Недопустимый формат веса вехи "${elementRaw}" в ${qKey}`
                });
              } else {
                const wVal = weightParseResult.value;
                if (wVal < 0 || wVal > 100) {
                  issues.push({
                    severity: "error",
                    rowIndex,
                    projectId: displayProjectId,
                    projectName: projectNameStr,
                    field: companions.weightCol || `Вес вехи ${year} ${quarter}`,
                    code: "MILESTONE_WEIGHT_OUT_OF_BOUNDS",
                    message: `Вес вехи не должен выходить за допустимые рамки. Найдено: ${wVal}% в ${qKey}`
                  });
                } else if (wVal > 0) {
                  totalMilestonesWeightSum += wVal;
                }
              }
            });
          }

          // 4) Parse and validate progress
          if (hasProgressFilled) {
            progressParsed.value.forEach((elementRaw) => {
              const progParseResult = parsePercentCell(elementRaw);
              if (progParseResult.status === "error" || progParseResult.value === null) {
                issues.push({
                  severity: "error",
                  rowIndex,
                  projectId: displayProjectId,
                  projectName: projectNameStr,
                  field: companions.progressCol || `% выполнения Вехи ${year} ${quarter}`,
                  code: "MILESTONE_PROGRESS_INVALID",
                  message: `Недопустимый формат % выполнения "${elementRaw}" в ${qKey}`
                });
              } else {
                const pVal = progParseResult.value;
                if (pVal < 0 || pVal > 100) {
                  issues.push({
                    severity: "error",
                    rowIndex,
                    projectId: displayProjectId,
                    projectName: projectNameStr,
                    field: companions.progressCol || `% выполнения Вехи ${year} ${quarter}`,
                    code: "MILESTONE_PROGRESS_OUT_OF_BOUNDS",
                    message: `% выполнения вехи должен быть от 0% до 100%. Найдено: ${pVal}% в ${qKey}`
                  });
                }
              }
            });
          }

        } else {
          // If no milestones, verify other columns are empty
          if (hasProgressFilled) {
            issues.push({
              severity: "error",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.progressCol || `% выполнения Вехи ${year} ${quarter}`,
              code: "PROGRESS_PROVIDED_WITHOUT_MILESTONES",
              message: `% выполнения указан при пустых вехах в ${qKey}`
            });
          }
          if (hasWeightFilled) {
            issues.push({
              severity: "error",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.weightCol || `Вес вехи ${year} ${quarter}`,
              code: "WEIGHT_PROVIDED_WITHOUT_MILESTONES",
              message: `Вес вехи указан при пустых вехах в ${qKey}`
            });
          }

          // Logical completeness verification
          logicalEmpties.push({
            field: companions.milestonesCol || `Вехи ${year} ${quarter}`,
            message: `Вехи пустые в применимом квартале ${qKey}`
          });
        }
      } else {
        // Quarter is NOT applicable
        if (hasMilestonesFilled || hasProgressFilled || hasWeightFilled) {
          issues.push({
            severity: "warning",
            rowIndex,
            projectId: displayProjectId,
            projectName: projectNameStr,
            field: companions.milestonesCol || `Вехи ${year} ${quarter}`,
            code: "QUARTER_DATA_NOT_APPLICABLE",
            message: `Квартал ${qKey} не входит в период проекта, но содержит заполненные вехи или метрики`
          });
        } else {
          // Normal logical emptiness
          logicalEmpties.push({
            field: companions.milestonesCol || `Вехи ${year} ${quarter}`,
            message: `Квартал не входит в период проекта, ячейки пусты`
          });
        }
      }

      // B. Indicators
      const iCol = companions.indicatorsCol ? row[companions.indicatorsCol] : "";
      const plCol = companions.planCol ? row[companions.planCol] : "";
      const fCol = companions.factCol ? row[companions.factCol] : "";

      const indicatorsParsed = splitListCell(iCol, { preserveEmpty: true });
      const plansParsed = splitListCell(plCol, { preserveEmpty: true });
      const factsParsed = splitListCell(fCol, { preserveEmpty: true });

      const iCount = indicatorsParsed.value ? indicatorsParsed.value.length : 0;
      const plCount = plansParsed.value ? plansParsed.value.length : 0;
      const fCount = factsParsed.value ? factsParsed.value.length : 0;

      const hasIndicatorsFilled = iCol && iCol.trim().length > 0;
      const hasPlanFilled = plCol && plCol.trim().length > 0;
      const hasFactFilled = fCol && fCol.trim().length > 0;

      if (isApplicable) {
        if (hasIndicatorsFilled) {
          // 1) Must have plan values
          if (!hasPlanFilled) {
            issues.push({
              severity: "error",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.planCol || `План Показатели проекта ${year} ${quarter}`,
              code: "INDICATOR_PLAN_MISSING",
              message: `Для показателей в ${qKey} не указаны плановые значения`
            });
          } else if (iCount !== plCount) {
            issues.push({
              severity: "error",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.planCol || `План Показатели проекта ${year} ${quarter}`,
              code: "INDICATOR_PLAN_COUNT_MISMATCH",
              message: `Количество показателей (${iCount}) не совпадает с количеством планов (${plCount}) в ${qKey}`
            });
          }

          // Parse plans as numbers
          if (hasPlanFilled) {
            plansParsed.value.forEach((elementRaw) => {
              const numParse = parseNumberCell(elementRaw);
              if (numParse.status === "error") {
                issues.push({
                  severity: "error",
                  rowIndex,
                  projectId: displayProjectId,
                  projectName: projectNameStr,
                  field: companions.planCol || `План Показатели проекта ${year} ${quarter}`,
                  code: "INDICATOR_PLAN_INVALID",
                  message: `Плановое значение "${elementRaw}" должно быть числовым в ${qKey}`
                });
              }
            });
          }

          // 2) Parse facts and verify requirements based on status (past, current, future)
          if (qStatus === "past") {
            if (!hasFactFilled) {
              issues.push({
                severity: "error",
                rowIndex,
                projectId: displayProjectId,
                projectName: projectNameStr,
                field: companions.factCol || `Факт Показатели проекта ${year} ${quarter}`,
                code: "INDICATOR_FACT_PAST_MISSING",
                message: `Для прошедшего периода в ${qKey} отсутствуют фактические значения`
              });
            } else if (iCount !== fCount) {
              issues.push({
                severity: "error",
                rowIndex,
                projectId: displayProjectId,
                projectName: projectNameStr,
                field: companions.factCol || `Факт Показатели проекта ${year} ${quarter}`,
                code: "INDICATOR_FACT_PAST_COUNT_MISMATCH",
                message: `Количество показателей (${iCount}) не совпадает с количеством фактов (${fCount}) в прошедшем периоде ${qKey}`
              });
            }
          } else if (qStatus === "current") {
            // current period fact filling depends on if it already should be monitored
            const shouldMonitorNow = projectStarted && cleanStage === "В работе";
            if (shouldMonitorNow) {
              if (!hasFactFilled) {
                issues.push({
                  severity: "warning",
                  rowIndex,
                  projectId: displayProjectId,
                  projectName: projectNameStr,
                  field: companions.factCol || `Факт Показатели проекта ${year} ${quarter}`,
                  code: "INDICATOR_FACT_CURRENT_MISSING",
                  message: `Для текущего периода в ${qKey} рекомендуется заполнить фактические значения показателей`
                });
              } else if (iCount !== fCount) {
                issues.push({
                  severity: "warning",
                  rowIndex,
                  projectId: displayProjectId,
                  projectName: projectNameStr,
                  field: companions.factCol || `Факт Показатели проекта ${year} ${quarter}`,
                  code: "INDICATOR_FACT_CURRENT_COUNT_MISMATCH",
                  message: `Количество показателей (${iCount}) не совпадает с количеством фактов (${fCount}) в текущем периоде ${qKey}`
                });
              }
            } else {
              // Not actively monitored yet, logical empty is fine
              if (!hasFactFilled) {
                logicalEmpties.push({
                  field: companions.factCol || `Факт Показатели проекта ${year} ${quarter}`,
                  message: `Текущий квартал еще не запущен/не мониторится активно, факт может быть пуст`
                });
              }
            }
          } else {
            // future period: facts may be empty
            if (!hasFactFilled) {
              logicalEmpties.push({
                field: companions.factCol || `Факт Показатели проекта ${year} ${quarter}`,
                message: `Будущий квартал ${qKey}, фактическое значение может отсутствовать`
              });
            } else if (iCount !== fCount) {
              issues.push({
                severity: "error",
                rowIndex,
                projectId: displayProjectId,
                projectName: projectNameStr,
                field: companions.factCol || `Факт Показатели проекта ${year} ${quarter}`,
                code: "INDICATOR_FACT_FUTURE_COUNT_MISMATCH",
                message: `Поскольку факт в будущем периоде ${qKey} был предварительно заполнен, его количество (${fCount}) должно совпадать с числом показателей (${iCount})`
              });
            }
          }

          // Parse any filled facts as numbers
          if (hasFactFilled) {
            factsParsed.value.forEach((elementRaw) => {
              const numParse = parseNumberCell(elementRaw);
              if (numParse.status === "error") {
                issues.push({
                  severity: "error",
                  rowIndex,
                  projectId: displayProjectId,
                  projectName: projectNameStr,
                  field: companions.factCol || `Факт Показатели проекта ${year} ${quarter}`,
                  code: "INDICATOR_FACT_INVALID",
                  message: `Фактическое значение "${elementRaw}" должно быть числовым в ${qKey}`
                });
              }
            });
          }

        } else {
          // If indicators empty, make sure plan and fact are empty too
          if (hasPlanFilled) {
            issues.push({
              severity: "error",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.planCol || `План Показатели проекта ${year} ${quarter}`,
              code: "PLAN_PROVIDED_WITHOUT_INDICATORS",
              message: `Плановые цели заполнены для пустого блока показателей в ${qKey}`
            });
          }
          if (hasFactFilled) {
            issues.push({
              severity: "error",
              rowIndex,
              projectId: displayProjectId,
              projectName: projectNameStr,
              field: companions.factCol || `Факт Показатели проекта ${year} ${quarter}`,
              code: "FACT_PROVIDED_WITHOUT_INDICATORS",
              message: `Фактические значения заполнены для пустого блока показателей в ${qKey}`
            });
          }

          logicalEmpties.push({
            field: companions.indicatorsCol || `Показатели проекта ${year} ${quarter}`,
            message: `Показатели отсутствуют в применимом периоде ${qKey}`
          });
        }
      } else {
        // Quarter is NOT applicable
        if (hasIndicatorsFilled || hasPlanFilled || hasFactFilled) {
          issues.push({
            severity: "warning",
            rowIndex,
            projectId: displayProjectId,
            projectName: projectNameStr,
            field: companions.indicatorsCol || `Показатели проекта ${year} ${quarter}`,
            code: "INDICATOR_DATA_NOT_APPLICABLE",
            message: `Квартал ${qKey} не входит в период проекта, но содержит заполненные показатели или планы/факты`
          });
        }
      }

    } // end quarters
  } // end years

  // 8. OVERALL MILESTONES WEIGHTS SUMS CONTROL
  if (hasAnyMilestonesOverall) {
    if (totalMilestonesWeightSum > 100.01) {
      issues.push({
        severity: "error",
        rowIndex,
        projectId: displayProjectId,
        projectName: projectNameStr,
        field: "Веса вех",
        code: "MILESTONES_TOTAL_WEIGHT_OVER_100",
        message: `Общая сумма заданных весов вех проекта превышает 100%. Найдено: ${totalMilestonesWeightSum}%`
      });
    }
  }

  const isValid = !issues.some(iss => iss.severity === "error");

  return {
    isValid,
    projectId: displayProjectId,
    projectName: projectNameStr,
    issues,
    logicalEmpties
  };
}

/**
 * Validates a batch of rows parsed from a Google Sheet CSV
 */
export function validateProjectRows(
  rawRows: Record<string, string>[],
  rawHeaders: string[],
  context?: Partial<ValidationContext>
): ImportValidationReport {
  const headers = (rawHeaders || []).map((h, idx) => normalizeHeaderName(h, idx));
  const rows = (rawRows || []).map(row => normalizeRowKeys(row, rawHeaders));
  const columnAnalysis = analyzeSheetColumns(headers);

  // default date is current system date
  const assessmentDate = context?.assessmentDate || new Date();
  const detectedYears = context?.detectedYears || columnAnalysis.detectedYears;

  const validContext: ValidationContext = {
    assessmentDate,
    detectedYears,
    columnAnalysis
  };

  const issues: DataIssue[] = [];
  const rowsWithErrorsSet = new Set<number>();
  const rowsWithWarningsSet = new Set<number>();

  const seenIds = new Map<string, number>(); // ID -> 1-based rowIndex

  rows.forEach((row, idx) => {
    const rowIndex = idx + 2; // 1-based, assuming header is row 1
    
    // Resolve project ID column
    const rawId = row["ID"] || row["ID проекта"] || row["ИД проекта"] || "";
    const cleanId = String(rawId).trim();

    // Check duplicate ID
    if (cleanId) {
      if (seenIds.has(cleanId)) {
        const firstSeenRow = seenIds.get(cleanId)!;
        issues.push({
          severity: "error",
          rowIndex,
          projectId: cleanId,
          projectName: row["Название"] || row["Название проекта"] || "Без названия",
          field: "ID",
          code: "DUPLICATE_ID",
          message: `Дублирование уникального ID проекта: "${cleanId}" ранее найден во 2-й строчке файла (индекс строки: ${firstSeenRow})`
        });
        rowsWithErrorsSet.add(rowIndex);
      } else {
        seenIds.set(cleanId, rowIndex);
      }
    }

    const rowValResult = validateProjectRow(row, rowIndex, validContext);
    
    issues.push(...rowValResult.issues);

    rowValResult.issues.forEach(iss => {
      if (iss.severity === "error") {
        rowsWithErrorsSet.add(rowIndex);
      } else if (iss.severity === "warning") {
        rowsWithWarningsSet.add(rowIndex);
      }
    });
  });

  const errorsCount = issues.filter(iss => iss.severity === "error").length;
  const warningsCount = issues.filter(iss => iss.severity === "warning").length;

  return {
    structureStatus: columnAnalysis.structureStatus,
    rowCount: rows.length,
    projectCount: seenIds.size,
    errorsCount,
    warningsCount,
    issues,
    columnAnalysis,
    rowsWithErrors: Array.from(rowsWithErrorsSet).sort((a,b) => a - b),
    rowsWithWarnings: Array.from(rowsWithWarningsSet).sort((a,b) => a - b),
    detectedYears,
    assessmentDate: assessmentDate.toISOString()
  };
}
