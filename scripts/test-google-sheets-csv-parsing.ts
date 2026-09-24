import assert from "node:assert/strict";
import Papa from "papaparse";
import {
  assertNoCsvParseErrors,
  fetchProjectsFromSheet
} from "../server/services/googleSheetsService";

const validCsv = [
  "ID,Название",
  "1,Проект 1",
  "2,Проект 2"
].join("\n");

const validResult = Papa.parse(validCsv, {
  header: true,
  skipEmptyLines: true
});
assert.doesNotThrow(
  () => assertNoCsvParseErrors(validResult.errors),
  "A complete, well-formed CSV must be accepted"
);

const truncatedCsv = [
  "ID,Название",
  "1,Проект 1",
  '2,"Незавершенное поле'
].join("\n");

const truncatedResult = Papa.parse(truncatedCsv, {
  header: true,
  skipEmptyLines: true
});
assert.ok(truncatedResult.errors.length > 0, "The fixture must produce a parser error");
assert.throws(
  () => assertNoCsvParseErrors(truncatedResult.errors),
  /malformed or incomplete CSV data/,
  "A truncated CSV must be rejected before it can drive a full sync"
);

const shortRowCsv = [
  "ID,Название,Стадия",
  "1,Проект 1,В работе",
  "2,Проект 2"
].join("\n");

const shortRowResult = Papa.parse(shortRowCsv, {
  header: true,
  skipEmptyLines: true
});
assert.ok(shortRowResult.errors.length > 0, "The short-row fixture must produce a parser error");
assert.throws(
  () => assertNoCsvParseErrors(shortRowResult.errors),
  /malformed or incomplete CSV data/,
  "A structurally incomplete row must fail the authoritative import"
);

const originalFetch = globalThis.fetch;
process.env.GOOGLE_SHEETS_CSV_URL = "https://example.test/sheet.csv";
try {
  globalThis.fetch = async () => new Response(truncatedCsv, {
    status: 200,
    headers: { "content-type": "text/csv" }
  });

  await assert.rejects(
    () => fetchProjectsFromSheet(new Date("2026-09-24T00:00:00.000Z")),
    /malformed or incomplete CSV data/,
    "The Sheets fetch path must stop before a malformed response can be synchronized"
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Google Sheets CSV parsing regression tests passed.");
