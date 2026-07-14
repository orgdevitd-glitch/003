import { Project, ProjectAnalysisResult, SyncLog } from "../../src/types";

export interface ImportResult {
  success: boolean;
  syncId: string;
  receivedProjects: number;
  created: number;
  updated: number;
  deleted: number;
  errors: Array<{
    projectId?: string;
    field?: string;
    message: string;
  }>;
}

export interface ProjectStorage {
  getAllProjects(): Promise<Project[]>;
  getProjectById(projectId: string): Promise<Project | null>;
  upsertProjects(projects: Project[], syncId: string, mode: string): Promise<ImportResult>;
  saveAnalysis(projectId: string, analysis: ProjectAnalysisResult): Promise<void>;
  getSyncLogs(): Promise<SyncLog[]>;
  getSheetsSyncMeta(): Promise<any>;
  saveSheetsSyncMeta(meta: any): Promise<void>;
}
