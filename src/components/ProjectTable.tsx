import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, FilterX, AlertTriangle, Clock, ArrowUpDown, ChevronUp, ChevronDown, User, ExternalLink, Activity, Info, BarChart, CheckCircle2, SlidersHorizontal, X } from 'lucide-react';
import { Project, ProjectEvaluation } from '../types';
import { formatDateSafe, normalizeDateValue, parseDateSafe } from '../utils/dateUtils';
import { 
  sanitizeAndParseFloat
} from '../utils/projectCalculations';
import { 
  formatPercent, 
  formatNullable, 
  formatStatusLabel, 
  getStatusTone,
  getEvaluationByProjectId,
  getProjectStatusTooltipData as getLegacyProjectStatusTooltipData
} from '../utils/evaluationUtils';
import {
  getRegistryPcStatusView,
  getRegistryRiskView,
  getRegistryProjectStatusView,
  getPcStatusTooltipData,
  getRiskTooltipData,
  getProjectStatusTooltipData as getUnifiedProjectStatusTooltipData
} from '../utils/projectRegistryStatus';
import {
  getRegistryMonitoringStatus,
  getRegistryDataQuality,
  getRegistryRiskReasons,
  getCurrentQuarterMilestoneProgress,
  getCurrentQuarterKpiProgress,
  getCurrentQuarterMilestoneMetrics,
  getCurrentQuarterKpiMetrics
} from '../utils/projectRegistryMetrics';
import { getStageBadgeClass, getStageLabel, normalizeProjectStage } from '../utils/projectStageStyles';
import { getNormalizedStageForFiltering } from '../utils/projectTableFilters';
import { isProjectDeadlineOverdue } from '../utils/projectTableDateStatus';
import { getProjectDateSortValue, compareNullableDates } from '../utils/projectTableSorting';

const getDaysPlural = (days: number): string => {
  const lastDigit = days % 10;
  const lastTwo = days % 100;
  if (lastTwo >= 11 && lastTwo <= 19) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
};

interface TriadProgressMetrics {
  plan: number;
  fact: number;
  deviation: number;
  hasData: boolean;
  planContributionPercent?: number;
  factContributionPercent?: number;
}

const getDeviationText = (metrics: TriadProgressMetrics): string => {
  const planRounded = Math.round(metrics.plan);
  const factRounded = Math.round(metrics.fact);
  const devRounded = Math.round(metrics.deviation);
  
  if (factRounded > planRounded && planRounded > 0) {
    return `План превышен на ${factRounded - planRounded}%`;
  } else if (factRounded === planRounded && planRounded > 0) {
    return "План выполнен";
  } else if (devRounded < 0) {
    return `Осталось до плана: ${Math.abs(devRounded)}%`;
  } else {
    return "План выполнен";
  }
};

const renderProgressCell = (metrics: TriadProgressMetrics, type: 'milestone' | 'indicator') => {
  if (!metrics.hasData) {
    return <span className="text-xs text-gray-400 italic font-medium font-sans">Нет данных для расчета</span>;
  }

  let tooltipText = type === 'milestone'
    ? "Выполнение за текущий квартал на дату просмотра. Факт по вехам считается с учетом веса каждой вехи и процента ее выполнения."
    : "Выполнение за текущий квартал на дату просмотра. Факт по показателям считается как средний процент достижения по показателям, где заполнены план и факт. Прямое суммирование не используется, так как показатели могут иметь разные единицы измерения.";

  if (type === 'milestone' && metrics.planContributionPercent !== undefined && metrics.factContributionPercent !== undefined) {
    tooltipText += ` Вес вех периода в проекте: ${metrics.planContributionPercent.toFixed(1)}%. Выполненный вклад: ${metrics.factContributionPercent.toFixed(1)}%.`;
  }

  const devRounded = Math.round(metrics.deviation);
  const devColor = devRounded < 0 
    ? "text-slate-500 font-semibold font-sans" 
    : devRounded > 0 
       ? "text-sky-700 font-bold font-sans" 
       : "text-slate-700 font-bold font-sans";

  return (
    <div 
      className="flex flex-col gap-1 text-[11px] font-sans leading-relaxed p-2 bg-gray-50/50 rounded-xl border border-gray-100 min-w-[140px] whitespace-normal break-words cursor-help text-left" 
      title={tooltipText}
    >
      <div className="flex justify-between items-center gap-2">
        <span className="text-gray-400 font-semibold uppercase text-[8px] tracking-wider">План:</span>
        <span className="text-gray-700 font-bold">{Math.round(metrics.plan)}%</span>
      </div>
      <div className="flex justify-between items-center gap-2">
        <span className="text-gray-400 font-semibold uppercase text-[8px] tracking-wider">Факт:</span>
        <span className="text-gray-900 font-black">{Math.round(metrics.fact)}%</span>
      </div>
      <div className="flex flex-col gap-0.5 border-t border-gray-200/50 pt-1 mt-0.5">
        <span className="text-gray-400 font-semibold uppercase text-[8px] tracking-wider">Отклонение:</span>
        <span className={`leading-snug text-[10px] ${devColor}`}>
          {getDeviationText(metrics)}
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1.5 border border-gray-300/20">
        <div 
          className={`h-full rounded-full transition-all duration-300 ${metrics.fact >= (metrics.plan > 0 ? metrics.plan : 100) ? "bg-slate-600" : "bg-sky-500"}`} 
          style={{ width: `${Math.min(100, Math.max(0, metrics.plan > 0 ? (metrics.fact / metrics.plan) * 100 : metrics.fact))}%` }}
        ></div>
      </div>
    </div>
  );
};

interface ProjectTableProps {
  projects: Project[];
  filteredProjects: Project[];
  filters: any;
  setFilters: (f: any) => void;
  resetFilters: () => void;
  onSelectProject: (id: string) => void;
  projectEvaluations?: ProjectEvaluation[] | null;
  assessmentDate?: string;
}

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
};

// Beautiful custom Multi-select dropdown with search, click-outside behavior and checkboxes
const MultiSelectDropdown: React.FC<{
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (vals: string[]) => void;
  placeholder: string;
}> = ({ label, options, selectedValues, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (opt: string) => {
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter(v => v !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };

  const filteredOptions = useMemo(() => {
    return options.filter(opt => 
      opt.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [options, searchQuery]);

  return (
    <div className="flex flex-col gap-1 relative font-sans" ref={containerRef}>
      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">{label}</span>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setSearchQuery('');
        }}
        className={`px-3 py-3 text-sm md:text-xs font-semibold bg-white border rounded-xl shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 min-h-[44px] flex items-center justify-between text-left cursor-pointer transition-colors ${
          selectedValues.length > 0 ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200'
        }`}
      >
        <span className="truncate max-w-[155px]">
          {selectedValues.length === 0 
            ? placeholder 
            : `${selectedValues.join(', ')}`}
        </span>
        <div className="flex items-center gap-1">
          {selectedValues.length > 0 && (
            <span className="bg-blue-600 text-white rounded-full px-1.5 py-0.5 text-[9px] font-black shrink-0">
              {selectedValues.length}
            </span>
          )}
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
        </div>
      </button>
      
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-16 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-hidden p-2 flex flex-col gap-1.5 min-w-[200px]">
          <div className="relative px-1 pt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
            <input
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          
          <div className="overflow-y-auto max-h-48 space-y-0.5 px-1">
            {filteredOptions.map((opt) => {
              const isChecked = selectedValues.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 px-2 py-1.5 group hover:bg-gray-50 rounded-lg cursor-pointer text-xs font-semibold select-none">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleOption(opt)}
                    className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300 cursor-pointer"
                  />
                  <span className={`truncate group-hover:text-blue-600 ${isChecked ? 'text-blue-600 font-bold' : 'text-gray-700'}`}>{opt}</span>
                </label>
              );
            })}
          </div>
          {filteredOptions.length === 0 && (
            <div className="text-xs text-gray-400 py-3 text-center">Ничего не найдено</div>
          )}
        </div>
      )}
    </div>
  );
};

