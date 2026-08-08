import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { JsonProjectStorage } from "./server/storage/jsonProjectStorage";
import { analyzeProjectWithOpenAI } from "./server/services/openaiAnalysisService";
import { buildProjectAnalysisPayload } from "./server/services/projectAnalysisPayloadService";
import { fetchProjectsFromSheet, fetchCsvFromGoogleSheets, getLastImportReport, getLatestNormalizedProjects, getLatestProjectEvaluations, getLatestPortfolioEvaluation, restoreOrCalculateEvaluations, reconstructNormalizedProjectsFromLegacy } from "./server/services/googleSheetsService";
import { handleChatAssistantMessage, getChatAssistantStatus } from "./server/services/chatAssistantService";
import { getGoogleSheetsConfig, cleanEnv } from "./server/services/envHelper";
import { loadIndicatorDictionary, getIndicatorDictionaryStatus, getUnknownIndicatorsReport, loadIndicatorDictionaryWithTTL } from "./server/services/indicatorDictionaryService";
import { getIndicatorDictionary } from "./server/services/indicatorDictionary";
import { evaluateProject } from "./server/services/projectEvaluationService";
import { geoAccessMiddleware } from "./server/services/geoAccessService";
import { 
  getAdvancedAccessConfig, 
  verifyAdvancedAccessPassword,
  isAdvancedAccessActive,
  createAdvancedAccessSession,
  revokeAdvancedAccessSession
} from "./server/services/advancedAccessService";

dotenv.config();

const storage = new JsonProjectStorage();

// Session container for active tokens: token -> expiry timestamp (ms)
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const activeSessions = new Map<string, number>();

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of activeSessions.entries()) {
    if (expiresAt <= now) activeSessions.delete(token);
  }
}

function isSessionValid(token: string | null): boolean {
  if (!token) return false;
  pruneExpiredSessions();
  const expiresAt = activeSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

const getSessionFromCookie = (req: express.Request): string | null => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").reduce((acc: Record<string, string>, c: string) => {
    const [name, ...val] = c.trim().split("=");
    if (name) {
      acc[name] = val.join("=");
    }
    return acc;
  }, {});
  return cookies.session || null;
};

// SHA-256 hash calculator for secure verification
const getPasswordHash = (pwd: string): string => {
  return crypto.createHash("sha256").update(pwd).digest("hex");
};

