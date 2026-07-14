import { parseDateSafe } from "./dateUtils";

export interface CompletenessResult {
  completenessPercent: number;
  totalApplicableRequiredFields: number;
  filledApplicableRequiredFields: number;
  missingFields: string[];
  invalidFields: string[];
  notApplicableFields: string[];
  userVisibleReasons: string[];
}

function toMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0));
}

function isValidDate(value: any): boolean {
  if (!value) return false;
  const parsed = parseDateSafe(String(value));
  return parsed !== null && !isNaN(parsed.getTime());
}

function isValidRegularity(value: any): boolean {
  if (value === null || value === undefined) return false;
  const num = Number(value);
  return !isNaN(num) && num > 0;
}

function getProjValue(project: any, fieldKey: string) {
  const isNormalized = !!project?.baseInfo;
  switch (fieldKey) {
    case "projectName": // 1. Название
      return isNormalized ? project.baseInfo.title : project.projectName;
    case "goals": // 2. Цели проекта
      if (isNormalized) {
        return project.baseInfo.goals;
      } else {
        const g = project.goals;
        return Array.isArray(g) ? g.join("; ") : g;
      }
    case "resultImages": // 3. Образы результатов
      if (isNormalized) {
        return project.baseInfo.resultImages;
      } else {
        const r = project.resultImages;
        return Array.isArray(r) ? r.join("; ") : r;
      }
    case "startDate": // 4. Дата начала
      return isNormalized ? project.baseInfo.startDate : project.startDate;
    case "endDate": // 5. Дата завершения
      return isNormalized ? project.baseInfo.endDate : project.endDate;
    case "stage": // 6. Стадия
      return isNormalized ? project.baseInfo.stage : project.stage;
    case "type": // 7. Вид
      return isNormalized ? project.baseInfo.type : project.projectType;
    case "projectManager": // 8. Руководитель проекта
      return isNormalized ? project.people.projectManager : project.projectManager;
    case "projectAdmin": // 9. Администратор проекта
      return isNormalized ? project.people.projectAdmin : project.projectAdmin;
    case "customers": // 10. Заказчики
      if (isNormalized) {
        return project.people.customers;
      } else {
        const c = project.sponsor;
        return typeof c === "string" ? c.split(";").map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(c) ? c : []);
      }
    case "team": // 11. Команда проекта
      if (isNormalized) {
        return project.people.team;
      } else {
        const t = project.projectTeam;
        return typeof t === "string" ? t.split(";").map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(t) ? t : []);
      }
    case "priority": // 12. Приоритет
      return isNormalized ? project.baseInfo.priority : project.priority;
    case "responsible": // 13. Ответственный
      return isNormalized ? project.people.responsible : project.responsible;
    case "monitoringStart": // 14. Дата начала мониторинга
      return isNormalized ? project.monitoring.startDate : project.monitoringStart;
    case "monitoringFrequencyWeeks": // 15. Регулярность мониторинга
      return isNormalized ? project.monitoring.regularityWeeks : project.monitoringFrequencyWeeks;
    case "lastPcDate": // 16. Дата последнего мониторинга
      return isNormalized ? project.monitoring.lastMonitoringDate : project.lastPcDate;
    case "monitoringParticipants": // 17. Обязательные участники Мониторинга
      if (isNormalized) {
        return project.people.monitoringParticipants;
      } else {
        const p = project.observers;
        return Array.isArray(p) ? p : [];
      }
    case "owner": // 18. Владелец проекта
      return isNormalized ? project.people.owner : project.projectOwner || project.owner;
    case "department": // 19. Департамент
      if (isNormalized) {
        return project.organization.departments;
      } else {
        const d = project.department;
        return typeof d === "string" ? d.split(";").map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(d) ? d : []);
      }
    default:
      return null;
  }
}

