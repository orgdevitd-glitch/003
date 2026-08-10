import type { Express } from "express";
import type { ProjectStorage } from "../storage/projectStorage";
import { cleanEnv } from "../services/envHelper";

type BitrixIngestStorage = Pick<ProjectStorage, "upsertProjects">;

export function installBitrixIngestRoute(app: Express, storage: BitrixIngestStorage): void {
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

    const providedToken = cleanEnv(trimmedHeader.substring(7).trim());
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
      const result = await storage.upsertProjects(
        projects,
        syncId || `sync-${Date.now()}`,
        mode || "full"
      );
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
}
