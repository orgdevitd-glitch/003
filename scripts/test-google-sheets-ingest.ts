import fs from "fs-extra";
import os from "os";
import path from "path";
import {
  cleanEnv,
  normalizeGoogleSheetsUrl
} from "../server/services/envHelper";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function assertRejects(
  operation: () => Promise<unknown>,
  expectedMessage: string,
  message: string
) {
  try {
    await operation();
  } catch (error: any) {
    assert(
      String(error?.message || error).includes(expectedMessage),
      `${message}. Expected "${expectedMessage}", received "${error?.message || error}"`
    );
    return;
  }
  throw new Error(`Assertion failed: ${message}. Expected operation to reject`);
}

function mockResponse(data: string, status = 200, contentType = "text/csv") {
  return {
    status,
    headers: {
      get: (name: string) => name.toLowerCase() === "content-type" ? contentType : null
    },
    text: async () => data
  } as any;
}

async function runTests() {
  console.log("=== GOOGLE SHEETS INGEST TESTS ===");

  assert(cleanEnv(`  "https://example.test/sheet.csv"  `) === "https://example.test/sheet.csv", "cleanEnv should strip wrapping quotes");

  const editUrl = normalizeGoogleSheetsUrl(
    "https://docs.google.com/spreadsheets/d/sheet-123/edit#gid=456"
  );
  assert(
    editUrl.normalizedUrl === "https://docs.google.com/spreadsheets/d/sheet-123/export?format=csv&gid=456",
    "edit URL should be converted to a direct CSV export URL"
  );
  assert(editUrl.gid === "456" && editUrl.hasGid, "hash GID should be preserved");

  const exportUrl = "https://docs.google.com/spreadsheets/d/sheet-123/export?format=csv&gid=789";
  const directUrl = normalizeGoogleSheetsUrl(exportUrl);
  assert(directUrl.normalizedUrl === exportUrl, "direct export URL should not be rewritten");
  assert(directUrl.gid === "789" && directUrl.hasGid, "query GID should be detected");

  const nonGoogleUrl = normalizeGoogleSheetsUrl("https://example.test/projects.csv");
  assert(nonGoogleUrl.normalizedUrl === "https://example.test/projects.csv", "non-Google CSV URL should pass through");
  console.log("✓ URL and environment normalization");

  const originalFetch = global.fetch;
  const originalPrimaryUrl = process.env.GOOGLE_SHEETS_CSV_URL;
  const originalSecondaryUrl = process.env.GOOGLE_SHEET_CSV_URL;
  const originalDataDir = process.env.DATA_DIR;
  const testDataDir = path.join(os.tmpdir(), `google-sheets-ingest-${process.pid}`);

  process.env.DATA_DIR = testDataDir;
  await fs.ensureDir(testDataDir);

  const {
    fetchCsvFromGoogleSheets,
    fetchProjectsFromSheet
  } = await import("../server/services/googleSheetsService");

  try {
    global.fetch = async () => mockResponse("ID,Название\n1,Проект", 200, "text/csv; charset=utf-8");
    const successfulFetch = await fetchCsvFromGoogleSheets("https://example.test/projects.csv");
    assert(successfulFetch.statusCode === 200, "successful fetch should preserve status");
    assert(successfulFetch.contentType === "text/csv; charset=utf-8", "successful fetch should preserve content type");
    assert(successfulFetch.data.includes("Проект"), "successful fetch should return response body");

    global.fetch = async () => mockResponse("unavailable", 503, "text/plain");
    await assertRejects(
      () => fetchCsvFromGoogleSheets("https://example.test/projects.csv"),
      "HTTP 503",
      "HTTP failures should include the status code"
    );

    global.fetch = async () => {
      throw new Error("connection reset");
    };
    await assertRejects(
      () => fetchCsvFromGoogleSheets("https://example.test/projects.csv"),
      "Failed to fetch from Google Sheets: connection reset",
      "network failures should have ingest context"
    );
    console.log("✓ CSV transport success and failure handling");

    process.env.GOOGLE_SHEETS_CSV_URL = exportUrl;
    delete process.env.GOOGLE_SHEET_CSV_URL;

    const fetchedUrls: string[] = [];
    const validAliasCsv = [
      "ID проекта,Название проекта,Дата начала проекта,Дата окончания проекта,Стадия проекта,Вид проекта,Приоритет",
      "17,Проект Альфа,01.01.2026,31.12.2026,В работе,Проект,1"
    ].join("\n");

    global.fetch = async (url: any) => {
      fetchedUrls.push(String(url));
      return fetchedUrls.length === 1
        ? mockResponse("<!DOCTYPE html><html>export unavailable</html>", 200, "text/html")
        : mockResponse(validAliasCsv);
    };

    const projects = await fetchProjectsFromSheet(new Date("2026-06-15T00:00:00Z"));
    assert(fetchedUrls.length === 2, "HTML from /export should trigger exactly one fallback request");
    assert(fetchedUrls[1].includes("/gviz/tq"), "fallback should use the gviz query endpoint");
    assert(fetchedUrls[1].includes("tqx=out:csv"), "fallback should request CSV output");
    assert(projects.length === 1, "fallback CSV should be ingested");
    assert(projects[0].projectId === "17", "ID проекта alias should map to project ID");
    assert(projects[0].projectName === "Проект Альфа", "Название проекта alias should map to project name");
    console.log("✓ HTML export fallback and header aliases");

    let htmlRequests = 0;
    global.fetch = async () => {
      htmlRequests += 1;
      return mockResponse("<html>sign in required</html>", 200, "text/html");
    };
    await assertRejects(
      () => fetchProjectsFromSheet(new Date("2026-06-15T00:00:00Z")),
      "returned HTML instead of CSV",
      "HTML from both Google endpoints should be rejected"
    );
    assert(htmlRequests === 2, "HTML rejection should occur after trying export and fallback once");

    process.env.GOOGLE_SHEETS_CSV_URL = "https://example.test/projects.csv";
    global.fetch = async () => mockResponse("ID,Стадия\n1,В работе");
    await assertRejects(
      () => fetchProjectsFromSheet(new Date("2026-06-15T00:00:00Z")),
      "Mandatory columns are missing",
      "CSV without a project name column should be rejected"
    );
    console.log("✓ HTML and mandatory-column rejection");
  } finally {
    global.fetch = originalFetch;

    if (originalPrimaryUrl === undefined) delete process.env.GOOGLE_SHEETS_CSV_URL;
    else process.env.GOOGLE_SHEETS_CSV_URL = originalPrimaryUrl;

    if (originalSecondaryUrl === undefined) delete process.env.GOOGLE_SHEET_CSV_URL;
    else process.env.GOOGLE_SHEET_CSV_URL = originalSecondaryUrl;

    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;

    await new Promise(resolve => setTimeout(resolve, 50));
    await fs.remove(testDataDir);
  }

  console.log("=== ALL GOOGLE SHEETS INGEST TESTS PASSED ===");
}

runTests().catch(error => {
  console.error("GOOGLE SHEETS INGEST TEST FAILURE", error);
  process.exit(1);
});
