import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import type { Env } from "./env";

export function createAuth(env: Env, baseURL: string) {
  const resend = new Resend(env.RESEND_API_KEY);
  const localOrigins = env.ENVIRONMENT !== "production"
    ? ["http://localhost:5173", "http://127.0.0.1:5173"]
    : [];

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    basePath: "/api/auth",
    database: env.DB,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        accessType: "offline",
        prompt: "select_account consent",
      },
    },
    plugins: [
      magicLink({
        expiresIn: 600,
        sendMagicLink: async ({ email, url }) => {
          await resend.emails.send({
            from: "RunViz <noreply@hwong103.work>",
            to: email,
            subject: "Your RunViz sign-in link",
            html: `
              <p>Click the link below to sign in to RunViz. It expires in 10 minutes.</p>
              <p>
                <a href="${url}">Sign in to RunViz</a>
              </p>
              <p>If you did not request this, you can safely ignore this email.</p>
            `,
          });
        },
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 28,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    trustedOrigins: [
      env.FRONTEND_URL,
      ...(env.ADDITIONAL_FRONTEND_URLS ? env.ADDITIONAL_FRONTEND_URLS.split(",").map((value) => value.trim()).filter(Boolean) : []),
      ...localOrigins,
    ],
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
