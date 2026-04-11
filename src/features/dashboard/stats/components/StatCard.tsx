import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

import type { TrainingHealthMetricKey } from '@/features/dashboard/stats/TrainingHealthTrendChart';

interface StatCardProps {
    label: string;
    value: string;
    unit: string;
    icon: LucideIcon;
    color?: string;
    detail?: string;
    style?: CSSProperties;
    helpMetric?: TrainingHealthMetricKey;
    helpText?: string;
    activeHelp?: string | null;
    onToggleHelp?: (metric: TrainingHealthMetricKey | null) => void;
    tone?: 'blue' | 'green' | 'gold' | 'orange' | 'neutral';
    metricKey?: TrainingHealthMetricKey;
    isSelected?: boolean;
    onSelectMetric?: (metric: TrainingHealthMetricKey) => void;
}

export function StatCard({
    label,
    value,
    unit,
    icon: Icon,
    color = 'text-[var(--rv-text)]',
    detail,
    style,
    helpMetric,
    helpText,
    activeHelp,
    onToggleHelp,
    tone = 'neutral',
    metricKey,
    isSelected = false,
    onSelectMetric,
}: StatCardProps) {
    const showHelp = !!helpMetric && activeHelp === helpMetric;
    const isCompact = !helpMetric;
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
    const isInteractive = !!metricKey && !!onSelectMetric;

    useEffect(() => {
        if (!showHelp || !cardRef.current) return;
        const frame = requestAnimationFrame(() => {
            if (!cardRef.current) return;
            const rect = cardRef.current.getBoundingClientRect();
            const tooltipWidth = 256;
            const gap = 8;
            const spaceBelow = window.innerHeight - rect.bottom;
            const left = Math.min(rect.left, window.innerWidth - tooltipWidth - 8);

            setTooltipStyle(
                spaceBelow > 160
                    ? { position: 'fixed', top: rect.bottom + gap, left, width: tooltipWidth }
                    : { position: 'fixed', top: rect.top - gap, left, width: tooltipWidth, transform: 'translateY(-100%)' }
            );
        });

        return () => cancelAnimationFrame(frame);
    }, [showHelp]);

    return (
        <div
            ref={cardRef}
            style={style}
            data-tone={tone}
            className={`rv-panel rv-stat-card rv-reveal-subtle rv-spotlight group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-[var(--rv-border-strong)] ${isCompact ? 'p-3 sm:p-3.5' : 'p-3.5 sm:p-4'} ${isInteractive ? 'cursor-pointer' : ''} ${isSelected ? 'border-[var(--rv-border-strong)] bg-[color-mix(in_srgb,var(--rv-bg-panel)_82%,white_18%)] shadow-[0_18px_36px_rgba(0,0,0,0.10)]' : ''}`}
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            aria-pressed={isInteractive ? isSelected : undefined}
            onClick={() => {
                if (metricKey && onSelectMetric) onSelectMetric(metricKey);
            }}
            onKeyDown={(event) => {
                if (!isInteractive || !metricKey || !onSelectMetric) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectMetric(metricKey);
                }
            }}
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
            {isInteractive && isSelected ? (
                <div className="absolute left-3 top-3 rounded-full border border-[var(--rv-border-strong)] bg-[var(--rv-bg-elevated)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--rv-text)]">
                    Trend
                </div>
            ) : null}
            <div className={`mb-2.5 flex items-center gap-2 ${isCompact ? 'pr-3' : 'pr-6'} ${isInteractive && isSelected ? 'pt-7' : ''}`}>
                <Icon className={`${isCompact ? 'h-[16px] w-[16px]' : 'h-[18px] w-[18px]'} text-[var(--rv-text-faint)] transition-transform duration-300 group-hover:scale-110 group-hover:text-[var(--rv-text-dim)]`} />
                <span className={`rv-mini-label ${isCompact ? 'tracking-[0.2em]' : 'tracking-[0.24em]'}`}>{label}</span>
            </div>
            {helpMetric && helpText && onToggleHelp ? (
                <>
                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleHelp(showHelp ? null : helpMetric);
                        }}
                        className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--rv-border)] bg-[var(--rv-bg-panel)] text-[10px] text-[var(--rv-text-faint)] transition-colors hover:bg-[var(--rv-bg-elevated)] hover:text-[var(--rv-text)]"
                        aria-label={`Help for ${label}`}
                        title={`Help for ${label}`}
                    >
                        ?
                    </button>
                    {showHelp ? createPortal(
                        <div
                            className="rv-panel rv-panel-strong pointer-events-none z-[9999] p-3 shadow-[0_20px_44px_rgba(0,0,0,0.35)]"
                            style={tooltipStyle}
                        >
                            <div className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[var(--rv-blue)]">{label}</div>
                            <div className="text-sm font-normal leading-6 normal-case text-[var(--rv-text-dim)]">
                                {helpText}
                            </div>
                        </div>,
                        document.body
                    ) : null}
                </>
            ) : null}
            <div className="flex flex-wrap items-baseline gap-1.5">
                <span className={`rv-data ${isCompact ? 'text-[1.4rem] sm:text-[1.7rem]' : 'text-[1.65rem] sm:text-[1.95rem]'} ${color}`}>{value}</span>
                <span className="rv-mini-label tracking-[0.18em]">{unit}</span>
            </div>
            {detail ? (
                <p className="rv-body-copy-sm mt-1.5 max-w-[22ch] text-[13px] leading-6">
                    {detail}
                </p>
            ) : null}
        </div>
    );
}
