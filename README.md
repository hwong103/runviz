# RunViz 🏃‍♂️

A beautiful, mobile-friendly running stats dashboard that visualizes your Strava data with elite analytics on a Cloudflare stack.

![RunViz Dashboard](public/screenshots/dashboard-stats.jpg)

## 📸 Screenshots

| Activity Frequency | Race Predictions |
|:---:|:---:|
| <img src="public/screenshots/activity-frequency.jpg" width="400" /> | <img src="public/screenshots/race-predictions.jpg" width="400" /> |

| Run Analysis | Shoe Tracker |
|:---:|:---:|
| <img src="public/screenshots/run-details.jpg" width="400" /> | <img src="public/screenshots/shoe-tracker.jpg" width="400" /> |

| Route Planner |
|:---:|
| <img src="public/screenshots/route_planner.jpg" width="800" /> |

## ✨ Features

- **Advanced Analytics** - GAP, HR zones, and CTL/ATL/TSB tracking
- **AI Route Planner** - Generate personalized round-trip running routes based on distance
- **Intelligent Search** - Geocoding with autocorrect and current location support
- **PR Progress** - Track personal records over time
- **Shoe Tracker** - Monitor mileage on your gear

### Beautiful Visualizations
- 📅 **Calendar Heatmap** - GitHub-style activity visualization
- 📊 **Fitness/Freshness Chart** - Track your training over time
- 🏆 **PR Progress** - Personal record tracking
- 📱 **Mobile-First Design** - Looks great on any device

## 🚀 Quick Start (For Your Own Copy)

### Prerequisites
- Node.js 18+
- Cloudflare account (free tier works!)
- Strava account

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/runviz.git
cd runviz
```

### 2. Create Auth Providers

1. Create a Google OAuth client for Better Auth sign-in.
2. Create a Resend API key for magic-link delivery.
3. Create a Strava API application for activity data.

For Strava, go to [Strava API Settings](https://www.strava.com/settings/api), create a new application, set **Authorization Callback Domain** to your frontend host, for example `runviz-stats.pages.dev`, and note your **Client ID** and **Client Secret**.

### 3. Deploy The Unified Cloudflare Worker

```bash
# Install dependencies
npm install

# Create KV namespace
npx wrangler kv:namespace create TOKENS
# Copy the id into wrangler.jsonc

# Create D1
npx wrangler d1 create runviz-db
# Copy the database_id into wrangler.jsonc

# Set secrets
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ORS_API_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REDIRECT_URI

# Update vars in wrangler.jsonc
# FRONTEND_URL=https://runviz.hwong103.work
# FRONTEND_PREVIEW_HOST=runviz.runviz-stats.workers.dev

npm run deploy
```

### 4. Frontend Config

Create `.env` in the root directory:

```env
# Optional if serving from a subpath instead of /
# VITE_BASE_PATH=/
```

The app and API now deploy together through the root [`wrangler.jsonc`](./wrangler.jsonc). The Worker script handles `/api/*` and Better Auth routes, and Cloudflare serves the React app from `dist` for all other routes.

Each signed-in user now saves their own Strava Client ID and Client Secret during setup before connecting Strava. Those credentials are stored per account and are no longer configured as global Worker secrets.

## 🛠️ Development

```bash
npm install
npm run dev

# In another terminal, run the unified Worker with assets
npm run preview:worker
```

Useful Cloudflare-specific commands:

```bash
# Preview the built app with the Worker runtime and static assets
npm run preview:worker

# Deploy the unified Worker and static assets
npm run deploy
```

## 📁 Project Structure

```
runviz/
├── src/
│   ├── analytics/     # GAP, HR zones, training load
│   ├── components/    # React components
│   ├── hooks/         # Custom hooks
│   ├── services/      # API and caching
│   └── types/         # TypeScript types
├── workers/           # Worker source used by the root Cloudflare deploy
│   └── src/
│       └── index.ts   # OAuth, auth, Strava proxy, asset fallback
└── .github/
    └── workflows/     # GitHub Actions deployment
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Optional override for the API origin. Leave unset for the unified same-origin Worker setup |
| `VITE_BASE_PATH` | Optional public base path |
| `VITE_LOGO_DEV_TOKEN` | Optional Logo.dev publishable token for shoe logos |

### Cloudflare Secrets

| Secret | Description |
|--------|-------------|
| `BETTER_AUTH_SECRET` | Secret used to sign Better Auth sessions and encrypt user-linked secrets |
| `RESEND_API_KEY` | Resend API key for magic-link emails |
| `ORS_API_KEY` | From [OpenRouteService](https://openrouteservice.org/dev/#/signup) |
| `GOOGLE_CLIENT_ID` | Optional Google OAuth client for Drive-powered form workflows |
| `GOOGLE_CLIENT_SECRET` | Optional Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Redirect URI for the Worker Google callback |

### Cloudflare Worker Vars

| Var | Description |
|-----|-------------|
| `DB` | D1 database binding used by Better Auth |
| `TOKENS` | KV namespace used for legacy session and OAuth state storage |
| `FRONTEND_URL` | Exact production Pages origin allowed for CORS and OAuth fallback redirects |
| `FRONTEND_PREVIEW_HOST` | Preview host suffix for branch deploys, for example `runviz.runviz-stats.workers.dev` |
| `ADDITIONAL_FRONTEND_URLS` | Optional comma-separated list of extra allowed frontend origins |

### 🗺️ Map API Setup

The Route Planner uses **OpenRouteService (ORS)** for routing and **Nominatim (OpenStreetMap)** for address search.

1.  **Register**: Sign up for a free account at [OpenRouteService](https://openrouteservice.org/dev/#/signup).
2.  **API Key**: Create a new API Key (Token) in the dashboard.
3.  **Configure**: Add the token to your Cloudflare Worker using `wrangler secret put ORS_API_KEY`.
4.  **Usage**: The free tier allows for 2,000 route requests per day, which is plenty for personal use!

## 📊 Analytics Details

### Grade Adjusted Pace (GAP)
Uses the Minetti formula to calculate metabolic cost at various grades, normalizing hilly runs to flat-ground equivalent.

### Training Load (CTL/ATL/TSB)
- **CTL (Fitness)**: 42-day exponentially weighted average of TRIMP
- **ATL (Fatigue)**: 7-day exponentially weighted average of TRIMP  
- **TSB (Form)**: CTL - ATL, indicates readiness to perform

### Heart Rate Zones
Default 5-zone model based on max HR:
- Zone 1: 50-60% (Recovery)
- Zone 2: 60-70% (Aerobic)
- Zone 3: 70-80% (Tempo)
- Zone 4: 80-90% (Threshold)
- Zone 5: 90-100% (Anaerobic)

## 📝 License

MIT - Fork it, modify it, make it yours!

## 🙏 Acknowledgments

- [Strava API](https://developers.strava.com/) for the data
- [Minetti et al.](https://pubmed.ncbi.nlm.nih.gov/12183501/) for the GAP formula
