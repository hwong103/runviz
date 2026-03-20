interface MetricCardProps {
    label: string;
    value: string;
    unit?: string;
    hint?: string;
    accentClassName?: string;
    className?: string;
}

export function MetricCard({
    label,
    value,
    unit,
    hint,
    accentClassName = 'text-[var(--rv-text)]',
    className,
}: MetricCardProps) {
    return (
        <div className={['rv-metric-card p-5', className].filter(Boolean).join(' ')}>
            <div className="rv-metric-card-label">{label}</div>
            <div className={['mt-4 flex items-end gap-2', accentClassName].filter(Boolean).join(' ')}>
                <div className="text-4xl font-black italic tracking-tighter">{value}</div>
                {unit && <div className="rv-metric-card-unit pb-1">{unit}</div>}
            </div>
            {hint && <div className="mt-3 text-[10px] font-medium leading-relaxed text-[var(--rv-text-faint)]">{hint}</div>}
        </div>
    );
}
