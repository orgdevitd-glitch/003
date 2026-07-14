import React, { useState, useEffect, useMemo } from 'react';
import { Map as LucideMap, Calendar } from 'lucide-react';
import { Project, ProjectEvaluation } from '../types';
import { formatDateSafe, parseDateSafe } from '../utils/dateUtils';
import { getEvaluationByProjectId } from '../utils/evaluationUtils';
import { getRegistryRiskView } from '../utils/projectRegistryStatus';
import { normalizeProjectStage, getRoadmapStageStyle } from '../utils/projectStageStyles';
import { parseRussianDate } from '../utils/projectCalculations';
import { getVisualProjectBounds, getYearsForRoadmap, getRoadmapTimelineProjects, getVisualCalendarProgressPercent, getProjectCalendarIntervalStatus } from '../utils/roadmapYearUtils';
import { resolveYearWithinAvailableYears } from '../utils/periodApplicability';

interface RoadmapProps {
  projects: Project[];
  assessmentDate?: string;
  headerHeight?: number;
  projectEvaluations?: ProjectEvaluation[] | null;
}

export const Roadmap: React.FC<RoadmapProps> = ({ projects, assessmentDate, headerHeight = 80, projectEvaluations }) => {
  const today = new Date();
  const y = today.getFullYear();
  const monthString = String(today.getMonth() + 1).padStart(2, '0');
  const dayString = String(today.getDate()).padStart(2, '0');
  const fallbackDate = `${y}-${monthString}-${dayString}`;
  const finalAssessmentDate = assessmentDate || fallbackDate;

  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  const headerRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    const body = bodyRef.current;
    if (!header || !body) return;

    let isSyncingHeader = false;
    let isSyncingBody = false;

    const handleHeaderScroll = () => {
      if (!isSyncingHeader) {
        isSyncingBody = true;
        body.scrollLeft = header.scrollLeft;
      }
      isSyncingHeader = false;
    };

    const handleBodyScroll = () => {
      if (!isSyncingBody) {
        isSyncingHeader = true;
        header.scrollLeft = body.scrollLeft;
      }
      isSyncingBody = false;
    };

    header.addEventListener('scroll', handleHeaderScroll, { passive: true });
    body.addEventListener('scroll', handleBodyScroll, { passive: true });

    return () => {
      header.removeEventListener('scroll', handleHeaderScroll);
      body.removeEventListener('scroll', handleBodyScroll);
    };
  }, []);

  const isMobile = windowWidth < 768;

  // Build availableYears from project portfolio
  const availableYears = useMemo(() => {
    return getYearsForRoadmap(projects, projectEvaluations, finalAssessmentDate);
  }, [projects, projectEvaluations, finalAssessmentDate]);

  // Selected Roadmap Year state
  const [selectedYearState, setSelectedYearState] = useState<number | null>(null);

  const selectedYear = useMemo(() => {
    if (selectedYearState !== null && availableYears.includes(selectedYearState)) {
      return selectedYearState;
    }
    return resolveYearWithinAvailableYears(availableYears, finalAssessmentDate);
  }, [selectedYearState, availableYears, finalAssessmentDate]);

  useEffect(() => {
    if (availableYears.length > 0) {
      if (selectedYearState === null || !availableYears.includes(selectedYearState)) {
        setSelectedYearState(resolveYearWithinAvailableYears(availableYears, finalAssessmentDate));
      }
    }
  }, [availableYears, selectedYearState, finalAssessmentDate]);

  const timelineProjects = useMemo(() => {
    return getRoadmapTimelineProjects(projects, projectEvaluations, selectedYear);
  }, [projects, projectEvaluations, selectedYear]);

  const [hiddenStages, setHiddenStages] = useState<Set<string>>(new Set());

  const toggleStageVisibility = (stage: string) => {
    setHiddenStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  };

  const visibleTimelineProjects = useMemo(() => {
    return timelineProjects.filter(project => {
      const stage = normalizeProjectStage(project.stage, project.status);
      return !hiddenStages.has(stage);
    });
  }, [timelineProjects, hiddenStages]);

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    timelineProjects.forEach(project => {
      const stage = normalizeProjectStage(project.stage, project.status);
      counts.set(stage, (counts.get(stage) || 0) + 1);
    });
    return counts;
  }, [timelineProjects]);

  const getYearPercentageHelper = (date: Date | null | undefined): number => {
    if (!date) return 0;
    if (date.getFullYear() < selectedYear) return 0;
    if (date.getFullYear() > selectedYear) return 100;

    const startOfYear = new Date(selectedYear, 0, 1);
    const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59);
    const totalMs = endOfYear.getTime() - startOfYear.getTime();
    const currentMs = date.getTime() - startOfYear.getTime();
    
    return Math.min(100, Math.max(0, (currentMs / totalMs) * 100));
  };

  const activeStages = useMemo(() => {
    const stagesSet = new Set<string>();
    timelineProjects.forEach(p => {
      stagesSet.add(normalizeProjectStage(p.stage, p.status));
    });
    const order = ["Планируется", "В работе", "На паузе", "Остановлен", "Завершен"];
    return order.filter(s => stagesSet.has(s));
  }, [timelineProjects]);

  const parsedAssess = parseDateSafe(finalAssessmentDate);
  let assessmentPositionPercent: number | null = null;
  let assessmentLabelSuffix = "";
  if (parsedAssess) {
    const pct = getYearPercentageHelper(parsedAssess);
    if (parsedAssess.getFullYear() === selectedYear) {
      assessmentPositionPercent = pct;
    } else if (parsedAssess.getFullYear() < selectedYear) {
      assessmentPositionPercent = 0;
      assessmentLabelSuffix = " (до начала года)";
    } else {
      assessmentPositionPercent = 100;
      assessmentLabelSuffix = " (после окончания года)";
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Year Selector component matched styling of tab 1 */}
      {availableYears.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar size={12} className="text-[#F8BC03]" /> Выберите год дорожной карты:
            </span>
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-fit shrink-0 flex-wrap gap-1">
              {availableYears.map((year) => (
                <button
                  key={year}
                  id={`btn-select-year-roadmap-${year}`}
                  onClick={() => setSelectedYearState(year)}
                  className={`px-4.5 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer interactive-button ${
                    selectedYear === year
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isMobile ? (
        <div className="bg-white rounded-3xl border border-gray-100 p-5 sm:p-8 space-y-6">
          <div className="flex flex-col gap-4 pb-4 border-b border-gray-100">
            <h3 className="text-sm font-black text-[#011] uppercase tracking-widest flex items-center gap-3">
              <LucideMap className="text-[#F8BC03]" size={20} /> Временная шкала проектов ({selectedYear})
            </h3>
            {activeStages.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50">
                {activeStages.map(stage => {
                  const colors = getRoadmapStageStyle(stage);
                  const isHidden = hiddenStages.has(stage);
                  const count = stageCounts.get(stage) || 0;
                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => toggleStageVisibility(stage)}
                      aria-pressed={!isHidden}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer text-[10px] uppercase font-bold tracking-tight interactive-button ${
                        isHidden
                          ? 'opacity-40 bg-gray-50 border-gray-100 text-gray-400 line-through'
                          : 'bg-white border-gray-200 text-gray-700 shadow-sm hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${isHidden ? 'bg-gray-300' : colors.fill}`} />
                      <span>
                        {stage} · {count}
                      </span>
                    </button>
                  );
                })}
                {hiddenStages.size > 0 && (
                  <button
                    onClick={() => setHiddenStages(new Set())}
                    className="px-2.5 py-1 text-[10px] font-bold text-amber-600 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    Показать все
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="relative border-l-2 border-gray-100 ml-4 pl-6 space-y-6">
            {visibleTimelineProjects.map((p) => {
              const pStart = parseDateSafe(p.startDate || p.createdAt);

              const currentStageStr = normalizeProjectStage(p.stage, p.status);
              const currentColors = getRoadmapStageStyle(currentStageStr);

              const startParsed = parseDateSafe(p.startDate);
              const endParsed = parseDateSafe(p.deadlineAt || p.endDate);

              let periodString = "";
              if (!startParsed && !endParsed) {
                periodString = "Период не указан";
              } else {
                const startFmt = startParsed ? formatDateSafe(p.startDate) : "Начало не указано";
                const endFmt = endParsed ? formatDateSafe(p.deadlineAt || p.endDate) : "Завершение не указано";
                periodString = `${startFmt} - ${endFmt}`;
              }

              // Visual bounds for the selected year
              const { visualStart, visualEnd } = getVisualProjectBounds(p, selectedYear, finalAssessmentDate);

              const intervalStatus = getProjectCalendarIntervalStatus(p);

              const visualCalendarProgressPercent = intervalStatus.isValid
                ? getVisualCalendarProgressPercent(visualStart, visualEnd, finalAssessmentDate, p)
                : null;

              return (
                <div key={p.projectId} className="relative group">
                  {/* Dot */}
                  <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-4 border-white shadow-sm transition-transform group-hover:scale-125 ${currentColors.dot}`} />
                  
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block font-mono">
                        {pStart ? pStart.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }) : 'Срок не указан'}
                      </span>
                      <span className={`${currentColors.pill} px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest`}>
                        {currentStageStr}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-gray-900 leading-snug">{p.projectName}</h4>

                    <div className="flex flex-col gap-1 text-[11px] text-gray-500 pt-2 border-t border-gray-50">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={12} className="text-gray-400 shrink-0" />
                        <span>Период: <span className="font-semibold text-gray-800">{periodString}</span></span>
                      </div>
                      {intervalStatus.isValid && (
                        <div className="flex items-center gap-1.5 text-[10px] text-amber-600/90 font-medium">
                          <span>На карте ({selectedYear}): {visualStart.toLocaleDateString("ru-RU")} - {visualEnd.toLocaleDateString("ru-RU")}</span>
                        </div>
                      )}
                    </div>

                    {!intervalStatus.isValid ? (
                      <div className="pt-2 border-t border-gray-50 mt-1 flex items-center justify-between text-[11px]">
                        <span className="font-bold uppercase tracking-widest text-gray-400">Календарный прогресс</span>
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider ${
                          intervalStatus.error === 'date_error' 
                            ? 'bg-red-50 text-red-600 border border-red-200' 
                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                          {intervalStatus.errorText}
                        </span>
                      </div>
                    ) : (
                      visualCalendarProgressPercent !== null && (
                        <div className="pt-2 border-t border-gray-50 mt-1 space-y-1">
                          <div className="flex justify-between items-center text-[10px] text-gray-400">
                            <span className="font-bold uppercase tracking-widest">Календарный прогресс</span>
                            <span className="font-bold text-gray-700">{visualCalendarProgressPercent}%</span>
                          </div>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${currentColors.fill}`}
                              style={{ width: `${visualCalendarProgressPercent}%` }}
                            />
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {timelineProjects.length === 0 ? (
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center py-8">Нет проектов для отображения на шкале за {selectedYear}</p>
            ) : visibleTimelineProjects.length === 0 ? (
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center py-8">Нет проектов для отображения с учетом выбранных стадий</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <h3 className="text-base font-black text-[#011] uppercase tracking-widest flex items-center gap-3">
              <LucideMap className="text-[#F8BC03]" size={24} /> Дорожная карта {selectedYear}: Портфель проектов
            </h3>
            {activeStages.length > 0 && (
              <div className="flex flex-wrap gap-2.5">
                {activeStages.map(stage => {
                  const colors = getRoadmapStageStyle(stage);
                  const isHidden = hiddenStages.has(stage);
                  const count = stageCounts.get(stage) || 0;
                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => toggleStageVisibility(stage)}
                      aria-pressed={!isHidden}
                      className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all cursor-pointer text-[10px] uppercase font-bold tracking-tight interactive-button ${
                        isHidden
                          ? 'opacity-40 bg-gray-50 border-gray-100 text-gray-400 line-through'
                          : 'bg-white border-gray-200 text-gray-700 shadow-sm hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${isHidden ? 'bg-gray-300' : colors.fill} shadow-sm`} />
                      <span>
                        {stage} · {count}
                      </span>
                    </button>
                  );
                })}
                {hiddenStages.size > 0 && (
                  <button
                    onClick={() => setHiddenStages(new Set())}
                    className="px-2.5 py-1 text-[10px] font-bold text-amber-600 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    Показать все
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sticky months header inside roadmap card */}
          <div
            className="sticky z-40 bg-white border-b border-gray-100"
            style={{ top: `${headerHeight}px` }}
          >
            <div
              ref={headerRef}
              className="overflow-x-auto scrollbar-none"
              style={{
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
              }}
            >
              <style>{`
                .scrollbar-none::-webkit-scrollbar {
                  display: none;
                }
              `}</style>
              <div className="min-w-[1400px] relative pt-3 pb-3">
                <div className="relative h-6 mb-2">
                  {assessmentPositionPercent !== null && (
                    <div
                      className="absolute pointer-events-none z-20 flex flex-col items-center"
                      style={{
                        left: `calc(280px + (100% - 280px) * ${assessmentPositionPercent / 100})`,
                        transform: 'translateX(-50%)'
                      }}
                    >
                      <div className="bg-[#F8BC03] text-black text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-sm whitespace-nowrap">
                        Текущая дата: {formatDateSafe(finalAssessmentDate)}{assessmentLabelSuffix}
                      </div>
                    </div>
                  )}
                </div>

                {/* Quarter Header breakdown */}
                <div className="grid grid-cols-[280px_1fr] gap-0 mb-1.5 border-b border-gray-100/70 pb-1 flex items-center">
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-2">Кварталы {selectedYear}</div>
                  <div className="grid grid-cols-4 w-full text-center">
                    {['Квартал I (Q1)', 'Квартал II (Q2)', 'Квартал III (Q3)', 'Квартал IV (Q4)'].map((q) => (
                      <div key={q} className="text-[10px] font-black text-slate-500 uppercase tracking-wider py-0.5 border-l border-slate-100 first:border-l-0">
                        {q}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-[280px_1fr] gap-0">
                  <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest pl-2">Проекты</div>
                  <div className="grid grid-cols-12 w-full">
                    {months.map(m => (
                      <div key={m} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">{m}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scrolling Projects Grid */}
          <div ref={bodyRef} className="overflow-x-auto pb-4 custom-scrollbar">
            <div className="min-w-[1400px] relative pt-2">
              {/* Background grid for Quarters */}
              <div className="absolute inset-y-0 left-[280px] right-0 pointer-events-none grid grid-cols-4 z-0">
                <div className="border-r border-slate-100/50" />
                <div className="border-r border-slate-100/50" />
                <div className="border-r border-slate-100/50" />
                <div className="h-full" />
              </div>

              {/* Vertical assessment date line - starting below the sticky header */}
              {assessmentPositionPercent !== null && (
                <div 
                  className="absolute top-0 bottom-0 pointer-events-none z-20 flex flex-col items-center"
                  style={{
                    left: `calc(280px + (100% - 280px) * ${assessmentPositionPercent / 100})`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div className="w-0 border-l border-dashed border-[#F8BC03]/40 h-full shadow-sm" />
                </div>
              )}

              <div className="space-y-6">
                {visibleTimelineProjects.map(p => {
                  const currentStageStr = normalizeProjectStage(p.stage, p.status);
                  const currentColors = getRoadmapStageStyle(currentStageStr);

                  const startParsed = parseDateSafe(p.startDate);
                  const endParsed = parseDateSafe(p.deadlineAt || p.endDate);

                  let periodString = "";
                  if (!startParsed && !endParsed) {
                    periodString = "Период не указан";
                  } else {
                    const startFmt = startParsed ? formatDateSafe(p.startDate) : "Начало не указано";
                    const endFmt = endParsed ? formatDateSafe(p.deadlineAt || p.endDate) : "Завершение не указано";
                    periodString = `${startFmt} - ${endFmt}`;
                  }

                  const intervalStatus = getProjectCalendarIntervalStatus(p);

                  const calendarProgressPercent = (() => {
                    if (!intervalStatus.isValid) return null;
                    const s = parseDateSafe(p.startDate || p.createdAt);
                    const e = parseDateSafe(p.deadlineAt || p.endDate);
                    const a = parseDateSafe(finalAssessmentDate);

                    if (!s || !e || !a) return null;

                    const sTime = s.getTime();
                    const eTime = e.getTime();
                    const aTime = a.getTime();

                    if (Number.isNaN(sTime) || Number.isNaN(eTime) || Number.isNaN(aTime)) {
                      return null;
                    }

                    if (eTime <= sTime) {
                      return aTime >= eTime ? 100 : 0;
                    }

                    if (aTime < sTime) return 0;
                    if (aTime > eTime) return 100;

                    const progress = ((aTime - sTime) / (eTime - sTime)) * 100;
                    return Math.min(100, Math.max(0, Math.round(progress)));
                  })();

                  // Retrieve visually cropped start & end bounds for the selected year
                  const { visualStart, visualEnd } = getVisualProjectBounds(p, selectedYear, finalAssessmentDate);

                  const startPct = getYearPercentageHelper(visualStart);
                  const endPct = getYearPercentageHelper(visualEnd);
                  const barWidth = Math.max(0.5, endPct - startPct);

                  const errorPct = (() => {
                    let pStart = parseRussianDate(p.startDate) || parseDateSafe(p.startDate);
                    let pEnd = parseRussianDate(p.deadlineAt || p.endDate) || parseDateSafe(p.deadlineAt || p.endDate);
                    if (pStart && !Number.isNaN(pStart.getTime()) && pStart.getFullYear() === selectedYear) {
                      return getYearPercentageHelper(pStart);
                    }
                    if (pEnd && !Number.isNaN(pEnd.getTime()) && pEnd.getFullYear() === selectedYear) {
                      return getYearPercentageHelper(pEnd);
                    }
                    return 0;
                  })();

                  const assessmentPct = getYearPercentageHelper(parsedAssess || new Date());
                  const visualProgressInBar = (() => {
                    if (assessmentPct < startPct) return 0;
                    if (assessmentPct > endPct) return 100;
                    if (barWidth <= 0) return 0;
                    return Math.min(100, Math.max(0, ((assessmentPct - startPct) / barWidth) * 100));
                  })();

                  const assessmentFormatted = formatDateSafe(finalAssessmentDate);
                  const visualCalendarProgressPercent = intervalStatus.isValid
                    ? getVisualCalendarProgressPercent(visualStart, visualEnd, finalAssessmentDate, p)
                    : null;

                  const progressValueText = visualCalendarProgressPercent !== null ? `${visualCalendarProgressPercent}%` : "Не указано";

                  const remainingCalendarPercent = visualCalendarProgressPercent !== null 
                    ? 100 - visualCalendarProgressPercent 
                    : null;
                  const remainingValueText = remainingCalendarPercent !== null ? `${remainingCalendarPercent}%` : "Не указано";

                  const projectStatusLabel = (() => {
                    const statusVal = p.status;
                    if (statusVal === 'active') return 'В работе';
                    if (statusVal === 'waiting') return 'Ожидание';
                    if (statusVal === 'completed') return 'Завершено';
                    if (statusVal === 'cancelled') return 'Остановлен';
                    if (statusVal === 'overdue') return 'Просрочен';
                    if (statusVal === 'at_risk') return 'Риск';
                    return 'Неизвестно';
                  })();

                  const evaluation = getEvaluationByProjectId(projectEvaluations, p.projectId);
                  const projectRiskLabel = getRegistryRiskView(p, evaluation, finalAssessmentDate);

                  const visualStartFormatted = visualStart.toLocaleDateString("ru-RU");
                  const visualEndFormatted = visualEnd.toLocaleDateString("ru-RU");
                  const visualPeriodText = intervalStatus.isValid ? `${visualStartFormatted} - ${visualEndFormatted}` : "Не определен";

                  const fullProjectProgressText = calendarProgressPercent !== null ? `${calendarProgressPercent}%` : "Не указано";
                  
                  const tooltipText = intervalStatus.isValid
                    ? `Проект: ${p.projectName}\nВыбранный год: ${selectedYear}\nПолный период: ${periodString}\nПериод на дорожной карте: ${visualPeriodText}\nСтадия: ${currentStageStr}\nКалендарный прогресс: ${progressValueText}\nОсталось календарного срока: ${remainingValueText}\nКалендарный прогресс проекта целиком: ${fullProjectProgressText}\nДата оценки: ${assessmentFormatted}\nСтатус проекта: ${projectStatusLabel}\nУровень риска: ${projectRiskLabel}`
                    : `Проект: ${p.projectName}\nВыбранный год: ${selectedYear}\nПолный период: ${periodString}\nСтатус интервала: ${intervalStatus.errorText}\nСтадия: ${currentStageStr}\nДата оценки: ${assessmentFormatted}\nСтатус проекта: ${projectStatusLabel}\nУровень риска: ${projectRiskLabel}`;

                  const errorBgClass = intervalStatus.error === 'date_error' 
                    ? 'bg-red-50 text-red-700 border-red-200' 
                    : 'bg-slate-50 text-slate-500 border-slate-200';

                  return (
                    <div key={p.projectId} className="grid grid-cols-[280px_1fr] gap-0 items-center group relative z-10 hover:bg-gray-50/50 p-1.5 rounded-xl transition-colors">
                      <div className="pr-6 pl-2 border-r border-gray-50 h-full flex flex-col justify-center min-w-0">
                        <p className="text-xs font-black text-[#011] truncate tracking-tight group-hover:text-[#F8BC03] transition-colors">{p.projectName}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter truncate flex items-center gap-1.5 leading-none">
                          <span>{periodString}</span>
                        </p>
                      </div>
                      <div 
                        className="relative h-10 flex items-center pr-2"
                        title={tooltipText}
                      >
                        {!intervalStatus.isValid ? (
                          <div 
                            className="absolute inset-y-0 flex items-center"
                            style={{
                              left: `${errorPct}%`,
                              width: 'auto'
                            }}
                          >
                            <div 
                              className={`relative h-8 px-3 rounded-lg border shadow-sm flex items-center gap-1.5 font-black uppercase tracking-widest text-[9px] ${errorBgClass}`}
                            >
                              <span className="shrink-0">
                                {intervalStatus.errorText}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="absolute inset-y-0 flex items-center"
                            style={{
                              left: `${startPct}%`,
                              width: `${barWidth}%`
                            }}
                          >
                            <div 
                              className={`relative h-8 w-full rounded-lg border border-white/70 shadow-sm flex items-center overflow-hidden ${currentColors.base}`}
                            >
                              {visualProgressInBar > 0 && (
                                <div 
                                  className={`absolute left-0 top-0 h-full transition-all duration-500 ${currentColors.fill}`}
                                  style={{ width: `${visualProgressInBar}%` }}
                                />
                              )}
                              <div className="relative z-10 w-full flex items-center justify-between px-2 gap-2 text-[9px] font-black uppercase tracking-widest pointer-events-none truncate">
                                <span className={`truncate px-2 py-0.5 rounded-md ${currentColors.pill}`}>
                                  {currentStageStr}
                                </span>
                                {visualCalendarProgressPercent !== null ? (
                                  <span className={`shrink-0 px-2 py-0.5 rounded-md ${currentColors.pill}`}>
                                    Пройдено {visualCalendarProgressPercent}%
                                  </span>
                                ) : (
                                  <span className={`shrink-0 px-2 py-0.5 rounded-md ${currentColors.pill}`}>
                                    Период не указан
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {timelineProjects.length === 0 ? (
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center py-8">Нет проектов для отображения на шкале за {selectedYear}</p>
                ) : visibleTimelineProjects.length === 0 ? (
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center py-8">Нет проектов для отображения с учетом выбранных стадий</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Footer Info */}
      <div className="bg-[#010101] rounded-2xl p-5 sm:p-10 border border-[#010101] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 text-white">
          <LucideMap size={120} />
        </div>
        <div className="relative z-10 max-w-2xl">
          <h3 className="text-lg sm:text-xl font-black text-[#F8BC03] uppercase tracking-[0.2em] mb-4">
            Контроль дедлайнов
          </h3>
          <p className="text-xs sm:text-sm text-gray-400 font-medium leading-relaxed">
            Визуализация портфеля в разрезе времени. Система автоматически рассчитывает пересечения и пиковые нагрузки на команду.
          </p>
        </div>
      </div>
    </div>
  );
};
