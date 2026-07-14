import React from 'react';
import { Database, CheckCircle, AlertTriangle, XCircle, Calendar, AlertOctagon } from 'lucide-react';
import { ImportValidationReport } from '../types';
import { formatDateSafe } from '../utils/dateUtils';

interface DataSourceStatusProps {
  importReport: ImportValidationReport | null | undefined;
  assessmentDate: string;
  onDateChange?: (date: string) => void;
}

export const DataSourceStatus: React.FC<DataSourceStatusProps> = ({
  importReport,
  assessmentDate,
  onDateChange
}) => {
  if (!importReport) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm flex items-center justify-center min-h-[160px]">
        <div className="text-center text-zinc-500 dark:text-zinc-400">
          <Database className="w-8 h-8 animate-pulse mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
          <p className="text-sm font-medium">Загрузка информации об источнике данных...</p>
        </div>
      </div>
    );
  }

  const {
    structureStatus,
    rowCount,
    projectCount,
    errorsCount,
    warningsCount,
    detectedYears,
  } = importReport;

  // Visual tones depending on standard structure status matching contract
  let statusColor = "text-emerald-500 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50";
  let statusText = "Структура колонок соответствует спецификации Excel / Sheets";
  let StatusIcon = CheckCircle;

  if (structureStatus === "error") {
    statusColor = "text-rose-500 bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/50";
    statusText = "Нарушена структура колонок! Критические несовпадения в контракте";
    StatusIcon = XCircle;
  } else if (structureStatus === "warning") {
    statusColor = "text-amber-500 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50";
    statusText = "Есть отклонения в структуре колонок (не все необязательные поля найдены)";
    StatusIcon = AlertTriangle;
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all">
      {/* Left side: status visual */}
      <div className="flex items-start gap-4 flex-1">
        <div className={`p-3 rounded-xl border flex items-center justify-center shrink-0 ${statusColor}`}>
          <StatusIcon className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            Регламентный контракт Google Sheets
            <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
              (строк: {rowCount})
            </span>
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
            {statusText}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 dark:text-zinc-500 pt-1">
            <span className="flex items-center gap-1">
              • Импортировано проектов: <strong className="text-zinc-700 dark:text-zinc-300">{projectCount}</strong>
            </span>
            <span className="flex items-center gap-1">
              • Периоды планирования: <strong className="text-zinc-700 dark:text-zinc-300">{detectedYears?.join(', ') || '-'} гг.</strong>
            </span>
            {errorsCount > 0 && (
              <span className="flex items-center gap-1 text-rose-500 font-medium">
                • {errorsCount} ошибок заполнения
              </span>
            )}
            {warningsCount > 0 && (
              <span className="flex items-center gap-1 text-amber-500 font-medium">
                • {warningsCount} предупреждений
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right side: Assessment Date Picker control */}
      <div className="border-t md:border-t-0 md:border-l border-zinc-200 dark:border-zinc-850 pt-4 md:pt-0 md:pl-6 shrink-0 flex flex-col sm:flex-row md:flex-col gap-3 min-w-[240px]">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            Выбрать контрольную дату (оценка)
          </label>
          <input
            type="date"
            id="assessment-date-input"
            value={assessmentDate}
            onChange={(e) => onDateChange && onDateChange(e.target.value)}
            className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent cursor-pointer dark:color-scheme-dark"
          />
        </div>
      </div>
    </div>
  );
};
