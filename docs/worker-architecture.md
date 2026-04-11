# Worker Architecture

## Runtime shape

- `workers/src/index.ts` is a thin bootstrap entrypoint.
- `workers/src/http/` owns CORS, response helpers, and route dispatch.
- `workers/src/routes/` owns endpoint matching and request-to-service handoff.
- `workers/src/services/` owns third-party integration and session/credential concerns.
- `workers/src/domain/` owns business logic for insights and memory/indexing.

## Request flow

1. `index.ts` creates auth and request context.
2. `http/router.ts` selects the matching route module.
3. Route modules validate the request and delegate to services/domain logic.
4. Services handle Strava, Google, auth/session, and persistence concerns.
5. Domain modules format prompts, sanitize AI output, and handle activity/week memory operations.

## Placement rules

- Keep endpoint matching out of `index.ts`.
- Keep external API concerns in `workers/src/services/`.
- Keep prompt logic, sanitization, embedding text, and similarity logic in `workers/src/domain/`.
- Shared response behavior belongs in `workers/src/http/`.

## Stability guidance

- Prefer additive route modules over extending a single conditional chain.
- Keep worker route contracts stable even when internal modules move.
- Avoid importing from facade/barrel files when the direct domain or service module is already the true owner.
