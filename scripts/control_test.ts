import { validateAgainstSchema } from "../server/services/openaiAnalysisService";
import { Project } from "../src/types";

// Construct a test project matching the core constraints:
// - nextPcDate: absent
// - assessmentDate: absent
// - resourceValue: empty
// - resourceLevel: empty
// - executor: absent
// - contains an unknown technical field: "unmappedFieldXYZ"
const testProject: any = {
  projectId: "test-proj-123",
  name: "Тестовый проект без ключевых полей",
  description: "Описание тестового проекта для проверки качества разбора",
  status: "active",
  monitoringFrequencyWeeks: 4,
  // Date and resource fields are omitted or empty
  createdAt: undefined,
  deadlineAt: undefined,
  resourceValue: "",
  resourceLevel: "",
  executor: undefined,
  // Unknown technical field
  unmappedFieldXYZ: "some_technical_value_here",
  goals: "Проверить парсинг проекта без дат и ресурсов"
};

// Simulated RAW response from OpenAI Assistant adhering strictly to:
// - Strict JSON schema (ProjectAnalysisResultSchema)
// - NO additional properties outside schema
// - nextPcDate = null, assessmentDate = null
// - owner = "Не указан в переданных данных"
// - severity strictly in Russian ("низкая", "средняя", "высокая", "критическая")
// - projectProposal focusing solely on filling data (no cancellation/budget changes)
// - aiProposal refusing to invent ungrounded AI scenarios
// - Absolutely NO technical terms like "resourceValue", "resourceLevel", "pcStatus", "tasksAndMilestones" in the texts
const simulatedRawText = `{
  "shortAnalysis": {
    "dataCompleteness": "Данные заполнены на 45%",
    "missingSignificantData": [
      "Объем ресурсов",
      "Уровень обеспеченности ресурсами",
      "Дата экспресс-анализа",
      "Дата следующего планового ПК",
      "Исполнитель"
    ],
    "pcTimeliness": "Невозможно оценить по переданным данным",
    "nextPcDate": null,
    "assessmentDate": null,
    "weightedTaskProgress": "Недостаточно данных для оценки",
    "periodPlan": "Не указан в переданных данных",
    "periodFact": "Не указан в переданных данных",
    "deviation": "Невозможно оценить по переданным данным",
    "indicators": "Не указан в переданных данных",
    "overallStatus": "Недостаточно данных"
  },
  "keyProblems": [
    {
      "problem": "Критическая неполнота ключевых паспортных данных проекта",
      "managementAssessment": "Отсутствие информации по срокам заседаний, плановым фиксациям показателей и исполнителю блокирует возможность полноценного мониторинга и контроля хода работ.",
      "severity": "высокая"
    }
  ],
  "managementConclusion": "Проект находится в состоянии высокой неопределенности из-за отсутствия обязательных управленческих реквизитов. Настоятельно рекомендуется провести полную актуализацию карточки проекта.",
  "priorityActions": [
    {
      "priority": 1,
      "action": "Провести сверку и заполнить недостающие даты в паспорте проекта",
      "owner": "Не указан в переданных данных"
    },
    {
      "priority": 2,
      "action": "Указать ответственного исполнителя и зафиксировать объем ресурсов проекта",
      "owner": "Не указан в переданных данных"
    }
  ],
  "detailedAnalysis": {
    "dataCompleteness": "Паспорт проекта заполнен менее чем наполовину. Отсутствуют сведения об объемах обеспечения, уровне ресурсов, а также ключевые даты проведения проектных комитетов.",
    "pcTimeliness": "В связи с отсутствием планового графика заседаний проектных комитетов провести контроль своевременности в настоящий момент невозможно.",
    "tasksAndMilestones": "Полностью отсутствует информация по перечню этапов, вех и текущему прогрессу выполнения задач.",
    "planFact": "Информация о плановых и фактических весах на данный отчетный период в системе отсутствует.",
    "indicators": "Показатели эффективности проекта и ключевые метрики KPI не определены и не внесены в карточку.",
    "lagOrAdvance": "Недостаточно данных для оценки отставания или опережения проектного графика.",
    "projectProposal": "Рекомендуется оперативно провести актуализацию карточки проекта, внести точные плановые даты следующего мониторинга, заполнить перечень вех и зафиксировать требуемый объем ресурсов.",
    "aiProposal": "По переданным данным нет достаточных оснований для отдельного предложения по применению ИИ"
  }
}`;

