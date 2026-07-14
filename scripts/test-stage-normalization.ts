import { normalizeProjectStage, getStageLabel, getStageColor, STAGE_COLOR_MAP, UNSPECIFIED_PROJECT_STAGE } from "../src/utils/projectStageStyles";

function runTest(name: string, fn: () => void) {
  console.log(`[STAGE_TEST] Running: ${name}...`);
  try {
    fn();
    console.log(`[STAGE_TEST] ✓ Passed: ${name}\n`);
  } catch (error: any) {
    console.error(`[STAGE_TEST] ❌ FAILED: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

runTest("normalizeProjectStage mappings for paused and stopped", () => {
  // Stopped mappings
  assert(normalizeProjectStage("Остановлен") === "Остановлен", "Остановлен -> Остановлен");
  assert(normalizeProjectStage("остановлен") === "Остановлен", "остановлен -> Остановлен");
  assert(normalizeProjectStage("stopped") === "Остановлен", "stopped -> Остановлен");

  // Paused mappings
  assert(normalizeProjectStage("На паузе") === "На паузе", "На паузе -> На паузе");
  assert(normalizeProjectStage("на паузе") === "На паузе", "на паузе -> На паузе");
  assert(normalizeProjectStage("Приостановлен") === "На паузе", "Приостановлен -> На паузе");
  assert(normalizeProjectStage("приостановлен") === "На паузе", "приостановлен -> На паузе");
  assert(normalizeProjectStage("paused") === "На паузе", "paused -> На паузе");

  // Other standard mappings
  assert(normalizeProjectStage("В работе") === "В работе", "В работе -> В работе");
  assert(normalizeProjectStage("завершен") === "Завершен", "завершен -> Завершен");
  
  // Legacy aliases to Остановлен
  assert(normalizeProjectStage("Отменен") === "Остановлен", "Отменен -> Остановлен");
  assert(normalizeProjectStage("Отменён") === "Остановлен", "Отменён -> Остановлен");
  assert(normalizeProjectStage("отмена") === "Остановлен", "отмена -> Остановлен");
  assert(normalizeProjectStage("cancelled") === "Остановлен", "cancelled -> Остановлен");
  assert(normalizeProjectStage("canceled") === "Остановлен", "canceled -> Остановлен");
  assert(normalizeProjectStage("cancel") === "Остановлен", "cancel -> Остановлен");
  assert(normalizeProjectStage("отменен") === "Остановлен", "отменен -> Остановлен");

  // Empty stage always → Стадия не указана (legacy status must NOT restore a known stage)
  assert(normalizeProjectStage("", "active") === UNSPECIFIED_PROJECT_STAGE, "stage='', status='active' -> Стадия не указана");
  assert(normalizeProjectStage(null, "completed") === UNSPECIFIED_PROJECT_STAGE, "stage=null, status='completed' -> Стадия не указана");
  assert(normalizeProjectStage(undefined, "cancelled") === UNSPECIFIED_PROJECT_STAGE, "stage=undefined, status='cancelled' -> Стадия не указана");
  assert(normalizeProjectStage("", "waiting") === UNSPECIFIED_PROJECT_STAGE, "stage='', status='waiting' -> Стадия не указана");

  // Empty / unknown must NOT become Планируется
  assert(normalizeProjectStage("") === UNSPECIFIED_PROJECT_STAGE, "empty stage -> Стадия не указана");
  assert(normalizeProjectStage(null) === UNSPECIFIED_PROJECT_STAGE, "null stage -> Стадия не указана");
  assert(normalizeProjectStage("foobar-unknown") === UNSPECIFIED_PROJECT_STAGE, "unknown stage -> Стадия не указана");
  assert(normalizeProjectStage("xyz") !== "Планируется", "unknown must not map to Планируется");
  assert(getStageLabel(null) === UNSPECIFIED_PROJECT_STAGE, "getStageLabel(null) -> Стадия не указана");
});

runTest("getStageColor returns #C00000 for Остановлен and works with STAGE_COLOR_MAP", () => {
  assert(getStageColor("Остановлен") === "#C00000", "Остановлен color code must be #C00000");
  assert(getStageColor("остановлен") === "#C00000", "Normalized stopped projects must map to color #C00000");
  assert(STAGE_COLOR_MAP["Остановлен"] === "#C00000", "STAGE_COLOR_MAP['Остановлен'] must be #C00000");
  assert(STAGE_COLOR_MAP["На паузе"] === "#9ca3af", "STAGE_COLOR_MAP['На паузе'] must be #9ca3af");
});

console.log("All stage normalization tests passed successfully!");
