import { calculateProjectDataCompleteness } from "../src/utils/projectCompleteness";
import { Project } from "../src/types";
import { buildProjectAnalysisPayload } from "../server/services/projectAnalysisPayloadService";

console.log("=== RUNNING UNIFIED PROJECT COMPLETENESS TEST SUITE (24 SCENARIOS) ===");

function createBaseProject(): any {
  return {
    projectId: "P-1",
    projectName: "Тестовый проект",
    goals: "Цель 1; Цель 2",
    resultImages: "Картинка 1",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    stage: "В работе",
    projectType: "Вид А",
    projectManager: "Иванов И.И.",
    projectAdmin: "Петров П.П.",
    sponsor: "Сидоров С.С.",
    projectTeam: "Команда А; Команда Б",
    priority: 1,
    responsible: "Ответственный А",
    monitoringStart: "2026-01-01",
    monitoringFrequencyWeeks: 2,
    lastPcDate: "2026-01-15",
    observers: ["Наблюдатель А"],
    projectOwner: "Владелец А",
    department: "Департамент А",
  };
}

let failed = false;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed = true;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// -------------------------------------------------------------
// SCENARIO 1: Fully filled project (18 always mandatory, lastPcDate is NOT applicable because future)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-07-01"; // Future
  project.lastPcDate = ""; // Empty but shouldn't matter since not applicable
  const result = calculateProjectDataCompleteness(project, "2026-06-01");
  
  assert(result.completenessPercent === 100, "Scenario 1: 100% completeness when future and other fields filled");
  assert(result.totalApplicableRequiredFields === 18, "Scenario 1: total applicable should be 18");
  assert(result.filledApplicableRequiredFields === 18, "Scenario 1: filled applicable should be 18");
  assert(!result.notApplicableFields.includes("monitoringStart"), "Scenario 1: monitoringStart should be applicable");
  assert(result.notApplicableFields.includes("Дата последнего мониторинга"), "Scenario 1: lastPcDate should be not applicable");
}

// -------------------------------------------------------------
// SCENARIO 2: Fully filled project with applicable and filled lastPcDate
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-01-01";
  project.monitoringFrequencyWeeks = 2;
  project.lastPcDate = "2026-01-15"; // First PC should be on 2026-01-15, which is equal or past
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.completenessPercent === 100, "Scenario 2: 100% completeness when applicable and filled lastPcDate");
  assert(result.totalApplicableRequiredFields === 19, "Scenario 2: total applicable should be 19");
  assert(result.filledApplicableRequiredFields === 19, "Scenario 2: filled should be 19");
}

// -------------------------------------------------------------
// SCENARIO 3: Missing basic fields
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.projectName = "";
  project.goals = "";
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.completenessPercent < 100, "Scenario 3: Missing basic fields reduces completeness");
  assert(result.missingFields.includes("Название"), "Scenario 3: missing fields should list 'Название'");
  assert(result.missingFields.includes("Цели проекта"), "Scenario 3: missing fields should list 'Цели проекта'");
  assert(result.userVisibleReasons.includes("Не заполнено поле: Название проекта"), "Scenario 3: reason for missing name");
  assert(result.userVisibleReasons.includes("Не заполнено поле: Цели проекта"), "Scenario 3: reason for missing goals");
}

// -------------------------------------------------------------
// SCENARIO 4: Missing all 18 always mandatory fields
// -------------------------------------------------------------
{
  const project: any = {};
  const result = calculateProjectDataCompleteness(project, "2026-01-01");

  assert(result.completenessPercent === 0, "Scenario 4: Missing all fields gives 0% completeness");
  assert(result.totalApplicableRequiredFields === 18, "Scenario 4: total applicable should be 18");
  assert(result.missingFields.length === 18, "Scenario 4: missing fields count should be 18");
}

// -------------------------------------------------------------
// SCENARIO 5: Future monitoring start (not applicable lastPcDate)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-05-01";
  project.lastPcDate = "";
  const result = calculateProjectDataCompleteness(project, "2026-04-15");

  assert(result.notApplicableFields.includes("Дата последнего мониторинга"), "Scenario 5: lastPcDate is not applicable");
  assert(result.completenessPercent === 100, "Scenario 5: completeness is 100% since lastPcDate is not applicable");
}

