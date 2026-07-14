export const BASE_COLUMNS = [
  "ID",
  "Название",
  "Цели проекта",
  "Образы результатов",
  "Дата начала",
  "Дата завершения",
  "Стадия",
  "Вид",
  "Руководитель проекта",
  "Администратор проекта",
  "Заказчики",
  "Команда проекта",
  "Приоритет",
  "Ответственный",
  "Дата начала мониторинга",
  "Регулярность мониторинга (1 раз в количество недель)",
  "Дата последнего мониторинга",
  "Обязательные участники Мониторинга",
  "Владелец проекта",
  "Департамент",
  "Ссылка на проект"
];

export const ALLOWED_STAGES = ["Планируется", "В работе", "На паузе", "Остановлен", "Завершен"] as const;
export const ALLOWED_KINDS = ["Проект", "Программа"] as const;
export const ALLOWED_PRIORITIES = ["0", "1", "2"] as const;

export type StageType = typeof ALLOWED_STAGES[number];
export type KindType = typeof ALLOWED_KINDS[number];
export type PriorityType = typeof ALLOWED_PRIORITIES[number];

export interface QuarterCompanions {
  milestonesCol?: string; // Вехи {year} Q{quarter}
  progressCol?: string;   // % выполнения Вехи {year} Q{quarter}
  weightCol?: string;     // Вес вехи {year} Q{quarter}
  indicatorsCol?: string; // Показатели проекта {year} Q{quarter}
  planCol?: string;       // План Показатели проекта {year} Q{quarter}
  factCol?: string;       // Факт Показатели проекта {year} Q{quarter}
}

export interface SheetContractAnalysis {
  foundColumns: string[];
  missingBaseColumns: string[];
  detectedYears: number[];
  detectedQuarters: string[]; // e.g. "2026 Q1"
  quarterGroups: Record<string, QuarterCompanions>;
  incompleteQuarterGroups: Record<string, string[]>; // e.g. { "2026 Q1": ["Вес вехи 2026 Q1"] }
  unknownColumns: string[];
  structureStatus: "ok" | "warning" | "error";
}

// Regex patterns for the 6 quarterly column types
export const QUARTER_PATTERNS = {
  milestonesCol: /^\s*Вехи\s+(\d{4})\s+(Q[1-4])\s*$/i,
  progressCol: /^\s*% выполнения Вехи\s+(\d{4})\s+(Q[1-4])\s*$/i,
  weightCol: /^\s*Вес вехи\s+(\d{4})\s+(Q[1-4])\s*$/i,
  indicatorsCol: /^\s*Показатели проекта\s+(\d{4})\s+(Q[1-4])\s*$/i,
  planCol: /^\s*План Показатели проекта\s+(\d{4})\s+(Q[1-4])\s*$/i,
  factCol: /^\s*Факт Показатели проекта\s+(\d{4})\s+(Q[1-4])\s*$/i,
};

export function normalizeHeaderName(header: string, index?: number): string {
  if (header === undefined || header === null) {
    if (index === 0) return "ID";
    return "";
  }
  const cleanHeader = header.replace(/^\uFEFF/, "");
  const trimmed = cleanHeader.trim();
  const lower = trimmed.toLowerCase();
  
  if (
    lower === "id" ||
    lower === "id проекта" ||
    lower === "ид проекта" ||
    lower === "ед" ||
    lower === "ед." ||
    lower === "№" ||
    lower === "№ п/п" ||
    lower === "ро" ||
    lower === "ро проекта" ||
    lower === "№ проекта" ||
    (trimmed === "" && index === 0)
  ) {
    return "ID";
  }
  if (lower === "название" || lower === "название проекта") {
    return "Название";
  }
  if (lower === "цели проекта" || lower === "цель проекта") {
    return "Цели проекта";
  }
  if (lower === "образы результатов" || lower === "образ результата" || lower === "образы результата") {
    return "Образы результатов";
  }
  if (lower === "дата начала" || lower === "дата начала проекта") {
    return "Дата начала";
  }
  if (lower === "дата завершения" || lower === "дата окончания проекта") {
    return "Дата завершения";
  }
  if (lower === "стадия" || lower === "стадия проекта") {
    return "Стадия";
  }
  if (lower === "статус" || lower === "статус проекта") {
    return "Статус";
  }
  if (lower === "вид" || lower === "вид проекта") {
    return "Вид";
  }
  
  return trimmed;
}

