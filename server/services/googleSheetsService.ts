import https from "https";
import Papa from "papaparse";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import { Project, ProjectTask, ProjectIndicator, ProjectStatus, TaskStatus } from "../../src/types";
import { getGoogleSheetsConfig } from "./envHelper";
import { validateProjectRows, ImportValidationReport } from "./dataValidation";
import { normalizeProjectRows, NormalizedProject } from "./projectNormalizer";
import { toLegacyProjectView } from "./projectViewAdapter";
import { analyzeSheetColumns, normalizeHeaderName, normalizeRowKeys } from "./dataContract";
import { evaluateProjects, calculatePortfolioEvaluation, ProjectEvaluation, PortfolioEvaluation } from "./projectEvaluationService";
import { getIndicatorDictionary, IndicatorDictionaryItem } from "./indicatorDictionary";

export type EvaluationCacheMeta = {
  assessmentDate: string;
  projectSignature: string;
  indicatorDictionarySignature: string;
  projectIds: string[];
  generatedAt: string;
  methodologyVersion?: string;
};

export const COMPLETENESS_METHODOLOGY_VERSION = "field-based-v2-monitoring-lifecycle-sync-v2";

export function buildIndicatorDictionarySignature(dictionary: IndicatorDictionaryItem[]): string {
  if (!dictionary || dictionary.length === 0) return "";
  const sorted = [...dictionary].sort((a, b) => a.name.localeCompare(b.name));
  const mapped = sorted.map(item => {
    const aliases = item.aliases ? [...item.aliases].sort((a, b) => a.localeCompare(b)) : [];
    return {
      name: item.name,
      aliases,
      calculationType: item.calculationType,
      status: item.status || "active",
      unit: item.unit || null
    };
  });
  const serialized = JSON.stringify(mapped);
  return crypto.createHash("md5").update(serialized).digest("hex");
}

let lastImportReport: ImportValidationReport | null = null;
let latestNormalizedProjects: NormalizedProject[] = [];
let latestProjectEvaluations: ProjectEvaluation[] = [];
let latestPortfolioEvaluation: PortfolioEvaluation | null = null;
let latestEvaluationsMeta: EvaluationCacheMeta | null = null;

export function getLastImportReport(): ImportValidationReport | null {
  return lastImportReport;
}

export function getLatestNormalizedProjects(): NormalizedProject[] {
  return latestNormalizedProjects;
}

export function getLatestProjectEvaluations(): ProjectEvaluation[] {
  return latestProjectEvaluations;
}

export function getLatestPortfolioEvaluation(): PortfolioEvaluation | null {
  return latestPortfolioEvaluation;
}

const BLOCKING_PROJECT_ID_ISSUES = new Set([
  "ID_MISSING",
  "ID_INVALID_FORMAT",
  "ID_NOT_POSITIVE",
  "DUPLICATE_ID"
]);

export function assertValidProjectIdentities(report: ImportValidationReport): void {
  const blockingIssue = report.issues.find(issue =>
    BLOCKING_PROJECT_ID_ISSUES.has(issue.code)
  );
  if (blockingIssue) {
    throw new Error(
      `Google Sheets sync rejected because project identity is invalid at row ${blockingIssue.rowIndex}: ${blockingIssue.message}`
    );
  }
}

interface FetchResult {
  data: string;
  statusCode?: number;
  contentType?: string;
}

const GOOGLE_SHEETS_FETCH_TIMEOUT_MS = 30_000;

