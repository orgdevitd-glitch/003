/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  RefreshCw, 
  Loader2, 
  AlertTriangle,
  LayoutDashboard,
  ListTodo,
  Map as LucideMap,
  Download,
  ArrowLeft,
  FileText,
  CheckCircle,
  Info,
  X
} from 'lucide-react';
import { 
  Project, 
  Stats, 
  NormalizedProject, 
  ImportValidationReport, 
  ProjectEvaluation, 
  PortfolioEvaluation 
} from './types';
import { getEvaluationByProjectId } from './utils/evaluationUtils';
import { Overview } from './components/Overview';
import { ProjectTable } from './components/ProjectTable';
import { Roadmap } from './components/Roadmap';
import { ProjectCard } from './components/ProjectCard';
import { Login } from './components/Login';
import { LogOut } from 'lucide-react';
import { useAdvancedAccess } from './components/AdvancedAccessContext';
import { exportPortfolioToPDF } from './utils/pdfExport';
import { buildExcelExportData } from './utils/projectTableExportData';
import { ChatAssistantWidget } from './components/ChatAssistantWidget';
import { parseDateSafe, formatDateSafe } from './utils/dateUtils';
import {
  getRegistryPcStatusView,
  getRegistryRiskView,
  getRegistryProjectStatusView
} from './utils/projectRegistryStatus';
import { 
  getRegistryMilestoneProgress, 
  getRegistryKpiProgress,
  getRegistryMonitoringStatus,
  getRegistryHealthStatus,
  getRegistryDataQuality,
  getRegistryRiskReasons,
  getRegistryMilestoneMetrics,
  getRegistryKpiMetrics,
  getCurrentQuarterMilestoneProgress,
  getCurrentQuarterKpiProgress
} from './utils/projectRegistryMetrics';
import { matchProjectStage } from './utils/projectTableFilters';
import { setIndicatorDictionary } from '../server/services/indicatorDictionary';