const ProjectStatusCell: React.FC<{ 
  project: Project; 
  evaluation?: ProjectEvaluation | null;
  assessmentDate?: string;
  isUltraCompact?: boolean; 
  isCompact?: boolean; 
}> = ({ project, evaluation, assessmentDate, isUltraCompact, isCompact }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const assessDate = assessmentDate || new Date().toISOString().split('T')[0];
  const tooltipId = useMemo(() => `project-status-tooltip-${project.id || project.projectId}`, [project.id, project.projectId]);

  useEffect(() => {
    const handleCloseAll = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.id !== tooltipId) {
        setIsOpen(false);
      }
    };
    window.addEventListener('close-all-project-tooltips', handleCloseAll);
    return () => {
      window.removeEventListener('close-all-project-tooltips', handleCloseAll);
    };
  }, [tooltipId]);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const openTooltip = () => {
    clearCloseTimeout();
    setIsOpen(true);
    window.dispatchEvent(new CustomEvent('close-all-project-tooltips', { detail: { id: tooltipId } }));
  };

  const startCloseTimeout = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 850);
  };

  const handleMouseEnter = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches) {
      openTooltip();
    }
  };

  const handleMouseLeave = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches) {
      startCloseTimeout();
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      clearCloseTimeout();
      setIsOpen(false);
    } else {
      openTooltip();
    }
  };

  const calculatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const tooltipWidth = Math.min(420, Math.max(310, window.innerWidth - 24));
    
    let left = rect.right - tooltipWidth;
    if (left < 12) left = 12;
    if (left + tooltipWidth > window.innerWidth - 12) {
      left = window.innerWidth - tooltipWidth - 12;
    }

    let top = rect.bottom + window.scrollY + 8;
    const isMobile = window.innerWidth < 640;
    const estimatedHeight = isMobile ? 320 : 380;
    if (rect.bottom + estimatedHeight > window.innerHeight && rect.top - estimatedHeight > 0) {
      top = rect.top + window.scrollY - estimatedHeight - 8;
    }
    
    setCoords({ top, left });
  };

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      const handleScrollResize = () => calculatePosition();
      window.addEventListener('scroll', handleScrollResize, { passive: true });
      window.addEventListener('resize', handleScrollResize);
      return () => {
        window.removeEventListener('scroll', handleScrollResize);
        window.removeEventListener('resize', handleScrollResize);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        const portalId = `project-status-tooltip-portal-${project.id || project.projectId}`;
        const portalEl = document.getElementById(portalId);
        if (portalEl && portalEl.contains(event.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearCloseTimeout();
    };
  }, [project.id, project.projectId]);

  const td = getUnifiedProjectStatusTooltipData(project, evaluation, assessDate);
  const risk = getRegistryRiskView(project, evaluation, assessDate);

  return (
    <div 
      ref={containerRef}
      className="relative flex flex-col gap-1 w-full max-w-[150px] font-sans min-w-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className={`${td.statusBadgeClass} inline-flex items-center gap-1 ${isUltraCompact ? 'text-[8.5px] px-1 py-0.5' : isCompact ? 'text-[9.5px] px-1.5 py-0.5' : 'text-[10.5px] px-1.5 py-0.5'} font-bold rounded w-max border min-w-0 break-words whitespace-normal`}>
        {td.status}
      </span>

      <button
        onClick={handleToggle}
        onMouseEnter={() => {
          clearCloseTimeout();
          calculatePosition();
          setIsOpen(true);
        }}
        type="button"
        className={`${isUltraCompact ? 'text-[8px]' : 'text-[9.5px]'} font-bold text-blue-600 hover:text-blue-800 transition-colors text-left w-max cursor-pointer decoration-dotted underline underline-offset-2 mt-0.5`}
      >
        Подробнее
      </button>

      {isOpen && coords && createPortal(
        <div 
          id={`project-status-tooltip-portal-${project.id || project.projectId}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ 
            position: 'absolute', 
            top: `${coords.top}px`, 
            left: `${coords.left}px`,
            zIndex: 99999
          }}
          className="w-[calc(100vw-24px)] sm:w-[380px] max-w-[420px] min-w-[300px] bg-white border border-gray-200 rounded-xl p-4 shadow-2xl text-left pointer-events-auto transition-all text-xs font-sans text-gray-800 leading-relaxed max-h-[460px] overflow-y-auto custom-scrollbar flex flex-col gap-1 whitespace-normal break-words [overflow-wrap:anywhere] min-w-0"
        >
          <div className="flex justify-between items-center mb-2 border-b border-gray-150 pb-1.5 shrink-0">
            <h4 className="font-bold text-gray-900 text-xs whitespace-normal break-words font-sans">
              {td.title}
            </h4>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              type="button"
              className="text-gray-400 hover:text-gray-650 p-1 bg-gray-50 hover:bg-gray-100 rounded-full focus:outline-none cursor-pointer inline-flex items-center justify-center shrink-0"
            >
              <X size={12} />
            </button>
          </div>
          
          <div className="space-y-3 overflow-y-auto flex-1 pr-1 min-w-0 font-sans">
            <div className="space-y-2.5">
              <div>
                <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider block font-sans">Статус:</span>
                <span className={`inline-block font-bold mt-0.5 px-1.5 py-0.5 rounded text-[10px] whitespace-normal break-words font-sans ${td.statusBadgeClass}`}>
                  {td.status}
                </span>
              </div>
            </div>

            <div className="text-[10.5px] text-gray-500 leading-normal border-t border-gray-100 pt-2.5 font-medium whitespace-normal break-words leading-relaxed [overflow-wrap:anywhere] font-sans">
              {td.explanation}
            </div>

            <div className="border-t border-gray-100 pt-2.5 bg-gray-50 p-2.5 rounded-lg text-[10px] text-gray-500 leading-normal whitespace-normal break-words min-w-0 shrink-0 font-sans">
              <span className="font-bold text-gray-700 block mb-1 font-sans">{td.methodologyTitle}:</span>
              <p className="font-sans font-medium mb-1.5 leading-relaxed">
                {td.methodologyDescription}
              </p>
              <ul className="list-disc list-inside space-y-0.5 pl-1 font-medium font-sans">
                {td.bullets.map((bullet, idx) => {
                  const parts = bullet.split(':');
                  const label = parts[0];
                  const text = parts.slice(1).join(':');
                  return (
                    <li key={idx}>
                      <span className={`font-bold font-sans ${
                        label.includes('Норма') ? 'text-emerald-700' :
                        label.includes('Зона риска') ? 'text-rose-700' :
                        'text-orange-700'
                      }`}>{label}</span>:{text}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const PcStatusCell: React.FC<{ 
  project: Project; 
  evaluation?: ProjectEvaluation | null;
  assessmentDate?: string;
  isUltraCompact?: boolean; 
  isCompact?: boolean;
}> = ({ project, evaluation, assessmentDate, isUltraCompact, isCompact }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const assessDate = assessmentDate || new Date().toISOString().split('T')[0];
  const hasPcConfig = project.monitoringStart || project.monitoringFrequencyWeeks || evaluation;
  if (!hasPcConfig) return <span className="text-xs text-slate-400 italic font-sans">Нет данных для расчета</span>;

  const isDebugMode = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('debug') === '1' ||
    new URLSearchParams(window.location.search).get('debug') === 'true' ||
    localStorage.getItem('debugDashboard') === 'true' ||
    localStorage.getItem('debugDashboard') === '1'
  );

  const tooltipId = useMemo(() => `pc-status-tooltip-${project.id || project.projectId}`, [project.id, project.projectId]);

  useEffect(() => {
    const handleCloseAll = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.id !== tooltipId) {
        setIsOpen(false);
      }
    };
    window.addEventListener('close-all-pc-tooltips', handleCloseAll);
    return () => {
      window.removeEventListener('close-all-pc-tooltips', handleCloseAll);
    };
  }, [tooltipId]);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const openTooltip = () => {
    clearCloseTimeout();
    setIsOpen(true);
    window.dispatchEvent(new CustomEvent('close-all-pc-tooltips', { detail: { id: tooltipId } }));
  };

  const startCloseTimeout = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 800);
  };

  const handleMouseEnter = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches) {
      openTooltip();
    }
  };

  const handleMouseLeave = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches) {
      startCloseTimeout();
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      clearCloseTimeout();
      setIsOpen(false);
    } else {
      openTooltip();
    }
  };

  const calculatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const tooltipWidth = Math.min(420, Math.max(310, window.innerWidth - 24));
    
    // Check space and set left position
    let left = rect.right - tooltipWidth;
    if (left < 12) left = 12;
    if (left + tooltipWidth > window.innerWidth - 12) {
      left = window.innerWidth - tooltipWidth - 12;
    }

    // Set top position
    let top = rect.bottom + window.scrollY + 8;
    
    // If it goes past bottom window edge, check if we can show above
    const isMobile = window.innerWidth < 640;
    const estimatedHeight = isMobile ? 320 : 380;
    if (rect.bottom + estimatedHeight > window.innerHeight && rect.top - estimatedHeight > 0) {
      top = rect.top + window.scrollY - estimatedHeight - 8;
    }
    
    setCoords({ top, left });
  };

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      
      const handleScrollResize = () => {
        calculatePosition();
      };
      
      window.addEventListener('scroll', handleScrollResize, { passive: true });
      window.addEventListener('resize', handleScrollResize);
      return () => {
        window.removeEventListener('scroll', handleScrollResize);
        window.removeEventListener('resize', handleScrollResize);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        const portalId = `pc-status-tooltip-portal-${project.id || project.projectId}`;
        const portalEl = document.getElementById(portalId);
        if (portalEl && portalEl.contains(event.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearCloseTimeout();
    };
  }, [project.id, project.projectId]);

  const td = getPcStatusTooltipData(project, evaluation, assessDate);
  const pcStatus = td.status;
  const pcOverdueDays = td.overdueDays;
  const nextPcDate = td.nextPcDate;
  const pcReason = td.reason;

  return (
    <div 
      ref={containerRef}
      className="relative flex flex-col gap-1 w-full max-w-[150px] font-sans min-w-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Badge with status */}
      <span className={`${
        pcStatus === 'Своевременно' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
        pcStatus === 'Просрочен' ? 'bg-red-50 text-red-700 border-red-100' : 
        pcStatus === 'Не применяется' ? 'bg-gray-50 text-gray-600 border-gray-200' :
        'bg-orange-50 text-orange-700 border-orange-100'
      } inline-flex items-center gap-1 ${isUltraCompact ? 'text-[8.5px] px-1 py-0.5' : isCompact ? 'text-[9.5px] px-1.5 py-0.5' : 'text-[10.5px] px-1.5 py-0.5'} font-bold rounded w-max border min-w-0 break-words whitespace-normal`}>
        {pcStatus}
      </span>
      
      {/* Text details - short date or delay only */}
      {pcStatus === 'Своевременно' && nextPcDate && (
        <span className={`${isUltraCompact ? 'text-[8px]' : 'text-[9.5px]'} text-emerald-600 font-bold max-w-[140px] truncate block pl-0.5 leading-tight`}>
          До: {nextPcDate}
        </span>
      )}

      {pcStatus === 'Просрочен' && pcOverdueDays !== undefined && pcOverdueDays !== null && (
        <span className={`${isUltraCompact ? 'text-[8px]' : 'text-[9.5px]'} text-red-600 font-bold max-w-[140px] truncate block pl-0.5 leading-tight`}>
          Просрочка: {pcOverdueDays} {getDaysPlural(pcOverdueDays)}
        </span>
      )}

      {/* "Подробнее" Button */}
      <button
        onClick={handleToggle}
        type="button"
        className={`${isUltraCompact ? 'text-[8px]' : 'text-[9.5px]'} font-bold text-blue-600 hover:text-blue-800 transition-colors text-left w-max cursor-pointer decoration-dotted underline underline-offset-2 mt-0.5`}
      >
        Подробнее
      </button>

      {/* Tooltip Content inside Portal */}
      {isOpen && coords && createPortal(
        <div 
          id={`pc-status-tooltip-portal-${project.id || project.projectId}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ 
            position: 'absolute', 
            top: `${coords.top}px`, 
            left: `${coords.left}px`,
            zIndex: 99999
          }}
          className="w-[calc(100vw-24px)] sm:w-[380px] max-w-[420px] min-w-[300px] bg-white border border-gray-200 rounded-xl p-4 shadow-2xl text-left pointer-events-auto transition-all text-xs font-sans text-gray-800 leading-relaxed max-h-[420px] overflow-y-auto custom-scrollbar flex flex-col gap-1 whitespace-normal break-words [overflow-wrap:anywhere] min-w-0"
        >
          <div className="flex justify-between items-center mb-2 border-b border-gray-150 pb-1.5 shrink-0">
            <h4 className="font-bold text-gray-900 text-xs whitespace-normal break-words font-sans">
              {td.title}
            </h4>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              type="button"
              className="text-gray-400 hover:text-gray-650 p-1 bg-gray-50 hover:bg-gray-100 rounded-full focus:outline-none cursor-pointer inline-flex items-center justify-center shrink-0"
            >
              <X size={12} />
            </button>
          </div>
          
          <div className="space-y-3 overflow-y-auto flex-1 pr-1 min-w-0 font-sans">
            <div>
              <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider block font-sans">Статус:</span>
              <span className={`inline-block font-bold mt-0.5 px-1.5 py-0.5 rounded text-[10px] whitespace-normal break-words font-sans border border-emerald-100 text-emerald-700 bg-emerald-50 ${td.statusBadgeClass}`}>
                {td.status}
              </span>
            </div>

            <div className="min-w-0 text-gray-750 font-medium space-y-1.5 border-t border-gray-100 pt-2.5">
              <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider block mb-0.5 font-sans">Параметры контроля:</span>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 bg-gray-50/50 p-2 rounded-lg border border-gray-100 text-[11px] font-sans">
                <span className="text-gray-500 font-normal">Старт мониторинга:</span>
                <span className="text-gray-900 font-bold text-right">{td.startDate}</span>
                
                <span className="text-gray-500 font-normal">Периодичность ПК:</span>
                <span className="text-gray-900 font-bold text-right">{td.frequency}</span>
                
                <span className="text-gray-500 font-normal">Последний ПК:</span>
                <span className="text-gray-900 font-bold text-right">{td.lastPcDate}</span>
                
                <span className="text-gray-500 font-normal font-bold">Следующий по плану:</span>
                <span className="text-gray-950 font-extrabold text-right">{typeof td.nextPcDate === 'string' ? td.nextPcDate : '—'}</span>

                {td.status === 'Просрочен' && td.overdueDays !== null && (
                  <>
                    <span className="text-red-500 font-semibold">Просрочка ПК:</span>
                    <span className="text-red-600 font-black text-right">{td.overdueDays} {getDaysPlural(td.overdueDays)}</span>
                  </>
                )}
              </div>
            </div>

            {td.explanation && (
              <div className="min-w-0 border-t border-gray-100 pt-2.5">
                <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider block mb-1 font-sans">Описание:</span>
                <span className="text-gray-600 font-medium block text-[10.5px] whitespace-normal break-words font-sans leading-normal">
                  {td.explanation}
                </span>
              </div>
            )}

            {td.reason && (
              <div className="min-w-0 border-t border-gray-100 pt-2">
                <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider block mb-1 font-sans font-extrabold text-red-700">Ошибка параметров:</span>
                <span className="text-rose-700 font-semibold block text-[10.5px] whitespace-normal break-words font-sans bg-rose-50/50 p-2 rounded-lg border border-rose-100 leading-normal">
                  {td.reason}
                </span>
              </div>
            )}

            <div className="border-t border-gray-100 pt-2.5 bg-gray-50 p-2.5 rounded-lg text-[10px] text-gray-500 leading-normal whitespace-normal break-words min-w-0 shrink-0 font-sans">
              <span className="font-bold text-gray-700 block mb-1 font-sans">{td.methodologyTitle}:</span>
              <p className="font-sans font-medium mb-1.5 leading-relaxed text-gray-650">
                {td.methodologyDescription}
              </p>
              <ul className="list-disc list-inside space-y-0.5 pl-1 font-medium font-sans text-gray-600">
                {td.bullets.map((bullet, idx) => {
                  const parts = bullet.split(':');
                  const label = parts[0];
                  const text = parts.slice(1).join(':');
                  return (
                    <li key={idx}>
                      <span className={`font-bold font-sans ${
                        label.includes('Своевременно') ? 'text-emerald-700' :
                        label.includes('Просроче') ? 'text-rose-700' :
                        'text-orange-700'
                      }`}>{label}</span>:{text}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const RiskLevelCell: React.FC<{ 
  project: Project; 
  evaluation?: ProjectEvaluation | null;
  assessmentDate?: string;
  isUltraCompact?: boolean; 
  isCompact?: boolean;
}> = ({ project, evaluation, assessmentDate, isUltraCompact, isCompact }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const assessDate = assessmentDate || new Date().toISOString().split('T')[0];
  const td = getRiskTooltipData(project, evaluation, assessDate);

  const tooltipId = useMemo(() => `risk-tooltip-${project.id || project.projectId}`, [project.id, project.projectId]);

  useEffect(() => {
    const handleCloseAll = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.id !== tooltipId) {
        setIsOpen(false);
      }
    };
    window.addEventListener('close-all-tooltips', handleCloseAll);
    return () => window.removeEventListener('close-all-tooltips', handleCloseAll);
  }, [tooltipId]);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      setCoords({
        top: rect.bottom + scrollY + 4,
        left: Math.max(12, Math.min(window.innerWidth - 432, rect.left + scrollX - 100))
      });
    }
  };

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimeout();
    updateCoords();
    window.dispatchEvent(new CustomEvent('close-all-tooltips', { detail: { id: tooltipId } }));
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 250);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
    } else {
      updateCoords();
      window.dispatchEvent(new CustomEvent('close-all-tooltips', { detail: { id: tooltipId } }));
      setIsOpen(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        const portalId = `risk-tooltip-portal-${project.id || project.projectId}`;
        const portalEl = document.getElementById(portalId);
        if (portalEl && portalEl.contains(event.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearCloseTimeout();
    };
  }, [project.id, project.projectId]);

  return (
    <div 
      ref={containerRef}
      className="relative flex flex-col gap-1 w-full max-w-[150px] font-sans min-w-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Badge with level */}
      <span className={`${
        td.risk === 'Высокий' ? 'bg-red-50 text-red-700 border-red-100' : 
        td.risk === 'Средний' ? 'bg-amber-50 text-amber-700 border-amber-100' : 
        td.risk === 'Недостаточно данных' ? 'bg-gray-50 text-gray-500 border border-gray-150' :
        'bg-emerald-50 text-emerald-700 border border-emerald-100'
      } inline-flex items-center gap-1 ${isUltraCompact ? 'text-[8.5px] px-1 py-0.5' : isCompact ? 'text-[9.5px] px-1.5 py-0.5' : 'text-[10.5px] px-1.5 py-0.5'} font-bold rounded w-max border min-w-0 break-words whitespace-normal`}>
        {td.risk}
      </span>

      {/* "Подробнее" Button */}
      <button
        onClick={handleToggle}
        type="button"
        className={`${isUltraCompact ? 'text-[8px]' : 'text-[9.5px]'} font-bold text-blue-600 hover:text-blue-800 transition-colors text-left w-max cursor-pointer decoration-dotted underline underline-offset-2 mt-0.5`}
      >
        Подробнее
      </button>

      {/* Tooltip Content inside Portal */}
      {isOpen && coords && createPortal(
        <div 
          id={`risk-tooltip-portal-${project.id || project.projectId}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ 
            position: 'absolute', 
            top: `${coords.top}px`, 
            left: `${coords.left}px`,
            zIndex: 99999
          }}
          className="w-[calc(100vw-24px)] sm:w-[380px] max-w-[420px] min-w-[300px] bg-white border border-gray-200 rounded-xl p-4 shadow-2xl text-left pointer-events-auto transition-all text-xs font-sans text-gray-800 leading-relaxed max-h-[440px] overflow-y-auto custom-scrollbar flex flex-col gap-1 whitespace-normal break-words [overflow-wrap:anywhere] min-w-0"
        >
          <div className="flex justify-between items-center mb-2 border-b border-gray-150 pb-1.5 shrink-0">
            <h4 className="font-bold text-gray-900 text-xs whitespace-normal break-words font-sans">
              {td.title}
            </h4>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              type="button"
              className="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 hover:bg-gray-100 rounded-full focus:outline-none cursor-pointer inline-flex items-center justify-center shrink-0"
            >
              <X size={12} />
            </button>
          </div>
          
          <div className="space-y-3 overflow-y-auto flex-1 pr-1 min-w-0 font-sans">
            <div>
              <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider block font-sans">Уровень риска:</span>
              <span className={`inline-block font-bold mt-0.5 px-1.5 py-0.5 rounded text-[10px] whitespace-normal break-words font-sans border border-emerald-100 ${td.riskBadgeClass}`}>
                {td.risk}
              </span>
            </div>

            {td.explanation && (
              <div className="min-w-0 border-t border-gray-100 pt-2.5 font-sans">
                <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider block mb-1 font-sans">Факторы риска:</span>
                <span className="text-gray-600 font-medium block text-[10.5px] whitespace-normal break-words font-sans leading-normal">
                  {td.explanation}
                </span>
              </div>
            )}

            <div className="border-t border-gray-100 pt-2.5 bg-gray-50 p-2.5 rounded-lg text-[10px] text-gray-500 leading-normal whitespace-normal break-words min-w-0 shrink-0 font-sans">
              <span className="font-bold text-gray-700 block mb-1 font-sans">{td.methodologyTitle}:</span>
              <p className="font-sans font-medium mb-1.5 leading-relaxed text-gray-650">
                {td.methodologyDescription}
              </p>
              <ul className="list-disc list-inside space-y-0.5 pl-1 font-medium font-sans text-gray-600">
                {td.bullets.map((bullet, idx) => {
                  const parts = bullet.split(':');
                  const label = parts[0];
                  const text = parts.slice(1).join(':');
                  return (
                    <li key={idx}>
                      <span className={`font-bold font-sans ${
                        label.includes('Высокий') ? 'text-rose-700' :
                        label.includes('Средний') ? 'text-amber-700' :
                        'text-emerald-700'
                      }`}>{label}</span>:{text}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export const ProjectTable: React.FC<ProjectTableProps> = ({ 
  projects, 
  filteredProjects, 
  filters, 
  setFilters, 
  resetFilters, 
  onSelectProject,
  projectEvaluations,
  assessmentDate
}) => {
  const [localSearch, setLocalSearch] = useState(filters.search || '');
  
  const formatValue = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return "Не заполнено";
    const str = String(val).trim();
    if (str === "" || str === "—" || str.toLowerCase() === "nan") return "Не заполнено";
    return str;
  };

  const formatDateValue = (val: string | null | undefined) => {
    if (!val) return "Не заполнено";
    const formatted = formatDateSafe(val);
    if (formatted === "Не указано" || formatted === "—") return "Не заполнено";
    return formatted;
  };
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'projectStatus', direction: 'desc' });
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdditional, setShowAdditional] = useState(false);
  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);

  // Column Customizer Setup
  const defaultVisibleColumns = useMemo(() => [
    'projectName',
    'sponsor',
    'stage',
    'department',
    'pcStatus',
    'projectStatus',
    'tasksProgress',
    'kpisProgress',
    'action'
  ], []);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('visible_columns_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.includes('projectName') && parsed.includes('action')) {
          return parsed.filter(c => c !== 'generalStatus' && c !== 'risk');
        }
      } catch (e) {
        // use default
      }
    }
    return [
      'projectName',
      'sponsor',
      'stage',
      'department',
      'pcStatus',
      'projectStatus',
      'tasksProgress',
      'kpisProgress',
      'action'
    ];
  });

  const allColumnsList = useMemo(() => [
    { id: 'projectName', label: 'Название проекта', required: true },
    { id: 'sponsor', label: 'Заказчики' },
    { id: 'projectManager', label: 'Руководитель проекта' },
    { id: 'projectOwner', label: 'Владелец проекта' },
    { id: 'priority', label: 'Приоритет' },
    { id: 'startDate', label: 'Дата начала' },
    { id: 'deadlineAt', label: 'Дата завершения' },
    { id: 'stage', label: 'Стадия' },
    { id: 'department', label: 'Департамент' },
    { id: 'pcStatus', label: 'Статус ПК' },
    { id: 'projectStatus', label: 'Зона риска' },
    { id: 'riskLevel', label: 'Уровень риска' },
    { id: 'tasksProgress', label: 'Выполнение по вехам (текущий квартал)' },
    { id: 'kpisProgress', label: 'Выполнение по показателям (текущий квартал)' },
    { id: 'action', label: 'Действие', required: true }
  ], []);

  useEffect(() => {
    localStorage.setItem('visible_columns_v1', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  const colCount = visibleColumns.length;
  const isCompact = colCount >= 10 && colCount <= 14;
  const isUltraCompact = colCount > 14;

  const cellPaddingClass = isUltraCompact 
    ? "px-1.5 py-1 text-[9px] leading-tight font-sans" 
    : isCompact 
      ? "px-2.5 py-2 text-[10px] leading-normal font-sans" 
      : "px-4 py-4 text-xs leading-relaxed font-sans";

  const headerPaddingClass = isUltraCompact 
    ? "px-1.5 py-1.5 text-[8px] font-black uppercase tracking-widest cursor-pointer hover:text-[#010101] transition-colors" 
    : isCompact 
      ? "px-2.5 py-2.5 text-[9px] font-black uppercase tracking-widest cursor-pointer hover:text-[#010101] transition-colors" 
      : "px-4 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-[#010101] transition-colors";

  const nameColWidthClass = isUltraCompact 
    ? "w-[12%] min-w-[140px]" 
    : isCompact 
      ? "w-[18%] min-w-[200px]" 
      : "w-[25%] min-w-[320px]";

  const renderTextTruncated = (text: string | null | undefined, limit = 30) => {
    if (!text) return "Не заполнено";
    const cleanText = String(text);
    if (isUltraCompact && cleanText.length > limit) {
      return (
        <span className="cursor-help" title={cleanText}>
          {cleanText.slice(0, limit)}...
        </span>
      );
    }
    return cleanText;
  };

  const renderCellWithTruncation = (text: string | null | undefined, colId: string) => {
    if (!text) return <span className="text-gray-400 italic">Не заполнено</span>;
    const cleanText = String(text).trim();
    if (!cleanText || cleanText.toLowerCase() === "nan") {
      return <span className="text-gray-400 italic">Не заполнено</span>;
    }

    let maxWClass = "max-w-[160px]";
    if (colId === 'department') maxWClass = "max-w-[130px]";
    else if (colId === 'sponsor') maxWClass = "max-w-[150px]";
    else if (colId === 'projectManager' || colId === 'projectOwner') maxWClass = "max-w-[140px]";
    else if (colId === 'stage') maxWClass = "max-w-[125px]";

    let modeClass = "";
    if (isUltraCompact) {
      modeClass = `whitespace-nowrap overflow-hidden text-ellipsis block max-w-[100px]`;
    } else if (isCompact) {
      modeClass = `whitespace-normal line-clamp-2 overflow-hidden text-ellipsis block ${maxWClass} leading-snug break-words`;
    } else {
      modeClass = `whitespace-nowrap overflow-hidden text-ellipsis block ${maxWClass}`;
    }

    return (
      <div className={`${modeClass} min-w-0`} title={cleanText}>
        {cleanText}
      </div>
    );
  };

  const renderHeader = (colId: string, fullLabel: string, shortLabel: string) => {
    if (isUltraCompact) {
      return (
        <span className="cursor-help border-b border-dashed border-gray-300" title={fullLabel}>
          {shortLabel} ℹ️
        </span>
      );
    }
    return fullLabel;
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    const arrayFilterKeys = [
      'sponsors', 'projectOwners', 'projectManagers', 'departments', 'priorities', 'pcStatuses',
      'responsibles', 'projectAdmins', 'projectTeams', 'stages', 'projectTypes', 'generalStatuses', 'risks'
    ];
    arrayFilterKeys.forEach(k => {
      if (Array.isArray(filters[k]) && filters[k].length > 0) count++;
    });

    const stringFilterKeys = [
      'startDateFrom', 'startDateTo', 'endDateFrom', 'endDateTo', 'lastPcDateFrom', 'lastPcDateTo',
      'tasksProgressMin', 'tasksProgressMax', 'kpisProgressMin', 'kpisProgressMax'
    ];
    stringFilterKeys.forEach(k => {
      if (filters[k] && filters[k] !== '') count++;
    });

    return count;
  }, [filters]);

  useEffect(() => {
    setLocalSearch(filters.search || '');
  }, [filters.search]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getGeneralStatusLevel = (p: Project) => {
    if (p.status === 'completed') return 0;
    const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
    const status = getRegistryProjectStatusView(p, ev, assessmentDate || '');
    switch (status) {
      case "Норма": return 1;
      case "Недостаточно данных": return 2;
      case "Зона риска": return 3;
      default: return 1;
    }
  };

  const getProjectIsAtRisk = (p: Project) => {
    const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
    const risk = getRegistryRiskView(p, ev, assessmentDate || '');
    const monitoringStatus = getRegistryMonitoringStatus(p, projectEvaluations);
    return risk === 'Высокий' || risk === 'Средний' || monitoringStatus === 'overdue' || p.status === 'at_risk';
  };

  const getMetricDeviation = (p: Project) => {
    const kpiMetrics = getCurrentQuarterKpiMetrics(p, projectEvaluations, assessmentDate);
    return kpiMetrics.deviation;
  };

  const getIndicatorsStatus = (p: Project) => {
    const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
    let status = "Нет показателей";
    if (ev) {
      const evStatus = ev.indicators.status;
      if (evStatus === "ok") status = "В норме";
      else if (evStatus === "attention") status = "Нет факта";
      else if (evStatus === "risk") status = "Отставание";
      else status = "Нет показателей";
    } else {
      const kpiMetrics = getCurrentQuarterKpiMetrics(p, projectEvaluations, assessmentDate);
      if (kpiMetrics.hasData) {
        if (kpiMetrics.deviation < 0) {
          status = "Отставание";
        } else {
          status = "В норме";
        }
      } else {
        status = "Нет показателей";
      }
    }
    let color = "gray";
    if (status === "В норме") color = "green";
    else if (status === "Нет факта" || status === "Отставание") color = "yellow";
    
    if (status === "Отставание") color = "red";

    return { text: status, color, hasIndicators: status !== "Нет показателей" };
  };

  const sortedProjects = useMemo(() => {
    let sorted = [...filteredProjects];
    const activeAssessDate = assessmentDate || new Date().toISOString().split('T')[0];
    if (sortConfig.key) {
      sorted.sort((a, b) => {
        if (sortConfig.key === 'startDate' || sortConfig.key === 'deadlineAt') {
          const aDate = getProjectDateSortValue(a, sortConfig.key);
          const bDate = getProjectDateSortValue(b, sortConfig.key);
          return compareNullableDates(aDate, bDate, sortConfig.direction);
        }

        let aVal: any = 0;
        let bVal: any = 0;

        switch (sortConfig.key) {
          case 'projectName': aVal = a.projectName; bVal = b.projectName; break;
          case 'sponsor': aVal = a.sponsor || ''; bVal = b.sponsor || ''; break;
          case 'projectManager': aVal = a.projectManager || a.executor || ''; bVal = b.projectManager || b.executor || ''; break;
          case 'projectOwner': aVal = a.projectOwner || a.owner || ''; bVal = b.projectOwner || b.owner || ''; break;
          case 'priority': aVal = a.priority !== null && a.priority !== undefined ? a.priority : 999; bVal = b.priority !== null && b.priority !== undefined ? b.priority : 999; break;
          case 'startDate': aVal = a.startDate || ''; bVal = b.startDate || ''; break;
          case 'deadlineAt': aVal = a.deadlineAt || a.endDate || 'Z'; bVal = b.deadlineAt || b.endDate || 'Z'; break;
          case 'stage': aVal = a.stage || ''; bVal = b.stage || ''; break;
          case 'department': aVal = a.department || ''; bVal = b.department || ''; break;
          case 'pcStatus': {
            const evA = getEvaluationByProjectId(projectEvaluations, a.projectId);
            const evB = getEvaluationByProjectId(projectEvaluations, b.projectId);
            const statusA = getRegistryPcStatusView(a, evA, activeAssessDate);
            const statusB = getRegistryPcStatusView(b, evB, activeAssessDate);
            const mapOrder = (st: string) => {
              if (st === 'Не применяется') return 0;
              if (st === 'Недостаточно данных') return 1;
              if (st === 'Своевременно') return 2;
              if (st === 'Просрочен') return 3;
              return 4;
            };
            aVal = mapOrder(statusA);
            bVal = mapOrder(statusB);
            break;
          }
          case 'projectStatus':
          case 'generalStatus': {
            const evA = getEvaluationByProjectId(projectEvaluations, a.projectId);
            const evB = getEvaluationByProjectId(projectEvaluations, b.projectId);
            const statusA = getRegistryProjectStatusView(a, evA, activeAssessDate);
            const statusB = getRegistryProjectStatusView(b, evB, activeAssessDate);
            const mapOrder = (st: string) => {
              if (st === 'Недостаточно данных') return 0;
              if (st === 'Норма') return 1;
              if (st === 'Зона риска') return 2;
              return 0;
            };
            aVal = mapOrder(statusA);
            bVal = mapOrder(statusB);
            break;
          }
          case 'riskLevel': {
            const evA = getEvaluationByProjectId(projectEvaluations, a.projectId);
            const evB = getEvaluationByProjectId(projectEvaluations, b.projectId);
            const riskA = getRegistryRiskView(a, evA, activeAssessDate);
            const riskB = getRegistryRiskView(b, evB, activeAssessDate);
            const mapOrder = (rk: string) => {
              if (rk === 'Низкий') return 0;
              if (rk === 'Средний') return 1;
              if (rk === 'Высокий') return 2;
              return 0;
            };
            aVal = mapOrder(riskA);
            bVal = mapOrder(riskB);
            break;
          }
          case 'risk': {
            const isAtRiskA = getProjectIsAtRisk(a);
            const isAtRiskB = getProjectIsAtRisk(b);
            aVal = isAtRiskA ? 1 : 0;
            bVal = isAtRiskB ? 1 : 0;
            break;
          }
          case 'tasksProgress': {
            const aPct = getCurrentQuarterMilestoneProgress(a, projectEvaluations, assessmentDate);
            const bPct = getCurrentQuarterMilestoneProgress(b, projectEvaluations, assessmentDate);
            aVal = aPct !== null ? aPct : -1;
            bVal = bPct !== null ? bPct : -1;
            break;
          }
          case 'kpisProgress': {
            const aKpi = getCurrentQuarterKpiProgress(a, projectEvaluations, assessmentDate);
            const bKpi = getCurrentQuarterKpiProgress(b, projectEvaluations, assessmentDate);
            aVal = aKpi !== null ? aKpi : -1;
            bVal = bKpi !== null ? bKpi : -1;
            break;
          }
          default:
            aVal = (a as any)[sortConfig.key];
            bVal = (b as any)[sortConfig.key];
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sorted;
  }, [filteredProjects, sortConfig, projectEvaluations, assessmentDate]);

  // Option list gatherers
  const getUniqueOptions = (getField: (p: Project) => string | number | undefined | null) => {
    const values = new Set<string>();
    projects.forEach(p => {
      const val = getField(p);
      if (val !== undefined && val !== null) {
        const valStr = String(val).trim();
        if (valStr && valStr.toLowerCase() !== "nan" && valStr !== "") {
          values.add(valStr);
        }
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  };

  const getUniqueOptionsForList = (getField: (p: Project) => string | string[] | undefined | null) => {
    const values = new Set<string>();
    projects.forEach(p => {
      const val = getField(p);
      if (!val) return;
      if (Array.isArray(val)) {
        val.forEach(v => {
          const vClean = v.trim();
          if (vClean && vClean.toLowerCase() !== "nan" && vClean !== "") values.add(vClean);
        });
      } else {
        String(val).split(";").forEach(v => {
          const vClean = v.trim();
          if (vClean && vClean.toLowerCase() !== "nan" && vClean !== "") values.add(vClean);
        });
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  };

  const sponsorsOptions = useMemo(() => {
    const opts = getUniqueOptions(p => p.sponsor);
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);

  const ownersOptions = useMemo(() => {
    const opts = getUniqueOptions(p => p.projectOwner || p.owner);
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);

  const managersOptions = useMemo(() => {
    const opts = getUniqueOptions(p => p.projectManager || p.executor);
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);

  const departmentsOptions = useMemo(() => {
    const opts = getUniqueOptionsForList(p => p.department);
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);

  const prioritiesOptions = useMemo(() => {
    const opts = getUniqueOptions(p => p.priority === null || p.priority === undefined ? null : String(p.priority));
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);
  
  const pcStatusesOptions = useMemo(() => ["Своевременно", "Просрочен", "Недостаточно данных", "Не применяется"], []);

  // Additional Filters
  const responsiblesOptions = useMemo(() => {
    const opts = getUniqueOptions(p => p.responsible);
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);

  const adminsOptions = useMemo(() => {
    const opts = getUniqueOptions(p => p.projectAdmin);
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);

  const teamsOptions = useMemo(() => {
    const opts = getUniqueOptionsForList(p => p.projectTeam);
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);

  const stagesOptions = useMemo(() => {
    const opts = getUniqueOptions(p => getNormalizedStageForFiltering(p));
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);

  const typesOptions = useMemo(() => {
    const opts = getUniqueOptions(p => p.projectType);
    return opts.length > 0 ? [...opts, "Не заполнено"] : ["Не заполнено"];
  }, [projects]);

  const projectStatusesOptions = useMemo(() => ["Норма", "Зона риска", "Недостаточно данных"], []);
  const riskLevelsOptions = useMemo(() => ["Низкий", "Средний", "Высокий"], []);

  const statusMap: Record<string, string> = {
    active: 'В работе',
    completed: 'Завершен',
    cancelled: 'Остановлен',
    overdue: 'Просрочено',
    at_risk: 'Зона риска',
    unknown: 'Неизвестно'
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={12} className="opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-[#010101]" /> : <ChevronDown size={12} className="text-[#010101]" />;
  };

  // Chips rendering helpers
  const activeChips = useMemo(() => {
    const chips: { id: string; label: string; valueText: string; onClear: () => void }[] = [];

    if (filters.sponsors?.length > 0) {
      chips.push({
        id: 'sponsors',
        label: 'Заказчики',
        valueText: filters.sponsors.join(', '),
        onClear: () => setFilters({ ...filters, sponsors: [] })
      });
    }
    if (filters.projectOwners?.length > 0) {
      chips.push({
        id: 'projectOwners',
        label: 'Владелец',
        valueText: filters.projectOwners.join(', '),
        onClear: () => setFilters({ ...filters, projectOwners: [] })
      });
    }
    if (filters.projectManagers?.length > 0) {
      chips.push({
        id: 'projectManagers',
        label: 'Руководитель',
        valueText: filters.projectManagers.join(', '),
        onClear: () => setFilters({ ...filters, projectManagers: [] })
      });
    }
    if (filters.departments?.length > 0) {
      chips.push({
        id: 'departments',
        label: 'Департамент',
        valueText: filters.departments.join(', '),
        onClear: () => setFilters({ ...filters, departments: [] })
      });
    }
    if (filters.priorities?.length > 0) {
      chips.push({
        id: 'priorities',
        label: 'Приоритет',
        valueText: filters.priorities.join(', '),
        onClear: () => setFilters({ ...filters, priorities: [] })
      });
    }
    if (filters.pcStatuses?.length > 0) {
      chips.push({
        id: 'pcStatuses',
        label: 'Статус ПК',
        valueText: filters.pcStatuses.join(', '),
        onClear: () => setFilters({ ...filters, pcStatuses: [] })
      });
    }
    if (filters.responsibles?.length > 0) {
      chips.push({
        id: 'responsibles',
        label: 'Ответственный',
        valueText: filters.responsibles.join(', '),
        onClear: () => setFilters({ ...filters, responsibles: [] })
      });
    }
    if (filters.projectAdmins?.length > 0) {
      chips.push({
        id: 'projectAdmins',
        label: 'Администратор',
        valueText: filters.projectAdmins.join(', '),
        onClear: () => setFilters({ ...filters, projectAdmins: [] })
      });
    }
    if (filters.projectTeams?.length > 0) {
      chips.push({
        id: 'projectTeams',
        label: 'Команда',
        valueText: filters.projectTeams.join(', '),
        onClear: () => setFilters({ ...filters, projectTeams: [] })
      });
    }
    if (filters.stages?.length > 0) {
      chips.push({
        id: 'stages',
        label: 'Стадия',
        valueText: filters.stages.join(', '),
        onClear: () => setFilters({ ...filters, stages: [] })
      });
    }
    if (filters.projectTypes?.length > 0) {
      chips.push({
        id: 'projectTypes',
        label: 'Вид проекта',
        valueText: filters.projectTypes.join(', '),
        onClear: () => setFilters({ ...filters, projectTypes: [] })
      });
    }
    if (filters.generalStatuses?.length > 0) {
      chips.push({
        id: 'generalStatuses',
        label: 'Зона риска',
        valueText: filters.generalStatuses.join(', '),
        onClear: () => setFilters({ ...filters, generalStatuses: [] })
      });
    }
    if (filters.risks?.length > 0) {
      chips.push({
        id: 'risks',
        label: 'Уровень риска',
        valueText: filters.risks.join(', '),
        onClear: () => setFilters({ ...filters, risks: [] })
      });
    }

    // Dates
    if (filters.startDateEmpty) {
      chips.push({
        id: 'startDateEmpty',
        label: 'Дата начала',
        valueText: 'Не заполнено',
        onClear: () => setFilters({ ...filters, startDateEmpty: false })
      });
    } else if (filters.startDateFrom || filters.startDateTo) {
      chips.push({
        id: 'startDate',
        label: 'Дата начала',
        valueText: `${filters.startDateFrom || '...'} — ${filters.startDateTo || '...'}`,
        onClear: () => setFilters({ ...filters, startDateFrom: '', startDateTo: '' })
      });
    }

    if (filters.endDateEmpty) {
      chips.push({
        id: 'endDateEmpty',
        label: 'Крайний срок',
        valueText: 'Не заполнено',
        onClear: () => setFilters({ ...filters, endDateEmpty: false })
      });
    } else if (filters.endDateFrom || filters.endDateTo) {
      chips.push({
        id: 'endDate',
        label: 'Крайний срок',
        valueText: `${filters.endDateFrom || '...'} — ${filters.endDateTo || '...'}`,
        onClear: () => setFilters({ ...filters, endDateFrom: '', endDateTo: '' })
      });
    }

    if (filters.lastPcDateEmpty) {
      chips.push({
        id: 'lastPcDateEmpty',
        label: 'Дата мониторинга',
        valueText: 'Не заполнено',
        onClear: () => setFilters({ ...filters, lastPcDateEmpty: false })
      });
    } else if (filters.lastPcDateFrom || filters.lastPcDateTo) {
      chips.push({
        id: 'lastPcDate',
        label: 'Дата мониторинга',
        valueText: `${filters.lastPcDateFrom || '...'} — ${filters.lastPcDateTo || '...'}`,
        onClear: () => setFilters({ ...filters, lastPcDateFrom: '', lastPcDateTo: '' })
      });
    }

    // Ranges
    if (filters.tasksProgressMin || filters.tasksProgressMax) {
      chips.push({
        id: 'tasksProgress',
        label: 'Процент выполнения по вехам',
        valueText: `${filters.tasksProgressMin || '0'}% — ${filters.tasksProgressMax || '100'}%`,
        onClear: () => setFilters({ ...filters, tasksProgressMin: '', tasksProgressMax: '' })
      });
    }
    if (filters.kpisProgressMin || filters.kpisProgressMax) {
      chips.push({
        id: 'kpisProgress',
        label: 'Выполнение по показателям',
        valueText: `${filters.kpisProgressMin || '0'}% — ${filters.kpisProgressMax || '100'}%`,
        onClear: () => setFilters({ ...filters, kpisProgressMin: '', kpisProgressMax: '' })
      });
    }

    return chips;
  }, [filters, setFilters]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-gray-100 bg-gray-50/50 space-y-4">
        {/* Search & Result Counter & Global Clear */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="Поиск по названию, исполнителю, описанию..."
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                setFilters({...filters, search: e.target.value});
              }}
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-base md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-2 rounded-xl border border-gray-200">
              Отображено: <span className="text-[#010101] font-black">{sortedProjects.length}</span> из <span className="text-gray-500 font-bold">{projects.length}</span>
            </p>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="md:hidden flex-1 text-xs flex items-center justify-center gap-2 text-gray-700 bg-white border border-gray-200 py-3 rounded-xl cursor-pointer shadow-sm font-bold min-h-[44px]"
            >
              <SlidersHorizontal size={14} /> 
              <span>Фильтры</span>
              {activeFiltersCount > 0 && (
                <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black">{activeFiltersCount}</span>
              )}
            </button>
            <button onClick={resetFilters} className="flex-1 md:flex-initial text-xs flex items-center justify-center gap-2 text-gray-500 hover:text-red-500 transition-colors font-bold whitespace-nowrap bg-white border border-gray-200 px-4 py-3 md:py-2.5 rounded-xl cursor-pointer shadow-sm min-h-[44px] md:min-h-0">
              <FilterX size={16} /> Сбросить {isMobile ? '' : 'фильтры'}
            </button>

            {!isMobile && (
              <div className="relative">
                <button 
                  onClick={() => setShowColumnCustomizer(!showColumnCustomizer)}
                  className="text-xs flex items-center justify-center gap-2 text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl cursor-pointer shadow-sm font-bold min-h-[44px] md:min-h-0"
                  title="Настроить видимость столбцов"
                >
                  <SlidersHorizontal size={14} className="text-gray-500" />
                  <span>Столбцы</span>
                </button>

                {showColumnCustomizer && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-gray-200 shadow-xl p-4 z-50 text-left font-sans">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Настройка столбцов</span>
                      <button onClick={() => setShowColumnCustomizer(false)} className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                      {allColumnsList.map((col) => {
                        if (col.required) return null;
                        const isVisible = visibleColumns.includes(col.id);
                        return (
                          <label key={col.id} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer text-xs font-semibold text-gray-700 transition-colors">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => {
                                if (isVisible) {
                                  setVisibleColumns(visibleColumns.filter(c => c !== col.id));
                                } else {
                                  setVisibleColumns([...visibleColumns, col.id]);
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500/20 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span>{col.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-3 gap-2">
                      <button
                        onClick={() => setVisibleColumns(defaultVisibleColumns)}
                        className="flex-1 py-1 px-2 text-[9px] font-black uppercase tracking-widest text-[#011] bg-gray-100 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer text-center"
                      >
                        Сбросить вид таблицы
                      </button>
                      <button
                        onClick={() => setShowColumnCustomizer(false)}
                        className="flex-1 py-1 px-2 text-[9px] font-black uppercase tracking-widest text-white bg-[#010101] rounded-lg hover:bg-blue-600 transition-colors cursor-pointer text-center"
                      >
                        Готово
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filters Panel */}
        {(showFilters || !isMobile) && (
          <div className="space-y-4 pt-2">
            {/* Primary filters grid (6 multi-select dropdowns) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <MultiSelectDropdown 
                label="Заказчики" 
                options={sponsorsOptions} 
                selectedValues={filters.sponsors || []} 
                onChange={(vals) => setFilters({ ...filters, sponsors: vals })}
                placeholder="Все заказчики"
              />

              <MultiSelectDropdown 
                label="Владелец проекта" 
                options={ownersOptions} 
                selectedValues={filters.projectOwners || []} 
                onChange={(vals) => setFilters({ ...filters, projectOwners: vals })}
                placeholder="Все владельцы"
              />

              <MultiSelectDropdown 
                label="Руководитель проекта" 
                options={managersOptions} 
                selectedValues={filters.projectManagers || []} 
                onChange={(vals) => setFilters({ ...filters, projectManagers: vals })}
                placeholder="Все руководители"
              />

              <MultiSelectDropdown 
                label="Департамент" 
                options={departmentsOptions} 
                selectedValues={filters.departments || []} 
                onChange={(vals) => setFilters({ ...filters, departments: vals })}
                placeholder="Все департаменты"
              />

              <MultiSelectDropdown 
                label="Зона риска" 
                options={projectStatusesOptions} 
                selectedValues={filters.generalStatuses || []} 
                onChange={(vals) => setFilters({ ...filters, generalStatuses: vals })}
                placeholder="Все статусы"
              />

              <MultiSelectDropdown 
                label="Статус ПК" 
                options={pcStatusesOptions} 
                selectedValues={filters.pcStatuses || []} 
                onChange={(vals) => setFilters({ ...filters, pcStatuses: vals })}
                placeholder="Все статусы ПК"
              />
            </div>

            {/* Toggle Additional Filters Button */}
            <button
              type="button"
              onClick={() => setShowAdditional(!showAdditional)}
              className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-[#011] hover:text-blue-600 transition-colors pl-1 pt-1 shrink-0 cursor-pointer focus:outline-none"
            >
              <SlidersHorizontal size={14} className={showAdditional ? 'rotate-95 text-blue-600' : ''} />
              <span>{showAdditional ? 'Скрыть дополнительные фильтры' : 'Показать дополнительные фильтры'}</span>
              <span className="text-gray-300 font-light">•</span>
              <span className="text-gray-400 font-bold bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Команда, Сроки, Риски, Выполнение %</span>
            </button>

            {/* Expanded section for additional filters */}
            {showAdditional && (
              <div className="p-4 bg-gray-100/30 border border-gray-100 rounded-2xl space-y-4 animate-fadeIn">
                {/* Additional Multi-select Dropdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  <MultiSelectDropdown 
                    label="Ответственный" 
                    options={responsiblesOptions} 
                    selectedValues={filters.responsibles || []} 
                    onChange={(vals) => setFilters({ ...filters, responsibles: vals })}
                    placeholder="Все ответственные"
                  />

                  <MultiSelectDropdown 
                    label="Администратор проекта" 
                    options={adminsOptions} 
                    selectedValues={filters.projectAdmins || []} 
                    onChange={(vals) => setFilters({ ...filters, projectAdmins: vals })}
                    placeholder="Все администраторы"
                  />

                  <MultiSelectDropdown 
                    label="Команда проекта" 
                    options={teamsOptions} 
                    selectedValues={filters.projectTeams || []} 
                    onChange={(vals) => setFilters({ ...filters, projectTeams: vals })}
                    placeholder="Все члены команды"
                  />

                  <MultiSelectDropdown 
                    label="Стадия" 
                    options={stagesOptions} 
                    selectedValues={filters.stages || []} 
                    onChange={(vals) => setFilters({ ...filters, stages: vals })}
                    placeholder="Все стадии"
                  />

                  <MultiSelectDropdown 
                    label="Вид проекта" 
                    options={typesOptions} 
                    selectedValues={filters.projectTypes || []} 
                    onChange={(vals) => setFilters({ ...filters, projectTypes: vals })}
                    placeholder="Все виды"
                  />

                  <MultiSelectDropdown 
                    label="Приоритет" 
                    options={prioritiesOptions} 
                    selectedValues={filters.priorities || []} 
                    onChange={(vals) => setFilters({ ...filters, priorities: vals })}
                    placeholder="Все приоритеты"
                  />
                </div>

                {/* Date ranges, percentages and risk */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                  <MultiSelectDropdown 
                    label="Уровень риска" 
                    options={riskLevelsOptions} 
                    selectedValues={filters.risks || []} 
                    onChange={(vals) => setFilters({ ...filters, risks: vals })}
                    placeholder="Все уровни риска"
                  />

                  {/* Date range picker - Start date (Период дат начала) */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Период даты начала</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="date" 
                        value={filters.startDateFrom || ''} 
                        onChange={e => setFilters({ ...filters, startDateFrom: e.target.value })}
                        disabled={!!filters.startDateEmpty}
                        className="flex-1 px-2.5 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px] disabled:opacity-50 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="С"
                      />
                      <span className="text-gray-400 text-xs font-bold">—</span>
                      <input 
                        type="date" 
                        value={filters.startDateTo || ''} 
                        onChange={e => setFilters({ ...filters, startDateTo: e.target.value })}
                        disabled={!!filters.startDateEmpty}
                        className="flex-1 px-2.5 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px] disabled:opacity-50 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="По"
                      />
                    </div>
                    <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none pl-1">
                      <input 
                        type="checkbox" 
                        checked={!!filters.startDateEmpty} 
                        onChange={e => setFilters({ ...filters, startDateEmpty: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500/20 w-4 h-4 border-gray-300"
                      />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Не заполнено</span>
                    </label>
                  </div>

                  {/* Date range picker - End date (Период крайнего срока) */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Период крайнего срока</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="date" 
                        value={filters.endDateFrom || ''} 
                        onChange={e => setFilters({ ...filters, endDateFrom: e.target.value })}
                        disabled={!!filters.endDateEmpty}
                        className="flex-1 px-2.5 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px] disabled:opacity-50 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="С"
                      />
                      <span className="text-gray-400 text-xs font-bold">—</span>
                      <input 
                        type="date" 
                        value={filters.endDateTo || ''} 
                        onChange={e => setFilters({ ...filters, endDateTo: e.target.value })}
                        disabled={!!filters.endDateEmpty}
                        className="flex-1 px-2.5 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px] disabled:opacity-50 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="По"
                      />
                    </div>
                    <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none pl-1">
                      <input 
                        type="checkbox" 
                        checked={!!filters.endDateEmpty} 
                        onChange={e => setFilters({ ...filters, endDateEmpty: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500/20 w-4 h-4 border-gray-300"
                      />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Не заполнено</span>
                    </label>
                  </div>

                  {/* Date range picker - Last PC date */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Дата мониторинга (ПК)</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="date" 
                        value={filters.lastPcDateFrom || ''} 
                        onChange={e => setFilters({ ...filters, lastPcDateFrom: e.target.value })}
                        disabled={!!filters.lastPcDateEmpty}
                        className="flex-1 px-2.5 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px] disabled:opacity-50 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="С"
                      />
                      <span className="text-gray-400 text-xs font-bold">—</span>
                      <input 
                        type="date" 
                        value={filters.lastPcDateTo || ''} 
                        onChange={e => setFilters({ ...filters, lastPcDateTo: e.target.value })}
                        disabled={!!filters.lastPcDateEmpty}
                        className="flex-1 px-2.5 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px] disabled:opacity-50 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="По"
                      />
                    </div>
                    <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none pl-1">
                      <input 
                        type="checkbox" 
                        checked={!!filters.lastPcDateEmpty} 
                        onChange={e => setFilters({ ...filters, lastPcDateEmpty: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500/20 w-4 h-4 border-gray-300"
                      />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Не заполнено</span>
                    </label>
                  </div>
                </div>

                {/* Range inputs for progress percentages */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                  {/* Task Completion % (Процент выполнения по вехам) */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="sm:w-1/2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight block">Процент выполнения по вехам</span>
                      <span className="text-[10px] text-gray-400 leading-tight">Прогресс вех</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input 
                        type="number" 
                        min="0" 
                        max="100"
                        placeholder="От 0%"
                        value={filters.tasksProgressMin || ''}
                        onChange={e => setFilters({ ...filters, tasksProgressMin: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px]"
                      />
                      <span className="text-gray-400 text-xs font-bold">—</span>
                      <input 
                        type="number" 
                        min="0" 
                        max="100"
                        placeholder="До 100%"
                        value={filters.tasksProgressMax || ''}
                        onChange={e => setFilters({ ...filters, tasksProgressMax: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px]"
                      />
                    </div>
                  </div>

                  {/* Indicator Completion % (Процент выполнения по показателям) */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="sm:w-1/2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight block">Процент выполнения по показателям</span>
                      <span className="text-[10px] text-gray-400 leading-tight">Показатели проекта</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input 
                        type="number" 
                        min="0" 
                        max="100"
                        placeholder="От 0%"
                        value={filters.kpisProgressMin || ''}
                        onChange={e => setFilters({ ...filters, kpisProgressMin: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px]"
                      />
                      <span className="text-gray-400 text-xs font-bold">—</span>
                      <input 
                        type="number" 
                        min="0" 
                        max="100"
                        placeholder="До 100%"
                        value={filters.kpisProgressMax || ''}
                        onChange={e => setFilters({ ...filters, kpisProgressMax: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px]"
                      />
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* Selected Active Chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-1">Активные фильтры:</span>
            {activeChips.map((chip) => (
              <div 
                key={chip.id} 
                className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-lg text-xs font-semibold animate-fadeIn max-w-[280px]"
              >
                <span className="text-blue-500 text-[10px] font-bold uppercase tracking-wide">{chip.label}:</span>
                <span className="truncate" title={chip.valueText}>{chip.valueText}</span>
                <button 
                  onClick={chip.onClear}
                  className="p-0.5 hover:bg-blue-100 rounded-full transition-colors cursor-pointer text-blue-400 hover:text-blue-700 font-bold"
                  title="Очистить фильтр"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              onClick={resetFilters}
              className="text-[10px] font-black uppercase tracking-widest text-[#011] hover:text-red-500 transition-colors py-1 px-2 border border-gray-200 rounded-lg hover:border-red-100 bg-white shadow-sm cursor-pointer ml-auto"
            >
              Сбросить всё
            </button>
          </div>
        )}
      </div>

      {isMobile ? (
        <div className="p-4 space-y-4 bg-gray-50/30">
          {sortedProjects.map((p) => {
            const genLevel = getGeneralStatusLevel(p);
            const indStatus = getIndicatorsStatus(p);
            const completeness = Math.round(getRegistryDataQuality(p, projectEvaluations) || 0);
            
            // Use unified calculations module for rendering progress
            const milestoneProgressVal = getCurrentQuarterMilestoneProgress(p, projectEvaluations, assessmentDate);
            const kpiProgressVal = getCurrentQuarterKpiProgress(p, projectEvaluations, assessmentDate);
            const deviation = getMetricDeviation(p);
            const isAtRisk = getProjectIsAtRisk(p);
            const hasMilestonesData = milestoneProgressVal !== null;

            return (
              <div key={p.projectId} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4 active:scale-[0.99] transition-transform">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-gray-900 text-base leading-snug break-words pr-2">{p.projectName}</p>
                    <div className={`px-2 py-1 rounded-lg border shrink-0 ${
                      isAtRisk ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-teal-50 border-teal-100 text-teal-700'
                    } text-[10px] font-black uppercase tracking-widest flex items-center gap-1`}>
                      {isAtRisk ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
                      {isAtRisk ? 'В зоне риска' : 'В норме'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border ${p.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : p.status === 'at_risk' ? 'bg-red-50 text-red-700 border-red-100' : p.status === 'active' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                      {statusMap[p.status] || p.status}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border truncate max-w-[150px] ${getStageBadgeClass(p.stage)}`}>{getStageLabel(p.stage)}</span>
                    {p.projectUrl && (
                      <a href={p.projectUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-auto text-[10px] text-blue-500 font-bold hover:underline flex items-center gap-0.5 whitespace-nowrap bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg min-h-[30px]">
                        <ExternalLink size={10} /> Ссылка
                      </a>
                    )}
                  </div>
                </div>

                <hr className="border-gray-100" />

                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-mono">Заказчики</p>
                    <p className="font-semibold text-gray-800 mt-0.5 truncate">{formatValue(p.sponsor)}</p>
                  </div>

                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-mono">Руководитель</p>
                    <p className="font-semibold text-gray-800 mt-0.5 truncate">{formatValue(p.projectManager || p.executor)}</p>
                  </div>

                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-mono">Владелец</p>
                    <p className="font-semibold text-gray-800 mt-0.5 truncate">{formatValue(p.projectOwner || p.owner)}</p>
                  </div>

                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-mono">Приоритет</p>
                    <p className="font-bold text-gray-900 mt-0.5">
                      {p.priority !== null && p.priority !== undefined ? p.priority : "Не заполнено"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-mono">Дата начала</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{formatDateValue(p.startDate)}</p>
                  </div>

                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-mono">Дата завершения / срок</p>
                    <p className={`font-bold mt-0.5 ${p.deadlineAt && (new Date() > (parseDateSafe(p.deadlineAt) || new Date('2099-01-01'))) && p.status !== 'completed' ? 'text-red-500' : 'text-gray-900'}`}>
                      {formatDateValue(p.deadlineAt || p.endDate)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-mono">Департамент</p>
                    <p className="font-semibold text-gray-800 mt-0.5 truncate">{formatValue(p.department)}</p>
                  </div>

                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-mono mb-1">Статус ПК</p>
                    <PcStatusCell project={p} evaluation={getEvaluationByProjectId(projectEvaluations, p.projectId)} assessmentDate={assessmentDate} />
                    <div className="hidden">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${(() => {
                        const cellPc = getRegistryPcStatusView(p, getEvaluationByProjectId(projectEvaluations, p.projectId), assessmentDate || '');
                        return cellPc === 'Своевременно' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : cellPc === 'Просрочен' ? 'bg-red-50 text-red-700 border border-red-100' : cellPc === 'Не применяется' ? 'bg-gray-50 text-gray-600 border border-gray-200' : 'bg-orange-50 text-orange-700 border border-orange-100';
                      })()}`}>
                        {(() => {
                          const cellPc = getRegistryPcStatusView(p, getEvaluationByProjectId(projectEvaluations, p.projectId), assessmentDate || '');
                          return cellPc === 'Своевременно' ? <Activity size={8} /> : cellPc === 'Просрочен' ? <AlertTriangle size={8} /> : <Info size={8} />;
                        })()}
                        {getRegistryPcStatusView(p, getEvaluationByProjectId(projectEvaluations, p.projectId), assessmentDate || '') || 'Нет данных'}
                      </span>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest font-mono mb-1">Зона риска</p>
                    <ProjectStatusCell project={p} evaluation={getEvaluationByProjectId(projectEvaluations, p.projectId)} assessmentDate={assessmentDate} />
                    {(() => {
                      const reasons = getRegistryRiskReasons(p, projectEvaluations, assessmentDate || new Date().toISOString().split('T')[0]);
                      return reasons && reasons.length > 0 && (
                        <p className="hidden">
                          <span className="font-bold text-gray-600">Причина:</span> {reasons.join(', ')}
                        </p>
                      );
                    })()}
                  </div>
                </div>

                <hr className="border-gray-100" />

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">Процент выполнения по вехам</span>
                        <span className="font-black text-gray-900">{hasMilestonesData ? `${Math.round(milestoneProgressVal)}%` : 'Нет данных'}</span>
                      </div>
                      {hasMilestonesData && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                            <div className="h-full bg-blue-500" style={{width: `${Math.min(100, Math.max(0, milestoneProgressVal))}%`}}></div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">Процент выполнения по показателям</span>
                        <span className="font-black text-gray-900">{kpiProgressVal !== null ? `${Math.round(kpiProgressVal)}%` : 'Нет данных'}</span>
                      </div>
                      {kpiProgressVal !== null ? (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                            <div className="h-full bg-emerald-500" style={{width: `${Math.min(100, Math.max(0, kpiProgressVal))}%`}}></div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {p.lastAnalysis && (
                    <p className="text-[9px] text-emerald-600 bg-emerald-50/50 border border-emerald-100 py-1.5 px-2.5 rounded-xl font-bold uppercase tracking-wider text-center flex items-center justify-center gap-1.5">
                      <CheckCircle2 size={10} /> ИИ Экспресс-анализ выполнен
                    </p>
                  )}

                  <button 
                    onClick={() => onSelectProject(p.projectId)}
                    className="w-full bg-[#010101] text-white py-3.5 text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-colors rounded-xl cursor-pointer flex items-center justify-center gap-1 min-h-[44px]"
                  >
                    Открыть анализ
                  </button>
                </div>
              );
            })}

            {sortedProjects.length === 0 && (
              <div className="py-16 text-center bg-white rounded-3xl border border-gray-100 p-6 flex flex-col items-center justify-center gap-4 text-gray-400">
                <FilterX size={44} className="opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest text-[#011]">Проекты не найдены</p>
                <button onClick={() => {
                  resetFilters();
                  setFilters({
                    search: '', status: 'all', stage: 'all', executor: 'all', department: 'all',
                    owner: 'all', pcStatus: 'all', generalStatus: 'all', 
                    quarter: 'all', hasIndicators: 'all', atRiskAny: 'all' 
                  });
                }} className="mt-2 text-xs font-black text-blue-500 hover:text-blue-600 uppercase tracking-widest min-h-[44px] px-6 py-2 border border-blue-100 rounded-xl bg-blue-50/30">Сбросить все фильтры</button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar relative">
          <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 font-mono">
                {visibleColumns.includes('projectName') && (
                  <th className={`${headerPaddingClass} ${nameColWidthClass}`} onClick={() => handleSort('projectName')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('projectName', 'Название проекта', 'Проект')} <SortIcon column="projectName" /></div>
                  </th>
                )}
                {visibleColumns.includes('sponsor') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('sponsor')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('sponsor', 'Заказчики', 'Зак')} <SortIcon column="sponsor" /></div>
                  </th>
                )}
                {visibleColumns.includes('projectManager') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('projectManager')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('projectManager', 'Руководитель проекта', 'РП')} <SortIcon column="projectManager" /></div>
                  </th>
                )}
                {visibleColumns.includes('projectOwner') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('projectOwner')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('projectOwner', 'Владелец проекта', 'ВП')} <SortIcon column="projectOwner" /></div>
                  </th>
                )}
                {visibleColumns.includes('priority') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('priority')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('priority', 'Приоритет', 'Приор')} <SortIcon column="priority" /></div>
                  </th>
                )}
                {visibleColumns.includes('startDate') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('startDate')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('startDate', 'Дата начала', 'Нач')} <SortIcon column="startDate" /></div>
                  </th>
                )}
                {visibleColumns.includes('deadlineAt') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('deadlineAt')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('deadlineAt', 'Дата завершения', 'Зав')} <SortIcon column="deadlineAt" /></div>
                  </th>
                )}
                {visibleColumns.includes('stage') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('stage')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('stage', 'Стадия', 'Стадия')} <SortIcon column="stage" /></div>
                  </th>
                )}
                {visibleColumns.includes('department') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('department')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('department', 'Департамент', 'Деп')} <SortIcon column="department" /></div>
                  </th>
                )}
                {visibleColumns.includes('pcStatus') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('pcStatus')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('pcStatus', 'Статус ПК', 'ПК')} <SortIcon column="pcStatus" /></div>
                  </th>
                )}
                {visibleColumns.includes('projectStatus') && (
                  <th 
                    className={headerPaddingClass} 
                    onClick={() => handleSort('projectStatus')}
                    title="Зона риска объединяет общий статус, расчетный уровень риска и ключевые факторы"
                  >
                    <div className="flex items-center gap-1.5 font-black text-[#010101]">{renderHeader('projectStatus', 'Зона риска', 'Зона')} <SortIcon column="projectStatus" /></div>
                  </th>
                )}
                {visibleColumns.includes('riskLevel') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('riskLevel')}>
                    <div className="flex items-center gap-1.5 font-black">{renderHeader('riskLevel', 'Уровень риска', 'Риск')} <SortIcon column="riskLevel" /></div>
                  </th>
                )}
                {visibleColumns.includes('tasksProgress') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('tasksProgress')}>
                    <div className="flex items-center gap-1.5 font-black" title="Прогресс вех за текущий квартал относительно даты оценки">{renderHeader('tasksProgress', 'Выполнение по вехам (текущий квартал)', 'Вехи Q%')} <SortIcon column="tasksProgress" /></div>
                  </th>
                )}
                {visibleColumns.includes('kpisProgress') && (
                  <th className={headerPaddingClass} onClick={() => handleSort('kpisProgress')}>
                    <div className="flex items-center gap-1.5 font-black" title="Показатели за текущий квартал относительно даты оценки">{renderHeader('kpisProgress', 'Выполнение по показателям (текущий квартал)', 'Показ Q%')} <SortIcon column="kpisProgress" /></div>
                  </th>
                )}
                {visibleColumns.includes('action') && (
                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
                    {isUltraCompact ? 'Действ' : 'Действие'}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedProjects.map((p) => {
                return (
                  <tr key={p.projectId} className="hover:bg-gray-50/50 transition-colors group">
                    {visibleColumns.includes('projectName') && (
                      <td className={`${cellPaddingClass} align-middle ${nameColWidthClass} whitespace-normal`} title={p.projectName}>
                        <div className="flex flex-col gap-0.5">
                          <span className={`font-extrabold text-[#010101] ${isUltraCompact ? 'text-[10px] line-clamp-1' : isCompact ? 'text-[11px] line-clamp-2' : 'text-sm line-clamp-2'} leading-snug break-words hover:line-clamp-none transition-all duration-200`}>
                            {renderTextTruncated(p.projectName, isUltraCompact ? 25 : 80)}
                          </span>
                          {!isUltraCompact && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-mono text-gray-400">
                                ID: {p.projectId}
                              </span>
                              {p.projectUrl && (
                                <a href={p.projectUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-0.5 text-gray-400 hover:text-blue-500 transition-colors">
                                  <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('sponsor') && (
                      <td className={`${cellPaddingClass} align-middle text-gray-700 font-medium`}>
                        {renderCellWithTruncation(p.sponsor, 'sponsor')}
                      </td>
                    )}
                    {visibleColumns.includes('projectManager') && (
                      <td className={`${cellPaddingClass} align-middle text-gray-700 font-medium`}>
                        {renderCellWithTruncation(p.projectManager || p.executor, 'projectManager')}
                      </td>
                    )}
                    {visibleColumns.includes('projectOwner') && (
                      <td className={`${cellPaddingClass} align-middle text-gray-700 font-medium`}>
                        {renderCellWithTruncation(p.projectOwner || p.owner, 'projectOwner')}
                      </td>
                    )}
                    {visibleColumns.includes('priority') && (
                      <td className={`${cellPaddingClass} align-middle text-gray-700 font-bold`}>
                        {isUltraCompact ? (
                          <span className="inline-flex items-center justify-center font-bold px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[9px] border border-stone-200">
                            {p.priority !== null && p.priority !== undefined ? p.priority : "-"}
                          </span>
                        ) : (
                          p.priority !== null && p.priority !== undefined ? p.priority : "Не заполнено"
                        )}
                      </td>
                    )}
                    {visibleColumns.includes('startDate') && (
                      <td className={`${cellPaddingClass} align-middle text-gray-600 font-bold whitespace-nowrap`}>
                        {formatDateValue(p.startDate)}
                      </td>
                    )}
                    {visibleColumns.includes('deadlineAt') && (
                      <td className={`${cellPaddingClass} align-middle font-bold whitespace-nowrap ${isProjectDeadlineOverdue(p, assessmentDate) ? 'text-red-500' : 'text-gray-900'}`}>
                        {formatDateValue(p.deadlineAt || p.endDate)}
                      </td>
                    )}
                    {visibleColumns.includes('stage') && (
                      <td className={`${cellPaddingClass} align-middle`}>
                        <span className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded-md text-[9.5px] border max-w-full truncate ${getStageBadgeClass(p.stage)}`} title={getStageLabel(p.stage)}>
                          {getStageLabel(p.stage)}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes('department') && (
                      <td className={`${cellPaddingClass} align-middle text-gray-500`}>
                        {renderCellWithTruncation(p.department, 'department')}
                      </td>
                    )}
                    {visibleColumns.includes('pcStatus') && (
                      <td className={`${cellPaddingClass} align-middle`}>
                        <PcStatusCell project={p} evaluation={getEvaluationByProjectId(projectEvaluations, p.projectId)} assessmentDate={assessmentDate} isUltraCompact={isUltraCompact} isCompact={isCompact} />
                      </td>
                    )}
                    {visibleColumns.includes('projectStatus') && (
                      <td className={`${cellPaddingClass} align-middle`}>
                        <ProjectStatusCell project={p} evaluation={getEvaluationByProjectId(projectEvaluations, p.projectId)} assessmentDate={assessmentDate} isUltraCompact={isUltraCompact} isCompact={isCompact} />
                      </td>
                    )}
                    {visibleColumns.includes('riskLevel') && (
                      <td className={`${cellPaddingClass} align-middle`}>
                        <RiskLevelCell project={p} evaluation={getEvaluationByProjectId(projectEvaluations, p.projectId)} assessmentDate={assessmentDate} isUltraCompact={isUltraCompact} isCompact={isCompact} />
                      </td>
                    )}
                    {visibleColumns.includes('tasksProgress') && (
                      <td className={`${cellPaddingClass} align-middle font-sans`}>
                        {renderProgressCell(getCurrentQuarterMilestoneMetrics(p, projectEvaluations, assessmentDate), 'milestone')}
                      </td>
                    )}
                    {visibleColumns.includes('kpisProgress') && (
                      <td className={`${cellPaddingClass} align-middle font-sans`}>
                        {renderProgressCell(getCurrentQuarterKpiMetrics(p, projectEvaluations, assessmentDate), 'indicator')}
                      </td>
                    )}
                    {visibleColumns.includes('action') && (
                      <td className={`${cellPaddingClass} align-middle text-center w-24 border-l border-gray-50 font-sans`}>
                        <button 
                          onClick={() => onSelectProject(p.projectId)}
                          className="w-full bg-[#010101] text-white px-2 py-1 text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors rounded-lg cursor-pointer flex items-center justify-center gap-0.5 whitespace-nowrap min-h-[30px]"
                        >
                          {isUltraCompact ? 'Анализ' : 'Открыть анализ'}
                        </button>
                        {!isUltraCompact && p.lastAnalysis && (
                          <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest text-center mt-1 flex items-center justify-center gap-1">
                            <CheckCircle2 size={8} /> Проанализирован
                          </p>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {sortedProjects.length === 0 && (
                <tr>
                   <td colSpan={visibleColumns.length} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-gray-400">
                      <FilterX size={48} className="opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Проекты не найдены</p>
                      <button onClick={() => {
                        resetFilters();
                        setFilters({
                          search: '', status: 'all', stage: 'all', executor: 'all', department: 'all',
                          owner: 'all', pcStatus: 'all', generalStatus: 'all', 
                          quarter: 'all', hasIndicators: 'all', atRiskAny: 'all' 
                        });
                      }} className="mt-2 text-xs font-bold text-blue-500 hover:text-blue-600 uppercase tracking-widest">Сбросить все фильтры</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
