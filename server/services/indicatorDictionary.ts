export type IndicatorCalculationType = "higher_is_better" | "lower_is_better" | "target" | "pending" | "disabled";

export interface IndicatorDictionaryItem {
  name: string;
  calculationType: IndicatorCalculationType;
  unit: string | null;
  aliases?: string[];
  status?: string;
  comment?: string;
  approvedBy?: string;
  updatedAt?: string;
  owner?: string;
}

export const DEFAULT_INDICATOR_DICTIONARY: IndicatorDictionaryItem[] = [
  {
    name: "Доля подразделений, прошедших обучение",
    calculationType: "higher_is_better",
    unit: "%"
  },
  {
    name: "Доля подразделений, обеспеченных инструментами",
    calculationType: "higher_is_better",
    unit: "%"
  },
  {
    name: "Доля договоров, заведенных в реестр",
    calculationType: "higher_is_better",
    unit: "%"
  },
  {
    name: "Средний срок согласования договора",
    calculationType: "lower_is_better",
    unit: "рабочих дней",
    aliases: ["Срок согласования договора"]
  },
  {
    name: "Среднее время ответа клиенту",
    calculationType: "lower_is_better",
    unit: "минут",
    aliases: ["Время ответа клиенту"]
  },
  {
    name: "Количество ошибок",
    calculationType: "lower_is_better",
    unit: "шт.",
    aliases: ["Ошибки", "Число ошибок"]
  },
  {
    name: "Средний балл качества коммуникаций",
    calculationType: "higher_is_better",
    unit: "баллы",
    aliases: ["Качество коммуникаций"]
  },
  // Real indicators from sheets
  {
    name: "Оборот",
    calculationType: "higher_is_better",
    unit: null,
    aliases: ["оборот", "ОБОРОТ"]
  },
  {
    name: "Прибыль",
    calculationType: "higher_is_better",
    unit: null,
    aliases: ["прибыль", "ПРИБЫЛЬ"]
  },
  {
    name: "Прибыль (ВП1)",
    calculationType: "higher_is_better",
    unit: null,
    aliases: ["Прибыль (ВП 1)", "Прибыль вп1", "прибыль вп1", "прибыль (вп1)"]
  },
  {
    name: "Рентабельность",
    calculationType: "higher_is_better",
    unit: "%",
    aliases: ["рентабельность", "РЕНТАБЕЛЬНОСТЬ"]
  },
  {
    name: "Новые клиенты",
    calculationType: "higher_is_better",
    unit: "чел.",
    aliases: ["новые клиенты", "НОВЫЕ КЛИЕНТЫ", "НовыеКлиенты"]
  },
  {
    name: "ОБОРОТ HONOR",
    calculationType: "higher_is_better",
    unit: null,
    aliases: ["Оборот Honor", "оборот honor", "оборот хонор", "Оборот Хонор", "ОБОРОТ ХОНОР"]
  },
  {
    name: "ОБОРОТ OTHER",
    calculationType: "higher_is_better",
    unit: null,
    aliases: ["Оборот Other", "оборот other", "Оборот Озер", "оборот озер", "ОБОРОТ ОЗЕР"]
  },
  {
    name: "ОБОРОТ DREEME",
    calculationType: "higher_is_better",
    unit: null,
    aliases: ["Оборот Dreeme", "оборот dreeme", "Оборот Дрим", "оборот дрим", "ОБОРОТ ДРИМ", "Dreeme"]
  },
  {
    name: "ОБОРОТ IT",
    calculationType: "higher_is_better",
    unit: null,
    aliases: ["Оборот IT", "оборот it", "Оборот ИТ", "оборот ит", "ОБОРОТ ИТ"]
  },
  {
    name: "вп1",
    calculationType: "higher_is_better",
    unit: null,
    aliases: ["ВП1", "Вп1", "вп 1", "ВП 1"]
  }
];

let activeIndicatorDictionary: IndicatorDictionaryItem[] = DEFAULT_INDICATOR_DICTIONARY;

export function setIndicatorDictionary(items: IndicatorDictionaryItem[]) {
  activeIndicatorDictionary = items;
}

export function getIndicatorDictionary(): IndicatorDictionaryItem[] {
  return activeIndicatorDictionary;
}

/**
 * Normalizes indicator name to ignore start/end spaces, casing, and internal multiple spaces.
 */
export function normalizeIndicatorName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Resolves dictionary item by indicator name.
 * It matches exact match first, then aliases, with NO substring matching.
 */
export function resolveIndicatorDictionaryItem(
  indicatorName: string,
  dictionary: IndicatorDictionaryItem[] = getIndicatorDictionary(),
  onlyCalculatable: boolean = true
): IndicatorDictionaryItem | null {
  const normalizedQuery = normalizeIndicatorName(indicatorName);
  if (!normalizedQuery) return null;

  // 1. Exact match after normalization
  let matched = dictionary.find(item => normalizeIndicatorName(item.name) === normalizedQuery);

  // 2. Alias match after normalization
  if (!matched) {
    matched = dictionary.find(item => 
      item.aliases?.some(alias => normalizeIndicatorName(alias) === normalizedQuery)
    );
  }

  if (!matched) return null;

  if (onlyCalculatable) {
    const method = matched.calculationType;
    const status = (matched as any).status || "active";

    const validMethods = ["higher_is_better", "lower_is_better", "target"];
    const validStatuses = ["active", "active_proposed"];

    if (!validMethods.includes(method) || !validStatuses.includes(status)) {
      return null;
    }
  }

  return matched;
}