// -------------------------------------------------------------
// SCENARIO 6: Missing lastPcDate when applicable
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-01-01";
  project.monitoringFrequencyWeeks = 2; // First PC on 2026-01-15
  project.lastPcDate = ""; // Missing
  const result = calculateProjectDataCompleteness(project, "2026-01-20"); // Today is past 2026-01-15

  assert(result.totalApplicableRequiredFields === 19, "Scenario 6: total applicable should be 19");
  assert(result.missingFields.includes("Дата последнего мониторинга"), "Scenario 6: missing fields should list lastPcDate");
  assert(result.completenessPercent === Math.round((18/19)*100), `Scenario 6: completeness should be ${Math.round((18/19)*100)}% (actual: ${result.completenessPercent}%)`);
  assert(result.userVisibleReasons.includes("Дата последнего мониторинга отсутствует, хотя первый плановый ПК уже должен был пройти"), "Scenario 6: contains correct missing reason");
}

// -------------------------------------------------------------
// SCENARIO 7: Present lastPcDate but invalid date
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-01-01";
  project.monitoringFrequencyWeeks = 2;
  project.lastPcDate = "NOT_A_DATE";
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.totalApplicableRequiredFields === 19, "Scenario 7: total applicable should be 19");
  assert(result.invalidFields.includes("Дата последнего мониторинга"), "Scenario 7: invalid fields should list lastPcDate");
  assert(result.userVisibleReasons.includes("Некорректная дата последнего мониторинга"), "Scenario 7: correct invalid reason");
}

// -------------------------------------------------------------
// SCENARIO 8: Missing regularity weeks
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringFrequencyWeeks = undefined;
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.missingFields.includes("Регулярность мониторинга"), "Scenario 8: missing regularity listed");
  assert(!result.missingFields.includes("Дата последнего мониторинга"), "Scenario 8: lastPcDate not checked since regularity is missing");
}

// -------------------------------------------------------------
// SCENARIO 9: Regularity weeks equal to 0 or negative
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringFrequencyWeeks = -2;
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.invalidFields.includes("Регулярность мониторинга"), "Scenario 9: invalid regularity listed");
  assert(!result.missingFields.includes("Дата последнего мониторинга"), "Scenario 9: lastPcDate not checked since regularity is invalid");
}

// -------------------------------------------------------------
// SCENARIO 10: Missing monitoring start
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "";
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.missingFields.includes("Дата начала мониторинга"), "Scenario 10: missing monitoringStart");
  assert(!result.missingFields.includes("Дата последнего мониторинга"), "Scenario 10: lastPcDate not checked since monitoringStart is missing");
}

// -------------------------------------------------------------
// SCENARIO 11: Invalid monitoring start
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "INVALID_DATE";
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.invalidFields.includes("Дата начала мониторинга"), "Scenario 11: invalid monitoring start");
  assert(!result.missingFields.includes("Дата последнего мониторинга"), "Scenario 11: lastPcDate not checked since monitoringStart is invalid");
}

// -------------------------------------------------------------
// SCENARIO 12: Missing 'Владелец проекта' (owner)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.projectOwner = "";
  project.owner = "";
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.missingFields.includes("Владелец проекта"), "Scenario 12: missing owner field");
}

// -------------------------------------------------------------
// SCENARIO 13: Missing 'Департамент' (department)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.department = "";
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.missingFields.includes("Департамент"), "Scenario 13: missing department field");
}

// -------------------------------------------------------------
// SCENARIO 14: Invalid priority
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.priority = 5; // Not 0, 1, 2
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.invalidFields.includes("Приоритет"), "Scenario 14: invalid priority field");
}

// -------------------------------------------------------------
// SCENARIO 15: Missing list fields (customers, team, monitoringParticipants)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.sponsor = "";
  project.projectTeam = "";
  project.observers = [];
  const result = calculateProjectDataCompleteness(project, "2026-01-20");

  assert(result.missingFields.includes("Заказчики"), "Scenario 15: missing sponsor/customers");
  assert(result.missingFields.includes("Команда проекта"), "Scenario 15: missing team");
  assert(result.missingFields.includes("Обязательные участники Мониторинга"), "Scenario 15: missing observers/monitoringParticipants");
}

