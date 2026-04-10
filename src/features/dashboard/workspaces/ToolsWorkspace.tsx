import { Link } from 'react-router-dom';

import { Backpack, Rocket } from 'lucide-react';

export function ToolsWorkspace() {
    return (
        <section className="grid gap-4 lg:grid-cols-2">
            <Link
                to="/plan-route"
                className="rounded-[1.4rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground/15 hover:bg-muted/40"
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--rv-blue)_18%,transparent)] text-[var(--rv-blue)]">
                        <Backpack className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="rv-kicker mb-1">Route Planner</p>
                        <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                            Build the next route
                        </h3>
                    </div>
                </div>
                <p className="mt-4 max-w-[52ch] text-sm leading-6 text-muted-foreground">
                    Choose a start point, set a target distance, and export a route without carrying this tool inside the daily dashboard.
                </p>
            </Link>

            <Link
                to="/form-analysis"
                className="rounded-[1.4rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground/15 hover:bg-muted/40"
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--rv-yellow)_18%,transparent)] text-[var(--rv-yellow)]">
                        <Rocket className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="rv-kicker mb-1">Form Lab</p>
                        <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                            Review running form
                        </h3>
                    </div>
                </div>
                <p className="mt-4 max-w-[52ch] text-sm leading-6 text-muted-foreground">
                    Upload a clip, link it to a run, and keep technical feedback in a dedicated review flow.
                </p>
            </Link>
        </section>
    );
}
