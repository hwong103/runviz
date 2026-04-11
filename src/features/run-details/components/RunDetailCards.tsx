import type { ReactNode } from 'react';

export function MetricTile({
    icon,
    label,
    value,
    unit,
    accentClassName,
    detail,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    unit?: string;
    accentClassName?: string;
    detail?: string;
}) {
    return (
        <div className="rv-subtle-card min-w-0 overflow-hidden px-4 py-4">
            <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rv-mini-label text-[var(--rv-text-faint)]">{label}</span>
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] ${accentClassName || 'text-[var(--rv-text-dim)]'}`}>
                    {icon}
                </span>
            </div>
            <div className={`rv-data min-w-0 break-words text-[clamp(1.8rem,8vw,2rem)] ${accentClassName || 'text-[var(--rv-text)]'}`}>
                {value}
                {unit ? <span className="ml-1 text-sm font-semibold text-[var(--rv-text-faint)]">{unit}</span> : null}
            </div>
            {detail ? <p className="rv-body-copy-sm mt-2">{detail}</p> : null}
        </div>
    );
}

export function InsightCard({
    kicker,
    title,
    description,
    children,
}: {
    kicker: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="rv-panel px-5 py-5 sm:px-6">
            <p className="rv-kicker mb-2">{kicker}</p>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--rv-text)]">{title}</h2>
            <p className="rv-body-copy-sm mb-4 mt-2 max-w-xl">{description}</p>
            <div className="rounded-[1.5rem] border border-white/[0.06] bg-black/[0.12] p-3 sm:p-4">
                {children}
            </div>
        </section>
    );
}

export function SummaryTile({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon: ReactNode;
}) {
    return (
        <div className="rv-subtle-card min-w-0 flex items-center gap-4 px-4 py-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[var(--rv-yellow)]">
                {icon}
            </span>
            <div className="min-w-0">
                <div className="rv-mini-label text-[var(--rv-text-faint)]">{label}</div>
                <div className="mt-1 break-words text-base font-semibold tracking-[-0.02em] text-[var(--rv-text)]">{value}</div>
            </div>
        </div>
    );
}
