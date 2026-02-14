# Metrics Roadmap

## Goal
Add metrics that improve training decisions while keeping data/API cost low.

## Priority 1: High Value, Low Risk
1. Acute:Chronic Load Ratio (ACWR)
- Why: quick overtraining signal.
- Inputs: existing CTL/ATL time series.
- UI: Fitness card badge (`ATL / CTL`) with risk bands.
- Effort: Small.

2. Weekly Ramp Rate
- Why: controls injury risk from sudden mileage jumps.
- Inputs: weekly distance totals from existing activities.
- UI: new stat card and mini trend sparkline.
- Effort: Small.

3. Consistency Score
- Why: easier to understand than raw streaks.
- Inputs: runs per week over last 4-8 weeks.
- UI: replace/add next to streak card.
- Effort: Small.

## Priority 2: Performance Depth
1. Long Run Ratio
- Why: verifies long run is proportionate to weekly load.
- Inputs: longest run / total weekly distance.
- UI: Training Log summary badge.
- Effort: Small.

2. Efficiency Index
- Why: indicates aerobic improvement at comparable effort.
- Inputs: pace + avg heart rate (when available).
- UI: trend chart (30-day rolling).
- Effort: Medium (missing HR handling needed).

3. Terrain-Adjusted Pace Trend
- Why: remove hill bias from progression tracking.
- Inputs: existing GAP calculator + activity stream grade where available.
- UI: compare raw pace vs GAP pace trend.
- Effort: Medium.

## Priority 3: Readiness & Racing
1. Race Readiness Score
- Why: combines fitness, freshness, and specificity.
- Inputs: CTL, TSB, recent interval/tempo density, long-run completion.
- UI: Race Prediction panel.
- Effort: Medium-Large.

2. Heat/Conditions Adjustment (optional)
- Why: avoid false negatives in hot/humid blocks.
- Inputs: weather API (future integration).
- UI: activity annotation + filtered trends.
- Effort: Large (new dependency).

## Implementation Plan (Suggested Sequence)
1. Build `trainingHealth.ts`
- Add ACWR and weekly ramp helpers.
- Unit test edge cases (sparse weeks, missing data).

2. Extend `StatsOverview`
- Add `Weekly Ramp` and `Consistency` cards.
- Keep existing card count responsive on mobile.

3. Extend `FitnessChart`
- Add ACWR overlay / badge with risk categories:
  - `<0.8`: detraining risk
  - `0.8-1.3`: normal
  - `>1.5`: high risk

4. Add optional `Efficiency Index`
- Use HR-only subset of runs.
- Show `insufficient HR data` fallback.

## Guardrails
1. No extra Strava API endpoints for v1 of these metrics.
2. Compute from cached activities only.
3. Recompute metrics in-memory via `useMemo`.
4. Defer stream-heavy metrics unless user opens Run Details.