export function normalizeRowKeys(row: Record<string, string>, rawHeaders?: string[]): Record<string, string> {
  if (!row) return {};
  const normalized: Record<string, string> = {};
  const keys = Object.keys(row);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const index = rawHeaders ? rawHeaders.indexOf(key) : i;
    normalized[normalizeHeaderName(key, index)] = row[key];
  }
  return normalized;
}

export function analyzeSheetColumns(headers: string[]): SheetContractAnalysis {
  const normalizedHeaders = (headers || []).map((h, idx) => normalizeHeaderName(h, idx));
  const cleanHeaders = normalizedHeaders.map(h => h.trim());
  const foundColumns = cleanHeaders.filter(h => BASE_COLUMNS.includes(h));
  const missingBaseColumns = BASE_COLUMNS.filter(h => !cleanHeaders.includes(h));

  const detectedYearsSet = new Set<number>();
  const detectedQuartersSet = new Set<string>(); // "YYYY QX"
  const quarterGroups: Record<string, QuarterCompanions> = {};
  const unknownColumns: string[] = [];

  for (const rawHeader of normalizedHeaders) {
    const header = rawHeader.trim();
    if (BASE_COLUMNS.includes(header)) {
      continue;
    }

    let isQuarterly = false;
    for (const [key, regex] of Object.entries(QUARTER_PATTERNS)) {
      const match = header.match(regex);
      if (match) {
        isQuarterly = true;
        const year = parseInt(match[1], 10);
        const quarter = match[2].toUpperCase();
        const keyGroup = `${year} ${quarter}`;

        detectedYearsSet.add(year);
        detectedQuartersSet.add(keyGroup);

        if (!quarterGroups[keyGroup]) {
          quarterGroups[keyGroup] = {};
        }
        quarterGroups[keyGroup][key as keyof QuarterCompanions] = header;
        break;
      }
    }

    if (!isQuarterly && header !== "") {
      unknownColumns.push(rawHeader);
    }
  }

  // Find incomplete groups (must have all 6 companions if any is present)
  const incompleteQuarterGroups: Record<string, string[]> = {};
  const companionKeys: (keyof QuarterCompanions)[] = [
    "milestonesCol",
    "progressCol",
    "weightCol",
    "indicatorsCol",
    "planCol",
    "factCol"
  ];

  const companionDisplayNames: Record<keyof QuarterCompanions, string> = {
    milestonesCol: "Вехи {year} Q{quarter}",
    progressCol: "% выполнения Вехи {year} Q{quarter}",
    weightCol: "Вес вехи {year} Q{quarter}",
    indicatorsCol: "Показатели проекта {year} Q{quarter}",
    planCol: "План Показатели проекта {year} Q{quarter}",
    factCol: "Факт Показатели проекта {year} Q{quarter}"
  };

  for (const [keyGroup, companions] of Object.entries(quarterGroups)) {
    const [year, quarter] = keyGroup.split(" ");
    const missing: string[] = [];
    for (const companionKey of companionKeys) {
      if (!companions[companionKey]) {
        const displayName = companionDisplayNames[companionKey]
          .replace("{year}", year)
          .replace("{quarter}", quarter);
        missing.push(displayName);
      }
    }
    if (missing.length > 0) {
      incompleteQuarterGroups[keyGroup] = missing;
    }
  }

  // Determine structure status
  let structureStatus: "ok" | "warning" | "error" = "ok";
  
  // Missing critical columns like ID, Название
  const criticalMissing = missingBaseColumns.some(col => col === "ID" || col === "Название");
  if (criticalMissing) {
    structureStatus = "error";
  } else if (missingBaseColumns.length > 0 || Object.keys(incompleteQuarterGroups).length > 0) {
    structureStatus = "warning";
  }

  const detectedYears = Array.from(detectedYearsSet).sort((a, b) => a - b);
  const detectedQuarters = Array.from(detectedQuartersSet).sort((a, b) => {
    const [yA, qA] = a.split(" ");
    const [yB, qB] = b.split(" ");
    if (yA !== yB) return parseInt(yA, 10) - parseInt(yB, 10);
    return qA.localeCompare(qB);
  });

  return {
    foundColumns,
    missingBaseColumns,
    detectedYears,
    detectedQuarters,
    quarterGroups,
    incompleteQuarterGroups,
    unknownColumns,
    structureStatus
  };
}
