import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import Papa from "papaparse";
import { normalizeGoogleSheetsUrl } from "./envHelper";
import { fetchCsvFromGoogleSheets } from "./googleSheetsService";
import { 
  DEFAULT_INDICATOR_DICTIONARY, 
  IndicatorDictionaryItem, 
  setIndicatorDictionary, 
  getIndicatorDictionary,
  resolveIndicatorDictionaryItem,
  normalizeIndicatorName
} from "./indicatorDictionary";
import { Project } from "../../src/types";

export interface DictionaryStatus {
  source: "google_sheets" | "cache" | "default";
  itemsCount: number;
  activeCount: number;
  pendingCount: number;
  disabledCount: number;
  lastLoadedAt: string;
  warnings: string[];
}

export interface UnknownReportItem {
  indicatorName: string;
  occurrenceCount: number;
  projectCount: number;
  projectIds: string[];
  projectNames: string[];
  exampleProjects: string[];
  examplePlanFact: string;
  reason?: string;
}

let latestDictionaryStatus: DictionaryStatus = {
  source: "default",
  itemsCount: DEFAULT_INDICATOR_DICTIONARY.length,
  activeCount: DEFAULT_INDICATOR_DICTIONARY.length,
  pendingCount: 0,
  disabledCount: 0,
  lastLoadedAt: new Date().toISOString(),
  warnings: []
};

export function getIndicatorDictionaryStatus(): DictionaryStatus {
  return latestDictionaryStatus;
}

let lastDictionaryLoadTime = 0;

export async function loadIndicatorDictionaryWithTTL(ttlMs: number = 5 * 60 * 1000): Promise<void> {
  const now = Date.now();
  if (now - lastDictionaryLoadTime < ttlMs) {
    return;
  }
  try {
    await loadIndicatorDictionary();
  } catch (err: any) {
    console.error("[IndicatorDictionary-TTL] Failed to reload dictionary, keeping previous. Error:", err.message);
  }
}

/**
 * Loads the indicator dictionary from Google Sheets CSV, or falls back to JSON cache, or to built-in default.
 */
