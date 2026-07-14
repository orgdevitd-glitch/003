import OpenAI from "openai";
import { Project, ProjectAnalysisResult } from "../../src/types";
import { ProjectAnalysisResultSchema } from "../prompts/projectAnalysisSchema";
import { cleanEnv, isValidAssistantId } from "./envHelper";
import { ProjectAnalysisPayload } from "./projectAnalysisPayloadService";

export async function analyzeProjectWithOpenAI(input: {
  project: Project;
  assessmentDate: string;
  analysisPayload: ProjectAnalysisPayload;
}): Promise<ProjectAnalysisResult> {
  const apiKey = cleanEnv(process.env.OPENAI_API_KEY);

  if (!apiKey) {
    console.error("[ProjectAnalysis] OPENAI_API_KEY is missing or empty in environment variables.");
    throw new Error("Анализ временно недоступен. Обратитесь к администратору (не настроен OPENAI_API_KEY).");
  }

  const assistantId = cleanEnv(process.env.PROJECT_ANALYSIS_ASSISTANT_ID);

  if (!assistantId) {
    console.error("[ProjectAnalysis] PROJECT_ANALYSIS_ASSISTANT_ID is missing or empty in environment variables.");
    throw new Error("Анализ временно недоступен. Обратитесь к администратору (не настроен PROJECT_ANALYSIS_ASSISTANT_ID).");
  }

  if (!isValidAssistantId(assistantId)) {
    console.error(`[ProjectAnalysis] PROJECT_ANALYSIS_ASSISTANT_ID is invalid (must start with "asst_"): "${assistantId}"`);
    throw new Error("Анализ временно недоступен. Обратитесь к администратору (некорректный PROJECT_ANALYSIS_ASSISTANT_ID).");
  }

  console.log("[ProjectAnalysis-Diagnose]", {
    hasAssistantId: Boolean(assistantId),
    assistantId,
    usesAssistantApi: true
  });

  const openai = new OpenAI({ apiKey });

  const projectData = {
    assessmentDate: input.assessmentDate,
    analysisPayload: input.analysisPayload,
    assistantEvidenceBrief: input.analysisPayload.assistantEvidenceBrief,
    legacyProject: input.project
  };

  const thread = await openai.beta.threads.create();

  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: JSON.stringify({
      task: "Оцени проект по переданным данным и верни результат строго по заданной JSON-схеме.",
      projectData
    })
  });

  const additionalInstructions = `Используй системный промпт ассистента как главный набор правил.

Основной фактический материал текущего анализа:
- projectData.assistantEvidenceBrief
- analysisPayload.cardSnapshot
- analysisPayload.analysisInsights
- analysisPayload.projectContentContext
- analysisPayload.assessmentContext

Анализ выполняется строго на дату assessmentContext.assessmentDate.

Будущие периоды после даты оценки не являются текущим отставанием. В проблемах, действиях и основаниях используй только вехи и показатели, у которых isDueAsOfAssessmentDate = true.

Если в assistantEvidenceBrief есть проблемные вехи, назови 1-3 конкретные вехи по имени.

Если в assistantEvidenceBrief есть проблемные показатели, назови 1-3 конкретные показатели по имени.

aiProposal должен описывать применение ИИ внутри самого проекта на основе projectContentContext.aiUsePotentialContext, а не контроль дашборда.`;

  let run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistantId,
    additional_instructions: additionalInstructions,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "project_analysis_result",
        strict: true,
        schema: ProjectAnalysisResultSchema
      }
    }
  });

  await waitForRun(openai, thread.id, run.id);

  const parsedResult = await getAssistantResponse(openai, thread.id, run.id);

  return {
    analysisId: run.id,
    projectId: input.project.projectId,
    createdAt: new Date().toISOString(),
    model: `Assistant (${assistantId})`,
    ...parsedResult
  };
}

async function waitForRun(openai: OpenAI, threadId: string, runId: string) {
  let run = await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });
  while (["queued", "in_progress", "cancelling"].includes(run.status)) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    run = await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });
  }
  if (run.status !== "completed") {
    throw new Error(`OpenAI assistant run failed with status: ${run.status}`);
  }
  return run;
}

async function getAssistantResponse(openai: OpenAI, threadId: string, runId: string): Promise<any> {
  const messages = await openai.beta.threads.messages.list(threadId);
  const resultMessage = messages.data.find(
    (message) => message.role === "assistant" && message.run_id === runId
  ) || messages.data.find(
    (message) => message.role === "assistant"
  );

  let rawText = "";
  if (resultMessage?.content) {
    for (const block of resultMessage.content) {
      if (block.type === "text") {
        rawText += block.text.value;
      }
    }
  }

  if (!rawText) {
    throw new Error("Assistant returned empty response");
  }

  try {
    const parsedResult = JSON.parse(rawText);
    validateAgainstSchema(parsedResult);
    return parsedResult;
  } catch (error: any) {
    throw new Error(`Assistant returned invalid or schema-deviating JSON: ${error.message}`);
  }
}

