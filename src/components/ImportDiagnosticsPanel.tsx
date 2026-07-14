import React, { useState, useMemo } from 'react';
import { AlertCircle, AlertTriangle, ChevronRight, ChevronDown, ListFilter, Trash2, Search, CheckCircle2 } from 'lucide-react';
import { ImportValidationReport, DataIssue } from '../types';
import { formatStatusLabel } from '../utils/evaluationUtils';

interface ImportDiagnosticsPanelProps {
  importReport: ImportValidationReport | null | undefined;
}

export const ImportDiagnosticsPanel: React.FC<ImportDiagnosticsPanelProps> = ({ importReport }) => {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const issues = importReport?.issues || [];

  // Filter issues
  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      const matchesSeverity = filterSeverity === 'all' || issue.severity === filterSeverity;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        issue.projectName?.toLowerCase().includes(q) ||
        issue.projectId?.toLowerCase().includes(q) ||
        issue.field?.toLowerCase().includes(q) ||
        issue.message?.toLowerCase().includes(q) ||
        issue.code?.toLowerCase().includes(q);
      
      return matchesSeverity && matchesSearch;
    });
  }, [issues, filterSeverity, searchQuery]);

  // Group issues by project
  const issuesByProject = useMemo(() => {
    const map: Record<string, { id: string; name: string; items: DataIssue[] }> = {};
    
    filteredIssues.forEach(issue => {
      const key = issue.projectId || 'system';
      if (!map[key]) {
        map[key] = {
          id: key,
          name: issue.projectName || 'Общие системные правила',
          items: []
        };
      }
      map[key].items.push(issue);
    });

    return Object.values(map);
  }, [filteredIssues]);

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  const handleExpandAll = () => {
    const updated: Record<string, boolean> = {};
    issuesByProject.forEach(p => {
      updated[p.id] = true;
    });
    setExpandedProjects(updated);
  };

  const handleCollapseAll = () => {
    setExpandedProjects({});
  };

  if (!importReport) return null;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm transition-all overflow-hidden">
      {/* Header with quick indicators */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 p-5 bg-zinc-50/50 dark:bg-zinc-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-md font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Диагностика качества исходных данных
              {issues.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                  {issues.length} всего
                </span>
              )}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Выявление логических несоответствий, пустых обязательных ячеек и нарушений методологии заполнения
            </p>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            {issuesByProject.length > 1 && (
              <div className="flex bg-zinc-100 dark:bg-zinc-800/60 p-0.5 rounded-lg text-xs font-medium">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="px-2.5 py-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-md transition"
                >
                  Развернуть
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="px-2.5 py-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-md transition"
                >
                  Свернуть
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col md:flex-row gap-3 mt-4 pt-1">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Поиск по названию проекта, коду ошибки, ячейке..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1.5 focus:ring-zinc-400 focus:border-transparent transition-all"
            />
          </div>

          {/* Severity filter taps */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-lg shrink-0 self-start md:self-auto box-border">
            <button
              onClick={() => setFilterSeverity('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                filterSeverity === 'all'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400'
              }`}
            >
              Все ({issues.length})
            </button>
            <button
              onClick={() => setFilterSeverity('error')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                filterSeverity === 'error'
                  ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 shadow-sm'
                  : 'text-zinc-500 hover:text-red-600 dark:text-zinc-400'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Ошибки ({issues.filter(i => i.severity === 'error').length})
            </button>
            <button
              onClick={() => setFilterSeverity('warning')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                filterSeverity === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 shadow-sm'
                  : 'text-zinc-500 hover:text-amber-600 dark:text-zinc-400'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Предупреждения ({issues.filter(i => i.severity === 'warning').length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Issues Area */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[500px] overflow-y-auto">
        {issuesByProject.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 dark:text-zinc-400 flex flex-col items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">Проблем с заполнением не обнаружено</h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-md">
              Качество данных полностью соответствует требованиям методологии. Все показатели считаются корректно.
            </p>
          </div>
        ) : (
          issuesByProject.map((project, index) => {
            const isExpanded = expandedProjects[project.id] !== false; // expanded by default
            return (
              <div key={project.id} className="transition-all">
                {/* Project Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleProjectExpand(project.id)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 text-left transition-all font-medium border-l-2 border-transparent"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 pr-4">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                    )}
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                      {project.name}
                    </span>
                    <span className="text-xs font-normal text-zinc-400 px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded shrink-0">
                      ID: {project.id}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-zinc-500 font-normal mr-1">
                      {project.items.length} замечаний
                    </span>
                    {project.items.some(i => i.severity === 'error') && (
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                    )}
                    {project.items.every(i => i.severity === 'warning') && (
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </div>
                </button>

                {/* Project Issues list */}
                {isExpanded && (
                  <div className="px-5 pb-4 space-y-2 border-t border-zinc-50 dark:border-zinc-850/40 pt-1 bg-zinc-50/30 dark:bg-zinc-950/5">
                    {project.items.map((issue, issueIdx) => {
                      const isErr = issue.severity === 'error';
                      
                      return (
                        <div
                          key={issueIdx}
                          className={`p-3 rounded-lg border text-xs gap-3 flex items-start transition-all ${
                            isErr
                              ? 'bg-rose-50/30 dark:bg-rose-950/10 border-rose-100 dark:border-rose-950/30 text-rose-800 dark:text-rose-300'
                              : 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-100 dark:border-amber-950/30 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          <div className="shrink-0 mt-0.5">
                            {isErr ? (
                              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                          </div>

                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-zinc-900 dark:text-zinc-100">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${
                                isErr
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-400'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400'
                              }`}>
                                {isErr ? 'Регламентная Ошибка' : 'Предупреждение'}
                              </span>
                              <span className="text-zinc-400 dark:text-zinc-500/80">
                                Строка: {issue.rowIndex}
                              </span>
                              {issue.field && (
                                <span className="bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded text-[10px] max-w-[150px] truncate">
                                  поле: &quot;{issue.field}&quot;
                                </span>
                              )}
                              <span className="text-zinc-400 dark:text-zinc-500 text-[10px] font-mono ml-auto">
                                Код: {issue.code}
                              </span>
                            </div>
                            <p className="text-zinc-600 dark:text-zinc-300 font-medium leading-relaxed">
                              {issue.message}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
