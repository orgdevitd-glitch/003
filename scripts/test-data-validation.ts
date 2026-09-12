import { analyzeSheetColumns, BASE_COLUMNS } from "../server/services/dataContract";
import { 
  splitListCell, 
  parseDateCell, 
  parseIntegerCell, 
  parsePercentCell, 
  parseUrlCell 
} from "../server/services/dataParsing";
import { 
  validateProjectRows, 
  getQuarterStatus, 
  getQuarterPeriod,
  getApplicableQuarters
} from "../server/services/dataValidation";

function runTest(name: string, fn: () => void) {
  console.log(`[TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function assertDeepEqual(a: any, b: any, msg: string) {
  const strA = JSON.stringify(a);
  const strB = JSON.stringify(b);
  if (strA !== strB) {
    throw new Error(`Assertion failed: ${msg}.\nExpected: ${strB}\nReceived: ${strA}`);
  }
}

// 1. Run Column Analysis Checks
runTest("Column Analysis Test", () => {
  const mockHeaders = [
    "ID", "Название", "Цели проекта", "Образы результатов", "Дата начала", "Дата завершения",
    "Стадия", "Вид", "Руководитель проекта", "Администратор проекта", "Заказчики",
    "Команда проекта", "Приоритет", "Ответственный", "Дата начала мониторинга",
    "Регулярность мониторинга (1 раз в количество недель)", "Дата последнего мониторинга",
    "Обязательные участники Мониторинга", "Владелец проекта", "Департамент", "Ссылка на проект",
    "Вехи 2026 Q1", "% выполнения Вехи 2026 Q1", "Вес вехи 2026 Q1",
    "Показатели проекта 2026 Q1", "План Показатели проекта 2026 Q1", "Факт Показатели проекта 2026 Q1",
    "Случайная Колонка"
  ];

  const res = analyzeSheetColumns(mockHeaders);
  assert(res.structureStatus === "ok", "mockHeaders should have ok structureStatus");
  assertDeepEqual(res.missingBaseColumns, [], "No base columns should be missing");
  assertDeepEqual(res.detectedYears, [2026], "Should detect 2026");
  assertDeepEqual(res.detectedQuarters, ["2026 Q1"], "Should detect 2026 Q1");
  assert(res.unknownColumns.includes("Случайная Колонка"), "Should identify unknownColumns");
});

runTest("Missing Base Column Test", () => {
  const incompleteHeaders = ["ID", "Название", "Стадия"];
  const res = analyzeSheetColumns(incompleteHeaders);
  assert(res.structureStatus === "error" || res.structureStatus === "warning", "Status should not be ok");
  assert(res.missingBaseColumns.includes("Цели проекта"), "Should identify missing base columns");
});

// 2. Parser Unit Tests
runTest("List Parser splitListCell", () => {
  const r1 = splitListCell("Item 1; Item 2; ");
  assertDeepEqual(r1.value, ["Item 1", "Item 2"], "Should trim and ignore empty space");
  assert(r1.status === "success", "Standard semicolon list should succeed");

  const r2 = splitListCell("Item 1, Item 2, Item 3");
  assert(r2.status === "warning", "List with commas but no semicolons should return warning");
});

runTest("Date Parser parseDateCell", () => {
  const r1 = parseDateCell("04.06.2026");
  assert(r1.value === "2026-06-04", "Should map correctly to ISO format");
  assert(r1.status === "success", "Valid date should succeed");

  const r2 = parseDateCell("32.13.2026");
  assert(r2.status === "error", "Invalid day or month should fail");

  const r3 = parseDateCell("   ");
  assert(r3.value === null, "Empty date should remain null without fallback");
  assert(r3.status === "success", "Empty date should parse successfully as null");
});

runTest("Percent Parser parsePercentCell", () => {
  const r1 = parsePercentCell("35%");
  assert(r1.value === 35, "Should strip % symbol");
  assert(r1.status === "success", "Valid string % should succeed");

  const r2 = parsePercentCell("0.25");
  assert(r2.value === 25, "Decimal < 1 should be converted to percent");
  assert(r2.status === "warning", "Decimal < 1 conversion warning should be supplied");

  const r3 = parsePercentCell("80");
  assert(r3.value === 80, "Raw integer should be kept as percent");

  for (const malformed of ["1O0%", "10%%", "25abc", "50 percent"]) {
    const result = parsePercentCell(malformed);
    assert(result.value === null, `Malformed percentage "${malformed}" must not be truncated`);
    assert(result.status === "error", `Malformed percentage "${malformed}" must report an error`);
  }
});

runTest("Malformed Milestone Percent Is Reported", () => {
  const headers = [
    "ID", "Название", "Цели проекта", "Образы результатов", "Дата начала",
    "Дата завершения", "Стадия", "Вид", "Приоритет",
    "Вехи 2026 Q1", "% выполнения Вехи 2026 Q1", "Вес вехи 2026 Q1"
  ];
  const row = {
    "ID": "1",
    "Название": "Проект с ошибочным процентом",
    "Цели проекта": "Цель",
    "Образы результатов": "Результат",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе",
    "Вид": "Проект",
    "Приоритет": "1",
    "Вехи 2026 Q1": "Запуск",
    "% выполнения Вехи 2026 Q1": "1O0%",
    "Вес вехи 2026 Q1": "100%"
  };

  const report = validateProjectRows([row], headers, {
    assessmentDate: new Date("2026-06-04"),
    detectedYears: [2026]
  });
  assert(
    report.issues.some(issue => issue.code === "MILESTONE_PROGRESS_INVALID"),
    "Malformed milestone progress must be surfaced as a validation error"
  );
});

// 3. Quarter Status Evaluation relative to Assessment Dates
runTest("Quarter Status Definitions", () => {
  const assessmentDate = new Date("2026-06-15"); // Falls inside 2026 Q2 (April 1 to June 30)

  // 2026 Q1 finishes on 2026-03-31
  const q1Status = getQuarterStatus(2026, "Q1", assessmentDate);
  assert(q1Status === "past", `2026 Q1 must be past relative to 2026-06-15. Obtained: ${q1Status}`);

  // 2026 Q2 finishes on 2026-06-30
  const q2Status = getQuarterStatus(2026, "Q2", assessmentDate);
  assert(q2Status === "current", `2026 Q2 must be current relative to 2026-06-15. Obtained: ${q2Status}`);

  // 2026 Q3 starts on 2026-07-01
  const q3Status = getQuarterStatus(2026, "Q3", assessmentDate);
  assert(q3Status === "future", `2026 Q3 must be future relative to 2026-06-15. Obtained: ${q3Status}`);
});

// 4. Batch Row Validator Controls
runTest("Full Rows Processing and Validation", () => {
  const headers = [
    "ID", "Название", "Цели проекта", "Образы результатов", "Дата начала", "Дата завершения",
    "Стадия", "Вид", "Руководитель проекта", "Администратор проекта", "Заказчики",
    "Команда проекта", "Приоритет", "Ответственный", "Дата начала мониторинга",
    "Регулярность мониторинга (1 раз в количество недель)", "Дата последнего мониторинга",
    "Обязательные участники Мониторинга", "Владелец проекта", "Департамент", "Ссылка на проект",
    "Вехи 2026 Q1", "% выполнения Вехи 2026 Q1", "Вес вехи 2026 Q1",
    "Показатели проекта 2026 Q1", "План Показатели проекта 2026 Q1", "Факт Показатели проекта 2026 Q1",
    "Вехи 2026 Q2", "% выполнения Вехи 2026 Q2", "Вес вехи 2026 Q2",
    "Показатели проекта 2026 Q2", "План Показатели проекта 2026 Q2", "Факт Показатели проекта 2026 Q2"
  ];

  const assessmentDate = new Date("2026-06-04T00:00:00Z"); // middle of Q2

  // A perfectly fine project row
  const validRow: Record<string, string> = {
    "ID": "1",
    "Название": "Универсальный Проект",
    "Цели проекта": "Цель 1; Цель 2",
    "Образы результатов": "Образ 1",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе",
    "Вид": "Проект",
    "Руководитель проекта": "Иванов И.И.",
    "Администратор проекта": "Петров П.П.",
    "Заказчики": "Заказчик 1",
    "Команда проекта": "Команда",
    "Приоритет": "1",
    "Ответственный": "Иванов И.И.",
    "Дата начала мониторинга": "01.01.2026",
    "Регулярность мониторинга (1 раз в количество недель)": "2",
    "Дата последнего мониторинга": "01.06.2026",
    "Обязательные участники Мониторинга": "Участник 1",
    "Владелец проекта": "Смирнов С.С.",
    "Департамент": "Департамент ИТ",
    "Ссылка на проект": "https://secure-url.com",

    // 2026 Q1 (Past period relative to 2026-06-04 assessmentDate)
    "Вехи 2026 Q1": "Веха Q1-1; Веха Q1-2",
    "% выполнения Вехи 2026 Q1": "100%; 100%",
    "Вес вехи 2026 Q1": "30%; 20%",

    "Показатели проекта 2026 Q1": "Показатель Q1-1",
    "План Показатели проекта 2026 Q1": "100",
    "Факт Показатели проекта 2026 Q1": "95",

    // 2026 Q2 (Current period, project active, weights sum must sum up 100% total)
    "Вехи 2026 Q2": "Веха Q2",
    "% выполнения Вехи 2026 Q2": "50%",
    "Вес вехи 2026 Q2": "50%", // 30% + 20% + 50% = 100% total

    "Показатели проекта 2026 Q2": "Показатель Q2-1",
    "План Показатели проекта 2026 Q2": "50",
    "Факт Показатели проекта 2026 Q2": "30"
  };

  const report = validateProjectRows([validRow], headers, { assessmentDate, detectedYears: [2026] });
  assert(report.errorsCount === 0, `Valid row should have 0 errors, got ${report.errorsCount}. Error messages: ${JSON.stringify(report.issues.map(i => i.message))}`);
});

runTest("Duplicate Project ID Control", () => {
  const headers = ["ID", "Название", "Цели проекта", "Образы результатов", "Дата начала", "Дата завершения", "Стадия", "Вид", "Приоритет"];
  
  const duplicatedRows: Record<string, string>[] = [
    { "ID": "10", "Название": "Проект 1", "Цели проекта": "Цель", "Образы результатов": "Результат", "Дата начала": "01.01.2026", "Дата завершения": "31.12.2026", "Стадия": "Планируется", "Вид": "Проект", "Приоритет": "1" },
    { "ID": "10", "Название": "Проект 2", "Цели проекта": "Цель", "Образы результатов": "Результат", "Дата начала": "01.01.2026", "Дата завершения": "31.12.2026", "Стадия": "Планируется", "Вид": "Проект", "Приоритет": "1" }
  ];

  const report = validateProjectRows(duplicatedRows, headers, { assessmentDate: new Date("2026-06-04"), detectedYears: [2026] });
  assert(report.errorsCount > 0, "Duplicate ID must generate an error issue");
  const findDuplicate = report.issues.some(iss => iss.code === "DUPLICATE_ID");
  assert(findDuplicate, "Duplicate check must attach double-ID custom error issue code");
});

runTest("Fails Invalid Directory Values", () => {
  const headers = ["ID", "Название", "Цели проекта", "Образы результатов", "Дата начала", "Дата завершения", "Стадия", "Вид", "Приоритет"];
  
  const badRow: Record<string, string> = { 
    "ID": "15", 
    "Название": "Тест Справочников", 
    "Цели проекта": "Тестирование", 
    "Образы результатов": "Результат", 
    "Дата начала": "01.01.2026", 
    "Дата завершения": "31.12.2026",
    "Стадия": "СуперСтадия",  // Invalid stage
    "Вид": "НеведомыйВид",     // Invalid kind
    "Приоритет": "4"            // Invalid priority
  };

  const report = validateProjectRows([badRow], headers, { assessmentDate: new Date("2026-06-04"), detectedYears: [2026] });
  assert(report.errorsCount === 3, `Expected exactly 3 directory errors, found: ${report.errorsCount}`);
  
  const stageErr = report.issues.find(iss => iss.code === "STAGE_INVALID");
  const foundStageErr = !!stageErr;
  const foundKindErr = report.issues.some(iss => iss.code === "KIND_INVALID");
  const foundPriorityErr = report.issues.some(iss => iss.code === "PRIORITY_INVALID");
  
  assert(foundStageErr && foundKindErr && foundPriorityErr, "Must report directory errors properly");
  assert(stageErr !== undefined, "STAGE_INVALID issues must be recorded");
  assert(!stageErr!.message.includes("Отменен"), "Validation error listing allowed values must not contain 'Отменен'");
  assert(!stageErr!.message.includes("Отменён"), "Validation error listing allowed values must not contain 'Отменён'");
});

runTest("Legacy Stage Normalization during Validation", () => {
  const headers = ["ID", "Название", "Цели проекта", "Образы результатов", "Дата начала", "Дата завершения", "Стадия", "Вид", "Приоритет"];
  
  // These rows have legacy stages that map to "Остановлен"
  const legacyRows: Record<string, string>[] = [
    { "ID": "101", "Название": "Проект C1", "Цели проекта": "Цель", "Образы результатов": "Результат", "Дата начала": "01.01.2026", "Дата завершения": "31.12.2026", "Стадия": "Отменен", "Вид": "Проект", "Приоритет": "1" },
    { "ID": "102", "Название": "Проект C2", "Цели проекта": "Цель", "Образы результатов": "Результат", "Дата начала": "01.01.2026", "Дата завершения": "31.12.2026", "Стадия": "Отменён", "Вид": "Проект", "Приоритет": "1" },
    { "ID": "103", "Название": "Проект C3", "Цели проекта": "Цель", "Образы результатов": "Результат", "Дата начала": "01.01.2026", "Дата завершения": "31.12.2026", "Стадия": "cancelled", "Вид": "Проект", "Приоритет": "1" },
    { "ID": "104", "Название": "Проект C4", "Цели проекта": "Цель", "Образы результатов": "Результат", "Дата начала": "01.01.2026", "Дата завершения": "31.12.2026", "Стадия": "canceled", "Вид": "Проект", "Приоритет": "1" },
    { "ID": "105", "Название": "Проект C5", "Цели проекта": "Цель", "Образы результатов": "Результат", "Дата начала": "01.01.2026", "Дата завершения": "31.12.2026", "Стадия": "Остановлен", "Вид": "Проект", "Приоритет": "1" }
  ];

  const report = validateProjectRows(legacyRows, headers, { assessmentDate: new Date("2026-06-04"), detectedYears: [2026] });
  assert(report.errorsCount === 0, `Legacy stages should be cleanly normalized to "Остановлен" and report no errors, obtained ${report.errorsCount} errors: ${JSON.stringify(report.issues.map(i => i.message))}`);
});

runTest("Milestones & Indicators Count Mismatch & Sum Weights Fail", () => {
  const headers = [
    "ID", "Название", "Цели проекта", "Образы результатов", "Дата начала", "Дата завершения", "Стадия", "Вид", "Приоритет",
    "Вехи 2026 Q1", "% выполнения Вехи 2026 Q1", "Вес вехи 2026 Q1",
    "Показатели проекта 2026 Q1", "План Показатели проекта 2026 Q1", "Факт Показатели проекта 2026 Q1"
  ];

  const faultyRow: Record<string, string> = { 
    "ID": "21", 
    "Название": "Тест Списков", 
    "Цели проекта": "Управление", 
    "Образы результатов": "Результат", 
    "Дата начала": "01.01.2026", 
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе", 
    "Вид": "Проект", 
    "Приоритет": "1",
    "Дата последнего мониторинга": "10.05.2026",
    
    // Milestones Mismatch count
    "Вехи 2026 Q1": "В-1; В-2",
    "% выполнения Вехи 2026 Q1": "100%", // Mismatch count
    "Вес вехи 2026 Q1": "50%; 40%",      // Sum is 90% (Not 100%, but under 100% is fine in new methodology)
    
    // Indicators without plan
    "Показатели проекта 2026 Q1": "Показатель 1",
    "План Показатели проекта 2026 Q1": "", // Plan missing
    "Факт Показатели проекта 2026 Q1": "15"
  };

  const overWeightRow: Record<string, string> = { 
    ...faultyRow,
    "ID": "22",
    "Вес вехи 2026 Q1": "70%; 60%",      // Sum is 130% (Error in new methodology)
  };

  const report1 = validateProjectRows([faultyRow], headers, { assessmentDate: new Date("2026-06-04"), detectedYears: [2026] });
  const report2 = validateProjectRows([overWeightRow], headers, { assessmentDate: new Date("2026-06-04"), detectedYears: [2026] });
  
  const hasCountMismatch = report1.issues.some(iss => iss.code === "MILESTONE_PROGRESS_COUNT_MISMATCH");
  const hasOldSumMismatch = report1.issues.some(iss => iss.code === "MILESTONES_TOTAL_WEIGHT_NOT_100");
  const hasOverSumMismatch = report2.issues.some(iss => iss.code === "MILESTONES_TOTAL_WEIGHT_OVER_100");
  const hasPlanMissing = report1.issues.some(iss => iss.code === "INDICATOR_PLAN_MISSING");

  assert(hasCountMismatch, "Should record milestone count mismatch issue");
  assert(!hasOldSumMismatch, "Should NOT record old MILESTONES_TOTAL_WEIGHT_NOT_100 issue as sums under 100% are allowed");
  assert(hasOverSumMismatch, "Should record MILESTONES_TOTAL_WEIGHT_OVER_100 issue for 130% total weight");
  assert(hasPlanMissing, "Should record indicator plan missing issue");
});

runTest("Empty Facts Permitted in Future Quarters", () => {
  const headers = [
    "ID", "Название", "Цели проекта", "Образы результатов", "Дата начала", "Дата завершения", "Стадия", "Вид", "Приоритет",
    "Показатели проекта 2026 Q4", "План Показатели проекта 2026 Q4", "Факт Показатели проекта 2026 Q4"
  ];

  // Assessment date: 2026-06-15. 2026 Q4 is in the future.
  const futureRow: Record<string, string> = { 
    "ID": "32", 
    "Название": "План Будущего", 
    "Цели проекта": "Метрика", 
    "Образы результатов": "Результат", 
    "Дата начала": "01.01.2026", 
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе", 
    "Вид": "Проект", 
    "Приоритет": "1",
    "Дата последнего мониторинга": "10.05.2026",
    
    "Показатели проекта 2026 Q4": "Будущий показатель",
    "План Показатели проекта 2026 Q4": "10",
    "Факт Показатели проекта 2026 Q4": "" // Left empty!
  };

  const report = validateProjectRows([futureRow], headers, { assessmentDate: new Date("2026-06-15"), detectedYears: [2026] });
  const hasFactPastMissing = report.issues.some(iss => iss.code === "INDICATOR_FACT_PAST_MISSING");
  const hasAnyErrors = report.errorsCount > 0;

  assert(!hasFactPastMissing, "Should not record fact missing for future quarters");
  assert(!hasAnyErrors, "Valid future indicator sequence with zero errors");
});

console.log("All validation tests successfully executed!");
process.exit(0);
