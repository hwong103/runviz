var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-2l25zF/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/index.ts
function corsHeaders(origin) {
  const allowedOrigins = [
    "https://hwong103.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ];
  const isAllowed = allowedOrigins.includes(origin) || origin.endsWith(".hwong103.github.io");
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true"
  };
}
__name(corsHeaders, "corsHeaders");
function getSessionId(request) {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(/runviz_session=([^;]+)/);
  return match ? match[1] : null;
}
__name(getSessionId, "getSessionId");
function generateSessionId() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(generateSessionId, "generateSessionId");
var STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
var STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
var STRAVA_API_URL = "https://www.strava.com/api/v3";
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || env.FRONTEND_URL;
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    try {
      if (url.pathname === "/auth/strava") {
        return handleAuthStart(url, env, origin);
      }
      if (url.pathname === "/auth/callback") {
        return await handleAuthCallback(request, env, origin);
      }
      if (url.pathname === "/auth/session") {
        return await handleSession(request, env, origin);
      }
      if (url.pathname === "/auth/logout") {
        return handleLogout(origin);
      }
      if (url.pathname.startsWith("/api/")) {
        return await handleApiRequest(request, url, env, origin);
      }
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        {
          status: 500,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
        }
      );
    }
  }
};
function handleAuthStart(url, env, origin) {
  const redirectUri = url.searchParams.get("redirect_uri") || `${env.FRONTEND_URL}/callback`;
  const authUrl = new URL(STRAVA_AUTH_URL);
  authUrl.searchParams.set("client_id", env.STRAVA_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "read,activity:read_all");
  authUrl.searchParams.set("state", generateSessionId().slice(0, 16));
  return Response.redirect(authUrl.toString(), 302);
}
__name(handleAuthStart, "handleAuthStart");
async function handleAuthCallback(request, env, origin) {
  const body = await request.json();
  const code = body.code;
  if (!code) {
    return new Response(
      JSON.stringify({ error: "Missing authorization code" }),
      { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
  const tokenResponse = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code"
    })
  });
  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error("Token exchange failed:", error);
    return new Response(
      JSON.stringify({ error: "Token exchange failed" }),
      { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
  const tokenData = await tokenResponse.json();
  const sessionId = generateSessionId();
  const storedData = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: tokenData.expires_at,
    athleteId: tokenData.athlete.id,
    athleteName: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`,
    athleteProfile: tokenData.athlete.profile
  };
  await env.TOKENS.put(`session:${sessionId}`, JSON.stringify(storedData), {
    expirationTtl: 60 * 60 * 24 * 30
    // 30 days
  });
  return new Response(
    JSON.stringify({
      athlete: {
        id: tokenData.athlete.id,
        firstname: tokenData.athlete.firstname,
        lastname: tokenData.athlete.lastname,
        profile: tokenData.athlete.profile
      }
    }),
    {
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
        "Set-Cookie": `runviz_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=2592000`
      }
    }
  );
}
__name(handleAuthCallback, "handleAuthCallback");
async function handleSession(request, env, origin) {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return new Response(
      JSON.stringify({ authenticated: false }),
      { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
  const stored = await env.TOKENS.get(`session:${sessionId}`);
  if (!stored) {
    return new Response(
      JSON.stringify({ authenticated: false }),
      { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
  const tokenData = JSON.parse(stored);
  return new Response(
    JSON.stringify({
      authenticated: true,
      athlete: {
        id: tokenData.athleteId,
        firstname: tokenData.athleteName.split(" ")[0],
        lastname: tokenData.athleteName.split(" ").slice(1).join(" "),
        profile: tokenData.athleteProfile
      }
    }),
    { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
  );
}
__name(handleSession, "handleSession");
function handleLogout(origin) {
  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
        "Set-Cookie": "runviz_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0"
      }
    }
  );
}
__name(handleLogout, "handleLogout");
async function handleApiRequest(request, url, env, origin) {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
  const stored = await env.TOKENS.get(`session:${sessionId}`);
  if (!stored) {
    return new Response(
      JSON.stringify({ error: "Session expired" }),
      { status: 401, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
  let tokenData = JSON.parse(stored);
  if (tokenData.expiresAt < Date.now() / 1e3) {
    const refreshResponse = await fetch(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        refresh_token: tokenData.refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!refreshResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Token refresh failed" }),
        { status: 401, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
      );
    }
    const refreshData = await refreshResponse.json();
    tokenData = {
      ...tokenData,
      accessToken: refreshData.access_token,
      refreshToken: refreshData.refresh_token,
      expiresAt: refreshData.expires_at
    };
    await env.TOKENS.put(`session:${sessionId}`, JSON.stringify(tokenData), {
      expirationTtl: 60 * 60 * 24 * 30
    });
  }
  const stravaPath = url.pathname.replace("/api", "").replace(/\/$/, "");
  const stravaUrl = new URL(`${STRAVA_API_URL}${stravaPath}`);
  url.searchParams.forEach((value, key) => stravaUrl.searchParams.set(key, value));
  const stravaResponse = await fetch(stravaUrl.toString(), {
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`
    }
  });
  const data = await stravaResponse.json();
  if (stravaPath === "/athlete/activities" || stravaPath === "/activities") {
    const activities = Array.isArray(data) ? data : [];
    const perPage = parseInt(url.searchParams.get("per_page") || "30");
    return new Response(
      JSON.stringify({
        activities,
        hasMore: activities.length === perPage,
        error: !Array.isArray(data) ? data : void 0
      }),
      { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
  return new Response(JSON.stringify(data), {
    status: stravaResponse.status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
  });
}
__name(handleApiRequest, "handleApiRequest");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-2l25zF/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-2l25zF/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
