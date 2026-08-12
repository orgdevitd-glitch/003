import { validateAgainstSchema } from "../server/services/openaiAnalysisService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTest(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function validAnalysisResult(): any {
  return {
    summary: {
      status: "yellow",
      title: "Требуется внимание",
      text: "Есть управляемые отклонения.",
      mainRiskSource: "Вехи",
      goalImpact: null
    },
    keyProblems: [
      {
        category: "Вехи",
        problem: "Отставание по контрольной точке",
        evidence: ["Веха выполнена на 70%."],
        managementAssessment: "Нужен корректирующий план.",
        severity: "high"
      }
    ],
    priorityActions: [
      {
        priority: 1,
        action: "Согласовать корректирующий план",
        linkedProblem: "Отставание по контрольной точке",
        expectedResult: "Возврат в плановый график",
        owner: null,
        deadlineHint: "До следующего ПК"
      }
    ],
    directionAnalysis: {
      data: {
        summary: "Данных достаточно.",
        evidence: ["Обязательные поля заполнены."]
      },
      pc: {
        summary: "ПК проводится регулярно.",
        evidence: []
      },
      milestones: {
        summary: "Одна веха отстает.",
        evidence: ["Фактическое выполнение ниже плана."]
      },
      indicators: {
        summary: "Показатели в норме.",
        evidence: ["Факт соответствует плану."]
      }
    },
    aiProposal: {
      title: "Помощник по мониторингу",
      text: "ИИ может формировать черновик статуса.",
      projectUseCases: ["Подготовка сводки отклонений"],
      limitations: null
    }
  };
}

function cloneResult(): any {
  return JSON.parse(JSON.stringify(validAnalysisResult()));
}

function assertRejected(
  mutate: (value: any) => void,
  expectedMessage: string
): void {
  const value = cloneResult();
  mutate(value);

  let thrown: unknown;
  try {
    validateAgainstSchema(value);
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, "invalid result must be rejected");
  assert(
    thrown.message.includes(expectedMessage),
    `expected error containing "${expectedMessage}", received "${thrown.message}"`
  );
}

runTest("accepts a complete result including nullable contract fields", () => {
  validateAgainstSchema(validAnalysisResult());
});

runTest("rejects missing required root sections", () => {
  assertRejected(
    value => delete value.priorityActions,
    "missing required property 'priorityActions'"
  );
});

runTest("rejects unsupported summary status values", () => {
  assertRejected(
    value => {
      value.summary.status = "amber";
    },
    "'summary.status' must be one of"
  );
});

runTest("rejects extra summary fields from schema-drifting responses", () => {
  assertRejected(
    value => {
      value.summary.confidence = 0.8;
    },
    "'summary' contains extra property 'confidence'"
  );
});

runTest("rejects non-string problem evidence", () => {
  assertRejected(
    value => {
      value.keyProblems[0].evidence = ["valid", 42];
    },
    "'keyProblems[0].evidence[1]' must be a string"
  );
});

runTest("rejects invalid nullable action owners", () => {
  assertRejected(
    value => {
      value.priorityActions[0].owner = { name: "Owner" };
    },
    "'priorityActions[0].owner' must be string or null"
  );
});

runTest("rejects malformed direction-analysis evidence", () => {
  assertRejected(
    value => {
      value.directionAnalysis.pc.evidence = "Нет отклонений";
    },
    "'directionAnalysis.pc.evidence' must be an array"
  );
});

runTest("rejects non-string AI project use cases", () => {
  assertRejected(
    value => {
      value.aiProposal.projectUseCases = ["Valid use case", null];
    },
    "'aiProposal.projectUseCases[1]' must be a string"
  );
});

console.log("All OpenAI analysis schema validation tests passed.");
