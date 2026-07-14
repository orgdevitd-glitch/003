import { 
  normalizeProjectRow, 
  normalizeProjectRows, 
  NormalizedProject, 
  NormalizationContext 
} from "../server/services/projectNormalizer";
import { toLegacyProjectView } from "../server/services/projectViewAdapter";
import { analyzeSheetColumns } from "../server/services/dataContract";

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

// 1. Проект с вехами в одном году
runTest("Scenario 1: Project with milestones in a single year", () => {
  const mockRow = {
    "ID": "1",
    "Название": "Тестовый проект Q1",
    "Цели проекта": "Выжить и победить",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе",
    "Вид": "Проект",
    "Вехи 2026 Q1": "Старт; Релиз сервиса",
    "% выполнения Вехи 2026 Q1": "100%; 50%",
    "Вес вехи 2026 Q1": "20%; 80%",
  };

  const context: NormalizationContext = {
    assessmentDate: new Date("2026-06-01"),
    detectedYears: [2026],
    columnAnalysis: analyzeSheetColumns(Object.keys(mockRow))
  };

  const res = normalizeProjectRow(mockRow, 2, context);
  
  assert(res.id === "1", "Project ID must be parsed");
  assert(res.baseInfo.title === "Тестовый проект Q1", "Title must match");
  assert(res.milestones.length === 2, "Should identify 2 milestones");
  
  const m1 = res.milestones[0];
  assert(m1.name === "Старт", "Milestone 1 title mismatch");
  assert(m1.progressPercent === 100, "Milestone 1 progress mismatch");
  assert(m1.weightPercent === 20, "Milestone 1 weight mismatch");
  assert(m1.year === 2026, "Milestone year mismatch");
  assert(m1.quarter === "Q1", "Milestone quarter mismatch");
});

// 2. Проект с вехами в нескольких годах
runTest("Scenario 2: Project with milestones across multiple years", () => {
  const mockRow = {
    "ID": "2",
    "Название": "Долгосрочная инициатива",
    "Цели проекта": "Системное развитие",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2027",
    "Стадия": "В работе",
    "Вид": "Программа",
    "Вехи 2026 Q1": "Первый этап",
    "% выполнения Вехи 2026 Q1": "100%",
    "Вес вехи 2026 Q1": "100%",
    "Вехи 2027 Q4": "Финальный этап",
    "% выполнения Вехи 2027 Q4": "0%",
    "Вес вехи 2027 Q4": "50%"
  };

  const context: NormalizationContext = {
    assessmentDate: new Date("2026-06-01"),
    detectedYears: [2026, 2027],
    columnAnalysis: analyzeSheetColumns(Object.keys(mockRow))
  };

  const res = normalizeProjectRow(mockRow, 3, context);
  
  assert(res.milestones.length === 2, "Should extract milestones across years");
  const years = res.milestones.map(m => m.year);
  assert(years.includes(2026) && years.includes(2027), "Milestones must map correct years");
});

// 3. Проект без вех, но с показателями
runTest("Scenario 3: Project with indicators only, no milestones", () => {
  const mockRow = {
    "ID": "3",
    "Название": "Контроль показателей",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе",
    "Показатели проекта 2026 Q1": "KPI-1; KPI-2",
    "План Показатели проекта 2026 Q1": "100; 250",
    "Факт Показатели проекта 2026 Q1": "95; 260"
  };

  const context: NormalizationContext = {
    assessmentDate: new Date("2026-06-01"),
    detectedYears: [2026],
    columnAnalysis: analyzeSheetColumns(Object.keys(mockRow))
  };

  const res = normalizeProjectRow(mockRow, 4, context);
  
  assert(res.milestones.length === 0, "No milestones should be parsed");
  assert(res.indicators.length === 2, "2 indicators should be parsed");
  assert(res.indicators[0].name === "KPI-1", "Indicator 1 name match");
  assert(res.indicators[0].plan === 100, "Indicator 1 plan match");
  assert(res.indicators[0].fact === 95, "Indicator 1 fact match");
});