export async function loadIndicatorDictionary(): Promise<void> {
  lastDictionaryLoadTime = Date.now();
  const DATA_DIR = process.env.DATA_DIR 
    ? path.resolve(process.env.DATA_DIR) 
    : path.join(process.cwd(), "data");

  const CACHE_FILE = path.join(DATA_DIR, "indicator-dictionary.json");

  const csvUrl = process.env.GOOGLE_SHEETS_INDICATOR_DICTIONARY_CSV_URL;
  const warnings: string[] = [];

  if (csvUrl && csvUrl.trim()) {
    try {
      const { normalizedUrl } = normalizeGoogleSheetsUrl(csvUrl.trim());
      console.log(`[IndicatorDictionary] Loading from Google Sheets: ${normalizedUrl.substring(0, 45)}...`);
      
      const fetchResult = await fetchCsvFromGoogleSheets(normalizedUrl);
      const csvData = fetchResult.data;

      const isHtml = csvData.trim().startsWith("<!DOCTYPE") || 
                     csvData.trim().startsWith("<html") ||
                     csvData.trim().startsWith("<HTML");

      if (isHtml) {
        throw new Error("Obtained HTML instead of CSV data. Verify your link and permissions.");
      }

      const results = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
      });

      const fields = results.meta.fields || [];
      const findHeader = (target: string): string | undefined => {
        const t = target.toLowerCase().replace(/\s+/g, "");
        return fields.find(f => f.toLowerCase().replace(/\s+/g, "") === t);
      };

      const canonicalNameCol = findHeader("canonicalName");
      const methodCol = findHeader("method");
      const statusCol = findHeader("status");

      if (!canonicalNameCol || !methodCol || !statusCol) {
        throw new Error("Mandatory columns are missing in sheets: canonicalName, method, status");
      }

      if (results.data.length === 0) {
        throw new Error("CSV sheet contains 0 rows of data");
      }

      const aliasesCol = findHeader("aliases");
      const unitCol = findHeader("unit");
      const commentCol = findHeader("comment");
      const approvedByCol = findHeader("approvedBy");
      const updatedAtCol = findHeader("updatedAt");
      const ownerCol = findHeader("owner");

      const items: IndicatorDictionaryItem[] = [];
      const allowedMethods = ["higher_is_better", "lower_is_better", "target", "pending", "disabled"];
      const allowedStatuses = ["active", "active_proposed", "pending_business_decision", "pending_review", "data_issue", "disabled"];

      let activeCount = 0;
      let pendingCount = 0;
      let disabledCount = 0;

      for (let i = 0; i < results.data.length; i++) {
        const row: any = results.data[i];
        if (!row || Object.keys(row).length === 0) continue;

        const canonicalName = String(row[canonicalNameCol] || "").trim();
        const method = String(row[methodCol] || "").trim().toLowerCase();
        const status = String(row[statusCol] || "").trim().toLowerCase();

        // Skip completely empty rows
        if (!canonicalName && !method && !status) {
          continue;
        }

        if (!canonicalName) {
          throw new Error(`Row ${i + 1} has empty canonicalName`);
        }
        if (!method) {
          throw new Error(`Row ${i + 1} (${canonicalName}) has empty method`);
        }
        if (!status) {
          throw new Error(`Row ${i + 1} (${canonicalName}) has empty status`);
        }
        if (!allowedMethods.includes(method)) {
          throw new Error(`Row ${i + 1} (${canonicalName}) has invalid method "${method}"`);
        }
        if (!allowedStatuses.includes(status)) {
          throw new Error(`Row ${i + 1} (${canonicalName}) has invalid status "${status}"`);
        }

        const rawAliases = aliasesCol ? String(row[aliasesCol] || "") : "";
        const aliases = rawAliases
          .split(";")
          .map(a => a.trim())
          .filter(a => a.length > 0);

        const unit = unitCol ? String(row[unitCol] || "").trim() : "";
        const comment = commentCol ? String(row[commentCol] || "").trim() : "";
        const approvedBy = approvedByCol ? String(row[approvedByCol] || "").trim() : "";
        const updatedAt = updatedAtCol ? String(row[updatedAtCol] || "").trim() : "";
        const owner = ownerCol ? String(row[ownerCol] || "").trim() : "";

        if (status === "active" || status === "active_proposed") {
          activeCount++;
        } else if (status === "disabled") {
          disabledCount++;
        } else {
          pendingCount++;
        }

        items.push({
          name: canonicalName,
          calculationType: method as any,
          unit: unit || null,
          aliases,
          status,
          comment,
          approvedBy,
          updatedAt,
          owner
        });
      }

      if (items.length === 0) {
        throw new Error("No valid KPI items found in CSV sheet");
      }

      // If we got here, parsing and validating everything succeeded. We can save to disk.
      const sourceUrlHash = crypto.createHash("md5").update(normalizedUrl).digest("hex");
      const loadedAt = new Date().toISOString();

      await fs.ensureDir(DATA_DIR);
      await fs.writeJson(CACHE_FILE, {
        items,
        meta: {
          source: "google_sheets",
          loadedAt,
          sourceUrlHash
        }
      });

      setIndicatorDictionary(items);
      latestDictionaryStatus = {
        source: "google_sheets",
        itemsCount: items.length,
        activeCount,
        pendingCount,
        disabledCount,
        lastLoadedAt: loadedAt,
        warnings
      };
      console.log(`[IndicatorDictionary] Successfully loaded ${items.length} items from Google Sheets and saved to cache.`);
      return;
    } catch (err: any) {
      const errMsg = err.message || String(err);
      console.error(`[IndicatorDictionary-Error] Failed to load from Google Sheets: ${errMsg}. Attempting cache fallback...`);
      warnings.push(`Google Sheets load failed: ${errMsg}`);
    }
  } else {
    console.log("[IndicatorDictionary] GOOGLE_SHEETS_INDICATOR_DICTIONARY_CSV_URL not set. Attempting cache fallback...");
    warnings.push("GOOGLE_SHEETS_INDICATOR_DICTIONARY_CSV_URL environment variable is not defined");
  }

  // Fallback to cache file
  try {
    const cacheExists = await fs.pathExists(CACHE_FILE);
    if (cacheExists) {
      const cacheData = await fs.readJson(CACHE_FILE);
      if (cacheData && Array.isArray(cacheData.items)) {
        const items = cacheData.items;
        let activeCount = 0;
        let pendingCount = 0;
        let disabledCount = 0;

        const allowedMethods = ["higher_is_better", "lower_is_better", "target", "pending", "disabled"];
        const allowedStatuses = ["active", "active_proposed", "pending_business_decision", "pending_review", "data_issue", "disabled"];

        for (const item of items) {
          if (!item.name || !item.calculationType) {
            throw new Error("Cache item missing name or calculationType");
          }
          if (!allowedMethods.includes(item.calculationType)) {
            throw new Error(`Cache item has invalid calculationType "${item.calculationType}"`);
          }
          const status = item.status || "active";
          if (!allowedStatuses.includes(status)) {
            throw new Error(`Cache item has invalid status "${status}"`);
          }

          if (status === "active" || status === "active_proposed") {
            activeCount++;
          } else if (status === "disabled") {
            disabledCount++;
          } else {
            pendingCount++;
          }
        }

        setIndicatorDictionary(items);
        latestDictionaryStatus = {
          source: "cache",
          itemsCount: items.length,
          activeCount,
          pendingCount,
          disabledCount,
          lastLoadedAt: cacheData.meta?.loadedAt || new Date().toISOString(),
          warnings
        };
        console.log(`[IndicatorDictionary] Successfully loaded ${items.length} items from cache file.`);
        return;
      }
    }
  } catch (cacheErr: any) {
    console.error("[IndicatorDictionary-Error] Cache load failed:", cacheErr.message || String(cacheErr));
    warnings.push(`Cache load failed: ${cacheErr.message || String(cacheErr)}`);
  }

  // Fallback to default
  console.log("[IndicatorDictionary] Falling back to default dictionary in code.");
  setIndicatorDictionary(DEFAULT_INDICATOR_DICTIONARY);
  latestDictionaryStatus = {
    source: "default",
    itemsCount: DEFAULT_INDICATOR_DICTIONARY.length,
    activeCount: DEFAULT_INDICATOR_DICTIONARY.length,
    pendingCount: 0,
    disabledCount: 0,
    lastLoadedAt: new Date().toISOString(),
    warnings
  };
}