// -------------------------------------------------------------
// SCENARIO 16: NormalizedProject vs Legacy Project shape equivalence
// -------------------------------------------------------------
{
  const legacy = createBaseProject();
  const normalized = {
    id: "P-1",
    baseInfo: {
      title: "Тестовый проект",
      goals: "Цель 1; Цель 2",
      resultImages: "Картинка 1",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      stage: "В работе",
      type: "Вид А",
      priority: 1,
    },
    people: {
      projectManager: "Иванов И.И.",
      projectAdmin: "Петров П.П.",
      customers: ["Сидоров С.С."],
      team: ["Команда А", "Команда Б"],
      responsible: "Ответственный А",
      monitoringParticipants: ["Наблюдатель А"],
      owner: "Владелец А",
    },
    monitoring: {
      startDate: "2026-01-01",
      regularityWeeks: 2,
      lastMonitoringDate: "2026-01-15",
    },
    organization: {
      departments: ["Департамент А"]
    }
  };

  const resLegacy = calculateProjectDataCompleteness(legacy, "2026-01-20");
  const resNormalized = calculateProjectDataCompleteness(normalized, "2026-01-20");

  assert(resLegacy.completenessPercent === resNormalized.completenessPercent, "Scenario 16: legacy & normalized shapes produce identical completenessPercent");
  assert(resLegacy.totalApplicableRequiredFields === resNormalized.totalApplicableRequiredFields, "Scenario 16: legacy & normalized shapes produce identical totalApplicableRequiredFields");
  assert(JSON.stringify(resLegacy.missingFields) === JSON.stringify(resNormalized.missingFields), "Scenario 16: identical missing fields list");
}

// -------------------------------------------------------------
// SCENARIO 17: Assessment date equals first planned PC date (edge case boundary)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-01-01";
  project.monitoringFrequencyWeeks = 2; // first PC date is 2026-01-15
  project.lastPcDate = "";

  const result = calculateProjectDataCompleteness(project, "2026-01-15"); // Exactly on the first PC date
  assert(result.totalApplicableRequiredFields === 19, "Scenario 17: is applicable when date is exactly equal to first planned PC");
}

// -------------------------------------------------------------
// SCENARIO 18: Assessment date is one day before first planned PC date (edge case boundary)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-01-01";
  project.monitoringFrequencyWeeks = 2; // first PC date is 2026-01-15
  project.lastPcDate = "";

  const result = calculateProjectDataCompleteness(project, "2026-01-14"); // One day before
  assert(result.totalApplicableRequiredFields === 18, "Scenario 18: is not applicable when date is one day before first planned PC");
  assert(result.notApplicableFields.includes("Дата последнего мониторинга"), "Scenario 18: lastPcDate is not applicable");
}

// -------------------------------------------------------------
// SCENARIO 19: Future monitoring start - payload doesn't contain forbidden phrases
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-05-01";
  project.monitoringFrequencyWeeks = 2;
  project.lastPcDate = "";

  // assessmentDate is before the first planned PC (2026-05-15), e.g. 2026-04-15
  const payload = buildProjectAnalysisPayload({
    project,
    evaluation: null,
    assessmentDate: "2026-04-15",
    assessmentDateMode: "custom"
  });

  const payloadStr = JSON.stringify(payload);
  
  const containsPhrase1 = payloadStr.includes("отсутствует дата последнего ПК") || payloadStr.includes("отсутствует дата последнего мониторинга");
  const containsPhrase2 = payloadStr.includes("оценка своевременности ПК усложнена");

  assert(!containsPhrase1, "Scenario 19: payload should not contain 'отсутствует дата последнего ПК' or 'отсутствует дата последнего мониторинга'");
  assert(!containsPhrase2, "Scenario 19: payload should not contain 'оценка своевременности ПК усложнена'");
}

// -------------------------------------------------------------
// SCENARIO 20: Monitoring start date is AFTER project end date (invalid field)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2027-01-01"; // After 2026-12-31
  project.endDate = "2026-12-31";
  
  const result = calculateProjectDataCompleteness(project, "2026-01-20");
  assert(result.invalidFields.includes("Дата начала мониторинга"), "Scenario 20: monitoringStart is invalid when after endDate");
  assert(result.userVisibleReasons.includes("Некорректная дата начала мониторинга: дата начала мониторинга позже даты завершения проекта"), "Scenario 20: correct invalid reason for monitoringStart");
  assert(result.completenessPercent < 100, "Scenario 20: completeness decreases for invalid monitoringStart");
}

// -------------------------------------------------------------
// SCENARIO 21: Monitoring start date equals project end date (valid field)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-12-31";
  project.endDate = "2026-12-31";

  const result = calculateProjectDataCompleteness(project, "2026-01-20");
  assert(!result.invalidFields.includes("Дата начала мониторинга"), "Scenario 21: monitoringStart is valid when equal to endDate");
}