// 4. Проект с вехами, но без показателей
runTest("Scenario 4: Project with milestones, no indicators", () => {
  const mockRow = {
    "ID": "4",
    "Название": "Проект без KPI",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе",
    "Вехи 2026 Q1": "Единичная веха",
    "% выполнения Вехи 2026 Q1": "10%",
    "Вес вехи 2026 Q1": "100%"
  };

  const context: NormalizationContext = {
    assessmentDate: new Date("2026-06-01"),
    detectedYears: [2026],
    columnAnalysis: analyzeSheetColumns(Object.keys(mockRow))
  };

  const res = normalizeProjectRow(mockRow, 5, context);
  
  assert(res.milestones.length === 1, "Should have 1 milestone");
  assert(res.indicators.length === 0, "Should have 0 indicators");
});

// 5. Проект с будущим пустым фактом
runTest("Scenario 5: Fact status verification for future periods", () => {
  const mockRow = {
    "ID": "5",
    "Название": "Будущее планирование",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "Планируется", // Not active yet
    "Показатели проекта 2026 Q3": "KPI-3",
    "План Показатели проекта 2026 Q3": "500",
    "Факт Показатели проекта 2026 Q3": "" // Empty fact
  };

  const context: NormalizationContext = {
    assessmentDate: new Date("2026-02-01"), // Assessment is in Q1, monitoring Q3 is future
    detectedYears: [2026],
    columnAnalysis: analyzeSheetColumns(Object.keys(mockRow))
  };

  const res = normalizeProjectRow(mockRow, 6, context);
  
  assert(res.indicators.length === 1, "Should parse indicator");
  const ind = res.indicators[0];
  assert(ind.fact === null, "Fact should be null");
  assert(ind.periodStatus === "future", "Period should be future");
  assert(ind.factStatus === "empty_future", "Empty fact in future period must have factStatus 'empty_future'");
});

// 6. Проект с датой оценки, переданной явно
runTest("Scenario 6: Explicit Assessment Date handling", () => {
  const mockRow = {
    "ID": "6",
    "Название": "Явная оценка",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе"
  };

  const explicitDate = new Date("2026-05-15");
  const context: NormalizationContext = {
    assessmentDate: explicitDate,
    detectedYears: [2026]
  };

  const res = normalizeProjectRow(mockRow, 7, context);
  assert(res.applicableQuarters.length > 0, "Quarters list generated");
  
  // Q2 2026 (Apr - Jun) should be current
  const q2 = res.applicableQuarters.find(q => q.year === 2026 && q.quarter === "Q2");
  assert(q2 !== undefined, "Q2 must exist");
  assert(q2?.status === "current", "Q2 status must be current with assessment date 2026-05-15");
});

// 7. Проект с датой оценки по текущей дате сервера
runTest("Scenario 7: Default server date handling when assessmentDate is missing", () => {
  const mockRow = {
    "ID": "7",
    "Название": "Серверное время",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе"
  };

  const context: NormalizationContext = {
    detectedYears: [2026]
  };

  const res = normalizeProjectRow(mockRow, 8, context);
  assert(res.applicableQuarters.length > 0, "Quarters generated by default date");
});

// 8. Корректное заполнение periodStatus
runTest("Scenario 8: Checking periodStatus calculations (past, current, future)", () => {
  const mockRow = {
    "ID": "8",
    "Название": "Временные промежутки",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе",
    "Вехи 2026 Q1": "Прошлая веха",
    "Вехи 2026 Q2": "Текущая веха",
    "Вехи 2026 Q4": "Будущая веха",
    "% выполнения Вехи 2026 Q1": "100%", "Вес вехи 2026 Q1": "10%",
    "% выполнения Вехи 2026 Q2": "50%", "Вес вехи 2026 Q2": "20%",
    "% выполнения Вехи 2026 Q4": "0%", "Вес вехи 2026 Q4": "30%",
  };

  const context: NormalizationContext = {
    assessmentDate: new Date("2026-05-01"), // Inside Q2
    detectedYears: [2026],
    columnAnalysis: analyzeSheetColumns(Object.keys(mockRow))
  };

  const res = normalizeProjectRow(mockRow, 9, context);
  
  const mPast = res.milestones.find(m => m.quarter === "Q1");
  const mCurrent = res.milestones.find(m => m.quarter === "Q2");
  const mFuture = res.milestones.find(m => m.quarter === "Q4");

  assert(mPast?.periodStatus === "past", "Q1 should be past");
  assert(mCurrent?.periodStatus === "current", "Q2 should be current");
  assert(mFuture?.periodStatus === "future", "Q4 should be future");
});