export default function App() {
  const { requireAdvancedAccess } = useAdvancedAccess();
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(80);

  useEffect(() => {
    if (!headerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderHeight(entry.target.getBoundingClientRect().height);
      }
    });
    resizeObserver.observe(headerRef.current);
    setHeaderHeight(headerRef.current.getBoundingClientRect().height);
    return () => resizeObserver.disconnect();
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isManualSync, setIsManualSync] = useState(false);
  const [exportingPortfolioPdf, setExportingPortfolioPdf] = useState(false);
  const [portfolioPdfError, setPortfolioPdfError] = useState<string | null>(null);
  const [syncNotification, setSyncNotification] = useState<{
    message: string;
    type: "success" | "warning" | "info";
  } | null>(null);
  const [dataSource, setDataSource] = useState<any>(null);
  const [assessmentMode, setAssessmentMode] = useState<'today' | 'custom'>('today');

  const [customAssessmentDate, setCustomAssessmentDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('pm_assessment_custom_date');
      if (saved && !isNaN(Date.parse(saved))) {
        return saved;
      }
    } catch (e) {
      // ignore
    }
    // Default fallback to local today YYYY-MM-DD
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [draftAssessmentDate, setDraftAssessmentDate] = useState<string>(customAssessmentDate);

  // Keep draft date in sync with applied custom date if it changes externally
  useEffect(() => {
    setDraftAssessmentDate(customAssessmentDate);
  }, [customAssessmentDate]);

  const assessmentDateStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    if (assessmentMode === 'today') {
      return todayStr;
    }
    return customAssessmentDate;
  }, [assessmentMode, customAssessmentDate]);

  const getQuarterFromDate = (date: Date): number => {
    const month = date.getMonth();
    if (month < 3) return 1;
    if (month < 6) return 2;
    if (month < 9) return 3;
    return 4;
  };

  const getQuarterFromDateString = (dateStr?: string): number => {
    const parsed = dateStr ? parseDateSafe(dateStr) : null;
    return getQuarterFromDate(parsed ?? new Date());
  };

  const [overviewSelectedYear, setOverviewSelectedYear] = useState<number | null>(null);
  const [overviewSelectedQuarter, setOverviewSelectedQuarter] = useState<number>(() =>
    getQuarterFromDateString(assessmentDateStr)
  );

  const [normalizedProjects, setNormalizedProjects] = useState<NormalizedProject[]>([]);
  const [importReport, setImportReport] = useState<ImportValidationReport | null>(null);
  const [projectEvaluations, setProjectEvaluations] = useState<ProjectEvaluation[]>([]);
  const [portfolioEvaluation, setPortfolioEvaluation] = useState<PortfolioEvaluation | null>(null);

  // Synchronize assessment variables to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('pm_assessment_mode', assessmentMode);
      localStorage.setItem('pm_assessment_custom_date', customAssessmentDate);
    } catch (e) {
      // ignore
    }
  }, [assessmentMode, customAssessmentDate, assessmentDateStr]);

  const [filters, setFilters] = useState<any>({
    search: '',
    sponsors: [],          // Заказчики
    projectOwners: [],     // Владелец проекта
    projectManagers: [],   // Руководитель проекта
    departments: [],       // Подразделение
    priorities: [],        // Приоритет
    pcStatuses: [],        // Статус ПК

    // Additional Filters
    responsibles: [],      // Ответственный
    projectAdmins: [],     // Администратор проекта
    stages: [],            // Стадия
    projectTypes: [],      // Вид
    generalStatuses: [],   // Общий статус
    risks: [],             // Риск

    // Dates
    startDateFrom: '',
    startDateTo: '',
    startDateEmpty: false,
    endDateFrom: '',
    endDateTo: '',
    endDateEmpty: false,
    lastPcDateFrom: '',
    lastPcDateTo: '',
    lastPcDateEmpty: false,

    // Ranges for progress %
    tasksProgressMin: '',
    tasksProgressMax: '',
    kpisProgressMin: '',
    kpisProgressMax: '',
  });

  // 1. Check Authenticated on Mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/check', { credentials: 'include' });
        const data = await response.json();
        setIsAuthenticated(!!data.authenticated);
      } catch (err) {
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    checkAuthStatus();
  }, []);

  // Chat history can contain project-sensitive context and must not survive an
  // authentication boundary on shared browsers.
  useEffect(() => {
    if (isAuthenticated === false) {
      sessionStorage.removeItem('chat_assistant_messages');
      sessionStorage.removeItem('chat_assistant_thread_id');
    }
  }, [isAuthenticated]);

  // Check and restore custom mode if advanced access is active on mount
  useEffect(() => {
    if (isAuthenticated !== true) return;

    const restoreCustomModeIfAuthorized = async () => {
      try {
        const savedMode = localStorage.getItem('pm_assessment_mode');
        if (savedMode === 'custom') {
          const res = await fetch("/api/advanced-access/status");
          const data = await res.json();
          if (data.success && data.active) {
            setAssessmentMode('custom');
          } else {
            localStorage.setItem('pm_assessment_mode', 'today');
          }
        }
      } catch (err) {
        console.error("Failed to restore custom assessment mode:", err);
      }
    };

    restoreCustomModeIfAuthorized();
  }, [isAuthenticated]);

  // 2. Fetch Projects only when Authenticated
  useEffect(() => {
    if (isAuthenticated !== true) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      setLoading(true);
      try {
        const urlParams = new URLSearchParams();
        urlParams.append('_ts', Date.now().toString());

        if (assessmentMode === "custom" && customAssessmentDate) {
          urlParams.append("assessmentDate", customAssessmentDate);
          urlParams.append("assessmentMode", "custom");
        }

        if (isManualSync) {
          urlParams.append('sync', 'true');
        }
        const response = await fetch(`/api/projects?${urlParams.toString()}`, { 
          credentials: 'include',
          cache: 'no-store'
        });
        if (response.status === 401) {
          setIsAuthenticated(false);
          return;
        }
        if (response.status === 403) {
          setAssessmentMode('today');
          try {
            localStorage.setItem('pm_assessment_mode', 'today');
          } catch (e) {}
          setSyncNotification({
            message: "Действие требует расширенного доступа. Режим даты сброшен на 'Сегодня'.",
            type: "warning"
          });
          setRefreshTrigger(prev => prev + 1);
          setLoading(false);
          setIsManualSync(false);
          return;
        }
        if (!response.ok) throw new Error('Не удалось загрузить данные из системы');
        const data = await response.json();
        if (data.success) {
          if (data.indicatorDictionary) {
            setIndicatorDictionary(data.indicatorDictionary);
          }
          setProjects(data.projects);
          setStats(data.stats);
          setDataSource(data.dataSource || null);
          setNormalizedProjects(data.normalizedProjects || []);
          setImportReport(data.importReport || null);
          setProjectEvaluations(data.projectEvaluations || []);
          setPortfolioEvaluation(data.portfolioEvaluation || null);

          // If a selected project no longer exists in current items, return to view and notify
          if (selectedProjectId && !data.projects.some((p: any) => p.projectId === selectedProjectId)) {
            setSelectedProjectId(null);
            setSyncNotification({
              message: "Текущий выбранный проект больше не найден в системе и был закрыт.",
              type: "warning"
            });
          } else if (data.warning) {
            if (isManualSync) {
              setSyncNotification({
                message: data.warning,
                type: data.dataSource?.mode === "fallback" ? "info" : "warning"
              });
            } else {
              setSyncNotification(null);
            }
          } else if (data.sync) {
            setSyncNotification(null);
          } else {
            setSyncNotification(null);
          }
        } else {
          throw new Error(data.error || 'Ошибка загрузки');
        }
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
        setIsManualSync(false);
      }
    };
    fetchData();
  }, [refreshTrigger, isAuthenticated, assessmentDateStr]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      // ignore
    }
    setIsAuthenticated(false);
    setProjects([]);
    setStats(null);
    setSelectedProjectId(null);
  };

  const handleRefresh = () => {
    requireAdvancedAccess("syncData", () => {
      setIsManualSync(true);
      setLastRefreshed(new Date());
      setRefreshTrigger(prev => prev + 1);
    });
  };

  const handleExportExcel = () => {
    requireAdvancedAccess("exportData", () => {
      const savedVisibleColumns = localStorage.getItem('visible_columns_v1');
      const { headers, rows } = buildExcelExportData(
        filteredProjects,
        projectEvaluations,
        assessmentDateStr,
        savedVisibleColumns
      );

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Projects Portfolio");
      XLSX.writeFile(wb, `portfolio_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    });
  };

  const getRoadmapProjectsInput = (allProjects: Project[]): Project[] => {
    return allProjects;
  };

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      // 1. Text Search
      if (filters.search) {
        const term = filters.search.toLowerCase();
        const matchesName = p.projectName.toLowerCase().includes(term);
        const matchesExecutor = (p.executor || '').toLowerCase().includes(term);
        const matchesManager = (p.projectManager || '').toLowerCase().includes(term);
        const matchesDescription = (p.projectDescription || '').toLowerCase().includes(term);
        if (!matchesName && !matchesExecutor && !matchesManager && !matchesDescription) return false;
      }

      // 2. Roles (Multi-select)
      // Заказчики
      if (filters.sponsors && filters.sponsors.length > 0) {
        const val = p.sponsor;
        const isEmpty = !val || val.trim() === "" || val.trim().toLowerCase() === "nan";
        const matched = filters.sponsors.some((sel: string) => {
          if (sel === "Не заполнено") return isEmpty;
          if (isEmpty) return false;
          return val.trim().toLowerCase() === sel.trim().toLowerCase();
        });
        if (!matched) return false;
      }

      // Владелец проекта
      if (filters.projectOwners && filters.projectOwners.length > 0) {
        const val = p.projectOwner || p.owner;
        const isEmpty = !val || val.trim() === "" || val.trim().toLowerCase() === "nan";
        const matched = filters.projectOwners.some((sel: string) => {
          if (sel === "Не заполнено") return isEmpty;
          if (isEmpty) return false;
          return val.trim().toLowerCase() === sel.trim().toLowerCase();
        });
        if (!matched) return false;
      }

      // Руководитель проекта
      if (filters.projectManagers && filters.projectManagers.length > 0) {
        const val = p.projectManager || p.executor;
        const isEmpty = !val || val.trim() === "" || val.trim().toLowerCase() === "nan";
        const matched = filters.projectManagers.some((sel: string) => {
          if (sel === "Не заполнено") return isEmpty;
          if (isEmpty) return false;
          return val.trim().toLowerCase() === sel.trim().toLowerCase();
        });
        if (!matched) return false;
      }

      // Ответственный
      if (filters.responsibles && filters.responsibles.length > 0) {
        const val = p.responsible;
        const isEmpty = !val || val.trim() === "" || val.trim().toLowerCase() === "nan";
        const matched = filters.responsibles.some((sel: string) => {
          if (sel === "Не заполнено") return isEmpty;
          if (isEmpty) return false;
          return val.trim().toLowerCase() === sel.trim().toLowerCase();
        });
        if (!matched) return false;
      }

      // Администратор проекта
      if (filters.projectAdmins && filters.projectAdmins.length > 0) {
        const val = p.projectAdmin;
        const isEmpty = !val || val.trim() === "" || val.trim().toLowerCase() === "nan";
        const matched = filters.projectAdmins.some((sel: string) => {
          if (sel === "Не заполнено") return isEmpty;
          if (isEmpty) return false;
          return val.trim().toLowerCase() === sel.trim().toLowerCase();
        });
        if (!matched) return false;
      }

      // Команда проекта (split by comma/semicolon)
      if (filters.projectTeams && filters.projectTeams.length > 0) {
        const val = p.projectTeam;
        const isEmpty = !val || val.trim() === "" || val.trim().toLowerCase() === "nan";
        
        if (isEmpty) {
          if (!filters.projectTeams.includes("Не заполнено")) return false;
        } else {
          const members = val.split(/[;,]/).map(m => m.trim().toLowerCase()).filter(Boolean);
          const matched = filters.projectTeams.some((sel: string) => {
            if (sel === "Не заполнено") return false;
            return members.some((m: string) => m.includes(sel.toLowerCase()));
          });
          if (!matched) return false;
        }
      }

      // 3. Organizational Filters
      // Подразделение (split by semicolon)
      if (filters.departments && filters.departments.length > 0) {
        const val = p.department;
        const isEmpty = !val || val.trim() === "" || val.trim().toLowerCase() === "nan";
        
        if (isEmpty) {
          if (!filters.departments.includes("Не заполнено")) return false;
        } else {
          const depts = val.split(";").map(d => d.trim().toLowerCase()).filter(Boolean);
          const matched = filters.departments.some((sel: string) => {
            if (sel === "Не заполнено") return false;
            return depts.includes(sel.toLowerCase());
          });
          if (!matched) return false;
        }
      }

      // Вид
      if (filters.projectTypes && filters.projectTypes.length > 0) {
        const val = p.projectType;
        const isEmpty = !val || val.trim() === "" || val.trim().toLowerCase() === "nan";
        const matched = filters.projectTypes.some((sel: string) => {
          if (sel === "Не заполнено") return isEmpty;
          if (isEmpty) return false;
          return val.trim().toLowerCase() === sel.trim().toLowerCase();
        });
        if (!matched) return false;
      }

      // Стадия
      if (filters.stages && filters.stages.length > 0) {
        if (!matchProjectStage(p, filters.stages)) return false;
      }

      // Приоритет
      if (filters.priorities && filters.priorities.length > 0) {
        const val = p.priority === null || p.priority === undefined ? null : String(p.priority);
        const isEmpty = val === null;
        const matched = filters.priorities.some((sel: string) => {
          if (sel === "Не заполнено") return isEmpty;
          if (isEmpty) return false;
          return val === sel;
        });
        if (!matched) return false;
      }

      // 4. Monitoring
      // Статус ПК
      if (filters.pcStatuses && filters.pcStatuses.length > 0) {
        const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
        const val = getRegistryPcStatusView(p, ev, assessmentDateStr);
        const isEmpty = val === "Недостаточно данных";
        const matched = filters.pcStatuses.some((sel: string) => {
          if (sel === "Не заполнено" || sel === "Недостаточно данных") {
            return isEmpty;
          }
          return val.trim().toLowerCase() === sel.trim().toLowerCase();
        });
        if (!matched) return false;
      }

      // 5. Calculated Filters
      // Зона риска (overallStatus)
      if (filters.generalStatuses && filters.generalStatuses.length > 0) {
        const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
        const val = getRegistryProjectStatusView(p, ev, assessmentDateStr);
        const isEmpty = val === "Недостаточно данных";
        const matched = filters.generalStatuses.some((sel: string) => {
          if (sel === "Не заполнено" || sel === "Недостаточно данных") {
            return isEmpty;
          }
          const cleanSel = sel.trim().toLowerCase();
          if (cleanSel === 'под наблюдением' || cleanSel === 'требует внимания' || cleanSel === 'зона риска') {
            return val === 'Зона риска';
          }
          return val.trim().toLowerCase() === cleanSel;
        });
        if (!matched) return false;
      }

      // Уровень риска
      if (filters.risks && filters.risks.length > 0) {
        const ev = getEvaluationByProjectId(projectEvaluations, p.projectId);
        const val = getRegistryRiskView(p, ev, assessmentDateStr);
        const matched = filters.risks.some((sel: string) => {
          return val.trim().toLowerCase() === sel.trim().toLowerCase();
        });
        if (!matched) return false;
      }

      // 6. Dates Period (от / до)
      const matchesDateRange = (dateStr: string | undefined | null, fromStr: string, toStr: string) => {
        if (!fromStr && !toStr) return true;
        if (!dateStr || dateStr.trim().toLowerCase() === "nan") return false;
        const d = parseDateSafe(dateStr);
        if (!d) return false;
        if (fromStr) {
          const fromDate = new Date(fromStr);
          fromDate.setHours(0,0,0,0);
          if (d < fromDate) return false;
        }
        if (toStr) {
          const toDate = new Date(toStr);
          toDate.setHours(23,59,59,999);
          if (d > toDate) return false;
        }
        return true;
      };

      const isDateEmpty = (dateStr: string | undefined | null) => {
        return !dateStr || dateStr.trim() === "" || dateStr.trim().toLowerCase() === "nan";
      };

      if (filters.startDateEmpty) {
        if (!isDateEmpty(p.startDate)) return false;
      } else {
        if (!matchesDateRange(p.startDate, filters.startDateFrom, filters.startDateTo)) return false;
      }

      const endD = p.deadlineAt || p.endDate;
      if (filters.endDateEmpty) {
        if (!isDateEmpty(endD)) return false;
      } else {
        if (!matchesDateRange(endD, filters.endDateFrom, filters.endDateTo)) return false;
      }

      if (filters.lastPcDateEmpty) {
        if (!isDateEmpty(p.lastPcDate)) return false;
      } else {
        if (!matchesDateRange(p.lastPcDate, filters.lastPcDateFrom, filters.lastPcDateTo)) return false;
      }

      // 7. Ranges for completion
      // Процент выполнения по вехам
      const tasksPct = getCurrentQuarterMilestoneProgress(p, projectEvaluations, assessmentDateStr);
      if (tasksPct !== null) {
        if (filters.tasksProgressMin !== "" && tasksPct < parseFloat(filters.tasksProgressMin)) return false;
        if (filters.tasksProgressMax !== "" && tasksPct > parseFloat(filters.tasksProgressMax)) return false;
      } else {
        if (filters.tasksProgressMin !== "" || filters.tasksProgressMax !== "") return false;
      }

      // Процент выполнения по показателям (kpiProgress)
      const kpisPct = getCurrentQuarterKpiProgress(p, projectEvaluations, assessmentDateStr);
      if (kpisPct === null) {
        if (filters.kpisProgressMin !== "" || filters.kpisProgressMax !== "") return false;
      } else {
        if (filters.kpisProgressMin !== "" && kpisPct < parseFloat(filters.kpisProgressMin)) return false;
        if (filters.kpisProgressMax !== "" && kpisPct > parseFloat(filters.kpisProgressMax)) return false;
      }

      return true;
    });
  }, [projects, filters, projectEvaluations, assessmentDateStr]);

  const handleExportPortfolioPDF = async () => {
    requireAdvancedAccess("exportPdf", async () => {
      setExportingPortfolioPdf(true);
      setPortfolioPdfError(null);
      try {
        await exportPortfolioToPDF(filteredProjects, stats, projectEvaluations, assessmentDateStr, {
          selectedYear: overviewSelectedYear || undefined,
          selectedQuarter: overviewSelectedQuarter,
        });
      } catch (err: any) {
        setPortfolioPdfError(`Не удалось сформировать PDF портфеля: ${err.message || String(err)}`);
      } finally {
        setExportingPortfolioPdf(false);
      }
    });
  };

  const selectedProject = useMemo(() => {
    return projects.find(p => p.projectId === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  if (isCheckingAuth || isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center flex-col gap-6">
        <div className="relative">
          <Loader2 className="animate-spin text-[#010101]" size={64} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#FBDF4B] rounded-lg border border-black/10 flex items-center justify-center overflow-hidden">
            <div className="w-6 h-6 border-[1.5px] border-black rounded-full flex items-center justify-center">
              <span className="text-black font-black text-[8px] tracking-tight">AI</span>
            </div>
          </div>
        </div>
        <p className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 animate-pulse">Проверка авторизации...</p>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center flex-col gap-6">
        <div className="relative">
          <Loader2 className="animate-spin text-[#010101]" size={64} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#FBDF4B] rounded-lg border border-black/10 flex items-center justify-center overflow-hidden">
            <div className="w-6 h-6 border-[1.5px] border-black rounded-full flex items-center justify-center">
              <span className="text-black font-black text-[8px] tracking-tight">AI</span>
            </div>
          </div>
        </div>
        <p className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 animate-pulse font-mono">Анализ проектов AI 2.0</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center flex-col gap-6 p-12 text-center">
        <div className="p-8 bg-red-50 rounded-full">
          <AlertTriangle className="text-red-500" size={64} />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-black uppercase tracking-tight text-gray-900 mb-2">Обнаружен сбой системы</h2>
          <p className="text-sm text-gray-500 font-medium leading-relaxed mb-8">{error}</p>
          <button 
            onClick={handleRefresh}
            className="w-full bg-[#010101] text-white px-8 py-4 text-xs font-black uppercase tracking-[0.3em] hover:bg-gray-800 transition-all rounded-xl shadow-xl hover:shadow-2xl active:scale-95 text-center"
          >
            Восстановить соединение
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-[#011] selection:bg-[#F8BC03]/30">
      <header ref={headerRef} className="bg-white border-b border-gray-200 shadow-sm px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4 fixed top-0 left-0 right-0 z-[100] transition-all">
        <div className="flex items-center gap-3 w-full md:w-auto">
          {selectedProjectId ? (
            <button 
              onClick={() => setSelectedProjectId(null)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors interactive-button"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <div className="w-10 h-10 md:w-12 md:h-12 bg-[#FBDF4B] rounded-2xl flex items-center justify-center shadow-lg rotate-3 hover:rotate-0 transition-transform overflow-hidden border border-black/5">
              <div className="w-7 h-7 md:w-9 md:h-9 border-2 border-black rounded-full flex items-center justify-center">
                <span className="text-black font-black text-xs md:text-sm tracking-tighter">AI</span>
              </div>
            </div>
          )}
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tighter text-[#011] uppercase leading-none mb-1">
              Проектный Аналитик 2.0
            </h1>
            <p className="text-gray-400 text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] leading-none mt-0.5">
              Синхронизация: {lastRefreshed.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} • {lastRefreshed.toLocaleDateString('ru-RU')}
            </p>
          </div>
        </div>

        {!selectedProjectId && (
          <nav className="w-full md:w-auto flex-1 flex items-center justify-start md:justify-center gap-1.5 md:gap-2 overflow-x-auto whitespace-nowrap py-1 relative scrollbar-none print:hidden">
            {[
              { id: 'overview', label: 'Обзор портфеля', icon: LayoutDashboard },
              { id: 'analytics', label: 'Портфель проектов', icon: ListTodo },
              { id: 'roadmap', label: 'Дорожная карта', icon: LucideMap },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 md:px-6 md:py-3 text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all rounded-xl cursor-pointer shrink-0 ${
                  activeTab === tab.id 
                  ? 'bg-[#010101] text-[#F8BC03] shadow-lg md:scale-105' 
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-900 border border-transparent hover:border-gray-100 bg-gray-50/50'
                }`}
              >
                <tab.icon size={12} />
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        <div className="flex flex-wrap items-center justify-center md:justify-end gap-1.5 md:gap-3 w-full md:w-auto print:hidden">
          <div className="flex items-center gap-1.5 bg-white border border-gray-100 text-[#011] px-2.5 py-1.5 md:px-4 md:py-2.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest shadow-sm rounded-xl">
            <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider shrink-0 flex items-center gap-1">
              Дата оценки:
              <div className="relative group inline-block normal-case tracking-normal">
                <Info size={12} className="text-slate-400 hover:text-slate-600 cursor-help transition-colors" />
                <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute right-0 md:left-1/2 md:-translate-x-1/2 top-full mt-2 w-72 p-3 bg-slate-900 text-white text-[10px] md:text-xs font-normal rounded-xl shadow-xl z-[9999] border border-slate-800 pointer-events-none whitespace-normal">
                  Дата оценки определяет, на какой день дашборд проверяет просрочки мониторинга, актуальность кварталов, будущие факты показателей и состояние проектов. Отчетный квартал для операционного трека выбирается отдельно в блоке "Прогресс портфеля".
                  <div className="absolute bottom-full right-2 md:right-auto md:left-1/2 md:-translate-x-1/2 border-4 border-transparent border-b-slate-900" />
                </div>
              </div>
            </span>
            <select
              value={assessmentMode}
              onChange={(e) => {
                const val = e.target.value as 'today' | 'custom';
                if (val === 'custom') {
                  requireAdvancedAccess("assessmentDateChange", () => {
                    setAssessmentMode('custom');
                  });
                } else {
                  setAssessmentMode('today');
                }
              }}
              className="bg-transparent border-none text-[#011] font-black uppercase tracking-widest focus:outline-none focus:ring-0 cursor-pointer text-[9px] md:text-[10px] pr-5"
            >
              <option value="today" className="bg-white text-gray-800">Сегодня</option>
              <option value="custom" className="bg-white text-gray-800">Выбрать дату</option>
            </select>
            {assessmentMode === 'custom' && (
              <div className="flex items-center gap-1.5 border-l border-zinc-200 pl-2">
                <input
                  type="date"
                  value={draftAssessmentDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setDraftAssessmentDate(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draftAssessmentDate !== customAssessmentDate) {
                      requireAdvancedAccess("assessmentDateChange", () => {
                        setCustomAssessmentDate(draftAssessmentDate);
                      });
                    }
                  }}
                  className="bg-transparent text-[#011] font-black tracking-widest focus:outline-none focus:ring-0 cursor-pointer text-[9px] md:text-[10px] uppercase outline-none"
                />
                {draftAssessmentDate !== customAssessmentDate && (
                  <button
                    onClick={() => {
                      requireAdvancedAccess("assessmentDateChange", () => {
                        setCustomAssessmentDate(draftAssessmentDate);
                      });
                    }}
                    className="px-2 py-0.5 bg-[#010101] text-[#F8BC03] hover:bg-[#F8BC03] hover:text-[#010101] border border-transparent font-bold text-[9px] uppercase tracking-wider rounded-lg transition-all shadow-sm shrink-0 cursor-pointer"
                    title="Применить выбранную дату оценки"
                  >
                    Применить
                  </button>
                )}
              </div>
            )}
          </div>
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-1.5 bg-white border border-gray-100 text-[#011] px-3.5 py-2.5 md:px-5 md:py-3 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm rounded-xl cursor-pointer"
          >
            <RefreshCw size={12} /> Синхронизация
          </button>
          {!selectedProjectId && (
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-[#010101] text-white px-3.5 py-2.5 md:px-5 md:py-3 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl rounded-xl cursor-pointer"
            >
              <Download size={12} />  Экспорт
            </button>
          )}
          {!selectedProjectId && activeTab === 'overview' && (
            <button 
              onClick={handleExportPortfolioPDF}
              disabled={exportingPortfolioPdf}
              className="flex items-center gap-1.5 bg-[#FBDF4B] text-[#010101] px-3.5 py-2.5 md:px-5 md:py-3 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-[#F8BC03] transition-all shadow-xl rounded-xl cursor-pointer disabled:opacity-50"
              title="Экспорт PDF отчета по обзору портфеля"
            >
              {exportingPortfolioPdf ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FileText size={12} />
              )}
              <span>{exportingPortfolioPdf ? 'Формирование...' : 'Отчет PDF'}</span>
            </button>
          )}
          {portfolioPdfError && (
            <div className="text-red-500 text-[9px] md:text-[10px] font-black uppercase tracking-widest animate-pulse w-full text-center">{portfolioPdfError}</div>
          )}
          <button 
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-white border border-red-100 text-red-600 px-3.5 py-2.5 md:px-5 md:py-3 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:border-red-200 transition-all shadow-sm rounded-xl cursor-pointer"
            title="Выйти из системы"
          >
            <LogOut size={12} /> Выйти
          </button>
        </div>
      </header>

      <main 
        style={{ paddingTop: `calc(${headerHeight}px + 1.5rem)` }}
        className="flex-1 p-4 sm:p-6 md:p-10 space-y-6 md:space-y-8 bg-gray-50/30 w-full max-w-full"
      >
        {syncNotification && (
          <div className={`p-4 rounded-xl flex items-start gap-4 border shadow-sm transition-all duration-300 ${
            syncNotification.type === 'success' ? 'bg-emerald-50/70 border-emerald-100 text-emerald-900' 
            : syncNotification.type === 'warning' ? 'bg-amber-50/80 border-amber-200 text-amber-900'
            : 'bg-blue-50/70 border-blue-100 text-blue-900'
          }`}>
            <div className="shrink-0 mt-0.5">
              {syncNotification.type === 'success' && <CheckCircle className="text-emerald-600" size={18} />}
              {syncNotification.type === 'warning' && <AlertTriangle className="text-amber-600" size={18} />}
              {syncNotification.type === 'info' && <Info className="text-blue-600" size={18} />}
            </div>
            <div className="flex-1 text-[10px] md:text-xs font-black uppercase tracking-wider leading-relaxed flex items-center">
              <span className="flex-1">{syncNotification.message}</span>
            </div>
            <button 
              onClick={() => setSyncNotification(null)}
              className="p-1 hover:bg-black/5 rounded-lg transition-colors cursor-pointer text-gray-400 hover:text-gray-900 shrink-0"
              title="Закрыть"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {selectedProjectId && selectedProject ? (
          <ProjectCard 
            project={selectedProject} 
            onRefresh={handleRefresh} 
            evaluation={getEvaluationByProjectId(projectEvaluations, selectedProjectId)}
            assessmentDate={assessmentDateStr}
            assessmentDateMode={assessmentMode}
          />
        ) : (
          <>
            {activeTab === 'overview' && stats && (
              <Overview 
                stats={stats} 
                projects={projects} 
                portfolioEvaluation={portfolioEvaluation}
                importReport={importReport}
                assessmentDate={assessmentDateStr}
                projectEvaluations={projectEvaluations}
                selectedYearExternal={overviewSelectedYear}
                onSelectedYearChange={setOverviewSelectedYear}
                selectedQuarterExternal={overviewSelectedQuarter}
                onSelectedQuarterChange={setOverviewSelectedQuarter}
              />
            )}
            {activeTab === 'analytics' && (
              <ProjectTable 
                projects={projects}
                filteredProjects={filteredProjects}
                filters={filters} 
                setFilters={setFilters} 
                assessmentDate={assessmentDateStr}
                resetFilters={() => setFilters({ 
                  search: '',
                  sponsors: [],
                  projectOwners: [],
                  projectManagers: [],
                  departments: [],
                  priorities: [],
                  pcStatuses: [],
                  responsibles: [],
                  projectAdmins: [],
                  stages: [],
                  projectTypes: [],
                  generalStatuses: [],
                  risks: [],
                  startDateFrom: '',
                  startDateTo: '',
                  startDateEmpty: false,
                  endDateFrom: '',
                  endDateTo: '',
                  endDateEmpty: false,
                  lastPcDateFrom: '',
                  lastPcDateTo: '',
                  lastPcDateEmpty: false,
                  tasksProgressMin: '',
                  tasksProgressMax: '',
                  kpisProgressMin: '',
                  kpisProgressMax: '',
                })}
                onSelectProject={setSelectedProjectId}
                projectEvaluations={projectEvaluations}
              />
            )}
            {activeTab === 'roadmap' && (
              <Roadmap 
                projects={getRoadmapProjectsInput(projects)} 
                assessmentDate={assessmentDateStr} 
                headerHeight={headerHeight}
                projectEvaluations={projectEvaluations}
              />
            )}
          </>
        )}
      </main>

      <ChatAssistantWidget />
    </div>
  );
}