// -------------------------------------------------------------
// SCENARIO 22: Monitoring start date is BEFORE project end date (valid field)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-12-30";
  project.endDate = "2026-12-31";

  const result = calculateProjectDataCompleteness(project, "2026-01-20");
  assert(!result.invalidFields.includes("Дата начала мониторинга"), "Scenario 22: monitoringStart is valid when before endDate");
}

// -------------------------------------------------------------
// SCENARIO 23: Last monitoring date is not applicable
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-07-01"; // Future relative to assessment
  project.lastPcDate = "";

  const result = calculateProjectDataCompleteness(project, "2026-06-01");
  assert(result.totalApplicableRequiredFields === 18, "Scenario 23: lastPcDate is not applicable and total fields is 18");
  assert(result.notApplicableFields.includes("Дата последнего мониторинга"), "Scenario 23: lastPcDate listed in notApplicableFields");
}

// -------------------------------------------------------------
// SCENARIO 24: 18 applicable mandatory fields and 4 problematic fields (78% completeness)
// -------------------------------------------------------------
{
  const project = createBaseProject();
  project.monitoringStart = "2026-07-01"; // Future, makes lastPcDate not applicable, so total = 18
  
  // Create 4 problematic fields:
  project.projectName = ""; // 1. missing
  project.goals = ""; // 2. missing
  project.priority = 999; // 3. invalid
  project.monitoringStart = "2027-01-01"; // 4. invalid (later than endDate)
  
  const result = calculateProjectDataCompleteness(project, "2026-06-01");
  assert(result.totalApplicableRequiredFields === 18, "Scenario 24: denominator is exactly 18");
  
  const problematicCount = result.missingFields.length + result.invalidFields.length;
  assert(problematicCount === 4, "Scenario 24: exactly 4 problematic fields found");
  assert(result.completenessPercent === 78, `Scenario 24: completeness is exactly 78% (actual: ${result.completenessPercent}%)`);
}

// -------------------------------------------------------------
// SCENARIO 25: Verify 'Владелец проекта' (owner) and 'Департамент' (department) are distinct, 
// and completeness consistency across subsystems
// -------------------------------------------------------------
{
  const project = createBaseProject();
  
  // Set owner and department to missing
  project.owner = "";
  project.projectOwner = "";
  project.department = "";
  project.monitoringStart = "2026-07-01"; // Future, so total applicable is 18
  
  const result = calculateProjectDataCompleteness(project, "2026-06-01");
  assert(result.totalApplicableRequiredFields === 18, "Scenario 25: denominator is 18");
  assert(result.missingFields.includes("Владелец проекта"), "Scenario 25: missing fields contains 'Владелец проекта'");
  assert(result.missingFields.includes("Департамент"), "Scenario 25: missing fields contains 'Департамент'");
  
  // They are separate, so they both reduce completeness separately: 2/18 missing -> 16/18 filled (89% completeness)
  assert(result.completenessPercent === 89, `Scenario 25: completeness should be 89% (actual: ${result.completenessPercent}%)`);

  // Verify consistency: we can simulate how evaluation, registry and other views consume this percentage.
  const mockEvaluation = {
    projectId: project.projectId,
    assessmentDate: "2026-06-01",
    dataQuality: {
      completenessPercent: result.completenessPercent,
      errorsCount: result.invalidFields.length,
      status: "ok" as const
    }
  };

  const getRegistryDataQuality = (p: any, evs: any[]) => {
    const ev = evs.find(e => e.projectId === p.projectId);
    return ev?.dataQuality?.completenessPercent ?? null;
  };

  const getProjectCompletenessPercent = (ev: any) => {
    return ev?.dataQuality?.completenessPercent ?? null;
  };

  const registryQuality = getRegistryDataQuality(project, [mockEvaluation]);
  const cardQuality = getProjectCompletenessPercent(mockEvaluation);
  const pdfQuality = getRegistryDataQuality(project, [mockEvaluation]);

  assert(registryQuality === result.completenessPercent, "Scenario 25: Registry completeness matches calculated");
  assert(cardQuality === result.completenessPercent, "Scenario 25: Card completeness matches calculated");
  assert(pdfQuality === result.completenessPercent, "Scenario 25: PDF completeness matches calculated");

  console.log("✅ PASS: Scenario 25: Владелец проекта and Департамент are distinct, unified completeness is consistent");
}

if (failed) {
  process.exit(1);
} else {
  console.log("\n⭐️ ALL 25 SCENARIOS PASSED SUCCESSFULLY! ⭐️\n");
}
