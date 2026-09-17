import { redactUrlForDiagnostics } from "../server/services/envHelper";

function assertEqual(actual: string, expected: string, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

assertEqual(
  redactUrlForDiagnostics(
    "https://docs.google.com/spreadsheets/d/1234567890abcdef/export?format=csv&gid=7&access_token=secret#fragment"
  ),
  "https://docs.google.com/spreadsheets/d/1234...cdef/export",
  "Google Sheets diagnostics must mask the ID and remove query credentials"
);

assertEqual(
  redactUrlForDiagnostics("https://user:password@csv.example.com/private/signed-token/export.csv?token=secret"),
  "https://csv.example.com/…",
  "Custom data-source diagnostics must expose only the origin"
);

assertEqual(
  redactUrlForDiagnostics("not a valid URL"),
  "",
  "Invalid URLs must not be reflected"
);

console.log("Environment URL redaction tests passed.");
