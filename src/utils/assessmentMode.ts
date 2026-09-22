export type AssessmentMode = "today" | "custom";

type AssessmentModeStorage = Pick<Storage, "getItem">;

export function readStoredAssessmentMode(
  storage: AssessmentModeStorage | null | undefined
): AssessmentMode {
  try {
    return storage?.getItem("pm_assessment_mode") === "custom" ? "custom" : "today";
  } catch {
    return "today";
  }
}
