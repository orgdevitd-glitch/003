import fs from "fs-extra";
import path from "path";
import { 
  loadIndicatorDictionary, 
  loadIndicatorDictionaryWithTTL,
  getIndicatorDictionaryStatus, 
  getUnknownIndicatorsReport 
} from "../server/services/indicatorDictionaryService";
import { 
  resolveIndicatorDictionaryItem, 
  setIndicatorDictionary, 
  getIndicatorDictionary,
  DEFAULT_INDICATOR_DICTIONARY 
} from "../server/services/indicatorDictionary";
import { Project } from "../src/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Temporary data dir for test persistence
const TEST_DATA_DIR = path.join(process.cwd(), "data-test-kpi-dictionary");
const CACHE_FILE = path.join(TEST_DATA_DIR, "indicator-dictionary.json");

async function runTests() {
  console.log("=== STARTING KPI DICTIONARY INTEGRATION TESTS ===");

  // Setup environment and paths
  process.env.DATA_DIR = TEST_DATA_DIR;
  await fs.ensureDir(TEST_DATA_DIR);
  await fs.remove(CACHE_FILE); // Start clean

  const originalFetch = global.fetch;
  const mockCsvUrl = "https://example.com/indicators.csv";
  process.env.GOOGLE_SHEETS_INDICATOR_DICTIONARY_CSV_URL = mockCsvUrl;

  try {
    // ==========================================
    // Сценарий A & B & C: Загрузка валидного CSV
    // ==========================================
    console.log("\n[Test Scenario A, B, C] Parsing and validating correct CSV...");
    
    const validCsv = `canonicalName,aliases,method,status,unit,comment,approvedBy,updatedAt,owner
Оборот,оборот; ОБОРОТ; Оборот Honor,higher_is_better,active,руб,Финансы,PMO,2026-06-30,Finance
Прибыль,прибыль; ПРИБЫЛЬ,higher_is_better,active,руб,,,
Доля отсрочки,,pending,pending_business_decision,,В разработке,,,
`;

    global.fetch = async (url: any) => {
      return {
        status: 200,
        headers: {
          get: (name: string) => name === "content-type" ? "text/csv" : null
        },
        text: async () => validCsv
      } as any;
    };

    await loadIndicatorDictionary();

    const status = getIndicatorDictionaryStatus();
    assert(status.source === "google_sheets", "Source should be google_sheets");
    assert(status.itemsCount === 3, `Items count should be 3, got ${status.itemsCount}`);
    assert(status.activeCount === 2, `Active count should be 2, got ${status.activeCount}`);
    assert(status.pendingCount === 1, `Pending count should be 1, got ${status.pendingCount}`);
    console.log("✓ Correctly loaded CSV stats");

    // Resolver checks
    console.log("Checking resolver for calculatable and pending/disabled items...");
    
    // Oborot is calculatable
    const resolvedOborot = resolveIndicatorDictionaryItem("Оборот");
    assert(!!resolvedOborot, "Should resolve Оборот");
    assert(resolvedOborot?.calculationType === "higher_is_better", "Оборот type should be higher_is_better");

    // Dolya otsrochki has pending status/method and should NOT be calculated
    const resolvedOtsrochka = resolveIndicatorDictionaryItem("Доля отсрочки", getIndicatorDictionary(), true);
    assert(resolvedOtsrochka === null, "Dolya otsrochki should not be calculatable");

    // But should resolve if onlyCalculatable is false (e.g. for metadata)
    const resolvedOtsrochkaMeta = resolveIndicatorDictionaryItem("Доля отсрочки", getIndicatorDictionary(), false);
    assert(!!resolvedOtsrochkaMeta, "Dolya otsrochki should resolve when onlyCalculatable is false");
    console.log("✓ Resolver correctly filters by calculations eligibility");

    // Scenario B: Aliases check
    console.log("Checking alias resolution...");
    const resolvedAlias1 = resolveIndicatorDictionaryItem("оборот");
    const resolvedAlias2 = resolveIndicatorDictionaryItem("ОБОРОТ");
    const resolvedAlias3 = resolveIndicatorDictionaryItem("Оборот Honor");
    assert(!!resolvedAlias1 && resolvedAlias1.name === "Оборот", "Should resolve alias 'оборот'");
    assert(!!resolvedAlias2 && resolvedAlias2.name === "Оборот", "Should resolve alias 'ОБОРОТ'");
    assert(!!resolvedAlias3 && resolvedAlias3.name === "Оборот", "Should resolve alias 'Оборот Honor'");
    console.log("✓ Aliases resolved successfully");

    // Scenario C: Negative checks (no substring matching)
    console.log("Checking negative cases (strictly no partial matches)...");
    assert(resolveIndicatorDictionaryItem("Оборотистость") === null, "Should not match partial 'Оборотистость'");
    assert(resolveIndicatorDictionaryItem("Прибыльность") === null, "Should not match partial 'Прибыльность'");
    assert(resolveIndicatorDictionaryItem("Количество") === null, "Should not match partial 'Количество'");
    assert(resolveIndicatorDictionaryItem("5 500 шт (Оборот ~1,65 млн$)") === null, "Should not match noisy '5 500 шт (Оборот...)'");
    assert(resolveIndicatorDictionaryItem("Увеличение доли отгрузок по предоплате до 60% от общего проектного оборота к концу года") === null, "Should not match sentence containing 'оборот'");
    console.log("✓ Checked and verified no substring matching");

    // ==========================================
    // Сценарий D: Лист недоступен, но есть cache
    // ==========================================
    console.log("\n[Test Scenario D] Sheet down, fall back to valid JSON cache...");
    
    // Setup fetch to fail
    global.fetch = async () => {
      throw new Error("Connection refused (mocking offline sheets)");
    };

    // Load again - should read from local cache file created in Scenario A
    await loadIndicatorDictionary();
    const statusD = getIndicatorDictionaryStatus();
    assert(statusD.source === "cache", "Source should be cache");
    assert(statusD.itemsCount === 3, "Items count should still be 3 from cache");
    console.log("✓ Successfully recovered from local JSON cache file");

    // ==========================================
    // Сценарий E: Лист недоступен, cache отсутствует
    // ==========================================
    console.log("\n[Test Scenario E] Sheet down, no cache file, fall back to default...");
    
    // Delete cache file
    await fs.remove(CACHE_FILE);

    await loadIndicatorDictionary();
    const statusE = getIndicatorDictionaryStatus();
    assert(statusE.source === "default", "Source should be default");
    assert(statusE.itemsCount === DEFAULT_INDICATOR_DICTIONARY.length, "Items count should match default dictionary");
    console.log("✓ Successfully fell back to built-in dictionary");

    // ==========================================
    // Сценарий F: Невалидный CSV
    // ==========================================
    console.log("\n[Test Scenario F] Invalid CSV does not overwrite healthy cache...");
    
    // First, populate cache again with a healthy dictionary
    const healthyCsv = `canonicalName,aliases,method,status,unit,comment,approvedBy,updatedAt,owner
Прибыль,прибыль,higher_is_better,active,руб,,,
`;
    global.fetch = async () => ({
      status: 200,
      headers: { get: () => "text/csv" },
      text: async () => healthyCsv
    } as any);

    await loadIndicatorDictionary();
    assert(getIndicatorDictionaryStatus().source === "google_sheets", "Populated cache successfully");

    // Now, simulate fetching a broken CSV
    const brokenCsv = `canonicalName,method,status
,,
`; // Empty canonicalNames, incomplete data

    global.fetch = async () => ({
      status: 200,
      headers: { get: () => "text/csv" },
      text: async () => brokenCsv
    } as any);

    await loadIndicatorDictionary();
    const statusF = getIndicatorDictionaryStatus();
    // It should have caught the error and fallen back to cache!
    assert(statusF.source === "cache", "Should fail on broken CSV and read from cache");
    assert(statusF.itemsCount === 1, "Should preserve the healthy cache row count (1)");
    console.log("✓ Confirmed invalid CSV does not overwrite healthy cache");

    // ==========================================
    // Сценарий G: Отчет по неизвестным KPI
    // ==========================================
    console.log("\n[Test Scenario G] Unknown KPI reporting...");
    
    // Let's load the validCsv dataset again
    global.fetch = async () => ({
      status: 200,
      headers: { get: () => "text/csv" },
      text: async () => validCsv
    } as any);
    await loadIndicatorDictionary();

    // Create mock projects
    const mockProjects: Project[] = [
      {
        projectId: "proj-1",
        projectName: "Проект Один",
        status: "active",
        tasks: [],
        milestones: [],
        indicators: [
          {
            indicatorId: "ind-1",
            name: "Оборот", // Active, calculatable => should NOT be in unknown report
            planValue: "100",
            factValue: "110"
          },
          {
            indicatorId: "ind-2",
            name: "Неизвестный Показатель X", // Fully unknown => should be in report as 'not_found'
            planValue: "10",
            factValue: "5"
          },
          {
            indicatorId: "ind-3",
            name: "Доля отсрочки", // Present but pending => should be in report as 'pending'
            planValue: "30",
            factValue: "15"
          }
        ]
      },
      {
        projectId: "proj-2",
        projectName: "Проект Два",
        status: "active",
        tasks: [],
        milestones: [],
        indicators: [
          {
            indicatorId: "ind-4",
            name: "Доля отсрочки", // Present but pending (multiple occurrences)
            planValue: "40",
            factValue: "20"
          },
          {
            indicatorId: "ind-5",
            name: "Неизвестный Показатель X", // Fully unknown (multiple occurrences)
            planValue: "15",
            factValue: "12"
          }
        ]
      }
    ];

    const report = getUnknownIndicatorsReport(mockProjects);
    
    // Verify report structure and values
    assert(report.length === 2, `Report size should be 2, got ${report.length}`);
    
    const xReport = report.find(r => r.indicatorName === "Неизвестный Показатель X");
    assert(!!xReport, "Report should contain 'Неизвестный Показатель X'");
    assert(xReport?.occurrenceCount === 2, `Occurrence count should be 2, got ${xReport?.occurrenceCount}`);
    assert(xReport?.projectCount === 2, "Project count should be 2");
    assert(xReport?.reason === "fallback_plan_fact", `Reason should be 'fallback_plan_fact', got '${xReport?.reason}'`);

    const pendingReport = report.find(r => r.indicatorName === "Доля отсрочки");
    assert(!!pendingReport, "Report should contain 'Доля отсрочки'");
    assert(pendingReport?.occurrenceCount === 2, "Occurrence should be 2");
    assert(pendingReport?.projectCount === 2, "Project count should be 2");
    assert(pendingReport?.reason === "pending", "Reason should be 'pending'");

    // Confirm that 'Оборот' is active and NOT in unknown report
    const oborotReport = report.find(r => r.indicatorName === "Оборот");
    assert(!oborotReport, "Active KPI 'Оборот' must not be in the unknown report");
    
    console.log("✓ Unknown KPI report verified successfully");

    // ==========================================
    // Сценарий H: Невалидный cache-файл отклоняется
    // ==========================================
    console.log("\n[Test Scenario H] Cache with invalid items is rejected, falls back to default...");
    
    // Write cache with invalid items
    await fs.writeJson(CACHE_FILE, {
      items: [
        {
          name: "Битый KPI",
          calculationType: "invalid_method_value",
          status: "active",
          unit: null
        }
      ],
      meta: {
        source: "google_sheets",
        loadedAt: new Date().toISOString()
      }
    });

    // Make fetch fail to force fallback
    global.fetch = async () => {
      throw new Error("Sheets offline");
    };

    await loadIndicatorDictionary();
    const statusH = getIndicatorDictionaryStatus();
    assert(statusH.source === "default", `Should fallback to default on invalid cache, got source: ${statusH.source}`);
    assert(getIndicatorDictionary().find(item => item.name === "Битый KPI") === undefined, "Broken KPI should not be present in active dictionary");
    console.log("✓ Cache with invalid items was correctly rejected and fell back to default");

    // ==========================================
    // Сценарий I: TTL подавляет лишние загрузки
    // ==========================================
    console.log("\n[Test Scenario I] TTL suppresses reloads until the exact expiry boundary...");

    const originalDateNow = Date.now;
    const ttlMs = 10_000;
    const firstLoadAt = originalDateNow() + 60_000;
    let now = firstLoadAt;
    let fetchCount = 0;

    Date.now = () => now;
    global.fetch = async () => {
      fetchCount++;
      return {
        status: 200,
        headers: { get: () => "text/csv" },
        text: async () => healthyCsv
      } as any;
    };

    try {
      await loadIndicatorDictionaryWithTTL(ttlMs);
      assert(fetchCount === 1, `Expired dictionary should reload once, got ${fetchCount} fetches`);

      now = firstLoadAt + ttlMs - 1;
      await loadIndicatorDictionaryWithTTL(ttlMs);
      assert(fetchCount === 1, "Dictionary should not reload before TTL expires");

      now = firstLoadAt + ttlMs;
      await loadIndicatorDictionaryWithTTL(ttlMs);
      assert(fetchCount === 2, "Dictionary should reload exactly when TTL expires");
    } finally {
      Date.now = originalDateNow;
    }
    console.log("✓ TTL prevents reload storms and refreshes at expiry");

  } finally {
    // Restore fetch and cleanup test dirs
    global.fetch = originalFetch;
    await fs.remove(TEST_DATA_DIR);
  }

  console.log("\n=== ALL KPI DICTIONARY TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch(err => {
  console.error("\n❌ TEST RUN FAILED:", err);
  process.exit(1);
});
