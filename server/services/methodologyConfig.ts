export interface StatusThresholds {
  okMaxDeviationPercent: number;        // e.g. 10 (which means performance >= 90%)
  attentionMaxDeviationPercent: number; // e.g. 25 (which means performance >= 75%)
}

export interface MethodologyConfig {
  thresholds: StatusThresholds;
  milestoneExpectedProgressCurrentQuarter: number; // e.g. expected progress for milestones in current quarter (e.g. 50%)
  monitoringAttentionDaysThreshold: number;        // e.g. 7 days before next monitoring is considered "attention"
  allowFutureIndicatorsCalculation: boolean;      // whether future indicators are counted if fact is filled
}

export const DEFAULT_METHODOLOGY_CONFIG: MethodologyConfig = {
  thresholds: {
    okMaxDeviationPercent: 10,       // Deviation up to 10% (Performance >= 90%)
    attentionMaxDeviationPercent: 25 // Deviation up to 25% (Performance >= 75%)
  },
  milestoneExpectedProgressCurrentQuarter: 50, // 50% progress expected if milestone is in current quarter
  monitoringAttentionDaysThreshold: 7,         // Warn 7 days before next monitoring window
  allowFutureIndicatorsCalculation: false     // Future показатели never enter aggregates/risk (even with early fact)
};
