export function PanelFallback({
    title,
    subtitle,
    heightClassName = 'h-56',
}: {
    title: string;
    subtitle: string;
    heightClassName?: string;
}) {
    return (
        <div className="rv-panel rv-panel-strong px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-6">
                <p className="rv-kicker mb-2">{title}</p>
                <p className="rv-body-copy-sm">{subtitle}</p>
            </div>
            <div
                className={`${heightClassName} animate-pulse rounded-[1.5rem] border border-[var(--rv-border)] bg-[var(--rv-bg-panel)]`}
            />
        </div>
    );
}