export function validateAgainstSchema(data: any): void {
  if (!data || typeof data !== "object") {
    throw new Error("Validation Error: Root element is not an object");
  }

  // Check excess properties on root if additionalProperties is false
  const allowedRootKeys = ["summary", "keyProblems", "priorityActions", "directionAnalysis", "aiProposal"];
  for (const key of Object.keys(data)) {
    if (!allowedRootKeys.includes(key)) {
      throw new Error(`Validation Error: Root contains extra property '${key}'`);
    }
  }

  // Check required root properties
  for (const key of allowedRootKeys) {
    if (!(key in data)) {
      throw new Error(`Validation Error: Root is missing required property '${key}'`);
    }
  }

  // Validate summary
  const summary = data.summary;
  if (!summary || typeof summary !== "object") {
    throw new Error("Validation Error: 'summary' is not a valid object");
  }
  const allowedSummaryKeys = ["status", "title", "text", "mainRiskSource", "goalImpact"];
  for (const key of Object.keys(summary)) {
    if (!allowedSummaryKeys.includes(key)) {
      throw new Error(`Validation Error: 'summary' contains extra property '${key}'`);
    }
  }
  for (const key of allowedSummaryKeys) {
    if (!(key in summary)) {
      throw new Error(`Validation Error: 'summary' is missing required property '${key}'`);
    }
  }
  const validStatuses = ["green", "yellow", "red", "gray"];
  if (!validStatuses.includes(summary.status)) {
    throw new Error(`Validation Error: 'summary.status' must be one of: ${validStatuses.join(", ")}. Received: '${summary.status}'`);
  }
  if (typeof summary.title !== "string") throw new Error("Validation Error: 'summary.title' must be a string");
  if (typeof summary.text !== "string") throw new Error("Validation Error: 'summary.text' must be a string");
  
  const validMainRiskSources = ["ПК", "Вехи", "Показатели", "Данные", "Сроки", "Риски", null];
  if (!validMainRiskSources.includes(summary.mainRiskSource)) {
    throw new Error(`Validation Error: 'summary.mainRiskSource' must be one of: ${validMainRiskSources.filter(x => x !== null).join(", ")} or null. Received: '${summary.mainRiskSource}'`);
  }
  if (summary.goalImpact !== null && typeof summary.goalImpact !== "string") {
    throw new Error("Validation Error: 'summary.goalImpact' must be a string or null");
  }

  // Validate keyProblems
  if (!Array.isArray(data.keyProblems)) {
    throw new Error("Validation Error: 'keyProblems' must be an array");
  }
  for (let i = 0; i < data.keyProblems.length; i++) {
    const item = data.keyProblems[i];
    if (!item || typeof item !== "object") {
      throw new Error(`Validation Error: 'keyProblems[${i}]' is not an object`);
    }
    const allowedKeys = ["category", "problem", "evidence", "managementAssessment", "severity"];
    for (const key of Object.keys(item)) {
      if (!allowedKeys.includes(key)) {
        throw new Error(`Validation Error: 'keyProblems[${i}]' contains extra property '${key}'`);
      }
    }
    for (const key of allowedKeys) {
      if (!(key in item)) {
        throw new Error(`Validation Error: 'keyProblems[${i}]' is missing required property '${key}'`);
      }
    }
    const validCategories = ["ПК", "Вехи", "Показатели", "Данные", "Сроки", "Риски"];
    if (!validCategories.includes(item.category)) {
      throw new Error(`Validation Error: 'keyProblems[${i}].category' must be one of: ${validCategories.join(", ")}. Received: '${item.category}'`);
    }
    if (typeof item.problem !== "string") throw new Error(`Validation Error: 'keyProblems[${i}].problem' must be a string`);
    
    if (!Array.isArray(item.evidence)) throw new Error(`Validation Error: 'keyProblems[${i}].evidence' must be an array`);
    for (let j = 0; j < item.evidence.length; j++) {
      if (typeof item.evidence[j] !== "string") throw new Error(`Validation Error: 'keyProblems[${i}].evidence[${j}]' must be a string`);
    }

    if (typeof item.managementAssessment !== "string") throw new Error(`Validation Error: 'keyProblems[${i}].managementAssessment' must be a string`);
    const validSeverities = ["low", "medium", "high", "critical"];
    if (!validSeverities.includes(item.severity)) {
      throw new Error(`Validation Error: 'keyProblems[${i}].severity' must be one of: ${validSeverities.join(", ")}. Received: '${item.severity}'`);
    }
  }

  // Validate priorityActions
  if (!Array.isArray(data.priorityActions)) {
    throw new Error("Validation Error: 'priorityActions' must be an array");
  }
  for (let i = 0; i < data.priorityActions.length; i++) {
    const item = data.priorityActions[i];
    if (!item || typeof item !== "object") {
      throw new Error(`Validation Error: 'priorityActions[${i}]' is not an object`);
    }
    const allowedKeys = ["priority", "action", "linkedProblem", "expectedResult", "owner", "deadlineHint"];
    for (const key of Object.keys(item)) {
      if (!allowedKeys.includes(key)) {
        throw new Error(`Validation Error: 'priorityActions[${i}]' contains extra property '${key}'`);
      }
    }
    for (const key of allowedKeys) {
      if (!(key in item)) {
        throw new Error(`Validation Error: 'priorityActions[${i}]' is missing required property '${key}'`);
      }
    }
    if (typeof item.priority !== "number") throw new Error(`Validation Error: 'priorityActions[${i}].priority' must be a number`);
    if (typeof item.action !== "string") throw new Error(`Validation Error: 'priorityActions[${i}].action' must be a string`);
    if (typeof item.linkedProblem !== "string") throw new Error(`Validation Error: 'priorityActions[${i}].linkedProblem' must be a string`);
    if (typeof item.expectedResult !== "string") throw new Error(`Validation Error: 'priorityActions[${i}].expectedResult' must be a string`);
    if (item.owner !== null && typeof item.owner !== "string") throw new Error(`Validation Error: 'priorityActions[${i}].owner' must be string or null`);
    if (item.deadlineHint !== null && typeof item.deadlineHint !== "string") throw new Error(`Validation Error: 'priorityActions[${i}].deadlineHint' must be string or null`);
  }

  // Validate directionAnalysis
  const direction = data.directionAnalysis;
  if (!direction || typeof direction !== "object") {
    throw new Error("Validation Error: 'directionAnalysis' is not a valid object");
  }
  const allowedDirectionKeys = ["data", "pc", "milestones", "indicators"];
  for (const key of Object.keys(direction)) {
    if (!allowedDirectionKeys.includes(key)) {
      throw new Error(`Validation Error: 'directionAnalysis' contains extra property '${key}'`);
    }
  }
  for (const key of allowedDirectionKeys) {
    if (!(key in direction)) {
      throw new Error("Validation Error: 'directionAnalysis' is missing required property '" + key + "'");
    }
    const subObj = direction[key];
    if (!subObj || typeof subObj !== "object") {
      throw new Error("Validation Error: 'directionAnalysis." + key + "' must be an object");
    }
    if (typeof subObj.summary !== "string") {
      throw new Error("Validation Error: 'directionAnalysis." + key + ".summary' must be a string");
    }
    if (!Array.isArray(subObj.evidence)) {
      throw new Error("Validation Error: 'directionAnalysis." + key + ".evidence' must be an array");
    }
    for (let j = 0; j < subObj.evidence.length; j++) {
      if (typeof subObj.evidence[j] !== "string") {
        throw new Error("Validation Error: 'directionAnalysis." + key + ".evidence[" + j + "]' must be a string");
      }
    }
  }

  // Validate aiProposal
  const aiProposal = data.aiProposal;
  if (!aiProposal || typeof aiProposal !== "object") {
    throw new Error("Validation Error: 'aiProposal' is not a valid object");
  }
  const allowedAiKeys = ["title", "text", "projectUseCases", "limitations"];
  for (const key of Object.keys(aiProposal)) {
    if (!allowedAiKeys.includes(key)) {
      throw new Error(`Validation Error: 'aiProposal' contains extra property '${key}'`);
    }
  }
  for (const key of allowedAiKeys) {
    if (!(key in aiProposal)) {
      throw new Error("Validation Error: 'aiProposal' is missing required property '" + key + "'");
    }
  }
  if (typeof aiProposal.title !== "string") throw new Error("Validation Error: 'aiProposal.title' must be a string");
  if (typeof aiProposal.text !== "string") throw new Error("Validation Error: 'aiProposal.text' must be a string");
  if (!Array.isArray(aiProposal.projectUseCases)) throw new Error("Validation Error: 'aiProposal.projectUseCases' must be an array");
  for (let i = 0; i < aiProposal.projectUseCases.length; i++) {
    if (typeof aiProposal.projectUseCases[i] !== "string") {
      throw new Error("Validation Error: 'aiProposal.projectUseCases[" + i + "]' must be a string");
    }
  }
  if (aiProposal.limitations !== null && typeof aiProposal.limitations !== "string") {
    throw new Error("Validation Error: 'aiProposal.limitations' must be a string or null");
  }
}