// 9. Корректное заполнение isApplicableQuarter
runTest("Scenario 9: Checking isApplicableQuarter boundary conditions", () => {
  const mockRow = {
    "ID": "9",
    "Название": "Применимость кварталов",
    "Дата начала": "01.04.2026", // Starts in Q2
    "Дата завершения": "30.09.2026", // Ends in Q3
    "Стадия": "В работе",
    "Вехи 2026 Q1": "Веха Q1", // Project hasn't started yet relative to this column
    "Вехи 2026 Q2": "Веха Q2", // Applicable
    "Вехи 2026 Q4": "Веха Q4", // Project ended before this
    "% выполнения Вехи 2026 Q1": "0%", "Вес вехи 2026 Q1": "1%",
    "% выполнения Вехи 2026 Q2": "10%", "Вес вехи 2026 Q2": "2%",
    "% выполнения Вехи 2026 Q4": "0%", "Вес вехи 2026 Q4": "4%",
  };

  const context: NormalizationContext = {
    assessmentDate: new Date("2026-05-01"),
    detectedYears: [2026],
    columnAnalysis: analyzeSheetColumns(Object.keys(mockRow))
  };

  const res = normalizeProjectRow(mockRow, 10, context);

  const mQ1 = res.milestones.find(m => m.quarter === "Q1");
  const mQ2 = res.milestones.find(m => m.quarter === "Q2");
  const mQ4 = res.milestones.find(m => m.quarter === "Q4");

  assert(mQ1?.isApplicableQuarter === false, "Q1 is not applicable (starts Q2)");
  assert(mQ2?.isApplicableQuarter === true, "Q2 is applicable");
  assert(mQ4?.isApplicableQuarter === false, "Q4 is not applicable (ends Q3)");
});

