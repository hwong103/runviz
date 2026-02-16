# RunViz Form Analysis Lab (Google Photos + Strava write-back)

## Summary
- Add a dedicated Form Analysis page that pulls a treadmill video from Google Photos (Picker API), auto-matches it to a Strava activity by timestamp, and runs in-browser pose analysis to compute core form metrics.
- Generate coach-like commentary by comparing metrics to your personal history and surface 1-2 top tips.
- Allow manual write-back of a concise summary plus tips into the Strava activity notes using `activity:write` scope.

## Goals
- Provide actionable form insights from side-profile treadmill video.
- Keep all video processing client-side for privacy.
- Persist derived metrics and commentary locally for historical comparisons.

## Non-Goals
- No server-side video processing or long-term video storage.
- No ML training or paid inference APIs.

## User Flow
1. Open Form Analysis from the header.
2. Connect Google Photos (if not already connected) and launch the Picker widget.
3. Select a video; auto-match the nearest Strava activity by start time (±30 min default).
4. If no match, allow manual activity selection or continue as "unmatched."
5. Select a 20-60s clip and run analysis.
6. Review metrics, overlay, and commentary.
7. Optionally write a concise block back to Strava notes (prompts re-auth if `activity:write` scope is missing).

## Important Public API and Type Changes
- Update Strava OAuth scope to include `activity:write` in `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/workers/src/index.ts`.
  - Existing users who authenticated with `read,activity:read_all` will need a **re-auth prompt** when they attempt a write-back; the session should detect missing scopes and redirect to OAuth with the upgraded scope.
- Add `PUT` to the CORS `Access-Control-Allow-Methods` header in `corsHeaders()` to support Strava update requests.
- Add a new dedicated `handleStravaActivityUpdate` worker function (not a generic proxy change — see Backend Plan).
- Add new worker endpoints for Google OAuth (separate token storage from Strava).
- Add a new `activities.update` client method in `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/src/services/api.ts`.
- Extend `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/src/types/index.ts`:
  - Add `FormVideo` and `FormAnalysis`.
  - Add optional `description?: string` to `Activity` for write-back support.

## Backend Plan (Cloudflare Worker)

### Google OAuth (separate from Strava auth)
- Update `Env` in `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/workers/src/index.ts`:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
- Store Google tokens in a **separate KV key pattern**: `google:${sessionId}` (not merged into `TokenData`).
  - Fields: `googleAccessToken`, `googleRefreshToken`, `googleExpiresAt`.
  - This keeps Google and Strava auth decoupled — refreshing one doesn't touch the other.
