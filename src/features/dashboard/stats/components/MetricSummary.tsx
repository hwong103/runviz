export function SnapshotCell({
    label,
    value,
    unit,
    detail,
}: {
    label: string;
    value: string;
    unit: string;
    detail: string;
}) {
    return (
        <div className="flex min-h-[172px] flex-col justify-between bg-[var(--rv-bg-panel)] px-4 py-4 sm:px-5 sm:py-5">
            <div>
                <p className="rv-mini-label mb-3">{label}</p>
                <div className="flex flex-wrap items-baseline gap-2">
                    <span className="rv-data text-[1.7rem] text-[var(--rv-text)] sm:text-[1.95rem]">
                        {value}
                    </span>
                    {unit ? <span className="rv-mini-label tracking-[0.18em]">{unit}</span> : null}
                </div>
            </div>
            <p className="mt-4 max-w-[18ch] text-sm leading-7 text-[var(--rv-text-dim)]">{detail}</p>
        </div>
    );
}

export function ToplineMetric({
    label,
    value,
    unit,
    compact = false,
}: {
    label: string;
    value: string;
    unit: string;
    compact?: boolean;
}) {
    return (
        <div className={`${compact ? 'rounded-[1rem] border border-[var(--rv-border)] px-3 py-3' : ''}`}>
            <p className="rv-mini-label mb-2">{label}</p>
            <div className="flex items-baseline gap-2">
                <span className={`rv-data ${compact ? 'text-[1.5rem]' : 'text-[1.85rem] sm:text-[2rem]'} text-[var(--rv-text)]`}>
                    {value}
                </span>
                {unit ? <span className="rv-mini-label tracking-[0.18em]">{unit}</span> : null}
            </div>
        </div>
    );
}
