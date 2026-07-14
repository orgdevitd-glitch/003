export const ProjectAnalysisResultSchema = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["green", "yellow", "red", "gray"]
        },
        title: { type: "string" },
        text: { type: "string" },
        mainRiskSource: {
          type: ["string", "null"],
          enum: ["ПК", "Вехи", "Показатели", "Данные", "Сроки", "Риски", null]
        },
        goalImpact: {
          type: ["string", "null"]
        }
      },
      required: ["status", "title", "text", "mainRiskSource", "goalImpact"],
      additionalProperties: false
    },
    keyProblems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["ПК", "Вехи", "Показатели", "Данные", "Сроки", "Риски"]
          },
          problem: { type: "string" },
          evidence: {
            type: "array",
            items: { type: "string" }
          },
          managementAssessment: { type: "string" },
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"]
          }
        },
        required: ["category", "problem", "evidence", "managementAssessment", "severity"],
        additionalProperties: false
      }
    },
    priorityActions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          priority: { type: "number" },
          action: { type: "string" },
          linkedProblem: { type: "string" },
          expectedResult: { type: "string" },
          owner: {
            type: ["string", "null"]
          },
          deadlineHint: {
            type: ["string", "null"]
          }
        },
        required: ["priority", "action", "linkedProblem", "expectedResult", "owner", "deadlineHint"],
        additionalProperties: false
      }
    },
    directionAnalysis: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            summary: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["summary", "evidence"],
          additionalProperties: false
        },
        pc: {
          type: "object",
          properties: {
            summary: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["summary", "evidence"],
          additionalProperties: false
        },
        milestones: {
          type: "object",
          properties: {
            summary: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["summary", "evidence"],
          additionalProperties: false
        },
        indicators: {
          type: "object",
          properties: {
            summary: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["summary", "evidence"],
          additionalProperties: false
        }
      },
      required: ["data", "pc", "milestones", "indicators"],
      additionalProperties: false
    },
    aiProposal: {
      type: "object",
      properties: {
        title: { type: "string" },
        text: { type: "string" },
        projectUseCases: {
          type: "array",
          items: { type: "string" }
        },
        limitations: {
          type: ["string", "null"]
        }
      },
      required: ["title", "text", "projectUseCases", "limitations"],
      additionalProperties: false
    }
  },
  required: ["summary", "keyProblems", "priorityActions", "directionAnalysis", "aiProposal"],
  additionalProperties: false
};