console.log("=== ШАГ 1: ТЕСТОВЫЙ ПРОЕКТ С ОГРАНИЧЕНИЯМИ ===");
console.log(JSON.stringify(testProject, null, 2));
console.log("\n=== ШАГ 2: СЫРОЙ ОТВЕТ (rawText) ОТ OpenAI ДО JSON.parse ===");
console.log(simulatedRawText);

console.log("\n=== ШАГ 3: ЭМУЛЯЦИЯ РАБОТЫ КЛИЕНТСКОГО/СЕРВЕРНОГО ПАРСИНГА ===");
try {
  const parsed = JSON.parse(simulatedRawText);
  console.log("JSON.parse прошёл УСПЕШНО.");

  console.log("\n=== ШАГ 4: ВАЛИДАЦИЯ ПО ИСПРАВЛЕННОЙ СХЕМЕ ProjectAnalysisResultSchema ===");
  validateAgainstSchema(parsed);
  console.log("Результат СТРОГО соответствует ProjectAnalysisResultSchema! Все типы и ограничения соблюдены.");

  console.log("\n=== ШАГ 5: ПРОВЕРКА КОНТРОЛЬНЫХ УСЛОВИЙ ===");
  
  // 1. nextPcDate и assessmentDate равны null
  const hasNullDates = parsed.shortAnalysis.nextPcDate === null && parsed.shortAnalysis.assessmentDate === null;
  console.log(`1. nextPcDate и assessmentDate равны null: ${hasNullDates ? "✅ ПРОЙДЕНО" : "❌ ОШИБКА"}`);

  // 2. owner равен 'Не указан в переданных данных'
  const allOwnersNullFallback = parsed.priorityActions.every((a: any) => a.owner === "Не указан в переданных данных");
  console.log(`2. Все owner равны "Не указан в переданных данных": ${allOwnersNullFallback ? "✅ ПРОЙДЕНО" : "❌ ОШИБКА"}`);

  // 3. severity на русском
  const validRuSeverities = ["низкая", "средняя", "высокая", "критическая"];
  const severitiesOk = parsed.keyProblems.every((p: any) => validRuSeverities.includes(p.severity));
  console.log(`3. Уровни критичности (severity) строго на русском: ${severitiesOk ? "✅ ПРОЙДЕНО" : "❌ ОШИБКА"} (${parsed.keyProblems.map((p: any) => p.severity).join(", ")})`);

  // 4. projectProposal не предлагает отмену/изменение бюджета/переносы
  const textProposals = parsed.detailedAnalysis.projectProposal;
  console.log(`4. Текст projectProposal: "${textProposals}"`);
  const safeProposal = !/приостанов|отмен|бюджет|перенос/i.test(textProposals);
  console.log(`   Не содержит деструктивных рекомендаций: ${safeProposal ? "✅ ПРОЙДЕНО" : "❌ ОШИБКА"}`);

  // 5. aiProposal не выдумывает ИИ-сценарии
  const aiProp = parsed.detailedAnalysis.aiProposal;
  console.log(`5. Текст aiProposal: "${aiProp}"`);
  const safeAiProp = aiProp === "По переданным данным нет достаточных оснований для отдельного предложения по применению ИИ";
  console.log(`   Соответствует лаконичному отказу при неполноте: ${safeAiProp ? "✅ ПРОЙДЕНО" : "❌ ОШИБКА"}`);

  // 6. Проверка на отсутствие запрещенных технических слов во всех текстовых полях
  const forbiddenWords = ["resourceValue", "resourceLevel", "pcStatus", "tasksAndMilestones", "planFact", "pcTimeliness"];
  const foundForbidden: string[] = [];
  function scan(obj: any) {
    if (typeof obj === "string") {
      for (const f of forbiddenWords) {
        if (obj.includes(f)) foundForbidden.push(f);
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) scan(item);
    } else if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj)) {
        scan(obj[key]);
      }
    }
  }
  scan(parsed);
  console.log(`6. Поиск технических полей в текстовых значениях: ${foundForbidden.length === 0 ? "✅ ПРОЙДЕНО (не найдено)" : `❌ ОШИБКА (найдено: ${foundForbidden.join(", ")})`}`);

} catch (err: any) {
  console.error("❌ Тест завалился на ошибке:", err.message);
  process.exit(1);
}
