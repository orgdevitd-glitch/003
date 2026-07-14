import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Project, ProjectAnalysisResult, Stats, ProjectEvaluation } from '../types';
import { formatDateSafe, parseDateSafe } from './dateUtils';
import { 
  getRegistryDataQuality, 
  getRegistryMilestoneProgress 
} from './projectRegistryMetrics';
import { getRegistryProjectStatusView, getRegistryRiskView, getRegistryPcStatusView } from './projectRegistryStatus';
import { getEvaluationByProjectId } from './evaluationUtils';
import { buildOverviewPdfReportData } from './overviewReportData';
import { buildProjectCardPdfReportData, escapeHtml } from './projectCardPdfReportData';

// Helper to translate severity to Russian
function translateSeverity(sev: string): string {
  const s = String(sev).toLowerCase().trim();
  if (s === 'low' || s === 'низкая') return 'Низкая';
  if (s === 'medium' || s === 'средняя') return 'Средняя';
  if (s === 'high' || s === 'высокая') return 'Высокая';
  if (s === 'critical' || s === 'критическая') return 'Критическая';
  return s || 'Не указана';
}

// Map English statuses to Russian
const RUSSIAN_STATUS_MAP: Record<string, string> = {
  active: 'В работе',
  completed: 'Завершено',
  cancelled: 'Остановлен',
  overdue: 'Просрочен',
  at_risk: 'Зона риска',
  unknown: 'Неизвестно',
  not_started: 'Не начат',
  risk: 'Зона риска',
  ok: 'Норма'
};

/**
 * EXPORT SINGLE PROJECT TO PDF
 * Generates an elegant, highly structured, clean publication-quality A4 report
 */
