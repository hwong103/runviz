## Summary

- What changed?
- Why did it change?

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Relevant manual flow checked

## Placement Checklist

- [ ] UI stays in feature components or shared UI/layout primitives.
- [ ] Business logic lives in feature hooks, `src/analytics`, or `workers/src/domain`.
- [ ] Third-party integration stays in `src/services` or `workers/src/services`.
- [ ] New imports do not reach into unrelated feature internals when a stable entrypoint exists.
