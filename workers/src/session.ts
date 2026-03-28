import type { Auth } from "./auth";
import { decrypt } from "./crypto";
import type { Env } from "./index";

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteId: number;
  athleteName: string;
  athleteProfile: string;
  scopes?: string;
}

export interface AthleteSummary {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
}

export interface SessionResponse {
  authenticated: boolean;
  needsStravaConnect?: boolean;
  source?: "legacy" | "better-auth";
  user?: {
    id: string;
    email?: string;
    name?: string;
    image?: string | null;
  };
  athlete?: AthleteSummary;
}

export interface StravaAccessContext {
  source: "legacy" | "better-auth";
  userId?: string;
  sessionId?: string;
  tokenData: TokenData;
  athlete: AthleteSummary;
}

type BetterAuthSession = Awaited<ReturnType<Auth["api"]["getSession"]>>;

function splitName(name: string): { firstname: string; lastname: string } {
  const parts = name.trim().split(/\s+/);
  return {
    firstname: parts[0] ?? "Athlete",
    lastname: parts.slice(1).join(" "),
  };
}

export function buildAthleteSummary(tokenData: TokenData): AthleteSummary {
  const { firstname, lastname } = splitName(tokenData.athleteName);
  return {
    id: tokenData.athleteId,
    firstname,
    lastname,
    profile: tokenData.athleteProfile,
  };
}

export function getLegacySessionId(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(/runviz_session=([^;]+)/);
  return match ? match[1] : null;
}

export function getOAuthState(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("state");
}

async function getStoredToken(env: Env, key: string): Promise<TokenData | null> {
  const stored = await env.TOKENS.get(key);
  if (!stored) return null;
  return JSON.parse(stored) as TokenData;
}

async function getBetterAuthSession(auth: Auth, request: Request) {
  try {
    return await auth.api.getSession({ headers: request.headers });
  } catch {
    return null;
  }
}

export async function getBetterAuthSessionWithHeaders(
  auth: Auth,
  request: Request,
): Promise<{ session: BetterAuthSession | null; headers: Headers | null }> {
  try {
    const result = await auth.api.getSession({
      headers: request.headers,
      asResponse: false,
      returnHeaders: true,
    }) as { response: BetterAuthSession | null; headers: Headers | null };

    return {
      session: result?.response ?? null,
      headers: result?.headers ?? null,
    };
  } catch {
    return { session: null, headers: null };
  }
}

export async function resolveSession(
  request: Request,
  env: Env,
  auth: Auth,
  betterSessionOverride?: BetterAuthSession | null,
): Promise<SessionResponse> {
  const betterSession = betterSessionOverride ?? await getBetterAuthSession(auth, request);
  if (betterSession?.user) {
    const userId = betterSession.user.id;
    const linked = await getStoredToken(env, `strava:${userId}`);
    if (linked) {
      return {
        authenticated: true,
        source: "better-auth",
        user: {
          id: userId,
          email: betterSession.user.email,
          name: betterSession.user.name,
          image: betterSession.user.image,
        },
        athlete: buildAthleteSummary(linked),
      };
    }

    const legacySessionId = getLegacySessionId(request);
    if (legacySessionId) {
      const legacy = await getStoredToken(env, `session:${legacySessionId}`);
      if (legacy) {
        return {
          authenticated: true,
          source: "legacy",
          user: {
            id: userId,
            email: betterSession.user.email,
            name: betterSession.user.name,
            image: betterSession.user.image,
          },
          athlete: buildAthleteSummary(legacy),
        };
      }
    }

    return {
      authenticated: true,
      needsStravaConnect: true,
      source: "better-auth",
      user: {
        id: userId,
        email: betterSession.user.email,
        name: betterSession.user.name,
        image: betterSession.user.image,
      },
    };
  }

  const sessionId = getLegacySessionId(request);
  if (!sessionId) return { authenticated: false };

  const legacy = await getStoredToken(env, `session:${sessionId}`);
  if (!legacy) return { authenticated: false };

  return {
    authenticated: true,
    source: "legacy",
    athlete: buildAthleteSummary(legacy),
  };
}

export async function resolveStravaAccess(request: Request, env: Env, auth: Auth): Promise<StravaAccessContext | null> {
  const betterSession = await getBetterAuthSession(auth, request);
  if (betterSession?.user) {
    const linked = await getStoredToken(env, `strava:${betterSession.user.id}`);
    if (linked) {
      return {
        source: "better-auth",
        userId: betterSession.user.id,
        tokenData: linked,
        athlete: buildAthleteSummary(linked),
      };
    }
  }

  const sessionId = getLegacySessionId(request);
  if (!sessionId) return null;

  const legacy = await getStoredToken(env, `session:${sessionId}`);
  if (!legacy) return null;

  return {
    source: "legacy",
    sessionId,
    tokenData: legacy,
    athlete: buildAthleteSummary(legacy),
  };
}

export async function resolveStoredStravaKeys(env: Env, userId: string): Promise<{ clientId: string; clientSecret: string } | null> {
  const row = await env.DB.prepare(
    "SELECT client_id, client_secret_enc FROM strava_keys WHERE user_id = ?"
  )
    .bind(userId)
    .first<{ client_id: string; client_secret_enc: string }>();

  if (!row) return null;

  const clientSecret = await decrypt(row.client_secret_enc, env.BETTER_AUTH_SECRET);
  return {
    clientId: row.client_id,
    clientSecret,
  };
}