// 10. Адаптер совместимости (toLegacyProjectView)
runTest("Scenario 10: Legacy View Adapter mapping accuracy", () => {
  const mockNormalized: NormalizedProject = {
    id: "10",
    projectId: "10",
    sourceRowIndex: 11,
    baseInfo: {
      title: "Новый проект",
      goals: "Цель номер один",
      resultImages: "картинки_результатов.jpg",
      type: "Проект",
      stage: "В работе",
      priority: 1,
      startDate: "2026-01-01",
      endDate: "2026-12-31"
    },
    people: {
      projectManager: "Иванов Иван",
      projectAdmin: "Петров Петр",
      customers: ["Заказчик А", "Заказчик Б"],
      team: ["Команда X"],
      responsible: "Сидоров Сидор",
      owner: "Владельцев Влад",
      monitoringParticipants: ["М-1"]
    },
    organization: {
      departments: ["Департамент ИТ"]
    },
    monitoring: {
      startDate: "2026-01-10",
      regularityWeeks: 2,
      lastMonitoringDate: "2026-01-15",
      nextMonitoringDate: "2026-01-29",
      isMonitoringOverdue: true
    },
    links: {
      bitrixUrl: "https://bitrix24.ru/1"
    },
    milestones: [
      {
        id: "M-10-2026-Q1-1",
        year: 2026,
        quarter: "Q1",
        name: "Веха Раз",
        progressPercent: 100,
        weightPercent: 50,
        periodStatus: "past",
        isApplicableQuarter: true,
        sourceColumns: { name: "", progress: "", weight: "" }
      }
    ],
    indicators: [
      {
        id: "IND-10-2026-Q1-1",
        year: 2026,
        quarter: "Q1",
        name: "Показатель Раз",
        plan: 200,
        fact: 180,
        periodStatus: "past",
        isApplicableQuarter: true,
        factStatus: "filled",
        sourceColumns: { name: "", plan: "", fact: "" }
      }
    ],
    applicableQuarters: [],
    dataQuality: {
      status: "ok",
      errorsCount: 0,
      warningsCount: 0,
      issues: []
    },
    source: {
      rawRow: {
        "ID": "10",
        "Название": "Новый проект",
        "Вехи 2026 Q1": "Веха Раз",
        "Показатели проекта 2026 Q1": "Показатель Раз"
      },
      detectedYears: [2026]
    }
  };

  const legacy = toLegacyProjectView(mockNormalized);

  assert(legacy.projectId === "10", "Adapter ID mapping mismatch");
  assert(legacy.projectName === "Новый проект", "Adapter projectName mismatch");
  assert(legacy.goals && legacy.goals[0] === "Цель номер один", "Adapter goals mapping mismatch");
  assert(legacy.startDate === "2026-01-01", "Adapter startDate mismatch");
  assert(legacy.endDate === "2026-12-31", "Adapter endDate mismatch");
  assert(legacy.deadlineAt === "2026-12-31", "Adapter deadlineAt mismatch");
  assert(legacy.status === "active", "Adapter status mismatch ('В работе' -> 'active')");
  assert(legacy.projectManager === "Иванов Иван", "Adapter manager mismatch");
  assert(legacy.responsible === "Сидоров Сидор", "Adapter responsible mismatch");
  assert(legacy.owner === "Владельцев Влад", "Adapter owner mismatch");
  assert(legacy.department === "Департамент ИТ", "Adapter department mismatch");
  assert(legacy.milestones[0].title === "Веха Раз", "Adapter milestone title mismatch");
  assert(legacy.milestones[0].progressPercent === 100, "Adapter milestone progress mismatch");
  assert(legacy.indicators[0].name === "Показатель Раз", "Adapter indicator name mismatch");
  assert(legacy.indicators[0].planValue === 200, "Adapter indicator plan mismatch");
  assert(legacy.indicators[0].factValue === 180, "Adapter indicator fact mismatch");
});

// 8. Regression test: department mapping from "Департамент"
runTest("Scenario 8: Correct mapping from 'Департамент' column", () => {
  const mockRow = {
    "ID": "100",
    "Название": "Проект Департамента",
    "Департамент": "Департамент ИТ; Департамент Цифровизации",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе"
  };

  const context: NormalizationContext = {
    assessmentDate: new Date("2026-06-01"),
    detectedYears: [2026],
    columnAnalysis: analyzeSheetColumns(Object.keys(mockRow))
  };

  const res = normalizeProjectRow(mockRow, 100, context);
  assert(res.organization.departments.length === 2, "Should identify 2 departments");
  assert(res.organization.departments[0] === "Департамент ИТ", "Department 1 mismatch");
  assert(res.organization.departments[1] === "Департамент Цифровизации", "Department 2 mismatch");

  const legacy = toLegacyProjectView(res);
  assert(legacy.department === "Департамент ИТ; Департамент Цифровизации", "Legacy project.department must contain the normalized list joined with semicolons");
});

// 9. Negative test: no mapping from old "Подразделение" column
runTest("Scenario 9: Old 'Подразделение' column must NOT be used", () => {
  const mockRow = {
    "ID": "101",
    "Название": "Проект со старой колонкой",
    "Подразделение": "Департамент ИТ",
    "Дата начала": "01.01.2026",
    "Дата завершения": "31.12.2026",
    "Стадия": "В работе"
  };

  const context: NormalizationContext = {
    assessmentDate: new Date("2026-06-01"),
    detectedYears: [2026],
    columnAnalysis: analyzeSheetColumns(Object.keys(mockRow))
  };

  const res = normalizeProjectRow(mockRow, 101, context);
  assert(res.organization.departments.length === 0, "Departments should be empty since old column is ignored");

  const legacy = toLegacyProjectView(res);
  assert(legacy.department === "", "Legacy project.department should be empty");
});
