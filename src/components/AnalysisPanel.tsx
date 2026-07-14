import React from 'react';
import {
  Sparkles,
  AlertCircle,
  AlertTriangle,
  ListChecks,
  Cpu,
  User,
  Clock,
  Layers,
  Database,
  Calendar,
  Milestone,
  TrendingUp,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { ProjectAnalysisResult } from '../types';

interface AnalysisPanelProps {
  analysis: ProjectAnalysisResult;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis }) => {
  // Check if the analysis contains the expected structure
  const isNewFormat = !!(
    analysis.summary &&
    'mainRiskSource' in analysis.summary &&
    analysis.keyProblems &&
    analysis.keyProblems.every((prob: any) => 'evidence' in prob) &&
    analysis.priorityActions &&
    analysis.priorityActions.every((act: any) => 'linkedProblem' in act) &&
    analysis.directionAnalysis &&
    typeof (analysis.directionAnalysis as any).data === 'object' &&
    analysis.aiProposal &&
    'projectUseCases' in analysis.aiProposal
  );

  if (!isNewFormat) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center space-y-3 font-sans">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 text-amber-700 mx-auto">
          <AlertTriangle size={20} />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-sm text-amber-900 uppercase tracking-wider">
            Анализ был создан в старом формате
          </h3>
          <p className="text-xs text-amber-800">
            Запустите анализ повторно для обновления структуры.
          </p>
        </div>
      </div>
    );
  }

  const { summary, keyProblems = [], priorityActions = [], directionAnalysis, aiProposal } = analysis;

  // Unified Status Colors (No high-contrast/extreme designs)
  const statusConfig = {
    green: {
      textColor: 'text-emerald-700 bg-emerald-50 border-emerald-100',
      labelText: 'В рамках нормы',
      icon: <CheckCircle2 className="text-emerald-600 shrink-0" size={14} />
    },
    yellow: {
      textColor: 'text-amber-700 bg-amber-50 border-amber-100',
      labelText: 'Под наблюдением',
      icon: <AlertTriangle className="text-amber-600 shrink-0" size={14} />
    },
    red: {
      textColor: 'text-rose-700 bg-rose-50 border-rose-100',
      labelText: 'Критический риск',
      icon: <AlertCircle className="text-rose-600 shrink-0" size={14} />
    },
    gray: {
      textColor: 'text-gray-600 bg-gray-50 border-gray-100',
      labelText: 'Недостаточно данных',
      icon: <HelpCircle className="text-gray-500 shrink-0" size={14} />
    }
  };

  const statusKey = summary?.status || 'gray';
  const statusObj = statusConfig[statusKey] || statusConfig.gray;

  // Severity labels for key problems
  const getSeverityBadge = (sev: string) => {
    const s = String(sev).toLowerCase().trim();
    if (s === 'critical' || s === 'критическая') {
      return {
        label: 'Критическая',
        color: 'text-rose-700 bg-rose-50 border-rose-100',
      };
    }
    if (s === 'high' || s === 'высокая') {
      return {
        label: 'Высокая',
        color: 'text-orange-700 bg-orange-50 border-orange-100',
      };
    }
    if (s === 'medium' || s === 'средняя') {
      return {
        label: 'Средняя',
        color: 'text-amber-700 bg-amber-50 border-amber-100',
      };
    }
    return {
      label: 'Низкая',
      color: 'text-blue-700 bg-blue-50 border-blue-100',
    };
  };

  return (
    <div className="space-y-8 font-sans">
      
      {/* 1. Блок: Краткий вывод */}
      {summary && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500 shrink-0" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
              Краткий вывод
            </h3>
          </div>
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100/50 pb-3">
              <h4 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight leading-snug">
                {summary?.title}
              </h4>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusObj.textColor}`}>
                {statusObj.icon}
                {statusObj.labelText}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-normal">
              {summary?.text}
            </p>

            {(summary?.mainRiskSource || summary?.goalImpact) && (
              <div className="pt-3 border-t border-gray-100/50 space-y-2 text-[11px] sm:text-xs">
                {summary.mainRiskSource && (
                  <div className="flex flex-wrap items-baseline gap-1.5 leading-relaxed">
                    <span className="font-bold text-gray-700 uppercase text-[9px] tracking-wider shrink-0 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
                      Главный источник риска:
                    </span>
                    <span className="text-gray-800 font-medium">{summary.mainRiskSource}</span>
                  </div>
                )}
                {summary.goalImpact && (
                  <div className="flex flex-wrap items-baseline gap-1.5 leading-relaxed">
                    <span className="font-bold text-gray-700 uppercase text-[9px] tracking-wider shrink-0 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
                      Влияние на цели проекта:
                    </span>
                    <span className="text-gray-800 font-medium">{summary.goalImpact}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Блок: Ключевые проблемы */}
      {keyProblems && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-500 shrink-0" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
              Ключевые проблемы
            </h3>
          </div>
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
            {keyProblems.length === 0 ? (
              <p className="text-xs sm:text-sm text-gray-500 italic">
                Ключевые проблемы по переданным данным не выявлены.
              </p>
            ) : (
              <div className="divide-y divide-gray-100 space-y-4">
                {keyProblems.slice(0, 5).map((prob, i) => {
                  const badge = getSeverityBadge(prob.severity);
                  const hasEvidence = prob.evidence && prob.evidence.length > 0;
                  return (
                    <div key={i} className="pt-4 first:pt-0 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Категория: {prob.category}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm font-bold text-gray-900 leading-snug">
                        {prob.problem}
                      </p>
                      {hasEvidence && (
                        <div className="text-[11px] sm:text-xs text-gray-650 space-y-1 bg-gray-50/50 p-3 rounded-2xl border border-gray-100/40">
                          <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400 block mb-1">
                            Основания:
                          </span>
                          <ul className="list-disc list-inside space-y-1 pl-1">
                            {prob.evidence.map((ev, evIdx) => (
                              <li key={evIdx} className="text-gray-600 font-medium leading-relaxed">
                                {ev}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="text-xs sm:text-sm text-gray-600 leading-relaxed pl-1.5 border-l-2 border-gray-200">
                        <span className="font-bold text-gray-700 block text-[10px] uppercase tracking-wider mb-0.5">Управленческая оценка:</span>
                        {prob.managementAssessment}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Блок: Приоритетные действия */}
      {priorityActions && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-emerald-500 shrink-0" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
              Приоритетные действия
            </h3>
          </div>
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
            {priorityActions.length === 0 ? (
              <p className="text-xs sm:text-sm text-gray-500 italic">
                Приоритетные действия не сформированы.
              </p>
            ) : (
              <div className="space-y-4 divide-y divide-gray-100">
                {priorityActions.slice(0, 5).map((act, i) => (
                  <div key={i} className="pt-4 first:pt-0 flex gap-3.5 items-start">
                    <div className="h-6 w-6 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 border border-emerald-100 shadow-xs">
                      {act.priority || (i + 1)}
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-xs sm:text-sm font-bold text-gray-900 leading-relaxed">
                        {act.action}
                      </p>
                      <div className="space-y-1.5 text-[11px] sm:text-xs text-gray-600 leading-relaxed">
                        <p>
                          <span className="font-semibold text-gray-500">Связанная проблема:</span> {act.linkedProblem}
                        </p>
                        <p>
                          <span className="font-semibold text-gray-500">Ожидаемый результат:</span> {act.expectedResult}
                        </p>
                      </div>
                      {(act.owner || act.deadlineHint) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[10px] uppercase font-bold tracking-wider text-gray-400">
                          {act.owner && (
                            <span className="flex items-center gap-1">
                              <User size={11} className="text-emerald-500 shrink-0" /> Кому: {act.owner}
                            </span>
                          )}
                          {act.deadlineHint && (
                            <span className="flex items-center gap-1">
                              <Clock size={11} className="text-emerald-500 shrink-0" /> Срок: {act.deadlineHint}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Блок: Разбор по направлениям */}
      {directionAnalysis && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-blue-500 shrink-0" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
              Разбор по направлениям
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 4.1 Данные */}
            <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Database size={13} className="text-indigo-500 shrink-0" /> Данные
                </h4>
                <p className="text-xs sm:text-sm text-gray-600 font-medium leading-relaxed">
                  {directionAnalysis?.data?.summary || 'Информации о полноте карточки проекта в анализе не содержится.'}
                </p>
              </div>
              {directionAnalysis?.data?.evidence && directionAnalysis.data.evidence.length > 0 && (
                <div className="text-[11px] sm:text-xs text-gray-500 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100/40">
                  <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400 block mb-1">Основания:</span>
                  <ul className="list-disc list-inside space-y-0.5">
                    {directionAnalysis.data.evidence.map((ev, evIdx) => (
                      <li key={evIdx} className="text-gray-550 font-medium leading-relaxed">{ev}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 4.2 ПК */}
            <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={13} className="text-orange-500 shrink-0" /> ПК
                </h4>
                <p className="text-xs sm:text-sm text-gray-600 font-medium leading-relaxed">
                  {directionAnalysis?.pc?.summary || 'Отсутствует детальный комментарий по периодичности мониторинга ПК.'}
                </p>
              </div>
              {directionAnalysis?.pc?.evidence && directionAnalysis.pc.evidence.length > 0 && (
                <div className="text-[11px] sm:text-xs text-gray-500 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100/40">
                  <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400 block mb-1">Основания:</span>
                  <ul className="list-disc list-inside space-y-0.5">
                    {directionAnalysis.pc.evidence.map((ev, evIdx) => (
                      <li key={evIdx} className="text-gray-550 font-medium leading-relaxed">{ev}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 4.3 Вехи */}
            <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Milestone size={13} className="text-blue-500 shrink-0" /> Вехи
                </h4>
                <p className="text-xs sm:text-sm text-gray-600 font-medium leading-relaxed">
                  {directionAnalysis?.milestones?.summary || 'Нет достаточных данных о достигнутых весах и вехах.'}
                </p>
              </div>
              {directionAnalysis?.milestones?.evidence && directionAnalysis.milestones.evidence.length > 0 && (
                <div className="text-[11px] sm:text-xs text-gray-500 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100/40">
                  <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400 block mb-1">Основания:</span>
                  <ul className="list-disc list-inside space-y-0.5">
                    {directionAnalysis.milestones.evidence.map((ev, evIdx) => (
                      <li key={evIdx} className="text-gray-550 font-medium leading-relaxed">{ev}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 4.4 Показатели */}
            <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-emerald-500 shrink-0" /> Показатели
                </h4>
                <p className="text-xs sm:text-sm text-gray-600 font-medium leading-relaxed">
                  {directionAnalysis?.indicators?.summary || 'Отчет не описывает динамику плановых и фактических параметров.'}
                </p>
              </div>
              {directionAnalysis?.indicators?.evidence && directionAnalysis.indicators.evidence.length > 0 && (
                <div className="text-[11px] sm:text-xs text-gray-500 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100/40">
                  <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400 block mb-1">Основания:</span>
                  <ul className="list-disc list-inside space-y-0.5">
                    {directionAnalysis.indicators.evidence.map((ev, evIdx) => (
                      <li key={evIdx} className="text-gray-550 font-medium leading-relaxed">{ev}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Блок: Потенциал применения ИИ в проекте */}
      {aiProposal && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-violet-500 shrink-0" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
              Потенциал применения ИИ в проекте
            </h3>
          </div>
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="space-y-2 pb-3 border-b border-gray-100/50">
              <h4 className="text-sm sm:text-base font-bold text-gray-900">
                {aiProposal?.title}
              </h4>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-normal">
                {aiProposal?.text}
              </p>
            </div>

            {aiProposal?.limitations && (
              <div className="flex items-start gap-2 bg-rose-50/50 border border-rose-100/60 rounded-2xl p-3 text-xs text-rose-800 leading-relaxed">
                <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                <div className="font-medium">
                  <span className="font-bold text-rose-900">Ограничение анализа:</span> {aiProposal.limitations}
                </div>
              </div>
            )}

            {aiProposal?.projectUseCases && aiProposal.projectUseCases.length > 0 && (
              <div className="space-y-3 pt-1">
                <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400">
                  Практические предметные сценарии:
                </span>
                <ul className="space-y-1.5 pl-1.5 text-xs sm:text-sm text-gray-600 leading-relaxed">
                  {aiProposal.projectUseCases.slice(0, 5).map((uc, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-600">
                      <span className="text-emerald-500 select-none mt-0.5">•</span>
                      <span className="font-medium">{uc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
