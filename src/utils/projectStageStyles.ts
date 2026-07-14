/**
 * Single source of truth for project stages, labels, colors, and tailwind/custom styling rules.
 * Implements the "Остановлен" stage with color #C00000.
 */

export const UNSPECIFIED_PROJECT_STAGE = "Стадия не указана";

export const KNOWN_PROJECT_STAGES = [
  "Планируется",
  "В работе",
  "На паузе",
  "Остановлен",
  "Завершен"
] as const;

export type KnownProjectStage = (typeof KNOWN_PROJECT_STAGES)[number];

export const PROJECT_STAGE_LABELS = {
  planned: "Планируется",
  active: "В работе",
  paused: "На паузе",
  stopped: "Остановлен",
  completed: "Завершен",
  unspecified: UNSPECIFIED_PROJECT_STAGE
};

export const PROJECT_STAGE_COLORS = {
  planned: "#3b82f6",  // Blue
  active: "#fbbf24",   // Amber/Yellow
  paused: "#9ca3af",   // Gray
  stopped: "#C00000",  // Dark Red (#C00000)
  completed: "#10b981", // Emerald
  unspecified: "#64748b" // Slate
};

export const STAGE_COLOR_MAP: Record<string, string> = {
  "Планируется": "#3b82f6",
  "В работе": "#fbbf24",
  "На паузе": "#9ca3af",
  "Остановлен": "#C00000",
  "Завершен": "#10b981",
  [UNSPECIFIED_PROJECT_STAGE]: "#64748b"
};

export const STAGE_ORDER = [
  "В работе",
  "На паузе",
  "Остановлен",
  "Завершен",
  "Планируется",
  UNSPECIFIED_PROJECT_STAGE
];

export function isKnownProjectStage(stage: string | null | undefined): boolean {
  return (KNOWN_PROJECT_STAGES as readonly string[]).includes(String(stage || ""));
}

/**
 * Normalizes any string representation of a stage to a canonical label.
 * Empty / unrecognized stages → "Стадия не указана" (never silently mapped to "Планируется").
 * Empty stage always maps to "Стадия не указана" — legacy `status` must not restore a known stage.
 * (`status` is accepted for call-site compatibility and is ignored.)
 */
export function normalizeProjectStage(value: string | null | undefined, _status?: string | null | undefined): string {
  const raw = String(value || "").trim().toLowerCase();

  if (!raw) {
    return UNSPECIFIED_PROJECT_STAGE;
  }

  // Paused stage check (must be BEFORE stopped stage check so "приостановлен" with "останов" is caught first)
  if (
    raw === "на паузе" || 
    raw === "paused" || 
    raw === "pause" || 
    raw.includes("пауз") || 
    raw.includes("приостанов")
  ) {
    return "На паузе";
  }

  // Cancelled/Stopped stage check - both map to Остановлен
  if (
    raw === "остановлен" || 
    raw === "stopped" || 
    raw === "stop" || 
    raw === "stopped_project" ||
    raw === "отменен" || 
    raw === "отменено" || 
    raw === "отменена" || 
    raw === "отменён" || 
    raw === "cancelled" || 
    raw === "canceled" ||
    raw === "cancel" || 
    raw.includes("отмен") ||
    raw.includes("отмена") ||
    (raw.includes("останов") && !raw.includes("приостанов"))
  ) {
    return "Остановлен";
  }

  // Active work stage check
  if (
    raw === "в работе" || 
    raw === "active" || 
    raw === "work" || 
    raw === "working" || 
    raw.includes("работ")
  ) {
    return "В работе";
  }

  // Completed stage check
  if (
    raw === "завершен" || 
    raw === "завершено" || 
    raw === "завершена" || 
    raw === "completed" || 
    raw === "complete" || 
    raw.includes("заверш")
  ) {
    return "Завершен";
  }

  // Planned stage check
  if (
    raw === "планируется" || 
    raw.includes("план")
  ) {
    return "Планируется";
  }

  if (raw === "стадия не указана" || raw === "не указана" || raw === "без стадии") {
    return UNSPECIFIED_PROJECT_STAGE;
  }

  // Unknown non-empty value — dedicated bucket, not "Планируется"
  return UNSPECIFIED_PROJECT_STAGE;
}

