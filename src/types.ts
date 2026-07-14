/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProjectStatus =
  | "active"
  | "waiting"
  | "completed"
  | "cancelled"
  | "overdue"
  | "at_risk"
  | "unknown";

export interface Project {
  projectId: string;
  id?: string; // для обратной совместимости с legacy-полями в UI
  projectUrl?: string;
  projectName: string;
  projectDescription?: string;
  resultImages?: string[];

  stage?: string;
  status: ProjectStatus;

  owner?: string;
  executor?: string;
  coExecutors?: string[];
  observers?: string[];

  sponsor?: string;
  projectManager?: string;
  projectOwner?: string;
  responsible?: string;
  projectAdmin?: string;
  projectTeam?: string;
  projectType?: string;
  monitoringStart?: string;

  createdAt?: string;
  deadlineAt?: string;
  startDate?: string;
  endDate?: string;

  lastPcDate?: string | null;
  monitoringFrequencyWeeks?: number | null;

  goals?: string[];
  linkedGoals?: string[];

  resourceLevel?: string | null;
  resourceValue?: string | null;
  itResourceLevel?: string | null;

  rice?: number | null;
  roi?: number | null;

  tasks: ProjectTask[];
  milestones: ProjectTask[];
  indicators: ProjectIndicator[];
  risks?: ProjectRisk[];

  createdInAppAt?: string;
  updatedInAppAt?: string;
  lastSyncId?: string;
  source?: "sheets" | "bitrix24";
  lastAnalysis?: ProjectAnalysisResult | null;
  priority?: number | null;
  department?: string | null;

  _rawQuarters?: {
    q1plan: number | null; q1fact: number | null;
    q2plan: number | null; q2fact: number | null;
    q3plan: number | null; q3fact: number | null;
    q4plan: number | null; q4fact: number | null;
  };
  _rawMilestonesNew?: {
    q1names: string | null; q1progress: string | null; q1weights: string | null;
    q2names: string | null; q2progress: string | null; q2weights: string | null;
    q3names: string | null; q3progress: string | null; q3weights: string | null;
    q4names: string | null; q4progress: string | null; q4weights: string | null;
  };
  _rawIndicatorsNew?: {
    q1names: string | null; q1plans: string | null; q1facts: string | null;
    q2names: string | null; q2plans: string | null; q2facts: string | null;
    q3names: string | null; q3plans: string | null; q3facts: string | null;
    q4names: string | null; q4plans: string | null; q4facts: string | null;
  };
  _rawMonitoring?: {
    plannedNextPcPattern: string | null;
    pcStatusPattern: string | null;
    frequencyWeeksRaw?: string | null;
    monitoringStartRaw?: string | null;
    lastPcDateRaw?: string | null;
  };
  _rawAnalysisComment?: string;
  _dataYear?: number;
  _rawByYear?: {
    [year: number]: {
      milestones: {
        q1names?: string | null; q1progress?: string | null; q1weights?: string | null;
        q2names?: string | null; q2progress?: string | null; q2weights?: string | null;
        q3names?: string | null; q3progress?: string | null; q3weights?: string | null;
        q4names?: string | null; q4progress?: string | null; q4weights?: string | null;
      };
      indicators: {
        q1names?: string | null; q1plans?: string | null; q1facts?: string | null;
        q2names?: string | null; q2plans?: string | null; q2facts?: string | null;
        q3names?: string | null; q3plans?: string | null; q3facts?: string | null;
        q4names?: string | null; q4plans?: string | null; q4facts?: string | null;
      };
    };
  };
}

export type TaskStatus =
  | "Ждёт выполнения"
  | "Выполняется"
  | "Завершена"
  | "Отменена"
  | "Просрочена"
  | "Не указан";

export interface ProjectTask {
  taskId: string;
  taskUrl?: string;
  title: string;
  description?: string;

  status: TaskStatus;
  owner?: string;
  executor?: string;

  createdAt?: string;
  deadlineAt?: string;
  completedAt?: string | null;

  quarter?: string;
  weight?: number | null;
  progressPercent?: number | null;

  isMilestone?: boolean;
  resultText?: string;
  commentsForAnalysis?: string[];
}

