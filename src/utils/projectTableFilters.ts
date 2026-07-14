import { Project } from "../types";
import { normalizeProjectStage } from "./projectStageStyles";

/**
 * Normalizes project stage for the purpose of filtering and building filter options.
 * Maps 'paused' (or 'На паузе') to 'Остановлен' based on the requirements.
 */
export function getNormalizedStageForFiltering(project: Project): string {
  const norm = normalizeProjectStage(project.stage, project.status);
  if (norm === "На паузе") {
    return "Остановлен";
  }
  return norm;
}

/**
 * Checks if a project matches the selected stage filter values.
 */
export function matchProjectStage(project: Project, selectedStages: string[]): boolean {
  if (!selectedStages || selectedStages.length === 0) return true;
  
  const normStage = getNormalizedStageForFiltering(project);
  const isEmpty = !project.stage && !project.status;

  return selectedStages.some(sel => {
    if (sel === "Не заполнено") return isEmpty;
    
    // Support raw and Russian comparison by normalizing the filter selection
    const rawSel = sel.trim().toLowerCase();
    let normSel = sel;

    if (rawSel === "paused" || rawSel === "pause" || sel === "На паузе") {
      normSel = "Остановлен";
    } else if (rawSel === "active" || sel === "В работе") {
      normSel = "В работе";
    } else if (rawSel === "completed" || sel === "Завершен") {
      normSel = "Завершен";
    } else if (rawSel === "cancelled" || rawSel === "stopped" || sel === "Остановлен") {
      normSel = "Остановлен";
    } else if (rawSel === "waiting" || sel === "Планируется") {
      normSel = "Планируется";
    }

    return normStage === normSel;
  });
}
