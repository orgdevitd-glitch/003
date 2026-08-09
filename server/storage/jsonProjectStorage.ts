import fs from "fs-extra";
import path from "path";
import { Project, ProjectAnalysisResult, SyncLog } from "../../src/types";
import { ProjectStorage, ImportResult } from "./projectStorage";

const DATA_DIR = process.env.DATA_DIR 
  ? path.resolve(process.env.DATA_DIR) 
  : path.join(process.cwd(), "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const SYNC_LOGS_FILE = path.join(DATA_DIR, "sync-logs.json");
const ANALYSIS_FILE = path.join(DATA_DIR, "analysis-results.json");

export class JsonProjectStorage implements ProjectStorage {
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.ensureDataDir();
  }

  private async ensureDataDir() {
    try {
      await fs.ensureDir(DATA_DIR);
      if (!(await fs.pathExists(PROJECTS_FILE))) await fs.writeJson(PROJECTS_FILE, []);
      if (!(await fs.pathExists(SYNC_LOGS_FILE))) await fs.writeJson(SYNC_LOGS_FILE, []);
      if (!(await fs.pathExists(ANALYSIS_FILE))) await fs.writeJson(ANALYSIS_FILE, {});
    } catch (err) {
      console.error(`[Storage Error] Failed to initialize DATA_DIR or files`, err);
      throw err;
    }
  }

  private async safeReadJson<T>(filePath: string, defaultValue: T): Promise<T> {
    await this.initPromise;
    try {
      if (!(await fs.pathExists(filePath))) {
        await fs.writeJson(filePath, defaultValue);
        return defaultValue;
      }
      const content = await fs.readFile(filePath, "utf8");
      if (!content.trim()) {
        await fs.writeJson(filePath, defaultValue);
        return defaultValue;
      }
      return JSON.parse(content) as T;
    } catch (err) {
      console.error(`[Storage Warning] Error reading JSON from ${filePath}. Recovering with default.`, err);
      try {
        await fs.writeJson(filePath, defaultValue);
      } catch (writeErr) {
        console.error(`[Storage Error] Failed to write default JSON back to ${filePath}`, writeErr);
        throw writeErr;
      }
      return defaultValue;
    }
  }

  private async safeWriteJson<T>(filePath: string, data: T): Promise<void> {
    await this.initPromise;
    try {
      await fs.writeJson(filePath, data);
    } catch (err) {
      console.error(`[Storage Error] Failed to write JSON to ${filePath}`, err);
      throw err;
    }
  }

  async getAllProjects(): Promise<Project[]> {
    return await this.safeReadJson<Project[]>(PROJECTS_FILE, []);
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    const projects: Project[] = await this.getAllProjects();
    return projects.find(p => p.projectId === projectId) || null;
  }

  async upsertProjects(
    projects: Project[],
    syncId: string,
    mode: string,
    source: "sheets" | "bitrix24"
  ): Promise<ImportResult> {
    const existingProjects: Project[] = await this.getAllProjects();
    const existingProjectsMap = new Map<string, Project>();
    for (const p of existingProjects) {
      existingProjectsMap.set(p.projectId, p);
    }

    const incomingIds = new Set<string>();
    const validIncomingProjects: Project[] = [];
    const errors: any[] = [];

    for (const project of projects) {
      if (!project.projectId || !project.projectName) {
        errors.push({
          projectId: project.projectId,
          message: "projectId and projectName are required"
        });
        continue;
      }
      incomingIds.add(project.projectId);
      validIncomingProjects.push(project);
    }

    let created = 0;
    let updated = 0;
    let deleted = 0;
    const now = new Date().toISOString();
    let updatedProjects: Project[] = [];

    const targetSource = source;

    if (mode === "full") {
      // Find deleted projects (existed in store with the same source, but not present in incoming list)
      for (const p of existingProjects) {
        const isSameSource = p.source === targetSource || (!p.source && targetSource === "sheets");
        if (isSameSource && !incomingIds.has(p.projectId)) {
          deleted++;
        } else if (!isSameSource) {
          // Keep other source's project
          updatedProjects.push(p);
        }
      }

      // Rebuild projects list for the incoming projects
      for (const project of validIncomingProjects) {
        const existing = existingProjectsMap.get(project.projectId);
        if (existing) {
          updatedProjects.push({
            ...existing,
            ...project,
            createdInAppAt: existing.createdInAppAt,
            lastAnalysis: existing.lastAnalysis,
            updatedInAppAt: now,
            lastSyncId: syncId,
            source: targetSource
          });
          updated++;
        } else {
          updatedProjects.push({
            ...project,
            createdInAppAt: now,
            updatedInAppAt: now,
            lastSyncId: syncId,
            source: targetSource
          });
          created++;
        }
      }
    } else {
      updatedProjects = [...existingProjects];
      for (const project of validIncomingProjects) {
        const index = updatedProjects.findIndex(p => p.projectId === project.projectId);
        if (index !== -1) {
          const existing = updatedProjects[index];
          updatedProjects[index] = {
            ...existing,
            ...project,
            createdInAppAt: existing.createdInAppAt,
            lastAnalysis: existing.lastAnalysis,
            updatedInAppAt: now,
            lastSyncId: syncId,
            source: targetSource
          };
          updated++;
        } else {
          updatedProjects.push({
            ...project,
            createdInAppAt: now,
            updatedInAppAt: now,
            lastSyncId: syncId,
            source: targetSource
          });
          created++;
        }
      }
    }

    await this.safeWriteJson(PROJECTS_FILE, updatedProjects);

    // Diagnostics in console
    console.log(`[Sync Diagnostics - ${syncId}]`);
    console.log(`- Проектов получено (из источника): ${projects.length}`);
    console.log(`- Было в локальном хранилище до синхронизации: ${existingProjects.length}`);
    console.log(`- Стало в локальном хранилище после синхронизации: ${updatedProjects.length}`);
    console.log(`- Создано новых проектов: ${created}`);
    console.log(`- Обновлено существующих проектов: ${updated}`);
    console.log(`- Удалено проектов: ${deleted}`);

    const log: SyncLog = {
      syncId,
      source: targetSource,
      mode: mode as any,
      receivedAt: new Date().toISOString(),
      receivedProjects: projects.length,
      created,
      updated,
      deleted,
      errors
    };

    const logs: SyncLog[] = await this.getSyncLogs();
    logs.unshift(log);
    await this.safeWriteJson(SYNC_LOGS_FILE, logs.slice(0, 100)); // Keep last 100 logs

    return {
      success: true,
      syncId,
      receivedProjects: projects.length,
      created,
      updated,
      deleted,
      errors
    };
  }

  async saveAnalysis(projectId: string, analysis: ProjectAnalysisResult): Promise<void> {
    const analyses = await this.safeReadJson<Record<string, ProjectAnalysisResult>>(ANALYSIS_FILE, {});
    analyses[projectId] = analysis;
    await this.safeWriteJson(ANALYSIS_FILE, analyses);

    // Also update project's lastAnalysis field
    const projects = await this.getAllProjects();
    const index = projects.findIndex(p => p.projectId === projectId);
    if (index !== -1) {
      projects[index].lastAnalysis = analysis;
      await this.safeWriteJson(PROJECTS_FILE, projects);
    }
  }

  async getSyncLogs(): Promise<SyncLog[]> {
    return await this.safeReadJson<SyncLog[]>(SYNC_LOGS_FILE, []);
  }

  async getSheetsSyncMeta(): Promise<any> {
    const metaFile = path.join(DATA_DIR, "sheets-sync-meta.json");
    return await this.safeReadJson<any>(metaFile, {
      lastSuccessfulSheetsSyncAt: null,
      lastSuccessfulSheetsProjectsCount: 0,
      lastSheetsErrorAt: null,
      lastSheetsErrorReason: null
    });
  }

  async saveSheetsSyncMeta(meta: any): Promise<void> {
    const metaFile = path.join(DATA_DIR, "sheets-sync-meta.json");
    await this.safeWriteJson(metaFile, meta);
  }
}