/**
 * Collects unrecognized/unknown indicators from current projects and their valuations.
 */
export function getUnknownIndicatorsReport(projects: Project[]): UnknownReportItem[] {
  const dictionary = getIndicatorDictionary();
  const map = new Map<string, {
    indicatorName: string;
    occurrenceCount: number;
    projectIds: Set<string>;
    projectNames: Set<string>;
    examplePlan: string;
    exampleFact: string;
    reason: string;
  }>();

  for (const project of projects) {
    if (!project.indicators || !Array.isArray(project.indicators)) {
      continue;
    }

    for (const ind of project.indicators) {
      if (!ind.name) continue;

      // Check if resolved as active
      const activeItem = resolveIndicatorDictionaryItem(ind.name, dictionary, true);
      if (activeItem) {
        continue;
      }

      // Check if it exists at all in the dictionary (e.g. pending or disabled)
      const fullItem = resolveIndicatorDictionaryItem(ind.name, dictionary, false);
      let reason = "fallback_plan_fact";
      if (fullItem) {
        const method = fullItem.calculationType;
        const status = fullItem.status || "active";
        
        if (method === "disabled" || status === "disabled") {
          reason = "disabled";
        } else if (status === "data_issue") {
          reason = "data_issue";
        } else if (method === "pending" || status === "pending_review" || status === "pending_business_decision") {
          reason = "pending";
        } else {
          reason = "unresolved";
        }
      }

      const key = normalizeIndicatorName(ind.name);
      const existing = map.get(key);

      const planVal = ind.planValue !== undefined && ind.planValue !== null ? String(ind.planValue) : "";
      const factVal = ind.factValue !== undefined && ind.factValue !== null ? String(ind.factValue) : "";

      if (existing) {
        existing.occurrenceCount++;
        existing.projectIds.add(project.projectId);
        existing.projectNames.add(project.projectName);
        if (!existing.examplePlan && planVal) existing.examplePlan = planVal;
        if (!existing.exampleFact && factVal) existing.exampleFact = factVal;
      } else {
        map.set(key, {
          indicatorName: ind.name,
          occurrenceCount: 1,
          projectIds: new Set([project.projectId]),
          projectNames: new Set([project.projectName]),
          examplePlan: planVal,
          exampleFact: factVal,
          reason
        });
      }
    }
  }

  const reportItems: UnknownReportItem[] = [];
  for (const [_, val] of map.entries()) {
    const pIds = Array.from(val.projectIds);
    const pNames = Array.from(val.projectNames);
    
    let examplePlanFact = "";
    if (val.examplePlan || val.exampleFact) {
      examplePlanFact = `plan: ${val.examplePlan || "—"}; fact: ${val.exampleFact || "—"}`;
    } else {
      examplePlanFact = "plan: —; fact: —";
    }

    reportItems.push({
      indicatorName: val.indicatorName,
      occurrenceCount: val.occurrenceCount,
      projectCount: pIds.length,
      projectIds: pIds,
      projectNames: pNames,
      exampleProjects: pNames,
      examplePlanFact,
      reason: val.reason
    });
  }

  // Sort by occurrence count descending
  reportItems.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  return reportItems;
}