export async function fetchCsvFromGoogleSheets(
  url: string,
  timeoutMs: number = GOOGLE_SHEETS_FETCH_TIMEOUT_MS
): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/csv,text/plain,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8",
      }
    });

    const statusCode = response.status;
    const contentType = response.headers.get("content-type") || "";
    const data = await response.text();

    if (statusCode >= 400) {
      throw new Error(`Failed to fetch from Google Sheets: HTTP ${statusCode}`);
    }

    return { data, statusCode, contentType };
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(`Failed to fetch from Google Sheets: timed out after ${timeoutMs}ms`);
    }
    if (err.message && err.message.includes("Failed to fetch from Google Sheets")) {
      throw err;
    }
    throw new Error(`Failed to fetch from Google Sheets: ${err.message || String(err)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseNumber(val: string | undefined): number | null {
  if (!val) return null;
  const num = parseFloat(val.replace(",", "."));
  return isNaN(num) ? null : num;
}

function parseWeightSum(val: string | undefined): number | null {
  if (!val) return null;
  const parts = val.split(";").map(s => parseFloat(s.replace("%", "").trim())).filter(n => !isNaN(n));
  if (parts.length === 0) return null;
  return parts.reduce((acc, n) => acc + n, 0);
}

function parseWeightSumFact(val: string | undefined, quarter: string, stage: string | undefined): number | null {
  const plan = parseWeightSum(val);
  if (plan === null) return null;
  
  const cleanStage = (stage || "").trim();
  if (cleanStage === "Завершен") {
    return plan;
  }
  if (cleanStage === "Планируется") {
    return 0;
  }
  
  if (quarter === "Q1") {
    return plan;
  }
  if (quarter === "Q2") {
    const factor = cleanStage === "В работе" ? 0.5 : 0.25;
    return Math.round(plan * factor);
  }
  return 0;
}

export async function fetchProjectsFromSheet(assessmentDate: Date = new Date()): Promise<Project[]> {
  const config = getGoogleSheetsConfig();
  console.log("[GoogleSheets-Diagnose] Ingesting projects from Google Sheets:");
  console.log(`- hasGoogleSheetsUrl: ${config.hasGoogleSheetsUrl}`);
  console.log(`- usedEnvName: ${config.usedEnvName}`);
  console.log(`- normalizedUrl: "${config.normalizedUrl}"`);

  let bustedUrl = config.normalizedUrl;
  console.log(`Google Sheets final fetch URL: ${bustedUrl}`);

  let fetchResult: FetchResult;
  try {
    fetchResult = await fetchCsvFromGoogleSheets(bustedUrl);
    
    // If we successfully resolved but got HTML instead of CSV, it might be that /export was blocked or redirected,
    // so we can trigger the fallback if it's an export link.
    const tempIsHtml = (fetchResult.contentType && fetchResult.contentType.toLowerCase().includes("text/html")) || 
                     fetchResult.data.trim().startsWith("<!DOCTYPE") || 
                     fetchResult.data.trim().startsWith("<html") ||
                     fetchResult.data.trim().startsWith("<HTML");

    if (tempIsHtml && bustedUrl.includes("/export")) {
      console.warn("[GoogleSheets-Fallback] /export returned HTML instead of CSV. Retrying with /gviz/tq...");
      const fallbackUrl = bustedUrl.replace("/export", "/gviz/tq").replace("format=csv", "tqx=out:csv");
      console.log(`Google Sheets fallback URL: ${fallbackUrl}`);
      const fallbackResult = await fetchCsvFromGoogleSheets(fallbackUrl);
      
      const fallbackIsHtml = (fallbackResult.contentType && fallbackResult.contentType.toLowerCase().includes("text/html")) || 
                             fallbackResult.data.trim().startsWith("<!DOCTYPE") || 
                             fallbackResult.data.trim().startsWith("<html") ||
                             fallbackResult.data.trim().startsWith("<HTML");
      
      if (!fallbackIsHtml) {
        fetchResult = fallbackResult;
      }
    }
  } catch (err: any) {
    if (bustedUrl.includes("/export")) {
      console.warn("[GoogleSheets-Fallback] /export failed. Retrying with /gviz/tq... Error:", err.message);
      try {
        const fallbackUrl = bustedUrl.replace("/export", "/gviz/tq").replace("format=csv", "tqx=out:csv");
        console.log(`Google Sheets fallback URL: ${fallbackUrl}`);
        fetchResult = await fetchCsvFromGoogleSheets(fallbackUrl);
      } catch (fallbackErr: any) {
        console.error("[GoogleSheets-Error] Fallback query URL also failed:", fallbackErr.message);
        throw err; // throw original export error
      }
    } else {
      console.error("[GoogleSheets-Error] Failed to fetch CSV data:", err.message);
      throw err;
    }
  }

  const { data: csvData, statusCode, contentType } = fetchResult;
  console.log(`- HTTP Status: ${statusCode}`);
  console.log(`- Content-Type: ${contentType}`);

  const isHtml = (contentType && contentType.toLowerCase().includes("text/html")) || 
                 csvData.trim().startsWith("<!DOCTYPE") || 
                 csvData.trim().startsWith("<html") ||
                 csvData.trim().startsWith("<HTML");

  if (isHtml) {
    console.error(`[GoogleSheets-Error] Obtained HTML content instead of CSV data. usedEnvName: ${config.usedEnvName}, gid: ${config.gid}`);
    throw new Error(`Google Sheets returned HTML instead of CSV data. This usually means the spreadsheet is private, has restrictive sharing permissions, or the URL has been entered incorrectly. Ensure that the sheet is shared with "Anyone with the link can view".`);
  } else {
    const sample = csvData.substring(0, 100).replace(/\r?\n/g, " ");
    console.log(`- Sample: "${sample}..."`);
  }

  const results = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
  });

  const rawHeaders = results.meta.fields || [];
  const parsedHeaders = rawHeaders.map((h, idx) => normalizeHeaderName(h, idx));
  const rawRowsCount = (results.data || []).length;
  const normalizedRows = (results.data as Record<string, string>[] || []).map(row => normalizeRowKeys(row, rawHeaders));

  console.log(`- Parsed csv. Row count: ${rawRowsCount}, Original headers found: ${JSON.stringify(rawHeaders)}, Normalized headers: ${JSON.stringify(parsedHeaders)}`);

  // Run validation process
  let currentImportReport: ImportValidationReport;
  try {
    const report = validateProjectRows(normalizedRows, parsedHeaders, {
      assessmentDate
    });
    currentImportReport = report;
    lastImportReport = report;
    console.log(`[Validation Report]
  - Количество строк: ${report.rowCount}
  - Количество проектов: ${report.projectCount}
  - Найденные годы: ${JSON.stringify(report.detectedYears)}
  - Дата оценки: ${report.assessmentDate}
  - Количество ошибок: ${report.errorsCount}
  - Количество предупреждений: ${report.warningsCount}
  - Статус структуры таблицы: ${report.structureStatus}`);
  } catch (valErr: any) {
    console.error("[Validation-Error] Failed to execute validation engine:", valErr);
    throw new Error(`Google Sheets validation failed: ${valErr.message || String(valErr)}`);
  }

  assertValidProjectIdentities(currentImportReport);

  if (parsedHeaders.length === 0) {
    console.error(`[GoogleSheets-Error] Empty CSV structure or header row missing. gid used: ${config.gid}`);
    throw new Error(`Google Sheets CSV download succeeded but parsed 0 columns. Please check if tab/GID "${config.gid}" contains valid data.`);
  }

  const hasIdColumn = parsedHeaders.includes("ID");
  const hasNameColumn = parsedHeaders.includes("Название");

  if (!hasIdColumn || !hasNameColumn) {
    const missing: string[] = [];
    if (!hasIdColumn) missing.push("ID проекта (ИД проекта) или ID");
    if (!hasNameColumn) missing.push("Название проекта или Название");

    console.error(`[GoogleSheets-Error] Mandatory columns are missing: ${missing.join(", ")}`);
    console.error(`- All found columns on GID "${config.gid}": ${JSON.stringify(parsedHeaders)}`);
    console.error(`- Total raw rows parsed: ${rawRowsCount}`);

    throw new Error(`Mandatory columns are missing in Google Sheets tab (GID: ${config.gid}): ${missing.join(", ")}. Found columns: ${parsedHeaders.join(", ")}`);
  }

  const columnAnalysis = analyzeSheetColumns(parsedHeaders);
  
  // Normalize raw CSV records into NormalizedProject objects
  const normalized = normalizeProjectRows(normalizedRows, {
    assessmentDate,
    detectedYears: currentImportReport.detectedYears || columnAnalysis.detectedYears,
    columnAnalysis,
    validationReport: currentImportReport
  });
  
  // Calculate project evaluations & portfolio metrics
  const indicatorDictionary = getIndicatorDictionary();
  const importIssuesByProjectId: Record<string, import("./dataValidation").DataIssue[]> = {};
  if (currentImportReport.issues?.length) {
    for (const issue of currentImportReport.issues) {
      const key = String(issue.projectId || "");
      if (!key) continue;
      if (!importIssuesByProjectId[key]) importIssuesByProjectId[key] = [];
      importIssuesByProjectId[key].push(issue);
    }
  }
  const evaluations = evaluateProjects(normalized, {
    assessmentDate,
    indicatorDictionary,
    importIssuesByProjectId
  });
  latestProjectEvaluations = evaluations;
  latestPortfolioEvaluation = calculatePortfolioEvaluation(normalized, evaluations, {
    assessmentDate,
    indicatorDictionary
  });

  // Attach evaluation objects directly to NormalizedProjects
  normalized.forEach((proj, idx) => {
    (proj as any).evaluation = evaluations[idx];
  });

  latestNormalizedProjects = normalized;

  // Convert NormalizedProject objects back to legacy format for UI compatibility
  const finalProjects = normalized.map(toLegacyProjectView);
  console.log(`- Converted projects count: ${finalProjects.length}`);

  // Save calculated evaluations & normalized projects to cache on disk asynchronously
  saveEvaluationsToDisk(finalProjects, assessmentDate).catch(err => {
    console.error("[GoogleSheets-Cache] Non-blocking cache save failed:", err);
  });

  return finalProjects;
}

const DATA_DIR = process.env.DATA_DIR 
  ? path.resolve(process.env.DATA_DIR) 
  : path.join(process.cwd(), "data");

const EVALUATIONS_FILE = path.join(DATA_DIR, "project-evaluations.json");
const PORTFOLIO_EVAL_FILE = path.join(DATA_DIR, "portfolio-evaluation.json");
const NORMALIZED_PROJECTS_FILE = path.join(DATA_DIR, "normalized-projects.json");
const SHEETS_IMPORT_REPORT_FILE = path.join(DATA_DIR, "sheets-import-report.json");
const EVALUATIONS_META_FILE = path.join(DATA_DIR, "evaluations-meta.json");

export function buildProjectEvaluationSignature(projects: Project[]): string {
  if (!projects || projects.length === 0) return "";
  const extracted = projects.map(p => {
    const proj = p as any;
    return {
      projectId: String(p.projectId || p.id || ""),
      projectName: p.projectName || proj.baseInfo?.title || "",
      stage: String(p.stage || proj.baseInfo?.stage || ""),
      status: String(p.status || ""),
      startDate: String(p.startDate || proj.baseInfo?.startDate || p.createdAt || ""),
      endDate: String(p.endDate || proj.baseInfo?.endDate || ""),
      deadlineAt: String(p.deadlineAt || proj.baseInfo?.endDate || ""),
      goals: Array.isArray(p.goals) ? p.goals.join(";") : String(p.goals || proj.baseInfo?.goals || ""),
      resultImages: Array.isArray(p.resultImages) ? p.resultImages.join(";") : String(p.resultImages || proj.baseInfo?.resultImages || ""),
      type: p.projectType || proj.baseInfo?.type || "",
      projectManager: p.projectManager || proj.people?.projectManager || "",
      projectAdmin: p.projectAdmin || proj.people?.projectAdmin || "",
      sponsor: Array.isArray(p.sponsor) ? p.sponsor.join(";") : String(p.sponsor || proj.people?.customers || ""),
      projectTeam: Array.isArray(p.projectTeam) ? p.projectTeam.join(";") : String(p.projectTeam || proj.people?.team || ""),
      priority: p.priority !== undefined && p.priority !== null ? Number(p.priority) : (proj.baseInfo?.priority !== undefined && proj.baseInfo?.priority !== null ? Number(proj.baseInfo?.priority) : null),
      responsible: p.responsible || proj.people?.responsible || "",
      monitoringStart: p.monitoringStart || proj.monitoring?.startDate || "",
      monitoringFrequencyWeeks: p.monitoringFrequencyWeeks !== undefined && p.monitoringFrequencyWeeks !== null ? Number(p.monitoringFrequencyWeeks) : (proj.monitoring?.regularityWeeks !== undefined && proj.monitoring?.regularityWeeks !== null ? Number(proj.monitoring?.regularityWeeks) : null),
      lastPcDate: p.lastPcDate || proj.monitoring?.lastMonitoringDate || "",
      observers: Array.isArray(p.observers) ? p.observers.join(";") : (Array.isArray(proj.people?.monitoringParticipants) ? proj.people?.monitoringParticipants.join(";") : ""),
      projectOwner: p.projectOwner || p.owner || proj.people?.owner || "",
      department: Array.isArray(p.department) ? p.department.join(";") : (Array.isArray(proj.organization?.departments) ? proj.organization?.departments.join(";") : String(p.department || "")),
      milestones: Array.isArray(p.milestones) ? p.milestones.map(m => ({
        taskId: m.taskId,
        status: m.status,
        quarter: m.quarter,
        weight: m.weight,
        progressPercent: m.progressPercent,
        isMilestone: m.isMilestone
      })) : null,
      indicators: Array.isArray(p.indicators) ? p.indicators.map(i => ({
        indicatorId: i.indicatorId,
        name: i.name,
        planValue: i.planValue,
        factValue: i.factValue,
        period: i.period
      })) : null,
      _rawByYear: (p as any)._rawByYear || null,
      _rawMilestonesNew: (p as any)._rawMilestonesNew || null
    };
  });
  extracted.sort((a, b) => a.projectId.localeCompare(b.projectId));
  return JSON.stringify(extracted);
}

function isStateValid(
  projects: Project[],
  assessmentDate: Date,
  meta: EvaluationCacheMeta | null,
  evaluations: ProjectEvaluation[]
): boolean {
  if (!evaluations || evaluations.length === 0) return false;
  if (!meta) return false;
  if (!projects || projects.length === 0) return false;

  // Check methodology version matches
  if (meta.methodologyVersion !== COMPLETENESS_METHODOLOGY_VERSION) {
    console.log(`[GoogleSheets-Cache] Invalidating cache due to methodology version mismatch. Cache: ${meta.methodologyVersion || 'v1'}, Current: ${COMPLETENESS_METHODOLOGY_VERSION}`);
    return false;
  }

  // 1. Check assessmentDate matches (day level precision check)
  const targetDateStr = new Date(assessmentDate).toISOString().split("T")[0];
  const metaDateStr = new Date(meta.assessmentDate).toISOString().split("T")[0];
  if (targetDateStr !== metaDateStr) {
    return false;
  }

  // 2. Check project IDs
  const projectIds = projects.map(p => String(p.projectId || p.id || ""));
  if (projectIds.length !== meta.projectIds.length) {
    return false;
  }
  const metaIdsSet = new Set(meta.projectIds);
  for (const id of projectIds) {
    if (!metaIdsSet.has(id)) {
      return false;
    }
  }

  // 3. Check signatures match
  const currentSignature = buildProjectEvaluationSignature(projects);
  if (currentSignature !== meta.projectSignature) {
    return false;
  }

  // 4. Check indicatorDictionarySignature matches
  const currentDictSignature = buildIndicatorDictionarySignature(getIndicatorDictionary());
  if (currentDictSignature !== meta.indicatorDictionarySignature) {
    return false;
  }

  // 5. Verify evaluation counts
  if (evaluations.length !== projects.length) {
    return false;
  }

  return true;
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.ensureDir(dir);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeJson(tmpPath, data);
    await fs.move(tmpPath, filePath, { overwrite: true });
  } catch (err) {
    try {
      if (await fs.pathExists(tmpPath)) await fs.remove(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

export async function saveEvaluationsToDisk(
  projects: Project[],
  assessmentDate: Date
): Promise<void> {
  if (!projects || projects.length === 0) {
    // Under Rule 5: do not overwrite valid cached data with empty data
    console.log("[GoogleSheets-Cache] Avoid overwriting valid disk cache with empty projects list.");
    return;
  }
  try {
    const signature = buildProjectEvaluationSignature(projects);
    const dictSignature = buildIndicatorDictionarySignature(getIndicatorDictionary());
    const meta: EvaluationCacheMeta = {
      assessmentDate: assessmentDate.toISOString(),
      projectSignature: signature,
      indicatorDictionarySignature: dictSignature,
      projectIds: projects.map(p => String(p.projectId || p.id || "")),
      generatedAt: new Date().toISOString(),
      methodologyVersion: COMPLETENESS_METHODOLOGY_VERSION
    };
    latestEvaluationsMeta = meta;

    await fs.ensureDir(DATA_DIR);
    await writeJsonAtomic(EVALUATIONS_FILE, latestProjectEvaluations);
    await writeJsonAtomic(PORTFOLIO_EVAL_FILE, latestPortfolioEvaluation);
    await writeJsonAtomic(NORMALIZED_PROJECTS_FILE, latestNormalizedProjects);
    await writeJsonAtomic(SHEETS_IMPORT_REPORT_FILE, lastImportReport);
    await writeJsonAtomic(EVALUATIONS_META_FILE, meta);

    // Keep legacy projects.json in sync so fallback works without Sheets
    const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
    await writeJsonAtomic(PROJECTS_FILE, projects);

    console.log("[GoogleSheets-Cache] Successfully saved evaluations, metadata, normalized projects, and projects.json to disk.");
  } catch (err) {
    console.error("[GoogleSheets-Cache] Failed to save evaluations to disk:", err);
  }
}

export function reconstructNormalizedProjectsFromLegacy(
  legacyProjects: Project[],
  assessmentDate: Date = new Date()
): NormalizedProject[] {
  const reconstructedRows: Record<string, string>[] = [];
  const detectedYearsSet = new Set<number>();

  for (const proj of legacyProjects) {
    const rawRow: Record<string, string> = {};
    rawRow["ID"] = String(proj.projectId || proj.id || "");
    rawRow["Название"] = String(proj.projectName || "");
    rawRow["Цели проекта"] = String(proj.goals?.[0] || "");
    rawRow["Образы результатов"] = String(proj.resultImages?.[0] || "");
    rawRow["Дата начала"] = String(proj.startDate || proj.createdAt || "");
    rawRow["Дата завершения"] = String(proj.endDate || proj.deadlineAt || "");
    rawRow["Стадия"] = String(proj.stage || "");
    rawRow["Вид"] = String(proj.projectType || "");
    rawRow["Руководитель проекта"] = String(proj.projectManager || "");
    rawRow["Администратор проекта"] = String(proj.projectAdmin || "");
    rawRow["Заказчики"] = String(proj.sponsor || "");
    rawRow["Команда проекта"] = String(proj.projectTeam || "");
    rawRow["Приоритет"] = proj.priority !== undefined && proj.priority !== null ? String(proj.priority) : "";
    rawRow["Ответственный"] = String(proj.responsible || "");
    rawRow["Дата начала мониторинга"] = String(proj.monitoringStart || "");
    rawRow["Регулярность мониторинга (1 раз в количество недель)"] = proj.monitoringFrequencyWeeks !== undefined && proj.monitoringFrequencyWeeks !== null ? String(proj.monitoringFrequencyWeeks) : "";
    rawRow["Дата последнего мониторинга"] = String(proj.lastPcDate || "");
    rawRow["Обязательные участники Мониторинга"] = Array.isArray(proj.observers) ? proj.observers.join("; ") : String(proj.observers || "");
    rawRow["Владелец проекта"] = String(proj.projectOwner || "");
    rawRow["Департамент"] = String(proj.department || "");
    rawRow["Ссылка на проект"] = String(proj.projectUrl || "");

    // Extract raw quarters/indicators by year
    const rawByYear = (proj as any)._rawByYear || {};
    const years = Object.keys(rawByYear).map(Number).filter(n => !isNaN(n));
    if (years.length === 0) {
      years.push(new Date().getFullYear());
    }

    for (const year of years) {
      detectedYearsSet.add(year);
      const yearData = rawByYear[year] || {};
      
      const milestones = yearData.milestones || {};
      rawRow[`Вехи ${year} Q1`] = milestones.q1names || "";
      rawRow[`% выполнения Вехи ${year} Q1`] = milestones.q1progress || "";
      rawRow[`Вес вехи ${year} Q1`] = milestones.q1weights || "";
      rawRow[`Вехи ${year} Q2`] = milestones.q2names || "";
      rawRow[`% выполнения Вехи ${year} Q2`] = milestones.q2progress || "";
      rawRow[`Вес вехи ${year} Q2`] = milestones.q2weights || "";
      rawRow[`Вехи ${year} Q3`] = milestones.q3names || "";
      rawRow[`% выполнения Вехи ${year} Q3`] = milestones.q3progress || "";
      rawRow[`Вес вехи ${year} Q3`] = milestones.q3weights || "";
      rawRow[`Вехи ${year} Q4`] = milestones.q4names || "";
      rawRow[`% выполнения Вехи ${year} Q4`] = milestones.q4progress || "";
      rawRow[`Вес вехи ${year} Q4`] = milestones.q4weights || "";

      const indicators = yearData.indicators || {};
      rawRow[`Показатели проекта ${year} Q1`] = indicators.q1names || "";
      rawRow[`План Показатели проекта ${year} Q1`] = indicators.q1plans || "";
      rawRow[`Факт Показатели проекта ${year} Q1`] = indicators.q1facts || "";
      rawRow[`Показатели проекта ${year} Q2`] = indicators.q2names || "";
      rawRow[`План Показатели проекта ${year} Q2`] = indicators.q2plans || "";
      rawRow[`Факт Показатели проекта ${year} Q2`] = indicators.q2facts || "";
      rawRow[`Показатели проекта ${year} Q3`] = indicators.q3names || "";
      rawRow[`План Показатели проекта ${year} Q3`] = indicators.q3plans || "";
      rawRow[`Факт Показатели проекта ${year} Q3`] = indicators.q3facts || "";
      rawRow[`Показатели проекта ${year} Q4`] = indicators.q4names || "";
      rawRow[`План Показатели проекта ${year} Q4`] = indicators.q4plans || "";
      rawRow[`Факт Показатели проекта ${year} Q4`] = indicators.q4facts || "";
    }

    reconstructedRows.push(rawRow);
  }

  const detectedYears = Array.from(detectedYearsSet);
  if (detectedYears.length === 0) {
    detectedYears.push(new Date().getFullYear());
  }

  // Generate headers to analyze columns
  const allHeaders = reconstructedRows.length > 0 ? Object.keys(reconstructedRows[0]) : [];
  const columnAnalysis = analyzeSheetColumns(allHeaders);

  const normalized = normalizeProjectRows(reconstructedRows, {
    assessmentDate,
    detectedYears,
    columnAnalysis
  });

  return normalized;
}

export async function restoreOrCalculateEvaluations(
  projects: Project[],
  assessmentDate: Date = new Date()
): Promise<void> {
  // If projects list is empty, reset RAM but do NOT write/overwrite disk cache (preserve existing cache)
  if (!projects || projects.length === 0) {
    console.log("[GoogleSheets-Cache] No projects provided. Resetting RAM evaluations (preserving disk cache).");
    latestProjectEvaluations = [];
    latestPortfolioEvaluation = null;
    latestNormalizedProjects = [];
    lastImportReport = null;
    latestEvaluationsMeta = null;
    return;
  }

  // If RAM is already set and is valid for projects & assessmentDate, nothing to do
  if (isStateValid(projects, assessmentDate, latestEvaluationsMeta, latestProjectEvaluations)) {
    console.log("[GoogleSheets-Cache] RAM evaluations are already valid and matched with projects.");
    return;
  }

  // Otherwise, try to load from persistent cache on disk and check its metadata
  let diskLoaded = false;
  try {
    const evExists = await fs.pathExists(EVALUATIONS_FILE);
    const portExists = await fs.pathExists(PORTFOLIO_EVAL_FILE);
    const normExists = await fs.pathExists(NORMALIZED_PROJECTS_FILE);
    const metaExists = await fs.pathExists(EVALUATIONS_META_FILE);

    if (evExists && portExists && normExists && metaExists) {
      const metaTemp: EvaluationCacheMeta = await fs.readJson(EVALUATIONS_META_FILE);
      const evTemp = await fs.readJson(EVALUATIONS_FILE);
      const portTemp = await fs.readJson(PORTFOLIO_EVAL_FILE);
      const normTemp = await fs.readJson(NORMALIZED_PROJECTS_FILE);
      let reportTemp = null;
      if (await fs.pathExists(SHEETS_IMPORT_REPORT_FILE)) {
        reportTemp = await fs.readJson(SHEETS_IMPORT_REPORT_FILE);
      }

      if (Array.isArray(evTemp) && Array.isArray(normTemp) && isStateValid(projects, assessmentDate, metaTemp, evTemp)) {
        latestProjectEvaluations = evTemp;
        latestPortfolioEvaluation = portTemp;
        latestNormalizedProjects = normTemp;
        lastImportReport = reportTemp;
        latestEvaluationsMeta = metaTemp;
        diskLoaded = true;
        console.log("[GoogleSheets-Cache] Successfully restored valid evaluations and normalized projects from disk cache.");
      } else {
        console.log("[GoogleSheets-Cache] Disk cache metadata or evaluations are stale or mismatched.");
      }
    }
  } catch (err) {
    console.warn("[GoogleSheets-Cache] Failed to load evaluations cache from disk, will recalculate from projects. Error:", err);
  }

  // If disk loading failed or cache was invalid/outdated/mismatched, recalculate from the projects list!
  if (!diskLoaded) {
    console.log(`[GoogleSheets-Cache] Cache invalid or missing. Recalculating evaluations for ${projects.length} projects...`);
    try {
      const normalized = reconstructNormalizedProjectsFromLegacy(projects, assessmentDate);
      const indicatorDictionary = getIndicatorDictionary();
      const evaluations = evaluateProjects(normalized, { assessmentDate, indicatorDictionary });
      
      latestProjectEvaluations = evaluations;
      latestPortfolioEvaluation = calculatePortfolioEvaluation(normalized, evaluations, { assessmentDate, indicatorDictionary });
      
      // Attach evaluation objects directly to NormalizedProjects
      normalized.forEach((proj, idx) => {
        (proj as any).evaluation = evaluations[idx];
      });
      latestNormalizedProjects = normalized;

      console.log("[GoogleSheets-Cache] Successfully recalculated evaluations from projects.");
      const finalProjects = normalized.map(toLegacyProjectView);
      await saveEvaluationsToDisk(finalProjects, assessmentDate);
    } catch (calcErr) {
      console.error("[GoogleSheets-Cache] Critical failure while recalculating evaluations from projects list:", calcErr);
      if (!latestProjectEvaluations) latestProjectEvaluations = [];
    }
  }
}

export function resetLatestEvaluationsForTesting(): void {
  lastImportReport = null;
  latestNormalizedProjects = [];
  latestProjectEvaluations = [];
  latestPortfolioEvaluation = null;
  latestEvaluationsMeta = null;
}
