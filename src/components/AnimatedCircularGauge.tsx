import React, { useState, useEffect } from 'react';
import { getTrafficLightColor } from '../utils/evaluationUtils';

interface AnimatedCircularGaugeProps {
  label: string;
  value: number | null;
  idSuffix?: string;
  precision?: number;
  plan?: number;
  title?: string;
}

export const AnimatedCircularGauge: React.FC<AnimatedCircularGaugeProps> = ({ 
  label, 
  value, 
  idSuffix = "",
  precision = 1,
  plan,
  title
}) => {
  const [currentValue, setCurrentValue] = useState<number>(0);
  const [displayValue, setDisplayValue] = useState<number>(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);
  const hasData = value !== null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);

  useEffect(() => {
    if (!hasData) {
      setCurrentValue(0);
      setDisplayValue(0);
      return;
    }

    if (prefersReducedMotion) {
      setCurrentValue(value);
      setDisplayValue(value);
      return;
    }

    // Set circle path fill target with a microscopic delay to make sure entrance transitions match nicely
    const timer = setTimeout(() => {
      setCurrentValue(value);
    }, 50);

    // Number count-up animation over 700ms (synchronized with gauge-path transition)
    let startTimestamp: number | null = null;
    const duration = 700;
    const startValue = 0;
    const endValue = value;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // cubic ease-out approximation for mimicry of cubic-bezier(0.16, 1, 0.3, 1)
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      const current = startValue + easeOutCubic(progress) * (endValue - startValue);
      
      setDisplayValue(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animationFrameId);
    };
  }, [value, hasData, prefersReducedMotion]);

  const radius = 53;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius; // ~333.01
  
  // Cap circular indicator visual filling at 100% as requested
  const fillPercent = (plan && plan > 0) ? (currentValue / plan) * 100 : currentValue;
  const cappedValue = hasData ? Math.min(100, Math.max(0, fillPercent)) : 0;
  const offset = hasData ? circumference - (cappedValue / 100) * circumference : circumference;

  const colorPercent = (plan && plan > 0 && value !== null) ? (value / plan) * 100 : (value || 0);

  return (
    <div 
      id={`card-metric-gauge${idSuffix}`} 
      className="group bg-white p-5 rounded-2xl border border-slate-100 flex flex-col items-center justify-center text-center transition-all duration-300 min-h-[170px] w-full cursor-default shadow-xs hover:shadow-md"
      title={title}
    >
      {hasData ? (
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90 origin-center transition-transform duration-300 group-hover:scale-105">
            <circle
              cx="60"
              cy="60"
              r={radius}
              className="stroke-slate-100"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              className="gauge-path"
              stroke={getTrafficLightColor(colorPercent)}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <div 
            id={`gauge-value${idSuffix}`} 
            className="absolute inset-0 flex items-center justify-center text-xl sm:text-2xl font-black tracking-tighter text-slate-800"
          >
            {displayValue.toFixed(precision)}%
          </div>
        </div>
      ) : (
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90 origin-center">
            <circle
              cx="60"
              cy="60"
              r={radius}
              className="stroke-slate-100"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-400">
            Нет данных
          </div>
        </div>
      )}
      <div className="flex flex-col items-center mt-4">
        <span className="font-semibold text-xs uppercase tracking-wider text-slate-500 leading-tight">
          {label}
        </span>
      </div>
    </div>
  );
};
