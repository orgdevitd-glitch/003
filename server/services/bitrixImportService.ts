import { Project } from "../../src/types";

export interface BitrixImportRequest {
  projects: Project[];
  syncId: string | null;
  mode: string;
}

export function parseBitrixImportRequest(body: unknown): BitrixImportRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.projects)) {
    return null;
  }

  return {
    projects: record.projects as Project[],
    syncId: typeof record.syncId === "string" && record.syncId.trim()
      ? record.syncId
      : null,
    mode: typeof record.mode === "string" && record.mode.trim()
      ? record.mode
      : "full"
  };
}
