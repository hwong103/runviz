# Feature Module Conventions

## What belongs in a feature

- UI that is only used by one product area.
- Feature-specific hooks and derived view-model logic.
- Small helpers that only make sense in that feature's domain.

## What does not belong in a feature

- Shared design-system primitives.
- Cross-cutting infrastructure such as API clients, caches, auth/session utilities, or generic analytics helpers.
- Business logic that is broadly reused across unrelated features.

## Import rules

- Prefer importing from the owning feature folder, not from `src/components`.
- Do not reach into unrelated feature internals when a stable public module already exists.
- Use `@/...` aliases for cross-feature and shared-module imports to keep moves low-risk.

## Ownership guidance

- UI stays in feature components.
- Business logic goes into analytics/domain-style modules or feature hooks, not render-heavy files.
- Third-party integration stays in services.
- If a file starts serving multiple unrelated features, move the shared part into `src/components/ui`, `src/components/layout`, `src/services`, or `src/analytics` as appropriate.