export function calculateProjectDataCompleteness(
  project: any,
  assessmentDateInput?: Date | string | null
): CompletenessResult {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const notApplicableFields: string[] = [];
  const userVisibleReasons: string[] = [];

  const alwaysMandatoryFields = [
    { key: "projectName", label: "Название", reasonMissing: "Не заполнено поле: Название проекта", reasonInvalid: "Некорректное название проекта" },
    { key: "goals", label: "Цели проекта", reasonMissing: "Не заполнено поле: Цели проекта", reasonInvalid: "Некорректные цели проекта" },
    { key: "resultImages", label: "Образы результатов", reasonMissing: "Не заполнено поле: Образы результатов", reasonInvalid: "Некорректные образы результатов" },
    { key: "startDate", label: "Дата начала", reasonMissing: "Не заполнено поле: Дата начала", reasonInvalid: "Некорректная дата начала проекта" },
    { key: "endDate", label: "Дата завершения", reasonMissing: "Не заполнено поле: Дата завершения", reasonInvalid: "Некорректная дата завершения проекта" },
    { key: "stage", label: "Стадия", reasonMissing: "Не заполнено поле: Стадия", reasonInvalid: "Некорректная стадия проекта" },
    { key: "type", label: "Вид", reasonMissing: "Не заполнено поле: Вид", reasonInvalid: "Некорректный вид проекта" },
    { key: "projectManager", label: "Руководитель проекта", reasonMissing: "Не заполнено поле: Руководитель проекта", reasonInvalid: "Некорректный руководитель проекта" },
    { key: "projectAdmin", label: "Администратор проекта", reasonMissing: "Не заполнено поле: Администратор проекта", reasonInvalid: "Некорректный администратор проекта" },
    { key: "customers", label: "Заказчики", reasonMissing: "Не заполнено поле: Заказчики", reasonInvalid: "Некорректные заказчики" },
    { key: "team", label: "Команда проекта", reasonMissing: "Не заполнено поле: Команда проекта", reasonInvalid: "Некорректная команда проекта" },
    { key: "priority", label: "Приоритет", reasonMissing: "Не заполнено поле: Приоритет", reasonInvalid: "Некорректный приоритет" },
    { key: "responsible", label: "Ответственный", reasonMissing: "Не заполнено поле: Ответственный", reasonInvalid: "Некорректный ответственный" },
    { key: "monitoringStart", label: "Дата начала мониторинга", reasonMissing: "Не заполнено поле: Дата начала мониторинга", reasonInvalid: "Некорректная дата начала мониторинга" },
    { key: "monitoringFrequencyWeeks", label: "Регулярность мониторинга", reasonMissing: "Не заполнена регулярность мониторинга", reasonInvalid: "Некорректная регулярность мониторинга" },
    { key: "monitoringParticipants", label: "Обязательные участники Мониторинга", reasonMissing: "Не заполнено поле: Обязательные участники Мониторинга", reasonInvalid: "Некорректные обязательные участники Мониторинга" },
    { key: "owner", label: "Владелец проекта", reasonMissing: "Не заполнено поле: Владелец проекта", reasonInvalid: "Некорректный владелец проекта" },
    { key: "department", label: "Департамент", reasonMissing: "Не заполнено поле: Департамент", reasonInvalid: "Некорректный департамент" },
  ];

  let filledApplicableRequiredFields = 0;
  let totalApplicableRequiredFields = 0;

  // Process always mandatory fields
  alwaysMandatoryFields.forEach(field => {
    totalApplicableRequiredFields++;
    const rawVal = getProjValue(project, field.key);

    let isMissing = false;
    let isValid = true;
    let reasonInvalid = field.reasonInvalid;

    // Check custom rules per field type
    if (field.key === "priority") {
      isMissing = rawVal === null || rawVal === undefined || String(rawVal).trim() === "";
      isValid = !isMissing && (Number(rawVal) === 0 || Number(rawVal) === 1 || Number(rawVal) === 2);
    } else if (field.key === "monitoringFrequencyWeeks") {
      isMissing = rawVal === null || rawVal === undefined || String(rawVal).trim() === "";
      isValid = !isMissing && isValidRegularity(rawVal);
    } else if (["startDate", "endDate", "monitoringStart"].includes(field.key)) {
      isMissing = !rawVal || String(rawVal).trim() === "";
      isValid = !isMissing && isValidDate(rawVal);
      
      if (field.key === "monitoringStart" && isValid) {
        const endDateVal = getProjValue(project, "endDate");
        if (isValidDate(endDateVal)) {
          const monStartObj = parseDateSafe(String(rawVal))!;
          const endDateObj = parseDateSafe(String(endDateVal))!;
          const monStartMidnight = toMidnight(monStartObj);
          const endDateMidnight = toMidnight(endDateObj);
          if (monStartMidnight.getTime() > endDateMidnight.getTime()) {
            isValid = false;
            reasonInvalid = "Некорректная дата начала мониторинга: дата начала мониторинга позже даты завершения проекта";
          }
        }
      }
    } else if (["customers", "team", "monitoringParticipants", "department"].includes(field.key)) {
      const listStr = Array.isArray(rawVal) ? rawVal.join("; ") : String(rawVal || "");
      isMissing = !listStr || listStr.trim() === "";
    } else {
      isMissing = !rawVal || String(rawVal).trim() === "";
    }

    if (isMissing) {
      missingFields.push(field.label);
      userVisibleReasons.push(field.reasonMissing);
    } else if (!isValid) {
      invalidFields.push(field.label);
      userVisibleReasons.push(reasonInvalid);
    } else {
      filledApplicableRequiredFields++;
    }
  });

  // Process conditionally mandatory field: Дата последнего мониторинга
  const monStartVal = getProjValue(project, "monitoringStart");
  const monFreqVal = getProjValue(project, "monitoringFrequencyWeeks");

  let monStartValid = isValidDate(monStartVal);
  if (monStartValid) {
    const endDateVal = getProjValue(project, "endDate");
    if (isValidDate(endDateVal)) {
      const monStartObj = parseDateSafe(String(monStartVal))!;
      const endDateObj = parseDateSafe(String(endDateVal))!;
      if (toMidnight(monStartObj).getTime() > toMidnight(endDateObj).getTime()) {
        monStartValid = false;
      }
    }
  }
  const monFreqValid = isValidRegularity(monFreqVal);

  let isLastPcApplicable = false;

  if (monStartValid && monFreqValid) {
    const assessmentDate = assessmentDateInput ? new Date(assessmentDateInput) : new Date();
    const assessmentMidnight = toMidnight(assessmentDate);

    const monStartObj = parseDateSafe(String(monStartVal))!;
    const monStartMidnight = toMidnight(monStartObj);

    if (monStartMidnight.getTime() <= assessmentMidnight.getTime()) {
      const regularityWeeks = Number(monFreqVal);
      const firstPlannedPcMidnight = new Date(monStartMidnight.getTime() + regularityWeeks * 7 * 24 * 60 * 60 * 1000);

      if (assessmentMidnight.getTime() >= firstPlannedPcMidnight.getTime()) {
        isLastPcApplicable = true;
      }
    }
  }

  if (isLastPcApplicable) {
    totalApplicableRequiredFields++;
    const lastPcVal = getProjValue(project, "lastPcDate");

    const isMissing = !lastPcVal || String(lastPcVal).trim() === "";
    const isValid = !isMissing && isValidDate(lastPcVal);

    if (isMissing) {
      missingFields.push("Дата последнего мониторинга");
      userVisibleReasons.push("Дата последнего мониторинга возрастает / отсутствует, хотя первый плановый ПК уже должен был пройти");
      // Actually let's use the exact requested reason string:
      userVisibleReasons[userVisibleReasons.length - 1] = "Дата последнего мониторинга отсутствует, хотя первый плановый ПК уже должен был пройти";
    } else if (!isValid) {
      invalidFields.push("Дата последнего мониторинга");
      userVisibleReasons.push("Некорректная дата последнего мониторинга");
    } else {
      filledApplicableRequiredFields++;
    }
  } else {
    notApplicableFields.push("Дата последнего мониторинга");
  }

  const completenessPercent = totalApplicableRequiredFields > 0
    ? Math.round((filledApplicableRequiredFields / totalApplicableRequiredFields) * 100)
    : 100;

  return {
    completenessPercent,
    totalApplicableRequiredFields,
    filledApplicableRequiredFields,
    missingFields,
    invalidFields,
    notApplicableFields,
    userVisibleReasons
  };
}
