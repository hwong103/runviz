# App Architecture

## Runtime shape

- `src/main.tsx` owns route registration and top-level providers.
- `src/App.tsx` is now a composition entrypoint for the signed-in dashboard experience.
- `src/app/` contains app-shell orchestration such as setup gating and dashboard page composition.

## Folder boundaries

- `src/features/` contains feature-owned UI, hooks, and local helpers.
- `src/components/ui/` contains reusable UI primitives.
- `src/components/layout/` contains shared app-shell layout only.
- `src/services/` contains infrastructure such as API clients and caches.
- `src/analytics/` contains shared pure analytics/domain calculations.
- `src/types/` contains domain-specific shared types.

## Current feature ownership

- `src/features/auth/` owns auth callback and sign-in route screens.
- `src/features/setup/` owns onboarding/setup UI.
- `src/features/settings/` owns the settings page.
- `src/features/dashboard/` owns dashboard workspaces, charts, stats, and logbook pieces.
- `src/features/run-details/` owns the run-details modal and related logic.
- `src/features/form-analysis/` owns the form-analysis workflow and page.
- `src/features/route-planner/` owns the route-planner page.
- `src/features/gear/` owns gear-specific UI that is not shared elsewhere.

## Placement rules

- Put feature-specific React components beside the feature that uses them.
- Put reusable visual primitives in `src/components/ui/` only when they are truly cross-feature.
- Keep page orchestration in `src/app/` and feature workflows in `src/features/`.
- Prefer importing through stable feature entrypoints or sibling modules rather than reaching into unrelated feature internals.
