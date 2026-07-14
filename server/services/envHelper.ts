export function cleanEnv(value?: string): string {
  if (!value) return "";
  let cleaned = value.trim();
  // Strip double or single quotes if present (common when set in some container environments)
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

export function isEnabled(value?: string): boolean {
  const clean = cleanEnv(value).toLowerCase();
  if (clean === "false" || clean === "0" || clean === "no" || clean === "off") {
    return false;
  }
  return true;
}

export function isValidAssistantId(id?: string): boolean {
  const clean = cleanEnv(id);
  return clean.startsWith("asst_");
}

export function normalizeGoogleSheetsUrl(rawUrl: string): { normalizedUrl: string; gid: string; hasGid: boolean } {
  const url = cleanEnv(rawUrl);
  if (!url) {
    return { normalizedUrl: "", gid: "0", hasGid: false };
  }

  // If it's not a google sheets link, leave it as is
  if (!url.includes("docs.google.com/spreadsheets")) {
    return { normalizedUrl: url, gid: "0", hasGid: false };
  }

  // Parse GID from URL (supports query param or hash tags like ?gid=12 or #gid=34)
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  const hasGid = !!gidMatch;

  if (!hasGid) {
    console.warn(`[GoogleSheets-Warn] Google Sheets gid was not provided, using gid=0`);
  }

  // If it's already a direct CSV export, gviz/tq query URL, or pub link, use it as is!
  if (url.includes("/export") || url.includes("/gviz/tq") || url.includes("/pub") || url.includes("output=csv")) {
    return { normalizedUrl: url, gid, hasGid };
  }

  // Parse Spreadsheet ID
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    const spreadsheetId = match[1];
    // Convert to the highly reliable /export?format=csv endpoint
    const normalizedUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    return { normalizedUrl, gid, hasGid };
  }

  return { normalizedUrl: url, gid, hasGid };
}

export function getGoogleSheetsConfig() {
  const primaryUrl = cleanEnv(process.env.GOOGLE_SHEETS_CSV_URL);
  const secondaryUrl = cleanEnv(process.env.GOOGLE_SHEET_CSV_URL);
  
  if (!primaryUrl && !secondaryUrl) {
    throw new Error("GOOGLE_SHEETS_CSV_URL environment variable is not defined");
  }
  
  const usedEnvName = primaryUrl ? "GOOGLE_SHEETS_CSV_URL" : "GOOGLE_SHEET_CSV_URL";
  const rawUrl = primaryUrl || secondaryUrl;
  const { normalizedUrl, gid, hasGid } = normalizeGoogleSheetsUrl(rawUrl);

  return {
    hasGoogleSheetsUrl: true,
    usedEnvName,
    rawUrl,
    normalizedUrl,
    gid,
    hasGid
  };
}