function verifyPassword(pwd: string): boolean {
  const cleanPwd = pwd ? String(pwd).trim() : "";
  
  const envHash = process.env.APP_ACCESS_PASSWORD_HASH;
  if (envHash && envHash.trim() !== "") {
    return getPasswordHash(cleanPwd) === envHash.trim();
  }
  
  const envPwd = process.env.APP_ACCESS_PASSWORD;
  if (envPwd && envPwd.trim() !== "") {
    return cleanPwd === envPwd.trim();
  }
  
  return false;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize KPI dictionary and restore evaluations from storage on startup
  try {
    console.log("[Startup] Loading KPI indicator dictionary...");
    await loadIndicatorDictionary();
  } catch (err) {
    console.error("[Startup] Failed to load KPI indicator dictionary on startup:", err);
  }

  // Initialize and restore evaluations from storage on startup
  try {
    const rawProjects = await storage.getAllProjects();
    if (rawProjects.length > 0) {
      console.log(`[Startup] Restoring evaluations for ${rawProjects.length} projects...`);
      await restoreOrCalculateEvaluations(rawProjects);
    }
  } catch (err) {
    console.error("[Startup] Failed to restore evaluations on startup:", err);
  }

  app.use(cors());
  app.use((req, res, next) => {
    const limit =
      req.path === "/api/bitrix/projects/import" ? "50mb" :
      req.path.startsWith("/api/projects") ? "5mb" :
      "1mb";
    return express.json({ limit })(req, res, next);
  });
  app.use(geoAccessMiddleware);

  // Protection middleware for API endpoints
  app.use((req, res, next) => {
    const isPublicRoute =
      req.path === "/api/auth/login" ||
      req.path === "/api/auth/check" ||
      req.path === "/api/auth/logout" ||
      req.path === "/api/health" ||
      req.path === "/api/bitrix/health" ||
      req.path === "/api/bitrix/projects/import" ||
      req.path === "/api/indicator-dictionary/status" ||
      req.path === "/api/advanced-access/config" ||
      req.path === "/api/advanced-access/verify" ||
      req.path === "/api/advanced-access/status" ||
      req.path === "/api/advanced-access/revoke";

    if (isPublicRoute) {
      return next();
    }

    if (req.path.startsWith("/api")) {
      const token = getSessionFromCookie(req);
      if (isSessionValid(token)) {
        return next();
      }
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    next();
  });

  // Auth Endpoints
  // 1. POST /api/auth/login
  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: "Пароль обязателен к заполнению" });
    }

    if (verifyPassword(password)) {
      const sessionToken = crypto.randomBytes(32).toString("hex");
      activeSessions.set(sessionToken, Date.now() + SESSION_TTL_MS);

      // Max-Age is 43200 seconds (12 hours)
      // SameSite=None; Secure must be used for cross-origin browser iframe environments
      res.setHeader(
        "Set-Cookie",
        `session=${sessionToken}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=43200`
      );
      return res.json({ success: true, authenticated: true });
    } else {
      return res.status(401).json({ success: false, error: "Неверный пароль" });
    }
  });

  // 2. GET /api/auth/check
  app.get("/api/auth/check", (req, res) => {
    const token = getSessionFromCookie(req);
    if (isSessionValid(token)) {
      return res.json({ authenticated: true });
    }
    return res.json({ authenticated: false });
  });

  // 3. POST /api/auth/logout
  app.post("/api/auth/logout", (req, res) => {
    const token = getSessionFromCookie(req);
    if (token) {
      activeSessions.delete(token);
    }
    res.setHeader("Set-Cookie", "session=; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0");
    return res.json({ success: true });
  });

  // Advanced Access Endpoints
  app.get("/api/advanced-access/config", (req, res) => {
    try {
      const config = getAdvancedAccessConfig();
      return res.json({
        success: true,
        config: {
          enabled: config.enabled,
          displayName: config.displayName,
          ttlMinutes: config.ttlMinutes,
          protectedActions: config.protectedActions
        }
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/advanced-access/verify", (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, error: "Код обязателен к заполнению" });
      }

      if (verifyAdvancedAccessPassword(password)) {
        createAdvancedAccessSession(res);
        return res.json({ success: true });
      } else {
        return res.status(401).json({ success: false, error: "Неверный код доступа" });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "Внутренняя ошибка сервера" });
    }
  });

  app.get("/api/advanced-access/status", (req, res) => {
    try {
      const active = isAdvancedAccessActive(req);
      return res.json({ success: true, active });
    } catch (error: any) {
      return res.status(401).json({ success: false, error: "Ошибка при получении статуса" });
    }
  });

  app.post("/api/advanced-access/revoke", (req, res) => {
    try {
      revokeAdvancedAccessSession(req, res);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(401).json({ success: false, error: "Ошибка при отзыве сессии" });
    }
  });

  // 7.1. health
  app.get("/api/health", (req, res) => {
    res.json({
      success: true,
      status: "ok",
      timestamp: new Date().toISOString(),
      envStatus: {
        hash_present: !!(process.env.APP_ACCESS_PASSWORD_HASH && process.env.APP_ACCESS_PASSWORD_HASH.trim() !== ""),
        plain_present: !!(process.env.APP_ACCESS_PASSWORD && process.env.APP_ACCESS_PASSWORD.trim() !== ""),
        node_env: process.env.NODE_ENV || "development"
      }
    });
  });

  // 7.2. bitrix/health
  app.get("/api/bitrix/health", (req, res) => {
    res.json({
      success: true,
      service: "bitrix-ingest",
      status: "ready"
    });
  });

  // 7.3. bitrix/projects/import
  app.post("/api/bitrix/projects/import", async (req, res) => {
    const token = cleanEnv(process.env.APP_INGEST_TOKEN);

    if (!token) {
      return res.status(503).json({ success: false, error: "Ingest endpoint is not configured" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const trimmedHeader = authHeader.trim();
    if (!trimmedHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const rawProvidedToken = trimmedHeader.substring(7).trim();
    const providedToken = cleanEnv(rawProvidedToken);

    if (!providedToken) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (providedToken !== token) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const { projects, syncId, mode } = req.body;

    if (!Array.isArray(projects)) {
      return res.status(400).json({ success: false, error: "projects must be an array" });
    }

    try {
      const result = await storage.upsertProjects(projects, syncId || `sync-${Date.now()}`, mode || "full");
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 7.4. GET /api/projects
  app.get("/api/projects", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      // Refresh the KPI indicator dictionary if TTL has expired
      await loadIndicatorDictionaryWithTTL();

      // Check assessmentMode and assessmentDate for custom date protection
      let assessmentDate = new Date();
      const assessmentModeQuery = req.query.assessmentMode;

      if (assessmentModeQuery === 'custom') {
        if (!isAdvancedAccessActive(req)) {
          return res.status(403).json({ success: false, error: "Требуется код расширенного доступа для выбора произвольной даты оценки" });
        }
        if (req.query.assessmentDate && typeof req.query.assessmentDate === 'string') {
          const parsed = new Date(req.query.assessmentDate);
          if (!isNaN(parsed.getTime())) {
            assessmentDate = parsed;
          }
        }
      } else if (assessmentModeQuery === 'today') {
        // Ignore assessmentDate if explicitly requested today
        assessmentDate = new Date();
      } else {
        // Backward compatibility fallback for tests or old clients not sending assessmentMode
        if (req.query.assessmentDate && typeof req.query.assessmentDate === 'string') {
          const reqDateStr = req.query.assessmentDate.trim();
          const serverToday = new Date().toISOString().split("T")[0];
          
          const localD = new Date();
          const localYear = localD.getFullYear();
          const localMonth = String(localD.getMonth() + 1).padStart(2, '0');
          const localDay = String(localD.getDate()).padStart(2, '0');
          const localTodayStr = `${localYear}-${localMonth}-${localDay}`;
          
          const isToday = reqDateStr === serverToday || reqDateStr === localTodayStr;
          if (!isToday) {
            if (!isAdvancedAccessActive(req)) {
              return res.status(403).json({ success: false, error: "Требуется код расширенного доступа для выбора произвольной даты оценки" });
            }
          }
          
          const parsed = new Date(req.query.assessmentDate);
          if (!isNaN(parsed.getTime())) {
            assessmentDate = parsed;
          }
        }
      }

      const rawProjectsCount = (await storage.getAllProjects()).length;
      const isSyncRequested = req.query.sync === "true";
      const shouldSync = isSyncRequested || (rawProjectsCount === 0);

      let sheetsProjects: any[] = [];
      let fetchSuccess = false;
      let warningMessage: string | null = null;
      let syncResult: any = null;

      const rawSheetsUrl = process.env.GOOGLE_SHEETS_CSV_URL || process.env.GOOGLE_SHEET_CSV_URL;
      const hasSheetsUrl = !!(rawSheetsUrl && rawSheetsUrl.trim());

      if (shouldSync) {
        if (isSyncRequested && !isAdvancedAccessActive(req)) {
          return res.status(403).json({ success: false, error: "Требуется код расширенного доступа для ручной синхронизации" });
        }

        if (hasSheetsUrl) {
          try {
            // 1. Fetch latest straight from Google Sheets
            sheetsProjects = await fetchProjectsFromSheet(assessmentDate);
            fetchSuccess = true;

            // Save last successful metadata
            const meta = await storage.getSheetsSyncMeta();
            meta.lastSuccessfulSheetsSyncAt = new Date().toISOString();
            meta.lastSuccessfulSheetsProjectsCount = sheetsProjects.length;
            await storage.saveSheetsSyncMeta(meta);
          } catch (sheetsError: any) {
            console.error("[GoogleSheets-FetchError] Error loading from Google Sheets, using local storage fallback:", sheetsError);
            warningMessage = "Не удалось обновить данные из Google Sheets. Показана последняя сохраненная копия.";

            // Save error metadata
            try {
              const meta = await storage.getSheetsSyncMeta();
              meta.lastSheetsErrorAt = new Date().toISOString();
              meta.lastSheetsErrorReason = sheetsError.message || String(sheetsError);
              await storage.saveSheetsSyncMeta(meta);
            } catch (metaErr) {
              console.error("Failed to write sheets error metadata:", metaErr);
            }
          }
        } else {
          console.log("[GoogleSheets-Info] GOOGLE_SHEETS_CSV_URL environment variable is not defined. Using local storage fallback.");
          warningMessage = "Google Sheets URL не настроен. Отображаются данные из локального хранилища.";
        }
      }

      if (fetchSuccess) {
        // 2. Sync to local storage to preserve lastAnalysis and other metadata
        syncResult = await storage.upsertProjects(sheetsProjects, `sheets-sync-${Date.now()}`, "full");
        if (!syncResult.success) {
          warningMessage = "Google Sheets не вернул ни одного проекта. Показана последняя сохраненная копия.";
        }
      }

      // 3. Return everything from local storage
      const rawProjects = await storage.getAllProjects();

      if (rawProjects.length === 0 && !fetchSuccess) {
        // No local fallback data exists, and Sheets fetch failed
        console.error("[Projects-API-Error] File storage is empty and Sheets fetch failed.");
        return res.status(500).json({
          success: false,
          error: "Не удалось загрузить данные проектов. Проверьте источник данных или повторите попытку позже."
        });
      }

      // Restore or recalculate evaluations for fallback or server restarted scenarios
      await restoreOrCalculateEvaluations(rawProjects, assessmentDate);
      
      const projects = rawProjects;
      const projectEvaluations = getLatestProjectEvaluations() || [];
      
      const stats = {
        total: projects.length,
        active: projects.filter(p => p.status === "active").length,
        completed: projects.filter(p => p.status === "completed").length,
        atRisk: projects.filter(p => {
          const ev = projectEvaluations.find(e => e.projectId === p.projectId);
          if (ev) {
            return ev.projectHealth?.status === "risk";
          }
          return p.status === "at_risk";
        }).length,
        overdue: projects.filter(p => {
          const ev = projectEvaluations.find(e => e.projectId === p.projectId);
          if (ev) {
            return ev.monitoring?.status === "overdue";
          }
          return p.status === "overdue";
        }).length,
        missingData: projects.filter(p => {
          const ev = projectEvaluations.find(e => e.projectId === p.projectId);
          if (ev) {
            return ev.projectHealth?.status === "not_enough_data" || ev.dataQuality?.status === "error";
          }
          return false;
        }).length,
        avgCompleteness: (() => {
          const sum = projects.reduce((acc, p) => {
            const ev = projectEvaluations.find(e => e.projectId === p.projectId);
            return acc + (ev?.dataQuality?.completenessPercent || 0);
          }, 0);
          return sum / (projects.length || 1);
        })(),
        avgProgress: (() => {
          const sum = projects.reduce((acc, p) => {
            const ev = projectEvaluations.find(e => e.projectId === p.projectId);
            return acc + (ev?.milestones?.actualProgressPercent || 0);
          }, 0);
          return sum / (projects.length || 1);
        })(),
        noIndicators: projects.filter(p => !p.indicators || p.indicators.length === 0).length,
        lagging: projects.filter(p => {
          const ev = projectEvaluations.find(e => e.projectId === p.projectId);
          if (ev) {
            return ev.milestones?.status === "risk" || ev.milestones?.status === "attention";
          }
          return false;
        }).length
      };

      const dataSource = {
        mode: fetchSuccess && syncResult?.success !== false ? "live" : "fallback",
        projectsCount: projects.length
      };

      res.json({
        success: true,
        projects,
        normalizedProjects: getLatestNormalizedProjects(),
        projectEvaluations,
        portfolioEvaluation: getLatestPortfolioEvaluation(),
        stats,
        dataSource,
        sync: syncResult ? {
          source: "google_sheets",
          totalFromSource: syncResult.receivedProjects,
          created: syncResult.created,
          updated: syncResult.updated,
          removed: syncResult.deleted,
          totalActive: projects.length
        } : null,
        importReport: getLastImportReport(),
        indicatorDictionary: getIndicatorDictionary(),
        ...(warningMessage ? { warning: warningMessage } : {})
      });
    } catch (error: any) {
      console.error("[Projects-API-Error] Overall projects route failed:", error);
      res.status(500).json({
        success: false,
        error: "Не удалось загрузить данные проектов. Проверьте источник данных или повторите попытку позже."
      });
    }
  });

  // 7.5. GET /api/projects/:projectId
  app.get("/api/projects/:projectId", async (req, res) => {
    try {
      const project = await storage.getProjectById(req.params.projectId);
      if (!project) {
        return res.status(404).json({ success: false, error: "Project not found" });
      }
      res.json({ success: true, project });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 7.6. POST /api/projects/:projectId/analyze
  app.post("/api/projects/:projectId/analyze", async (req, res) => {
    try {
      const project = await storage.getProjectById(req.params.projectId);
      if (!project) {
        return res.status(404).json({ success: false, error: "Project not found" });
      }

      let assessmentDate = new Date();
      let assessmentDateMode: "today" | "custom" | "server_fallback" = "server_fallback";

      const rawAssessmentDateMode = req.body.assessmentDateMode;
      const isValidAssessmentDateMode = rawAssessmentDateMode === "today" || rawAssessmentDateMode === "custom";

      if (req.body.assessmentDate && typeof req.body.assessmentDate === 'string') {
        const parsed = new Date(req.body.assessmentDate);
        if (!isNaN(parsed.getTime())) {
          assessmentDate = parsed;
          assessmentDateMode = isValidAssessmentDateMode ? rawAssessmentDateMode : "custom";
        } else {
          assessmentDateMode = "server_fallback";
        }
      } else {
        assessmentDateMode = "server_fallback";
      }

      const assessmentDateStr = assessmentDate.toISOString().split("T")[0];
      const localD = new Date();
      const localTodayStr = `${localD.getFullYear()}-${String(localD.getMonth() + 1).padStart(2, "0")}-${String(localD.getDate()).padStart(2, "0")}`;
      const isTodayRequest =
        assessmentDateMode === "today" ||
        assessmentDateMode === "server_fallback" ||
        assessmentDateStr === localTodayStr ||
        assessmentDateStr === new Date().toISOString().split("T")[0];

      if (!isTodayRequest && !isAdvancedAccessActive(req)) {
        return res.status(403).json({
          success: false,
          error: "Требуется код расширенного доступа для AI-анализа на произвольную дату оценки"
        });
      }
      
      const projectEvaluations = getLatestProjectEvaluations() || [];
      let evaluation = projectEvaluations.find(ev => ev.projectId === project.projectId) || null;

      const evaluationDate = evaluation?.assessmentDate
        ? String(evaluation.assessmentDate).slice(0, 10)
        : null;

      // Always recompute when cached evaluation date does not match the requested assessment date
      if (!evaluation || evaluationDate !== assessmentDateStr) {
        const normalizedList = getLatestNormalizedProjects();
        let normalized = normalizedList.find(p => String(p.projectId) === String(project.projectId));
        if (!normalized) {
          const reconstructed = reconstructNormalizedProjectsFromLegacy([project], assessmentDate);
          normalized = reconstructed[0];
        }
        if (!normalized) {
          return res.status(400).json({
            success: false,
            error: "Не удалось выполнить AI-анализ: отсутствует нормализованный проект для пересчёта оценки"
          });
        }
        evaluation = evaluateProject(normalized, {
          assessmentDate,
          indicatorDictionary: getIndicatorDictionary()
        });
      }

      if (!evaluation) {
        return res.status(400).json({ success: false, error: "Не удалось выполнить AI-анализ: отсутствует ProjectEvaluation для проекта" });
      }

      const analysisPayload = buildProjectAnalysisPayload({
        project,
        evaluation,
        assessmentDate: assessmentDateStr,
        assessmentDateMode
      });

      console.log("[AI_ANALYSIS_PAYLOAD_CHECK]", {
        projectId: analysisPayload.projectSnapshot?.projectId,
        schemaVersion: analysisPayload.schemaVersion,
        hasAnalysisInsights: Boolean(analysisPayload.analysisInsights),
        mainRiskSource: analysisPayload.analysisInsights?.mainRiskSource,
        topMilestoneIssuesCount: analysisPayload.analysisInsights?.topMilestoneIssues?.length ?? 0,
        topIndicatorIssuesCount: analysisPayload.analysisInsights?.topIndicatorIssues?.length ?? 0,
        currentPeriodIssuesCount: analysisPayload.analysisInsights?.currentPeriodIssues?.length ?? 0,
        goalImpact: analysisPayload.analysisInsights?.goalImpact,
        dataConsistencyNotesCount: analysisPayload.analysisInsights?.dataConsistencyNotes?.length ?? 0,
        hasCardSnapshot: Boolean(analysisPayload.cardSnapshot),
        milestonesDetailsCount: analysisPayload.cardSnapshot?.milestonesDetails?.length ?? 0,
        indicatorsDetailsCount: analysisPayload.cardSnapshot?.indicatorsDetails?.length ?? 0,
        hasProjectContentContext: Boolean(analysisPayload.projectContentContext),
        aiUsePotentialContextCount: analysisPayload.projectContentContext?.aiUsePotentialContext?.length ?? 0,
        assistantEvidenceBriefLength: analysisPayload.assistantEvidenceBrief?.length ?? 0,
        assessmentDate: analysisPayload.assessmentContext?.assessmentDate,
        assessmentDateMode: analysisPayload.assessmentContext?.assessmentDateMode,
        evaluationAssessmentDate: evaluation.assessmentDate,
        currentQuarter: analysisPayload.assessmentContext?.currentQuarter,
        currentYear: analysisPayload.assessmentContext?.currentYear
      });

      const analysis = await analyzeProjectWithOpenAI({
        project,
        assessmentDate: assessmentDate.toISOString(),
        analysisPayload
      });

      await storage.saveAnalysis(project.projectId, analysis);

      res.json({ success: true, analysis });
    } catch (error: any) {
      console.error("Analysis Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 18. GET /api/sync-logs
  app.get("/api/sync-logs", async (req, res) => {
    try {
      const logs = await storage.getSyncLogs();
      res.json({ success: true, logs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/indicator-dictionary/status
  app.get("/api/indicator-dictionary/status", (req, res) => {
    try {
      const status = getIndicatorDictionaryStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/indicator-dictionary/unknown
  app.get("/api/indicator-dictionary/unknown", async (req, res) => {
    try {
      const projectsList = await storage.getAllProjects();
      const report = getUnknownIndicatorsReport(projectsList);
      res.json({ items: report });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/chat-assistant/status
  app.get("/api/chat-assistant/status", (req, res) => {
    try {
      const status = getChatAssistantStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Не удалось получить статус ассистента." });
    }
  });

  // GET /api/data-source/status
  app.get("/api/data-source/status", async (req, res) => {
    try {
      const config = getGoogleSheetsConfig();
      const syncMeta = await storage.getSheetsSyncMeta();
      
      let canFetch = false;
      let httpStatus: number | null = null;
      let contentType: string | null = null;
      let lastError: string | null = null;

      try {
        const fetchResult = await fetchCsvFromGoogleSheets(config.normalizedUrl);
        canFetch = true;
        httpStatus = fetchResult.statusCode || 200;
        contentType = fetchResult.contentType || null;
      } catch (fetchErr: any) {
        console.error("[DataSourceStatus-Error] HEAD check failed:", fetchErr.message);
        lastError = fetchErr.message || String(fetchErr);
        if (fetchErr.message && fetchErr.message.includes("HTTP ")) {
          const match = fetchErr.message.match(/HTTP (\d+)/);
          if (match) httpStatus = parseInt(match[1]);
        }
      }

      const maskSpreadsheetUrl = (url: string) => {
        if (!url) return "";
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
          const originalId = match[1];
          const maskedId = originalId.substring(0, 4) + "..." + originalId.substring(originalId.length - 4);
          return url.replace(originalId, maskedId);
        }
        return url;
      };

      res.json({
        success: true,
        source: "google_sheets",
        hasGoogleSheetsUrl: config.hasGoogleSheetsUrl,
        usedEnvName: config.usedEnvName,
        normalizedUrl: maskSpreadsheetUrl(config.normalizedUrl),
        gid: config.gid,
        hasGid: config.hasGid,
        canFetch,
        httpStatus,
        contentType,
        lastError,
        isNormalized: config.rawUrl !== config.normalizedUrl,
        normalizationApplied: config.rawUrl.includes("/edit"),
        syncMeta
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "Не удалось получить статус источника данных." });
    }
  });

  // POST /api/chat-assistant/message
  app.post("/api/chat-assistant/message", async (req, res) => {
    try {
      const { message, threadId } = req.body;
      const result = await handleChatAssistantMessage({ message, threadId });
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Помощник временно недоступен. Попробуйте позже." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