/**
 * Returns Tailwind css definitions for project stage badges.
 */
export function getStageBadgeClass(stageName: string | null | undefined): string {
  const norm = normalizeProjectStage(stageName);
  switch (norm) {
    case "Планируется":
      return "bg-blue-50 text-blue-700 border-blue-100";
    case "В работе":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "На паузе":
      return "bg-gray-50 text-gray-500 border-gray-100";
    case "Остановлен":
      // Custom color #C00000 for "Остановлен" stage
      return "bg-red-50 text-[#C00000] border-red-100";
    case "Завершен":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case UNSPECIFIED_PROJECT_STAGE:
      return "bg-slate-50 text-slate-600 border-slate-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

/**
 * Returns Tailwind css definitions for project stage badges on dark backgrounds.
 */
export function getStageDarkBadgeClass(stageName: string | null | undefined): string {
  const norm = normalizeProjectStage(stageName);
  switch (norm) {
    case "Остановлен":
      return "border-red-500/30 bg-[#C00000]/20 text-red-200";
    case "Планируется":
      return "border-blue-500/30 bg-blue-500/10 text-blue-300";
    case "В работе":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "На паузе":
      return "border-gray-500/30 bg-gray-500/10 text-gray-400";
    case "Завершен":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case UNSPECIFIED_PROJECT_STAGE:
      return "border-slate-500/30 bg-slate-500/10 text-slate-300";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }
}

/**
 * Returns a human-friendly Russified label for a stage.
 */
export function getStageLabel(stageName: string | null | undefined): string {
  return normalizeProjectStage(stageName);
}

/**
 * Returns hex color code for a stage.
 */
export function getStageColor(stageName: string | null | undefined): string {
  const norm = normalizeProjectStage(stageName);
  return STAGE_COLOR_MAP[norm] || STAGE_COLOR_MAP[UNSPECIFIED_PROJECT_STAGE];
}

export interface RoadmapStageStyle {
  base: string;
  fill: string;
  pill: string;
  dot: string;
}

/**
 * Returns stage styling for visual roadmaps.
 */
export function getRoadmapStageStyle(stageName: string | null | undefined): RoadmapStageStyle {
  const norm = normalizeProjectStage(stageName);
  switch (norm) {
    case "Планируется":
      return {
        base: "bg-amber-100/55",
        fill: "bg-amber-400",
        pill: "bg-white/95 text-gray-900 border border-amber-200/70 shadow-sm",
        dot: "bg-amber-400"
      };
    case "В работе":
      return {
        base: "bg-gray-100",
        fill: "bg-black",
        pill: "bg-white/95 text-gray-900 border border-gray-200/70 shadow-sm",
        dot: "bg-black"
      };
    case "На паузе":
      return {
        base: "bg-orange-100/55",
        fill: "bg-orange-400",
        pill: "bg-white/95 text-gray-900 border border-orange-200/70 shadow-sm",
        dot: "bg-orange-400"
      };
    case "Остановлен":
      return {
        base: "bg-red-50",
        fill: "bg-[#C00000]",
        pill: "bg-white/95 text-red-800 border border-red-200 shadow-sm",
        dot: "bg-[#C00000]"
      };
    case "Завершен":
      return {
        base: "bg-emerald-100/55",
        fill: "bg-emerald-500",
        pill: "bg-white/95 text-gray-900 border border-emerald-200/70 shadow-sm",
        dot: "bg-emerald-500"
      };
    case UNSPECIFIED_PROJECT_STAGE:
    default:
      return {
        base: "bg-slate-100/70",
        fill: "bg-slate-400",
        pill: "bg-white/95 text-slate-800 border border-slate-200 shadow-sm",
        dot: "bg-slate-400"
      };
  }
}
