# RunViz PWA Implementation Note

## What Changed

- Added `vite-plugin-pwa` with a conservative manifest and auto-updating service worker registration.
- Limited service worker precaching to static app shell assets and left runtime API caching disabled.
- Added install metadata in `index.html` plus install icons in `public/`.
- Added a global offline banner so users get a clear message when the network is unavailable.

## Intentionally Deferred

- Offline syncing and background sync
- Push notifications
- Service-worker caching for authenticated or dynamic API responses
- Custom update prompts beyond automatic service worker refresh handling

## How To Test

1. Run `npm run build` and confirm the output includes `manifest.webmanifest` plus generated service worker assets in `dist/`.
2. Open a production preview, load the app once, then toggle offline mode and verify the app shell still opens with the offline banner visible.
3. On Android Chrome, verify installability from the browser menu and confirm the installed app launches in standalone mode.
4. On iPhone Safari, use Add to Home Screen and confirm the icon, title, and standalone launch behavior look correct.