- Add Google OAuth endpoints:
  - `GET /auth/google` to redirect to Google OAuth with scope `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
  - `POST /auth/google/callback` to exchange code, store tokens in KV under `google:${sessionId}`, and return a minimal HTML page that closes the window and posts a success message to `window.opener`.
  - `GET /auth/google/session` to report connected status.
  - `POST /auth/google/token` to return a short-lived access token to the frontend for the Picker JS widget.

### Google Photos Picker (client-side widget, not proxied)
- The Picker API runs as a **client-side JS widget** — the frontend launches it directly.
- The worker's role is limited to:
  - Serving a valid Google access token (via `/auth/google/token`).
  - Optionally proxying media item content fetch if `baseUrl` requires server-side auth.
- No need for `POST /api/photos/picker/sessions` or related proxy endpoints.

### Strava Write-Back (scoped, not generic)
- **Do NOT open `handleApiRequest` to arbitrary non-GET methods.** Instead, add a dedicated function:
  - `handleStravaActivityUpdate(request, env, origin)` that:
    - Only accepts `PUT` method.
    - Only targets `/api/activities/:id`.
    - Allowlists writable fields to `description` only.
    - Forwards as JSON (`Content-Type: application/json`) — Strava accepts JSON for `PUT /activities/{id}`, no need for `application/x-www-form-urlencoded` translation.
- Update CORS: add `PUT` to `Access-Control-Allow-Methods` in `corsHeaders()`.

### Strava Scope Migration
- Store the granted scopes in `TokenData` at auth time (Strava returns scopes in the token response).
- Add a `GET /auth/strava/scopes` endpoint that returns the current session's scopes.
- When write-back is attempted and `activity:write` is missing, the frontend redirects to OAuth with the upgraded scope. On callback, merge the new tokens into the existing session.

- Update `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/workers/wrangler.toml` with new vars and secrets.

## Frontend Plan
- Add route `/form-analysis` in `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/src/main.tsx`.
- Add header link in `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/src/App.tsx`.
- Create `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/src/components/FormAnalysis.tsx` with sections:
  - Activity selector with auto-match suggestion (±30 min window).
  - Google Photos connect button and Picker widget launch (client-side).
  - Video preview and clip range selection.
  - Analyze action with `isAnalyzing` state guard to prevent concurrent runs.
  - Results cards and overlay view.
  - Write to Strava button with scope check and re-auth prompt if needed.
- Add client API helpers in `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/src/services/api.ts`:
  - `google.getToken` — fetch short-lived access token for Picker widget.
  - `google.getSessionStatus` — check Google connection status.
  - `activities.update(id, payload)` — `PUT` to update activity description.
  - `auth.getStravaScopes()` — check current session's Strava scopes.

## Data Model and Persistence
- Extend IndexedDB in `/Users/henrywong/Documents/Personal Dev/RunViz/runviz/src/services/cache.ts`:
  - Bump DB version to `2`.
  - Add `form_analyses` store keyed by `id`.
  - Add helper functions: `saveFormAnalysis`, `getFormAnalysisByActivity`, `listFormAnalyses`, `deleteFormAnalysis`.
- Types:
  - `FormVideo`:
    - `id`, `filename`, `mimeType`, `creationTime`, `durationSec`, `width`, `height`
    - `mediaItemId` (stable ID for re-fetching `baseUrl` later)
    - `baseUrl` (short-lived, ~60 min expiry — resolve lazily before use)
  - `FormAnalysis`:
    - `id`, `activityId`, `videoId`, `clipStartSec`, `clipEndSec`, `createdAt`
    - `analysisVersion`, `modelVersion` (MediaPipe model variant/version for invalidation)
    - `metrics`: cadence, strideLength, verticalOscillation, trunkLean, overstrideFlag
    - `series`: per-stride metrics and timestamps
    - `commentary`: top tips, baseline comparison, confidence
    - `lastWrittenAt?: string`

## Pose Analysis Pipeline (Client-Only)
- **Lazy-load** `@mediapipe/tasks-vision` via dynamic `import()` only when the user clicks "Analyze" — the WASM module is ~5-10 MB and should not impact page load for users who never use this feature.
- Show a loading spinner / progress bar during model download.
- Consider hosting the model file on a CDN rather than bundling it.
- Use Pose Landmarker on sampled frames at 10-15 FPS using `requestVideoFrameCallback` and `OffscreenCanvas`.
- Select the more visible body side by landmark confidence.
- Smooth landmarks with EMA to reduce jitter.

## Core Metrics
- Cadence: steps per minute from detected foot strikes.
- Stride length: `activity.average_speed / (cadence/60)` when available.
- Vertical oscillation: hip Y peak-to-peak normalized by leg length.
- Trunk lean: angle between shoulder-hip line and vertical.
- Overstride flag: ankle ahead of hip by > 0.2 * leg length at foot strike.

## Commentary Engine
- Baseline from personal history: use rolling median of last N analyses (default N=10).
- For each metric, compute deviation vs baseline and map to coaching cues.
- Rank tips by deviation magnitude and signal confidence.
- Output 1-2 coach-like tips.

### Metric Deviation Thresholds

| Metric | Warning Threshold | Unit | Coaching Cue |
|---|---|---|---|
| Cadence | ±5 from baseline | spm | "Try quickening/slowing your turnover" |
| Trunk lean | > 2° deviation from baseline | degrees | "Focus on running tall" |
| Vertical oscillation | > 15% above baseline | ratio | "You're bouncing — drive forward" |
| Overstride | flagged in > 30% of strides | % of strides | "Land with feet under your hips" |
| Stride length | > 10% deviation from baseline | ratio | "Check you're not over/under-striding" |

- If personal history has fewer than 3 analyses, fall back to general heuristic ranges rather than personal baseline.

## Strava Write-Back
- Requires `activity:write` scope — if the current session lacks it, prompt a re-auth flow (not a full logout).
- Write-back is manual from the results screen.
- Format:
  - Append a block labeled `--- RunViz Form Analysis ---`.
  - Include 3-6 lines of metrics and 1-2 tips.
- Idempotency:
  - If an existing RunViz block exists, replace it instead of appending.

## Edge Cases and Handling
- Missing or low-confidence pose data: show warning and reduce tips.
- No matching activity: allow analysis with "unmatched" label and skip stride length.
- No average speed: stride length shows `N/A`.
- Google Picker session timeout: prompt retry.
- **Video `baseUrl` expiry**: Store the stable `mediaItemId`; before analysis, re-fetch the `baseUrl` if it may be stale (>30 min old). Show a brief loading state during refresh.
- **Concurrent analysis prevention**: Disable the "Analyze" button and show progress while `isAnalyzing` is true.
- **Strava scope mismatch**: Detect missing `activity:write` scope before write-back attempt and prompt targeted re-auth.

## Tests and Scenarios
1. Google OAuth connect succeeds and session status shows "Connected."
2. Picker widget opens and returns selected video items; playback works.
3. Auto-match selects correct activity within ±30 minutes.
4. When two activities fall within the match window (e.g. AM/PM double), user is prompted to choose.
5. Analysis produces metrics and commentary on a 30s clip.
6. MediaPipe model loads lazily on first analysis (not at page load).
7. Strava write-back appends or replaces the RunViz block correctly.
8. Re-auth flow triggers correctly when `activity:write` scope is missing.
9. Refresh page and see saved analyses from IndexedDB.
10. Expired `baseUrl` is re-resolved before analysis starts.

## Assumptions and Defaults
- Default clip length: 30 seconds centered in the video.
- Default auto-match window: ±30 minutes.
- Analysis is informational, not medical advice.
- If personal history is insufficient (<3 analyses), fall back to general heuristic ranges.
- Video never leaves the client.
