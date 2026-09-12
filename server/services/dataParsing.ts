export interface ParseResult<T> {
  value: T | null;
  rawValue: string;
  status: "success" | "warning" | "error";
  errors: string[];
  warnings: string[];
}

/**
 * Parses a semicolon separated list cell
 */
export function splitListCell(
  value: any,
  options?: { preserveEmpty?: boolean }
): ParseResult<string[]> {
  const rawStr = String(value === undefined || value === null ? "" : value).trim();
  
  if (!rawStr) {
    return {
      value: [],
      rawValue: rawStr,
      status: "success",
      errors: [],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  let status: "success" | "warning" | "error" = "success";

  // Check if there are commas but no semicolons, which might indicate a comma-separated list
  if (rawStr.includes(",") && !rawStr.includes(";")) {
    const listCount = rawStr.split(",").length;
    // Simple heuristic: if we have multiple comma-separated tokens length, and it's not a single number (like "1,5")
    if (listCount > 1 && !/^\d+,\d+$/.test(rawStr)) {
      warnings.push("Значение похоже на список, разделенный запятыми вместо точки с запятой ';'");
      status = "warning";
    }
  }

  const items = rawStr
    .split(";")
    .map(x => x.trim());

  // Default: drop empty slots. Callers that need positional alignment (вехи/KPI)
  // should pass preserveEmpty: true.
  const parsedItems = options?.preserveEmpty ? items : items.filter(x => x.length > 0);

  return {
    value: parsedItems,
    rawValue: rawStr,
    status,
    errors,
    warnings
  };
}

/**
 * Parses DD.MM.YYYY date and returns ISO format YYYY-MM-DD
 */
export function parseDateCell(value: any): ParseResult<string> {
  const rawStr = String(value === undefined || value === null ? "" : value).trim();
  
  if (!rawStr) {
    return {
      value: null,
      rawValue: rawStr,
      status: "success",
      errors: [],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Match DD.MM.YYYY format
  const dateMatch = rawStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  
  if (!dateMatch) {
    // Check if it's already in ISO format YYYY-MM-DD
    const isoMatch = rawStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(T.*)?$/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        errors.push(`Несуществующая дата календарных дней/месяцев: "${rawStr}"`);
        return {
          value: null,
          rawValue: rawStr,
          status: "error",
          errors,
          warnings
        };
      }
      const dateObj = new Date(Date.UTC(year, month - 1, day));
      if (
        isNaN(dateObj.getTime()) ||
        dateObj.getUTCDate() !== day ||
        dateObj.getUTCMonth() !== month - 1 ||
        dateObj.getUTCFullYear() !== year
      ) {
        errors.push(`Недопустимый день для выбранного месяца: "${rawStr}"`);
        return {
          value: null,
          rawValue: rawStr,
          status: "error",
          errors,
          warnings
        };
      }
      const isoStr = dateObj.toISOString().split("T")[0];
      return {
        value: isoStr,
        rawValue: rawStr,
        status: "success",
        errors: [],
        warnings: []
      };
    }

    errors.push(`Недопустимый формат даты "${rawStr}". Ожидается ДД.ММ.ГГГГ`);
    return {
      value: null,
      rawValue: rawStr,
      status: "error",
      errors,
      warnings
    };
  }

  const day = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const year = parseInt(dateMatch[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    errors.push(`Несуществующая дата календарных дней/месяцев: "${rawStr}"`);
    return {
      value: null,
      rawValue: rawStr,
      status: "error",
      errors,
      warnings
    };
  }

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(dateObj.getTime()) || dateObj.getUTCDate() !== day || dateObj.getUTCMonth() !== month - 1) {
    errors.push(`Недопустимый день для выбранного месяца: "${rawStr}"`);
    return {
      value: null,
      rawValue: rawStr,
      status: "error",
      errors,
      warnings
    };
  }

  const isoStr = dateObj.toISOString().split("T")[0];
  return {
    value: isoStr,
    rawValue: rawStr,
    status: "success",
    errors,
    warnings
  };
}

/**
 * Parses integer values
 */
export function parseIntegerCell(value: any): ParseResult<number> {
  const rawStr = String(value === undefined || value === null ? "" : value).trim();
  
  if (!rawStr) {
    return {
      value: null,
      rawValue: rawStr,
      status: "success",
      errors: [],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Replace comma with dot
  const normalized = rawStr.replace(",", ".");
  const parsedFloat = parseFloat(normalized);

  if (isNaN(parsedFloat)) {
    errors.push(`Не удалось преобразовать в целое число: "${rawStr}"`);
    return {
      value: null,
      rawValue: rawStr,
      status: "error",
      errors,
      warnings
    };
  }

  const valueInt = Math.round(parsedFloat);
  if (Math.abs(parsedFloat - valueInt) > 0.0001) {
    warnings.push(`Дробное число "${rawStr}" округлено до целого "${valueInt}"`);
  }

  return {
    value: valueInt,
    rawValue: rawStr,
    status: warnings.length > 0 ? "warning" : "success",
    errors,
    warnings
  };
}

/**
 * Parses number values (decimals supported)
 */
export function parseNumberCell(value: any): ParseResult<number> {
  const rawStr = String(value === undefined || value === null ? "" : value).trim();
  
  if (!rawStr) {
    return {
      value: null,
      rawValue: rawStr,
      status: "success",
      errors: [],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const normalized = rawStr.replace(",", ".").replace(/\s/g, "");
  // Strict numeric token: optional sign, digits, optional decimal part. Reject trailing junk like "100abc".
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
    errors.push(`Не удалось преобразовать в число: "${rawStr}"`);
    return {
      value: null,
      rawValue: rawStr,
      status: "error",
      errors,
      warnings
    };
  }

  const parsedFloat = parseFloat(normalized);

  if (isNaN(parsedFloat)) {
    errors.push(`Не удалось преобразовать в число: "${rawStr}"`);
    return {
      value: null,
      rawValue: rawStr,
      status: "error",
      errors,
      warnings
    };
  }

  return {
    value: parsedFloat,
    rawValue: rawStr,
    status: "success",
    errors,
    warnings
  };
}

/**
 * Parses percent values
 */
export function parsePercentCell(value: any): ParseResult<number> {
  const rawStr = String(value === undefined || value === null ? "" : value).trim();
  
  if (!rawStr) {
    return {
      value: null,
      rawValue: rawStr,
      status: "success",
      errors: [],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const hasPercentSuffix = rawStr.endsWith("%");
  const numericToken = (hasPercentSuffix ? rawStr.slice(0, -1) : rawStr)
    .trim()
    .replace(",", ".");

  // parseFloat accepts a valid numeric prefix and silently ignores the rest
  // (for example, "1O0%" becomes 1). Require the entire cell to be numeric.
  if (!/^[+-]?\d+(\.\d+)?$/.test(numericToken)) {
    errors.push(`Недопустимый формат процента: "${rawStr}"`);
    return {
      value: null,
      rawValue: rawStr,
      status: "error",
      errors,
      warnings
    };
  }

  const parsedFloat = Number(numericToken);

  if (hasPercentSuffix) {
    return {
      value: parsedFloat,
      rawValue: rawStr,
      status: "success",
      errors,
      warnings
    };
  }

  // For excel fractions < 1, like 0.05 -> interpret as 5% with a warning
  if (parsedFloat > 0 && parsedFloat < 1) {
    const calculatedPercent = parseFloat((parsedFloat * 100).toFixed(4));
    warnings.push(`Дробное значение Excel "${rawStr}" (< 1) интерпретировано как ${calculatedPercent}%`);
    return {
      value: calculatedPercent,
      rawValue: rawStr,
      status: "warning",
      errors,
      warnings
    };
  }

  return {
    value: parsedFloat,
    rawValue: rawStr,
    status: "success",
    errors,
    warnings
  };
}

/**
 * Checks if a weight value is empty, dash, zero or other placeholder
 * according to the new milestone weight methodology.
 */
export function isEmptyWeightValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const raw = String(value).trim().toLowerCase();
  return (
    raw === "" ||
    raw === "-" ||
    raw === "—" ||
    raw === "–" ||
    raw === "нет" ||
    raw === "н/д" ||
    raw === "n/a" ||
    raw === "0" ||
    raw === "0%" ||
    raw === "0,0" ||
    raw === "0.0" ||
    raw === "0,0%" ||
    raw === "0.0%"
  );
}

/**
 * Parses milestone weight cells, returning null for empty, 0%, or invalid values.
 */
export function parseMilestoneWeightCell(value: any): ParseResult<number> {
  const rawStr = String(value === undefined || value === null ? "" : value).trim();
  if (isEmptyWeightValue(rawStr)) {
    return {
      value: null,
      rawValue: rawStr,
      status: "success",
      errors: [],
      warnings: []
    };
  }
  const parsed = parsePercentCell(rawStr);
  if (parsed.status === "error" || parsed.value === null || parsed.value <= 0 || parsed.value > 100) {
    return {
      value: null,
      rawValue: rawStr,
      status: parsed.status,
      errors: parsed.errors,
      warnings: parsed.warnings
    };
  }
  return parsed;
}

/**
 * Parses URLs
 */
export function parseUrlCell(value: any): ParseResult<string> {
  const rawStr = String(value === undefined || value === null ? "" : value).trim();
  
  if (!rawStr) {
    return {
      value: null,
      rawValue: rawStr,
      status: "success",
      errors: [],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const url = new URL(rawStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push(`Протокол ссылки должен быть http или https: "${rawStr}"`);
      return {
        value: null,
        rawValue: rawStr,
        status: "error",
        errors,
        warnings
      };
    }
    return {
      value: rawStr,
      rawValue: rawStr,
      status: "success",
      errors,
      warnings
    };
  } catch (err) {
    errors.push(`Недопустимый формат ссылки: "${rawStr}"`);
    return {
      value: null,
      rawValue: rawStr,
      status: "error",
      errors,
      warnings
    };
  }
}