export interface ProjectIndicator {
  indicatorId: string;
  name: string;
  planValue?: string | number | null;
  factValue?: string | number | null;
  unit?: string | null;
  period?: string | null;
  comment?: string | null;
}

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export interface ProjectRisk {
  riskId: string;
  title: string;
  description?: string;
  severity: RiskSeverity;
  owner?: string;
  recommendation?: string;
}

export interface ProjectAnalysisResult {
  analysisId: string;
  projectId: string;
  createdAt: string;
  model: string;

  // New compact blocks
  summary?: {
    status: "green" | "yellow" | "red" | "gray";
    title: string;
    text: string;
    mainRiskSource: "ПК" | "Вехи" | "Показатели" | "Данные" | "Сроки" | "Риски" | null;
    goalImpact: string | null;
  };
  keyProblems?: Array<{
    category: "ПК" | "Вехи" | "Показатели" | "Данные" | "Сроки" | "Риски";
    problem: string;
    evidence: string[];
    managementAssessment: string;
    severity: "low" | "medium" | "high" | "critical";
  }>;
  priorityActions?: Array<{
    priority: number;
    action: string;
    linkedProblem: string;
    expectedResult: string;
    owner: string | null;
    deadlineHint: string | null;
  }>;
  directionAnalysis?: {
    data: {
      summary: string;
      evidence: string[];
    };
    pc: {
      summary: string;
      evidence: string[];
    };
    milestones: {
      summary: string;
      evidence: string[];
    };
    indicators: {
      summary: string;
      evidence: string[];
    };
  };
  aiProposal?: {
    title: string;
    text: string;
    projectUseCases: string[];
    limitations: string | null;
  };

  // Keep old fields as optional for backward compatibility
  shortAnalysis?: {
    dataCompleteness: string;
    missingSignificantData: string[];
    pcTimeliness: string;
    nextPcDate: string | null;
    assessmentDate: string | null;
    weightedTaskProgress: string;
    periodPlan: string;
    periodFact: string;
    deviation: string;
    indicators: string;
    overallStatus: string;
  };
  managementConclusion?: string;
  detailedAnalysis?: {
    dataCompleteness: string;
    pcTimeliness: string;
    tasksAndMilestones: string;
    planFact: string;
    indicators: string;
    lagOrAdvance: string;
    projectProposal: string;
    aiProposal: string;
  };
}

export interface SyncLog {
  syncId: string;
  source: "bitrix24" | "sheets" | string;
  mode: "test" | "full" | "partial";
  syncedAt?: string;
  receivedAt: string;
  receivedProjects: number;
  created: number;
  updated: number;
  deleted?: number;
  errors: Array<{
    projectId?: string;
    field?: string;
    message: string;
  }>;
}

export interface Stats {
  total: number;
  active: number;
  completed: number;
  atRisk: number;
  overdue: number;
  missingData?: number;
  avgCompleteness?: number;
  avgProgress?: number;
  noIndicators?: number;
  lagging?: number;
}

export const THEME = {
  black: '#010101',
  yellow: '#F8BC03',
  white: '#FFFFFF',
  red: '#ef4444',
  green: '#10b981',
  orange: '#f59e0b',
  gray: '#9ca3af',
  blue: '#3b82f6',
  purple: '#8b5cf6'
};

export const CHART_COLORS = [THEME.black, THEME.yellow, THEME.blue, THEME.green, THEME.purple, THEME.orange, '#06b6d4', '#f43f5e', '#84cc16'];

export interface DataIssue {
  severity: "error" | "warning";
  rowIndex: number;
  projectId: string;
  projectName: string;
  field: string;
  code: string;
  message: string;
}

export interface SheetColumnAnalysis {
  yearsCount: number;
  detectedYears: number[];
  quarterColumnsGrouped: {
    [year: number]: {
      [quarter: string]: {
        hasMilestonesName: boolean;
        hasMilestonesProgress: boolean;
        hasMilestonesWeight: boolean;
        hasKpiName: boolean;
        hasKpiPlan: boolean;
        hasKpiFact: boolean;
      };
    };
  };
}

