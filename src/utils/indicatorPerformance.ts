import { resolveIndicatorDictionaryItem } from "../../server/services/indicatorDictionary";

const sanitizeAndParseFloat = (val: string | number | undefined | null): number => {
  if (val === undefined || val === null) return 0;
  const valStr = val.toString().trim().replace(/,/g, ".");
  if (valStr === "" || valStr.toLowerCase() === "nan") return 0;

  // Handle ranges like "10-20%" or "10 - 20"
  const rangeMatch = valStr.match(/^([\d.]+)\s*-\s*([\d.]+)/);
  if (rangeMatch) {
    const first = parseFloat(rangeMatch[1]);
    const second = parseFloat(rangeMatch[2]);
    if (!isNaN(first) && !isNaN(second)) {
      return (first + second) / 2;
    }
  }

  // Handle potential leading/trailing garbage, but keep main digits, dot, and minus-sign prefix
  const cleaned = valStr.replace(/[^\d.-]/g, "");
  if (
    cleaned === "" ||
    cleaned === "." ||
    cleaned === "-" ||
    cleaned === ".-" ||
    cleaned === "-."
  ) {
    return 0;
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export interface IndicatorPerformanceResult {
  performancePercent: number;
  cappedPerformancePercent: number;
  calculationSource?: "dictionary" | "fallback_plan_fact";
}

export const calculateSingleIndicatorPerformance = (
  name: string,
  plan: string | number | null | undefined,
  fact: string | number | null | undefined
): IndicatorPerformanceResult | null => {
  if (plan === null || plan === undefined || fact === null || fact === undefined) {
    return null;
  }

  const planStr = plan.toString().trim();
  const factStr = fact.toString().trim();

  const isValid = (str: string): boolean => {
    const cleaned = str.trim().toLowerCase();
    if (
      !cleaned ||
      cleaned === "nan" ||
      cleaned === "—" ||
      cleaned === "нет" ||
      cleaned === "n/a" ||
      cleaned === "--" ||
      cleaned === "-"
    ) {
      return false;
    }
    const dotStr = cleaned.replace(/,/g, ".");

    // Check for range like "10-20" or "10-20%"
    const rangeMatch = dotStr.match(/^([\d.]+)\s*-\s*([\d.]+)%?$/);
    if (rangeMatch) {
      const first = parseFloat(rangeMatch[1]);
      const second = parseFloat(rangeMatch[2]);
      return !isNaN(first) && !isNaN(second);
    }

    const withoutPercent = dotStr.replace(/%/g, "").trim();
    const numericRegex = /^-?\d+(\.\d+)?$/;
    return numericRegex.test(withoutPercent);
  };

  if (!isValid(planStr) || !isValid(factStr)) {
    return null;
  }

  const planVal = sanitizeAndParseFloat(planStr);
  const factVal = sanitizeAndParseFloat(factStr);

  if (planVal === 0) {
    return null;
  }

  const calculatableItem = resolveIndicatorDictionaryItem(name, undefined, true);
  const anyDictionaryItem = resolveIndicatorDictionaryItem(name, undefined, false);

  if (calculatableItem) {
    const resolvedType = calculatableItem.calculationType;

    let performance = 0;
    if (resolvedType === "higher_is_better") {
      performance = (factVal / planVal) * 100;
    } else if (resolvedType === "lower_is_better") {
      performance = factVal === 0 ? 100 : (planVal / factVal) * 100;
    } else if (resolvedType === "target") {
      const dev = Math.abs((factVal - planVal) / planVal);
      performance = Math.max(0, 100 - dev * 100);
    }

    const capped = Math.min(100, Math.max(0, performance));

    return {
      performancePercent: performance,
      cappedPerformancePercent: capped,
      calculationSource: "dictionary"
    };
  } else if (anyDictionaryItem) {
    return null;
  } else {
    // Unknown indicator fallback calculation
    const performance = (factVal / planVal) * 100;
    const capped = Math.min(100, Math.max(0, performance));

    return {
      performancePercent: performance,
      cappedPerformancePercent: capped,
      calculationSource: "fallback_plan_fact"
    };
  }
};

