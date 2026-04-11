export function ModalFallback() {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_srgb,var(--rv-bg)_92%,transparent)] backdrop-blur-xl p-4">
            <div className="rv-panel rv-panel-strong flex w-full max-w-xl items-center justify-center gap-4 px-8 py-10">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--rv-blue)]/30 border-t-[var(--rv-yellow)]" />
                <div>
                    <p className="rv-kicker mb-2">Run Details</p>
                    <p className="rv-body-copy-sm">Loading deeper analysis</p>
                </div>
            </div>
        </div>
    );
}