export interface ImportValidationReport {
  structureStatus: "ok" | "warning" | "error";
  rowCount: number;
  projectCount: number;
  errorsCount: number;
  warningsCount: number;
  issues: DataIssue[];
  columnAnalysis: any; // Simplified for client ease
  rowsWithErrors: number[];
  rowsWithWarnings: number[];
  detectedYears: number[];
  assessmentDate: string;
}

export interface NormalizedMilestone {
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
}

export interface NormalizedIndicator {
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
}

export interface ApplicableQuarter {
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  startDate: string;
  endDate: string;
  status: "past" | "current" | "future";
  isApplicable: boolean;
}

export interface NormalizedProject {
  id: string;
  projectId: string;
  sourceRowIndex: number;
  baseInfo: {
    title: string;
    goals: string;
    resultImages: string;
    type: string;
    stage: string;
    priority: number | null;
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
}

export interface IndicatorEvaluation {
  id: string;
  name: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  plan: number | null;
  fact: number | null;
  calculationType: "higher_is_better" | "lower_is_better" | "target" | "unknown";
  performancePercent: number | null;
  cappedPerformancePercent: number | null;
  status: "ok" | "attention" | "risk" | "future" | "not_enough_data" | "missing_dictionary";
  explanation: string;
}

export interface MilestoneEvaluation {
  id: string;
  name: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  originalWeightPercent: number | null;
  effectiveWeightPercent: number;
  weightSource: "explicit" | "calculated" | "equal_fallback" | "informational" | "excluded_no_progress";
  isIncludedInProgress: boolean;
  completionPercent: number | null;
  contributionPercent: number;
}

export interface ProjectEvaluation {
  projectId: string;
  assessmentDate: string;
  dataQuality: {
    status: "ok" | "warning" | "error";
    completenessPercent: number | null;
    errorsCount: number;
    warningsCount: number;
    issuesCount: number;
  };
  milestones: {
    status: "ok" | "attention" | "risk" | "not_applicable" | "not_enough_data";
    totalProgressPercent: number | null;
    actualProgressPercent: number | null;
    totalWeightPercent: number | null;
    weightControlStatus: "ok" | "warning" | "error" | "not_applicable";
    milestonesCount: number;
    actualMilestonesCount: number;
    completedMilestonesCount: number;
    overdueMilestonesCount: number;
    milestoneResults?: MilestoneEvaluation[];
  };
  indicators: {
    status: "ok" | "attention" | "risk" | "not_applicable" | "not_enough_data";
    averagePerformancePercent: number | null;
    cappedAveragePerformancePercent: number | null;
    calculatedIndicatorsCount: number;
    skippedFutureIndicatorsCount: number;
    missingDictionaryCount: number;
    indicatorResults: IndicatorEvaluation[];
  };
  monitoring: {
    status: "ok" | "attention" | "overdue" | "not_applicable" | "not_enough_data";
    lastMonitoringDate: string | null;
    nextMonitoringDate: string | null;
    overdueDays: number | null;
  };
  projectHealth: {
    status: "ok" | "attention" | "risk" | "not_enough_data";
    score: number | null;
    mainReasons: string[];
  };
  explanations: string[];
}

export interface PortfolioEvaluation {
  assessmentDate: string;
  totalProjects: number;
  okCount: number;
  attentionCount: number;
  riskCount: number;
  notEnoughDataCount: number;
  dataErrorCount: number;
  averageCompletenessPercent: number | null;
  averageMilestoneProgressPercent: number | null;
  averageActualMilestoneProgressPercent: number | null;
  averageIndicatorPerformancePercent: number | null;
}

export interface ApiProjectsResponse {
  success: boolean;
  projects: Project[];
  normalizedProjects?: NormalizedProject[];
  importReport?: ImportValidationReport;
  projectEvaluations?: ProjectEvaluation[];
  portfolioEvaluation?: PortfolioEvaluation;
  stats: Stats;
  dataSource: {
    source: "sheets" | "bitrix24" | string;
    syncedAt?: string;
  } | null;
  sync?: {
    receivedProjects: number;
    created: number;
    updated: number;
    errorsCount: number;
  } | null;
}