export async function exportProjectToPDF(
  project: Project,
  analysis: ProjectAnalysisResult | null,
  projectEvaluations?: ProjectEvaluation[] | null,
  options?: {
    assessmentDate?: string;
    selectedYear?: number;
    selectedQuarter?: number;
  }
): Promise<void> {
  let container: HTMLDivElement;
  try {
    const selectedYear = options?.selectedYear || project._dataYear || new Date().getFullYear();
    const selectedQuarter = options?.selectedQuarter || 1;
    const assessmentDate = options?.assessmentDate || formatDateSafe(new Date().toISOString());

    const data = buildProjectCardPdfReportData({
      project,
      analysis,
      projectEvaluations,
      assessmentDate,
      selectedYear,
      selectedQuarter,
    });

    const isAiAnalysisFormed = data.analysisBlocks !== null;
    const totalPages = isAiAnalysisFormed ? 4 : 3;

    // Helper to safety-clamp percentages for progress bars
    const clampPercent = (value: number | null): number => {
      if (value === null || value === undefined || Number.isNaN(value)) return 0;
      return Math.max(0, Math.min(100, Math.round(value)));
    };

    // Helper functions for badge styling in PDF
    const getStatusBadgeStyle = (status: string) => {
      const s = status.toLowerCase();
      if (s.includes("работе")) {
        return { text: status, style: "background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;" };
      }
      if (s.includes("заверш")) {
        return { text: status, style: "background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;" };
      }
      return { text: status, style: "background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;" };
    };

    const getRiskBadgeStyle = (risk: string) => {
      const r = risk.toLowerCase();
      if (r.includes("низк")) {
        return { text: risk, style: "background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;" };
      }
      if (r.includes("средн")) {
        return { text: risk, style: "background: #fef3c7; color: #92400e; border: 1px solid #fde68a;" };
      }
      if (r.includes("высок")) {
        return { text: risk, style: "background: #fee2e2; color: #991b1b; border: 1px solid #fecaca;" };
      }
      if (r.includes("критич")) {
        return { text: risk, style: "background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; font-weight: bold;" };
      }
      return { text: risk, style: "background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;" };
    };

    const getPcBadgeStyle = (pcStatus: string) => {
      const p = pcStatus.toLowerCase();
      if (p.includes("в графике") || p.includes("договорной")) {
        return { text: pcStatus, style: "background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;" };
      }
      if (p.includes("просрочен") || p.includes("отклонение")) {
        return { text: pcStatus, style: "background: #fee2e2; color: #991b1b; border: 1px solid #fecaca;" };
      }
      return { text: pcStatus, style: "background: #fef3c7; color: #92400e; border: 1px solid #fde68a;" };
    };

    const getDataQualityBadgeStyle = (qualityStr: string) => {
      const val = parseInt(qualityStr, 10);
      if (!isNaN(val)) {
        if (val >= 90) {
          return { text: qualityStr, style: "background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;" };
        }
        if (val >= 70) {
          return { text: qualityStr, style: "background: #fef3c7; color: #92400e; border: 1px solid #fde68a;" };
        }
        return { text: qualityStr, style: "background: #fee2e2; color: #991b1b; border: 1px solid #fecaca;" };
      }
      return { text: qualityStr, style: "background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;" };
    };

    const statusBadge = getStatusBadgeStyle(data.statusSummary.status);
    const riskBadge = getRiskBadgeStyle(data.statusSummary.risk);
    const pcBadge = getPcBadgeStyle(data.statusSummary.pcStatus);
    const qualityBadge = getDataQualityBadgeStyle(data.statusSummary.dataQuality);

    // Create clean containing offscreen DOM element
    container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-99999px';
    container.style.top = '-99999px';
    container.style.width = '850px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.background = '#f3f4f6';

    // Page 1: Passport and Project Status
    const page1HTML = `
      <div class="pdf-page" style="width: 850px; height: 1200px; padding: 45px 50px; background: #ffffff; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; position: relative; margin-bottom: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
        <div style="width: 100%; height: 6px; background: linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%); position: absolute; top: 0; left: 0;"></div>
        <div>
          <!-- Header block -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">
            <div>
              <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #4b5563; letter-spacing: 0.1em;">КАРТОЧКА ПРОЕКТА</span>
              <h1 style="font-size: 24px; font-weight: 800; color: #111827; margin: 4px 0 0 0; letter-spacing: -0.02em;">Паспорт и состояние проекта</h1>
            </div>
            <div style="text-align: right;">
              <span style="display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 10px; padding: 4px 8px; border-radius: 6px; text-transform: uppercase;">Q${selectedQuarter} ${selectedYear} год</span>
              <div style="font-size: 11px; color: #6b7280; font-weight: 500; margin-top: 6px;">Отчетная дата: ${escapeHtml(assessmentDate)}</div>
            </div>
          </div>

          <!-- Project identity banner -->
          <div style="background: #fafafa; border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 0 12px 12px 0; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 4px;">НАЗВАНИЕ ПРОЕКТА</div>
            <div style="font-size: 18px; font-weight: 800; color: #1f2937; line-height: 1.35;">${escapeHtml(data.projectInfo.projectName)}</div>
            <div style="font-size: 11px; font-weight: 500; color: #9ca3af; margin-top: 4px; font-family: monospace;">UUID: ${escapeHtml(data.projectInfo.projectId)}</div>
          </div>

          <!-- Grid for Meta Information -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
            <!-- Column 1 -->
            <div style="border: 1px solid #f3f4f6; border-radius: 12px; padding: 16px; background: #ffffff;">
              <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #4f46e5; margin: 0 0 12px 0; border-bottom: 1px solid #f3f4f6; padding-bottom: 6px;">Параметры проекта</h3>
              <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                <tr>
                   <td style="padding: 6px 0; color: #6b7280; font-weight: 500; width: 40%;">Стадия:</td>
                   <td style="padding: 6px 0; color: #1f2937; font-weight: 700;">${escapeHtml(data.projectInfo.stage)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Вид проекта:</td>
                  <td style="padding: 6px 0; color: #1f2937; font-weight: 700;">${escapeHtml(data.projectInfo.projectType)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Приоритет:</td>
                  <td style="padding: 6px 0; color: #1f2937; font-weight: 700;">${escapeHtml(data.projectInfo.priority)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Департамент:</td>
                  <td style="padding: 6px 0; color: #1f2937; font-weight: 700;">${escapeHtml(data.projectInfo.department)}</td>
                </tr>
              </table>
            </div>

            <!-- Column 2 -->
            <div style="border: 1px solid #f3f4f6; border-radius: 12px; padding: 16px; background: #ffffff;">
              <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #4f46e5; margin: 0 0 12px 0; border-bottom: 1px solid #f3f4f6; padding-bottom: 6px;">Команда и Сроки</h3>
              <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-weight: 500; width: 40%;">Владелец:</td>
                  <td style="padding: 6px 0; color: #1f2937; font-weight: 700;">${escapeHtml(data.projectInfo.owner)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Руководитель:</td>
                  <td style="padding: 6px 0; color: #1f2937; font-weight: 700;">${escapeHtml(data.projectInfo.manager)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Заказчик:</td>
                  <td style="padding: 6px 0; color: #1f2937; font-weight: 700;">${escapeHtml(data.projectInfo.sponsor)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Сроки:</td>
                  <td style="padding: 6px 0; color: #1f2937; font-weight: 700; font-size: 11px;">
                    ${escapeHtml(data.projectInfo.startDate)} — ${escapeHtml(data.projectInfo.deadlineAt)}
                  </td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Evaluated Status Indicator Box -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 25px;">
            <!-- Status -->
            <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: #fafafa;">
              <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 6px;">СТАТУС ПРОЕКТА</span>
              <span style="font-size: 11px; font-weight: 800; ${statusBadge.style} padding: 3px 8px; border-radius: 6px; display: inline-block;">
                ${escapeHtml(statusBadge.text)}
              </span>
            </div>
            <!-- Risk -->
            <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: #fafafa;">
              <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 6px;">РИСК</span>
              <span style="font-size: 11px; font-weight: 800; ${riskBadge.style} padding: 3px 8px; border-radius: 6px; display: inline-block;">
                ${escapeHtml(riskBadge.text)}
              </span>
            </div>
            <!-- PC Status -->
            <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: #fafafa;">
              <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 6px;">СТАТУС ПК</span>
              <span style="font-size: 11px; font-weight: 800; ${pcBadge.style} padding: 3px 8px; border-radius: 6px; display: inline-block; white-space: nowrap;">
                ${escapeHtml(pcBadge.text)}
              </span>
            </div>
            <!-- Data Completeness -->
            <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: #fafafa;">
              <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 6px;">ЗАПОЛНЕННОСТЬ</span>
              <span style="font-size: 11px; font-weight: 800; ${qualityBadge.style} padding: 3px 8px; border-radius: 6px; display: inline-block; white-space: nowrap;">
                ${escapeHtml(qualityBadge.text)}
              </span>
            </div>
          </div>

          <!-- Dynamic lists of goals and images of results -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <!-- Goals -->
            <div style="border: 1px solid #f3f4f6; border-radius: 12px; padding: 16px; background: #ffffff;">
              <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #374151; margin: 0 0 10px 0; border-bottom: 1px solid #f3f4f6; padding-bottom: 6px;">Цели проекта</h3>
              <div style="font-size: 11px; color: #4b5563; line-height: 1.5; max-height: 200px; overflow: hidden;">
                ${data.projectInfo.goals && data.projectInfo.goals.length > 0
                  ? `<ul style="margin: 0; padding-left: 16px;">` + data.projectInfo.goals.map(g => `<li style="margin-bottom: 4px;">${escapeHtml(g)}</li>`).join("") + `</ul>`
                  : `<p style="margin: 0; color: #9ca3af; font-style: italic;">Цели проекта не указаны</p>`
                }
              </div>
            </div>
            <!-- Result Images -->
            <div style="border: 1px solid #f3f4f6; border-radius: 12px; padding: 16px; background: #ffffff;">
              <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #374151; margin: 0 0 10px 0; border-bottom: 1px solid #f3f4f6; padding-bottom: 6px;">Образы результатов</h3>
              <div style="font-size: 11px; color: #4b5563; line-height: 1.5; max-height: 200px; overflow: hidden;">
                ${data.projectInfo.resultImages && data.projectInfo.resultImages.length > 0
                  ? `<ul style="margin: 0; padding-left: 16px;">` + data.projectInfo.resultImages.map(ri => `<li style="margin-bottom: 4px;">${escapeHtml(ri)}</li>`).join("") + `</ul>`
                  : `<p style="margin: 0; color: #9ca3af; font-style: italic;">Образы результатов не заполнены</p>`
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Safe Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 15px; font-size: 9px; font-weight: bold; color: #9ca3af; text-transform: uppercase;">
          <div>КОНФИДЕНЦИАЛЬНО • ДЛЯ ВНУТРЕННЕГО ИСПОЛЬЗОВАНИЯ</div>
          <div>Страница 1 из ${totalPages}</div>
        </div>
      </div>
    `;

    // Page 2: Project Progress (4 horizontal progress metrics cards)
    const page2HTML = `
      <div class="pdf-page" style="width: 850px; height: 1200px; padding: 45px 50px; background: #ffffff; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; position: relative; margin-bottom: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
        <div style="width: 100%; height: 6px; background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%); position: absolute; top: 0; left: 0;"></div>
        <div>
          <!-- Header block -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">
            <div>
              <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #4b5563; letter-spacing: 0.1em;">КАРТОЧКА ПРОЕКТА</span>
              <h1 style="font-size: 24px; font-weight: 800; color: #111827; margin: 4px 0 0 0; letter-spacing: -0.02em;">Оценка прогресса проекта</h1>
            </div>
            <div style="text-align: right;">
              <span style="display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 10px; padding: 4px 8px; border-radius: 6px; text-transform: uppercase;">Q${selectedQuarter} ${selectedYear} год</span>
            </div>
          </div>

          <div style="margin-bottom: 25px;">
            <h2 style="font-size: 16px; font-weight: 800; color: #1f2937; margin: 0 0 6px 0;">Сводные показатели выполнения</h2>
            <p style="font-size: 11.5px; color: #4b5563; margin: 0; line-height: 1.5;">
              Сводка показывает выполнение вех и показателей проекта за выбранный квартал и год.
            </p>
          </div>

          <!-- 2x2 Progress Cards grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
            <!-- Box 1: Milestones Quarter -->
            <div style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.01);">
              <div>
                <span style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #4b5563; display: block; margin-bottom: 10px;">Вехи Q${selectedQuarter}</span>
                <div style="font-size: 28px; font-weight: 800; color: #111827; margin-bottom: 12px; line-height: 1;">
                  ${escapeHtml(data.progressMetrics.milestonesQuarterText)}
                </div>
              </div>
              <div>
                <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 8px;">
                  ${data.progressMetrics.milestonesQuarterVal !== null ? `<div style="width: ${clampPercent(data.progressMetrics.milestonesQuarterVal)}%; height: 100%; background: #10b981; border-radius: 4px;"></div>` : ''}
                </div>
                <div style="font-size: 10px; color: #6b7280; font-weight: 600; margin-top: 8px;">
                  ${data.progressMetrics.milestonesQuarterVal !== null ? 'Выполнение за выбранный квартал' : 'Нет данных'}
                </div>
              </div>
            </div>

            <!-- Box 2: Indicators Quarter -->
            <div style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.01);">
              <div>
                <span style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #4b5563; display: block; margin-bottom: 10px;">Показатели Q${selectedQuarter}</span>
                <div style="font-size: 28px; font-weight: 800; color: #111827; margin-bottom: 12px; line-height: 1;">
                  ${escapeHtml(data.progressMetrics.indicatorsQuarterText)}
                </div>
              </div>
              <div>
                <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 8px;">
                  ${data.progressMetrics.indicatorsQuarterVal !== null ? `<div style="width: ${clampPercent(data.progressMetrics.indicatorsQuarterVal)}%; height: 100%; background: #3b82f6; border-radius: 4px;"></div>` : ''}
                </div>
                <div style="font-size: 10px; color: #6b7280; font-weight: 600; margin-top: 8px;">
                  ${data.progressMetrics.indicatorsQuarterVal !== null ? 'Выполнение за выбранный квартал' : 'Нет данных'}
                </div>
              </div>
            </div>

            <!-- Box 3: Milestones Year -->
            <div style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.01);">
              <div>
                <span style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #4b5563; display: block; margin-bottom: 10px;">Вехи ${selectedYear}</span>
                <div style="font-size: 28px; font-weight: 800; color: #111827; margin-bottom: 12px; line-height: 1;">
                  ${escapeHtml(data.progressMetrics.milestonesYearText)}
                </div>
              </div>
              <div>
                <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 8px;">
                  ${data.progressMetrics.milestonesYearVal !== null ? `<div style="width: ${clampPercent(data.progressMetrics.milestonesYearVal)}%; height: 100%; background: #10b981; border-radius: 4px;"></div>` : ''}
                </div>
                <div style="font-size: 10px; color: #6b7280; font-weight: 600; margin-top: 8px;">
                  ${data.progressMetrics.milestonesYearVal !== null ? 'Выполнение за отчетный год' : 'Нет данных'}
                </div>
              </div>
            </div>

            <!-- Box 4: Indicators Year -->
            <div style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.01);">
              <div>
                <span style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #4b5563; display: block; margin-bottom: 10px;">Показатели ${selectedYear}</span>
                <div style="font-size: 28px; font-weight: 800; color: #111827; margin-bottom: 12px; line-height: 1;">
                  ${escapeHtml(data.progressMetrics.indicatorsYearText)}
                </div>
              </div>
              <div>
                <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 8px;">
                  ${data.progressMetrics.indicatorsYearVal !== null ? `<div style="width: ${clampPercent(data.progressMetrics.indicatorsYearVal)}%; height: 100%; background: #3b82f6; border-radius: 4px;"></div>` : ''}
                </div>
                <div style="font-size: 10px; color: #6b7280; font-weight: 600; margin-top: 8px;">
                  ${data.progressMetrics.indicatorsYearVal !== null ? 'Выполнение за отчетный год' : 'Нет данных'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footnote A4 footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 15px; font-size: 9px; font-weight: bold; color: #9ca3af; text-transform: uppercase;">
          <div>КОНФИДЕНЦИАЛЬНО • ДЛЯ ВНУТРЕННЕГО ИСПОЛЬЗОВАНИЯ</div>
          <div>Страница 2 из ${totalPages}</div>
        </div>
      </div>
    `;

    // Page 3: Selected Period Details (Tables for Milestones and Indicators)
    const page3HTML = `
      <div class="pdf-page" style="width: 850px; height: 1200px; padding: 45px 50px; background: #ffffff; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; position: relative; margin-bottom: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
        <div style="width: 100%; height: 6px; background: linear-gradient(90deg, #10b981 0%, #059669 100%); position: absolute; top: 0; left: 0;"></div>
        <div>
          <!-- Header block -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">
            <div>
              <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #4b5563; letter-spacing: 0.1em;">КАРТОЧКА ПРОЕКТА</span>
              <h1 style="font-size: 24px; font-weight: 800; color: #111827; margin: 4px 0 0 0; letter-spacing: -0.02em;">Детализация за отчетный период</h1>
            </div>
            <div style="text-align: right;">
              <span style="display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 10px; padding: 4px 8px; border-radius: 6px; text-transform: uppercase;">Q${selectedQuarter} ${selectedYear} год</span>
            </div>
          </div>

          <!-- Milestones Table Section -->
          <div style="margin-bottom: 25px;">
            <h3 style="font-size: 13px; font-weight: 800; text-transform: uppercase; color: #047857; margin: 0 0 10px 0; border-bottom: 2px solid #e5e5e5; padding-bottom: 4px;">Ход выполнения вех в Q${selectedQuarter} ${selectedYear}</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">
                  <th style="padding: 8px 10px; width: 60%;">Веха проекта</th>
                  <th style="padding: 8px 10px; width: 25%;">Период вехи</th>
                  <th style="padding: 8px 10px; width: 15%;">Прогресс</th>
                </tr>
              </thead>
              <tbody>
                ${data.milestonesDetails.list && data.milestonesDetails.list.length > 0
                  ? data.milestonesDetails.list.map(m => `
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px 10px; font-weight: 600; color: #1e293b;">${escapeHtml(m.name)}</td>
                        <td style="padding: 8px 10px; color: #475569;">${escapeHtml(m.quarterText)}</td>
                        <td style="padding: 8px 10px;">
                          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; ${
                            m.progressText.toLowerCase().includes('100%') || m.progressText.toLowerCase() === 'д'
                              ? 'background: #dcfce7; color: #166534;'
                              : m.progressText === '—' || m.progressText.toLowerCase().includes('нет')
                              ? 'background: #f3f4f6; color: #6b7280;'
                              : 'background: #fef3c7; color: #92400e;'
                          }">${escapeHtml(m.progressText)}</span>
                        </td>
                      </tr>
                    `).join('')
                  : `<tr><td colspan="3" style="padding: 20px; text-align: center; color: #94a3b8; font-style: italic;">Нет зарегистрированных вех на выбранный период</td></tr>`
                }
              </tbody>
            </table>
          </div>

          <!-- Indicators Table Section -->
          <div>
            <h3 style="font-size: 13px; font-weight: 800; text-transform: uppercase; color: #0284c7; margin: 0 0 10px 0; border-bottom: 2px solid #e5e5e5; padding-bottom: 4px;">Ключевые показатели в Q${selectedQuarter} ${selectedYear}</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">
                  <th style="padding: 8px 10px; width: 40%;">Показатель</th>
                  <th style="padding: 8px 10px; width: 20%; text-align: right;">План</th>
                  <th style="padding: 8px 10px; width: 20%; text-align: right;">Факт</th>
                  <th style="padding: 8px 10px; width: 20%; text-align: center;">Выполнение</th>
                </tr>
              </thead>
              <tbody>
                ${data.indicatorsDetails.list && data.indicatorsDetails.list.length > 0
                  ? data.indicatorsDetails.list.map(ind => `
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px 10px; font-weight: 600; color: #1e293b;">${escapeHtml(ind.name)}</td>
                        <td style="padding: 8px 10px; text-align: right; color: #475569;">${escapeHtml(ind.planText)}</td>
                        <td style="padding: 8px 10px; text-align: right; font-weight: bold; color: #0f172a;">${escapeHtml(ind.factText)}</td>
                        <td style="padding: 8px 10px; text-align: center;">
                          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; ${
                            ind.progressText.includes('100%')
                              ? 'background: #dcfce7; color: #166534;'
                              : ind.progressText === '—' || ind.progressText.toLowerCase().includes('нет')
                              ? 'background: #f3f4f6; color: #6b7280;'
                              : 'background: #fef3c7; color: #92400e;'
                          }">${escapeHtml(ind.progressText)}</span>
                        </td>
                      </tr>
                    `).join('')
                  : `<tr><td colspan="4" style="padding: 20px; text-align: center; color: #94a3b8; font-style: italic;">Нет зарегистрированных показателей на выбранный период</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footnote A4 footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 15px; font-size: 9px; font-weight: bold; color: #9ca3af; text-transform: uppercase;">
          <div>КОНФИДЕНЦИАЛЬНО • ДЛЯ ВНУТРЕННЕГО ИСПОЛЬЗОВАНИЯ</div>
          <div>Страница 3 из ${totalPages}</div>
        </div>
      </div>
    `;

    // Page 4: Analytics and Recommendations (Conditional, only if AI report is formed)
    let page4HTML = '';
    if (isAiAnalysisFormed && data.analysisBlocks) {
      page4HTML = `
        <div class="pdf-page" style="width: 850px; height: 1200px; padding: 45px 50px; background: #ffffff; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; position: relative; margin-bottom: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
          <div style="width: 100%; height: 6px; background: linear-gradient(90deg, #8b5cf6 0%, #6d28d9 100%); position: absolute; top: 0; left: 0;"></div>
          <div>
            <!-- Header block -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">
              <div>
                <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #4b5563; letter-spacing: 0.1em;">КАРТОЧКА ПРОЕКТА</span>
                <h1 style="font-size: 24px; font-weight: 800; color: #111827; margin: 4px 0 0 0; letter-spacing: -0.02em;">Аналитика и рекомендации</h1>
              </div>
              <div style="text-align: right;">
                <span style="display: inline-block; background: #f3e8ff; color: #6b21a8; font-weight: 700; font-size: 10px; padding: 4px 8px; border-radius: 6px; text-transform: uppercase;">ИИ Анализ</span>
              </div>
            </div>

            <!-- Management Conclusion Callout -->
            <div style="background: #f5f3ff; border-left: 4px solid #8b5cf6; padding: 14px 18px; border-radius: 0 10px 10px 0; margin-bottom: 22px;">
              <h4 style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #6d28d9; margin: 0 0 4px 0; letter-spacing: 0.05em;">Управленческое резюме</h4>
              <p style="font-size: 11.5px; font-style: italic; color: #4c1d95; margin: 0; line-height: 1.5;">
                "${escapeHtml(data.analysisBlocks.managementConclusion)}"
              </p>
            </div>

            <!-- Multi-perspective Analysis Blocks -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 22px;">
              <div style="background: #fafafa; border: 1px solid #f3f4f6; border-radius: 10px; padding: 12px 14px;">
                <h4 style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #1e293b; margin: 0 0 6px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">Полнота паспорта</h4>
                <p style="font-size: 10.5px; color: #4b5563; margin: 0; line-height: 1.4;">${escapeHtml(data.analysisBlocks.detailedAnalysis.dataCompleteness)}</p>
              </div>
              <div style="background: #fafafa; border: 1px solid #f3f4f6; border-radius: 10px; padding: 12px 14px;">
                <h4 style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #1e293b; margin: 0 0 6px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">Сроки и заседания ПК</h4>
                <p style="font-size: 10.5px; color: #4b5563; margin: 0; line-height: 1.4;">${escapeHtml(data.analysisBlocks.detailedAnalysis.pcTimeliness)}</p>
              </div>
              <div style="background: #fafafa; border: 1px solid #f3f4f6; border-radius: 10px; padding: 12px 14px;">
                <h4 style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #1e293b; margin: 0 0 6px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">Анализ отклонений</h4>
                <p style="font-size: 10.5px; color: #4b5563; margin: 0; line-height: 1.4;">${escapeHtml(data.analysisBlocks.detailedAnalysis.lagOrAdvance)}</p>
              </div>
              <div style="background: #fafafa; border: 1px solid #f3f4f6; border-radius: 10px; padding: 12px 14px;">
                <h4 style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #1e293b; margin: 0 0 6px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">Эффективность показателей</h4>
                <p style="font-size: 10.5px; color: #4b5563; margin: 0; line-height: 1.4;">${escapeHtml(data.analysisBlocks.detailedAnalysis.indicators)}</p>
              </div>
            </div>

            <!-- Recommended Actions Table -->
            <div>
              <h4 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #5b21b6; margin: 0 0 8px 0;">Рекомендованные действия по минимизации отклонений</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; font-weight: bold; color: #475569;">
                    <th style="padding: 6px 10px; width: 10%; text-align: center;">Приор.</th>
                    <th style="padding: 6px 10px; width: 60%;">Выявленная проблема и действие</th>
                    <th style="padding: 6px 10px; width: 30%;">Ответственный</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.analysisBlocks.priorityActions && data.analysisBlocks.priorityActions.length > 0
                    ? data.analysisBlocks.priorityActions.map(action => `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                          <td style="padding: 6px 10px; text-align: center; font-weight: bold; color: #6d28d9;">${escapeHtml(action.priority)}</td>
                          <td style="padding: 6px 10px; color: #334155; line-height: 1.4;">${escapeHtml(action.action)}</td>
                          <td style="padding: 6px 10px; font-weight: 600; color: #1e293b;">${escapeHtml(action.owner)}</td>
                        </tr>
                      `).join('')
                    : `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #94a3b8; font-style: italic;">Рекомендованные корректирующие действия отсутствуют</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Footnote A4 footer -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 15px; font-size: 9px; font-weight: bold; color: #9ca3af; text-transform: uppercase;">
            <div>КОНФИДЕНЦИАЛЬНО • ДЛЯ ВНУТРЕННЕГО ИСПОЛЬЗОВАНИЯ</div>
            <div>Страница 4 из ${totalPages}</div>
          </div>
        </div>
      `;
    }

    // Combine pages dynamically based on AI analytical status
    container.innerHTML = `
      ${page1HTML}
      ${page2HTML}
      ${page3HTML}
      ${isAiAnalysisFormed ? page4HTML : ''}
    `;

    document.body.appendChild(container);

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageElements = container.querySelectorAll('.pdf-page');

    for (let i = 0; i < pageElements.length; i++) {
      const pageEl = pageElements[i] as HTMLElement;
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) {
        doc.addPage();
      }
      doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    }

    doc.save(`project-card-${project.projectId}-${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (err: any) {
    console.error('Project PDF generation failed:', err);
    throw err;
  } finally {
    if (container) {
      document.body.removeChild(container);
    }
  }
}

export async function exportPortfolioToPDF(
  projects: Project[],
  stats: Stats | null,
  projectEvaluations?: ProjectEvaluation[] | null,
  assessmentDateInput?: string,
  options?: {
    selectedYear?: number;
    selectedQuarter?: number;
  }
): Promise<void> {
  const assessmentDate = assessmentDateInput || formatDateSafe(new Date().toISOString());
  const selectedYearOpt = options?.selectedYear;
  const selectedQuarterOpt = options?.selectedQuarter;

  // 1. Prepare data using our unified report data helper
  const reportData = buildOverviewPdfReportData({
    projects,
    projectEvaluations,
    assessmentDate,
    selectedYear: selectedYearOpt,
    selectedQuarter: selectedQuarterOpt
  });

  const {
    selectedYear,
    selectedQuarter,
    effectiveAssessmentDate,
    projectsInSelectedYear,
    stageCounts,
    priorityCounts,
    portfolioProgress,
    departmentAnalytics
  } = reportData;

  const totalProjects = projectsInSelectedYear.length;

  // Create clean offscreen DOM element
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-99999px';
  container.style.top = '-99999px';
  container.style.width = '1120px';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.background = '#f8fafc';

  // If empty state: chosen year has no projects matching criteria
  if (totalProjects === 0) {
    container.innerHTML = `
      <div class="pdf-page" style="width: 1120px; height: 792px; background: #ffffff; padding: 60px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: -apple-system, system-ui, sans-serif;">
        <div style="text-align: center; max-width: 600px;">
          <div style="font-size: 72px; margin-bottom: 24px;">📭</div>
          <h1 style="font-size: 32px; font-weight: 800; color: #1e293b; margin: 0 0 16px 0; letter-spacing: -0.02em;">В выбранном году проекты не найдены</h1>
          <p style="font-size: 15px; color: #64748b; line-height: 1.6; margin: 0;">В отчетном ${selectedYear} году нет активных или планируемых проектов по выбранной выборке. Измените фильтры или выберите отличный период.</p>
          <div style="margin-top: 40px; padding: 8px 16px; background: #f1f5f9; border-radius: 20px; font-size: 11px; font-weight: bold; color: #475569; display: inline-block;">
            Дата среза: ${effectiveAssessmentDate}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageEl = container.querySelector('.pdf-page') as HTMLElement;
      const canvas = await html2canvas(pageEl, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      doc.addImage(imgData, 'JPEG', 0, 0, 297, 210);
      doc.save(`portfolio-report-${selectedYear}-Q${selectedQuarter}.pdf`);
    } finally {
      document.body.removeChild(container);
    }
    return;
  }

  // Percent calculation helpers
  const getShare = (count: number) => totalProjects > 0 ? Math.round((count / totalProjects) * 100) : 0;

  // PAGE 1: Portfolio Overview
  const p1_milestones_q = portfolioProgress.selectedMilestones !== null ? `${Math.round(portfolioProgress.selectedMilestones)}%` : 'Нет данных';
  const p1_kpi_q = portfolioProgress.selectedKpi !== null ? `${Math.round(portfolioProgress.selectedKpi)}%` : 'Нет данных';
  const p1_milestones_y = portfolioProgress.yearMilestones !== null ? `${Math.round(portfolioProgress.yearMilestones)}%` : 'Нет данных';
  const p1_kpi_y = portfolioProgress.yearKpi !== null ? `${Math.round(portfolioProgress.yearKpi)}%` : 'Нет данных';

  const page1HTML = `
    <div class="pdf-page" style="width: 1120px; height: 792px; background: #ffffff; padding: 45px 50px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; position: relative;">
      <div>
        <!-- Top Tech Ribbon Bar -->
        <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 25px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
          <div>
            <h1 style="font-size: 26px; font-weight: 900; color: #0f172a; margin: 0; letter-spacing: -0.01em; text-transform: uppercase;">Обзор портфеля проектов</h1>
            <p style="font-size: 11px; font-weight: 500; color: #64748b; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.05em;">Управленческий дашборд • Вкладка 1 (Состояние и динамика)</p>
          </div>
          <div style="text-align: right; font-family: monospace;">
            <p style="font-size: 9px; font-weight: bold; color: #94a3b8; text-transform: uppercase; margin: 0; letter-spacing: 0.1em;">Отчетный период</p>
            <p style="font-size: 14px; font-weight: 950; color: #010101; margin: 3px 0 0 0;">Q${selectedQuarter} ${selectedYear} Г.</p>
            <p style="font-size: 9px; color: #64748b; margin: 2px 0 0 0;">(Срез на: ${effectiveAssessmentDate})</p>
          </div>
        </div>

        <!-- Metric Section: Stage levels -->
        <div style="margin-bottom: 25px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
          <h2 style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 0 0 10px 0; letter-spacing: 0.1em;">Стадии жизненного цикла портфеля</h2>
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px;">
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px 8px; text-align: center;">
              <span style="font-size: 28px; font-weight: 950; color: #0f172a; display: block; line-height: 1;">${stageCounts.total}</span>
              <span style="font-size: 8px; font-weight: 800; color: #475569; text-transform: uppercase; display: block; margin-top: 8px; letter-spacing: 0.02em;">Всего проектов</span>
            </div>

            <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 15px 8px; text-align: center;">
              <span style="font-size: 28px; font-weight: 950; color: #475569; display: block; line-height: 1;">${stageCounts.planned}</span>
              <span style="font-size: 8px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-top: 8px; letter-spacing: 0.02em;">Планируется</span>
            </div>

            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 15px 8px; text-align: center;">
              <span style="font-size: 28px; font-weight: 950; color: #2563eb; display: block; line-height: 1;">${stageCounts.inWork}</span>
              <span style="font-size: 8px; font-weight: 800; color: #1d4ed8; text-transform: uppercase; display: block; margin-top: 8px; letter-spacing: 0.02em;">В работе</span>
            </div>

            <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 15px 8px; text-align: center;">
              <span style="font-size: 28px; font-weight: 950; color: #d97706; display: block; line-height: 1;">${stageCounts.onPause}</span>
              <span style="font-size: 8px; font-weight: 800; color: #b45309; text-transform: uppercase; display: block; margin-top: 8px; letter-spacing: 0.02em;">На паузе</span>
            </div>

            <div style="background: #fff5f5; border: 1px solid #fee2e2; border-radius: 12px; padding: 15px 8px; text-align: center;">
              <span style="font-size: 28px; font-weight: 950; color: #dc2626; display: block; line-height: 1;">${stageCounts.stopped}</span>
              <span style="font-size: 8px; font-weight: 800; color: #b91c1c; text-transform: uppercase; display: block; margin-top: 8px; letter-spacing: 0.02em;">Остановлен</span>
            </div>

            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 15px 8px; text-align: center;">
              <span style="font-size: 28px; font-weight: 950; color: #16a34a; display: block; line-height: 1;">${stageCounts.completed}</span>
              <span style="font-size: 8px; font-weight: 800; color: #15803d; text-transform: uppercase; display: block; margin-top: 8px; letter-spacing: 0.02em;">Завершен</span>
            </div>

            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 15px 8px; text-align: center;">
              <span style="font-size: 28px; font-weight: 950; color: #475569; display: block; line-height: 1;">${stageCounts.unspecified}</span>
              <span style="font-size: 8px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-top: 8px; letter-spacing: 0.02em;">Стадия не указана</span>
            </div>

          </div>
        </div>

        <!-- Portfolio Progress Section -->
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
          <h2 style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 0 0 12px 0; letter-spacing: 0.1em;">Прогресс выполнения портфеля</h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">

            <!-- Left: Quarter metrics -->
            <div style="border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 15px;">
                <span style="font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.02em;">Показатели квартала (Q${selectedQuarter})</span>
                <span style="font-size: 10px; color: #2563eb; font-weight: 700; background: #eff6ff; padding: 3px 8px; border-radius: 8px;">ТЕКУЩИЙ КВАРТАЛ</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 15px;">
                <div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px;">
                    <span style="color: #475569; font-weight: 600;">Вехи Q${selectedQuarter}</span>
                    <span style="font-weight: 800; color: ${p1_milestones_q === 'Нет данных' ? '#94a3b8' : '#0f172a'}">${p1_milestones_q}</span>
                  </div>
                  <div style="height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; display: flex;">
                    ${p1_milestones_q !== 'Нет данных' ? `<div style="width: ${p1_milestones_q}; background: #2563eb; border-radius: 4px;"></div>` : `<div style="width: 100%; background: #cbd5e1; opacity: 0.5;"></div>`}
                  </div>
                </div>
                <div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px;">
                    <span style="color: #475569; font-weight: 600;">Показатели KPI Q${selectedQuarter}</span>
                    <span style="font-weight: 800; color: ${p1_kpi_q === 'Нет данных' ? '#94a3b8' : '#0f172a'}">${p1_kpi_q}</span>
                  </div>
                  <div style="height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; display: flex;">
                    ${p1_kpi_q !== 'Нет данных' ? `<div style="width: ${p1_kpi_q}; background: #16a34a; border-radius: 4px;"></div>` : `<div style="width: 100%; background: #cbd5e1; opacity: 0.5;"></div>`}
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Year metrics -->
            <div style="border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 15px;">
                <span style="font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.02em;">Показатели года (${selectedYear})</span>
                <span style="font-size: 10px; color: #16a34a; font-weight: 700; background: #f0fdf4; padding: 3px 8px; border-radius: 8px;">ГОДОВОЙ ИТОГ</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 15px;">
                <div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px;">
                    <span style="color: #475569; font-weight: 600;">Вехи года (${selectedYear})</span>
                    <span style="font-weight: 800; color: ${p1_milestones_y === 'Нет данных' ? '#94a3b8' : '#0f172a'}">${p1_milestones_y}</span>
                  </div>
                  <div style="height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; display: flex;">
                    ${p1_milestones_y !== 'Нет данных' ? `<div style="width: ${p1_milestones_y}; background: #2563eb; border-radius: 4px;"></div>` : `<div style="width: 100%; background: #cbd5e1; opacity: 0.5;"></div>`}
                  </div>
                </div>
                <div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px;">
                    <span style="color: #475569; font-weight: 600;">Показатели KPI года (${selectedYear})</span>
                    <span style="font-weight: 800; color: ${p1_kpi_y === 'Нет данных' ? '#94a3b8' : '#0f172a'}">${p1_kpi_y}</span>
                  </div>
                  <div style="height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; display: flex;">
                    ${p1_kpi_y !== 'Нет данных' ? `<div style="width: ${p1_kpi_y}; background: #16a34a; border-radius: 4px;"></div>` : `<div style="width: 100%; background: #cbd5e1; opacity: 0.5;"></div>`}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- Footer navigation info -->
      <div style="display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; font-family: monospace; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 15px;">
        <span>Раздел 1: Показатели портфеля • Стр. 1 из 3</span>
        <span>КОНФИДЕНЦИАЛЬНО • ДЛЯ ВНУТРЕННЕГО ИСПОЛЬЗОВАНИЯ</span>
      </div>
    </div>
  `;

  // PAGE 2: Structure of Portfolio
  const pctPlanned = getShare(stageCounts.planned);
  const pctInWork = getShare(stageCounts.inWork);
  const pctOnPause = getShare(stageCounts.onPause);
  const pctStopped = getShare(stageCounts.stopped);
  const pctCompleted = getShare(stageCounts.completed);
  const pctUnspecified = getShare(stageCounts.unspecified);

  const pctP0 = getShare(priorityCounts.p0);
  const pctP1 = getShare(priorityCounts.p1);
  const pctP2 = getShare(priorityCounts.p2);

  const page2HTML = `
    <div class="pdf-page" style="width: 1120px; height: 792px; background: #ffffff; padding: 45px 50px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; position: relative;">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 25px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
          <div>
            <h1 style="font-size: 26px; font-weight: 900; color: #0f172a; margin: 0; letter-spacing: -0.01em; text-transform: uppercase;">Структура и Реестр портфеля</h1>
            <p style="font-size: 11px; font-weight: 500; color: #64748b; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.05em;">Детальное распределение по стадиям и приоритетам за ${selectedYear} год</p>
          </div>
          <span style="font-family: monospace; font-size: 13px; font-weight: 800; color: #010101;">Q${selectedQuarter} ${selectedYear} Г.</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 24px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
          
          <!-- Column 1: Visual indicators / cards -->
          <div style="display: flex; flex-direction: column; gap: 15px;">
            <div style="border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; background: #f8fafc;">
              <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin: 0 0 10px 0; letter-spacing: 0.02em;">Приоритеты проектов</h3>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                  <span style="font-weight: 600; color: #0f172a;">Нулевой приоритет (P0)</span>
                  <span style="font-weight: 800; color: #4b5563;">${priorityCounts.p0} (${pctP0}%)</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                  <span style="font-weight: 600; color: #b45309;">Первый приоритет (P1)</span>
                  <span style="font-weight: 800; color: #b45309;">${priorityCounts.p1} (${pctP1}%)</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                  <span style="font-weight: 600; color: #64748b;">Второй приоритет (P2)</span>
                  <span style="font-weight: 800; color: #64748b;">${priorityCounts.p2} (${pctP2}%)</span>
                </div>
              </div>
            </div>

            <div style="border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; background: #ffffff;">
              <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin: 0 0 10px 0; letter-spacing: 0.02em;">Распределение по стадиям</h3>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                  <span>Планируется</span> <span>${stageCounts.planned} (${pctPlanned}%)</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                  <span>В работе</span> <span>${stageCounts.inWork} (${pctInWork}%)</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                  <span>На паузе</span> <span>${stageCounts.onPause} (${pctOnPause}%)</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                  <span>Остановлен</span> <span>${stageCounts.stopped} (${pctStopped}%)</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                  <span>Завершен</span> <span>${stageCounts.completed} (${pctCompleted}%)</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
                  <span>Стадия не указана</span> <span>${stageCounts.unspecified} (${pctUnspecified}%)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Column 2: Structured Category Summary Table -->
          <div style="border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #040404; margin: 0 0 12px 0; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 8px;">Сводная матрица структуры</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; border-top: 1px solid #e2e8f0;">
                  <th style="padding: 10px 12px; font-weight: 800; color: #334155;">Категория</th>
                  <th style="padding: 10px 12px; font-weight: 800; color: #334155; text-align: center; width: 140px;">Количество</th>
                  <th style="padding: 10px 12px; font-weight: 800; color: #334155; text-align: right; width: 130px;">Доля от портфеля</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #64748b; font-weight: 600;">Стадия: Планируется</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: #334155;">${stageCounts.planned}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #0284c7;">${pctPlanned}%</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #2563eb; font-weight: 600;">Стадия: В работе</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: #1e40af;">${stageCounts.inWork}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #1d4ed8;">${pctInWork}%</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #b45309; font-weight: 600;">Стадия: На паузе</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: #9a3412;">${stageCounts.onPause}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #b45309;">${pctOnPause}%</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #dc2626; font-weight: 600;">Стадия: Остановлен</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: #991b1b;">${stageCounts.stopped}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #dc2626;">${pctStopped}%</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #16a34a; font-weight: 600;">Стадия: Завершен</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: #166534;">${stageCounts.completed}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #15803d;">${pctCompleted}%</td>
                </tr>
                <tr style="border-bottom: 2px solid #e2e8f0;">
                  <td style="padding: 10px 12px; color: #64748b; font-weight: 600;">Стадия не указана</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: #475569;">${stageCounts.unspecified}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #64748b;">${pctUnspecified}%</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #0f172a; font-weight: 700;">Нулевой приоритет (P0)</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: #010101;">${priorityCounts.p0}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #000000;">${pctP0}%</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #d97706; font-weight: 700;">Первый приоритет (P1)</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: #92400e;">${priorityCounts.p1}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #d97706;">${pctP1}%</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #64748b; font-weight: 700;">Второй приоритет (P2)</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: #334155;">${priorityCounts.p2}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #64748b;">${pctP2}%</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>

      <!-- Footer navigation info -->
      <div style="display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; font-family: monospace; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 15px;">
        <span>Раздел 2: Структура и классификаторы • Стр. 2 из 3</span>
        <span>КОНФИДЕНЦИАЛЬНО • ДЛЯ ВНУТРЕННЕГО ИСПОЛЬЗОВАНИЯ</span>
      </div>
    </div>
  `;

  // PAGE 3: Department break downs (Top 10 max)
  const maxDeptsToShow = 10;
  const sortedDepts = [...departmentAnalytics].sort((a, b) => {
    // Sort by total projects in that department descending
    const aTotal = a.p0 + a.p1 + a.p2;
    const bTotal = b.p0 + b.p1 + b.p2;
    return bTotal - aTotal;
  });
  
  const hasMoreDepts = sortedDepts.length > maxDeptsToShow;
  const slicedDepts = sortedDepts.slice(0, maxDeptsToShow);

  const formatProgVal = (v: number | null) => v !== null ? `${Math.round(v)}%` : 'Нет данных';

  const page3HTML = `
    <div class="pdf-page" style="width: 1120px; height: 792px; background: #ffffff; padding: 45px 50px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; position: relative;">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 25px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
          <div>
            <h1 style="font-size: 26px; font-weight: 900; color: #0f172a; margin: 0; letter-spacing: -0.01em; text-transform: uppercase;">Показатели департаментов компании</h1>
            <p style="font-size: 11px; font-weight: 500; color: #64748b; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.05em;">Обеспеченность приоритетами, стадии, статус ИС ПК и темп прогресса по вехам/KPI</p>
          </div>
          <span style="font-family: monospace; font-size: 13px; font-weight: 800; color: #010101;">Q${selectedQuarter} ${selectedYear} Г.</span>
        </div>

        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; border-top: 1px solid #e2e8f0;">
                <th style="padding: 10px 10px; font-weight: 800; color: #475569;">Департамент</th>
                <th style="padding: 10px 10px; font-weight: 800; color: #475569; text-align: center;">Всего</th>
                <th style="padding: 10px 10px; font-weight: 800; color: #475569; text-align: center; width: 100px;">Приоритеты</th>
                <th style="padding: 10px 10px; font-weight: 800; color: #475569; text-align: center; width: 120px;">Стадии (В раб/Зв)</th>
                <th style="padding: 10px 10px; font-weight: 800; color: #475569; text-align: center; width: 120px;">Мониторинг ПК</th>
                <th style="padding: 10px 10px; font-weight: 800; color: #475569; text-align: center; width: 120px; background: #faf5ff;">Прогресс вех</th>
                <th style="padding: 10px 10px; font-weight: 800; color: #475569; text-align: center; width: 120px; background: #fafdf6;">Выполнение KPI</th>
              </tr>
            </thead>
            <tbody>
              ${slicedDepts.map((d, index) => {
                const totalD = d.p0 + d.p1 + d.p2;
                return `
                  <tr style="border-bottom: 1px solid #f1f5f9; background: ${index % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                    <td style="padding: 10px 10px; font-weight: bold; color: #0f172a; font-family: -apple-system, sans-serif;">${escapeHtml(d.department)}</td>
                    <td style="padding: 10px 10px; text-align: center; font-weight: bold;">${totalD}</td>
                    <td style="padding: 10px 10px; text-align: center; color: #475569; font-size: 10px;">
                      P0: <strong>${d.p0}</strong> | P1: <strong>${d.p1}</strong> | P2: <strong>${d.p2}</strong>
                    </td>
                    <td style="padding: 10px 10px; text-align: center; color: #475569; font-size: 10px;">
                      В раб: <span style="font-weight: bold; color: #2563eb;">${d.stageInWork}</span> • Зав: <span style="font-weight: bold; color: #16a34a;">${d.stageCompleted}</span>
                    </td>
                    <td style="padding: 10px 10px; text-align: center; color: #64748b; font-size: 10px; font-family: monospace;">
                      Своевр: <span style="color: #16a34a; font-weight: bold;">${d.timely}</span> • Проср: <span style="color: #dc2626; font-weight: bold;">${d.overdue}</span>
                    </td>
                    <td style="padding: 10px 10px; text-align: center; font-weight: bold; color: #2563eb; background: #faf5ff;">
                      ${formatProgVal(d.avgTasksProgress)}
                    </td>
                    <td style="padding: 10px 10px; text-align: center; font-weight: bold; color: #16a34a; background: #fafdf6;">
                      ${formatProgVal(d.avgKpiProgress)}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          ${hasMoreDepts ? `
            <div style="margin-top: 15px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 12px; font-size: 11px; color: #475569; text-align: center; font-weight: 500;">
              Показаны первые ${maxDeptsToShow} департаментов. Полный список доступен в интерфейсе дашборда.
            </div>
          ` : ''}

          ${slicedDepts.length === 0 ? `
            <div style="border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 25px; text-align: center; color: #64748b; font-size: 12px; font-style: italic;">
              Нет данных для группировки по департаментам.
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Footer navigation info -->
      <div style="display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; font-family: monospace; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 15px;">
        <span>Раздел 3: Аналитика департаментов • Стр. 3 из 3</span>
        <span>КОНФИДЕНЦИАЛЬНО • ДЛЯ ВНУТРЕННЕГО ИСПОЛЬЗОВАНИЯ</span>
      </div>
    </div>
  `;

  // Join layout HTML templates
  container.innerHTML = `
    ${page1HTML}
    ${page2HTML}
    ${page3HTML}
  `;

  document.body.appendChild(container);

  try {
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageElements = container.querySelectorAll('.pdf-page');

    for (let i = 0; i < pageElements.length; i++) {
      const pageEl = pageElements[i] as HTMLElement;

      const canvas = await html2canvas(pageEl, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      if (i > 0) {
        doc.addPage();
      }

      // Add image to full index page matching full A4 dimensions 297mm x 210mm
      doc.addImage(imgData, 'JPEG', 0, 0, 297, 210);
    }

    const currentDateString = new Date().toISOString().split('T')[0];
    doc.save(`portfolio-report-${selectedYear}-Q${selectedQuarter}-${currentDateString}.pdf`);
  } catch (err: any) {
    console.error('Programmatic portfolio rendering failed:', err);
    throw new Error(`Ошибка генерации PDF отчета портфеля: ${err?.message || String(err)}`);
  } finally {
    document.body.removeChild(container);
  }
}