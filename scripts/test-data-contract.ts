import {
  BASE_COLUMNS,
  analyzeSheetColumns,
  normalizeHeaderName,
  normalizeRowKeys,
} from "../server/services/dataContract";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `Assertion failed: ${message}\nExpected: ${expectedJson}\nReceived: ${actualJson}`,
    );
  }
}

function runTest(name: string, test: () => void): void {
  try {
    test();
    console.log(`[DATA_CONTRACT_TEST] ✓ ${name}`);
  } catch (error) {
    console.error(`[DATA_CONTRACT_TEST] ✗ ${name}`);
    throw error;
  }
}

const quarterHeaders = (year: number, quarter: string): string[] => [
  `Вехи ${year} ${quarter}`,
  `% выполнения Вехи ${year} ${quarter}`,
  `Вес вехи ${year} ${quarter}`,
  `Показатели проекта ${year} ${quarter}`,
  `План Показатели проекта ${year} ${quarter}`,
  `Факт Показатели проекта ${year} ${quarter}`,
];

runTest("normalizes spreadsheet aliases, BOMs, and a blank first ID header", () => {
  assert(
    normalizeHeaderName("\uFEFF ID проекта ", 0) === "ID",
    "BOM-prefixed ID alias should normalize to ID",
  );
  assert(
    normalizeHeaderName("Название проекта", 1) === "Название",
    "project name alias should normalize to the canonical name",
  );
  assert(
    normalizeHeaderName("", 0) === "ID",
    "a blank first spreadsheet header should be treated as ID",
  );
  assert(
    normalizeHeaderName("", 2) === "",
    "a blank non-first header must not be treated as ID",
  );
});

runTest("normalizes imported row keys without changing cell values", () => {
  const row = {
    "ID проекта": " PRJ-007 ",
    "Название проекта": "Запуск продукта",
    "Дата окончания проекта": "31.12.2026",
    "Пользовательское поле": "сохранить",
  };

  assertDeepEqual(
    normalizeRowKeys(row, Object.keys(row)),
    {
      ID: " PRJ-007 ",
      Название: "Запуск продукта",
      "Дата завершения": "31.12.2026",
      "Пользовательское поле": "сохранить",
    },
    "only header names should be canonicalized",
  );
});

runTest("recognizes complete quarterly groups and sorts periods chronologically", () => {
  const aliasedBaseHeaders = BASE_COLUMNS.map((header) => {
    if (header === "ID") return "\uFEFFID проекта";
    if (header === "Название") return "Название проекта";
    return header;
  });
  const headers = [
    ...aliasedBaseHeaders,
    ...quarterHeaders(2026, "q1").map((header) => ` ${header} `),
    ...quarterHeaders(2025, "Q4"),
  ];

  const analysis = analyzeSheetColumns(headers);

  assert(analysis.structureStatus === "ok", "complete aliased sheet should be valid");
  assertDeepEqual(analysis.missingBaseColumns, [], "all base columns should be found");
  assertDeepEqual(analysis.detectedYears, [2025, 2026], "years should be sorted");
  assertDeepEqual(
    analysis.detectedQuarters,
    ["2025 Q4", "2026 Q1"],
    "quarters should be normalized and sorted",
  );
  assertDeepEqual(
    analysis.incompleteQuarterGroups,
    {},
    "complete quarter groups should have no missing companions",
  );
});

runTest("reports every missing companion in a partial quarterly group", () => {
  const analysis = analyzeSheetColumns([
    ...BASE_COLUMNS,
    "Вехи 2026 Q3",
    "% выполнения Вехи 2026 Q3",
  ]);
  const missingCompanions = analysis.incompleteQuarterGroups["2026 Q3"];

  assert(analysis.structureStatus === "warning", "partial quarter should be a warning");
  assert(
    missingCompanions?.length === 4,
    "the import report should include all four missing quarter companions",
  );
});

runTest("marks a sheet missing a critical identifier as an error", () => {
  const analysis = analyzeSheetColumns(BASE_COLUMNS.filter((header) => header !== "ID"));

  assert(analysis.structureStatus === "error", "missing ID should reject the sheet structure");
  assert(analysis.missingBaseColumns.includes("ID"), "missing ID should be reported");
});

console.log("[DATA_CONTRACT_TEST] All tests passed.");
