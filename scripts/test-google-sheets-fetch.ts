import { fetchCsvFromGoogleSheets } from "../server/services/googleSheetsService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function main(): Promise<void> {
  const originalFetch = global.fetch;
  try {
    global.fetch = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("mock upstream aborted")),
          { once: true }
        );
      })) as typeof fetch;

    const startedAt = Date.now();
    let timeoutError = "";
    try {
      await fetchCsvFromGoogleSheets("https://example.com/projects.csv", 20);
    } catch (error: any) {
      timeoutError = error.message || String(error);
    }

    assert(timeoutError.includes("timed out after 20ms"), "Stalled fetch must fail with a timeout");
    assert(Date.now() - startedAt < 1000, "Stalled fetch must be aborted promptly");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("Google Sheets fetch timeout test passed");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
