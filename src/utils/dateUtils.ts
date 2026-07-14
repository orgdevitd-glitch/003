export function normalizeDateValue(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Replace commas or slashes with dots to standardize standard Russian date delimiters
  const standardized = trimmed.replace(/[,/]/g, '.');

  // Handle DD.MM.YYYY
  const ruDateMatch = standardized.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruDateMatch) {
    const [, day, month, year] = ruDateMatch;
    return `${year}-${month}-${day}`;
  }

  // Handle date with time context in DD.MM.YYYY HH:MM or similar
  const ruDateTimeMatch = standardized.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+/);
  if (ruDateTimeMatch) {
    const [, day, month, year] = ruDateTimeMatch;
    return `${year}-${month}-${day}`;
  }

  return standardized;
}

export function parseDateSafe(value: string | null | undefined): Date | null {
  const normalized = normalizeDateValue(value);
  if (!normalized) {
    return null;
  }

  // Handle YYYY-MM-DD directly to avoid timezone/UTC offset shifting
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1; // 0-indexed month
    const day = parseInt(isoMatch[3], 10);
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  // Fallback for full ISO strings or formats not fully matched
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function formatDateSafe(value: string | null | undefined): string {
  const date = parseDateSafe(value);
  if (!date) {
    return "Не указано";
  }
  return date.toLocaleDateString("ru-RU");
}
