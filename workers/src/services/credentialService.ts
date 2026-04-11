import { decrypt, encrypt } from '../crypto';
import type { Env } from '../env';

export async function resolveStoredStravaKeys(
    env: Env,
    userId: string,
): Promise<{ clientId: string; clientSecret: string } | null> {
    const row = await env.DB.prepare(
        'SELECT client_id, client_secret_enc FROM strava_keys WHERE user_id = ?',
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

export async function saveStravaKeys(
    env: Env,
    userId: string,
    clientId: string,
    clientSecret: string,
): Promise<void> {
    const encryptedSecret = await encrypt(clientSecret, env.BETTER_AUTH_SECRET);
    await env.DB.prepare(
        `INSERT INTO strava_keys (user_id, client_id, client_secret_enc, created_at, updated_at)
         VALUES (?, ?, ?, unixepoch(), unixepoch())
         ON CONFLICT(user_id) DO UPDATE SET
           client_id = excluded.client_id,
           client_secret_enc = excluded.client_secret_enc,
           updated_at = unixepoch()`,
    ).bind(userId, clientId, encryptedSecret).run();
}

export async function getStravaKeyStatus(
    env: Env,
    userId: string,
): Promise<{ configured: boolean; clientId: string | null; updatedAt: number | null }> {
    const row = await env.DB.prepare(
        'SELECT client_id, updated_at FROM strava_keys WHERE user_id = ?',
    ).bind(userId).first<{ client_id: string; updated_at: number }>();

    return {
        configured: !!row,
        clientId: row?.client_id ?? null,
        updatedAt: row?.updated_at ?? null,
    };
}

export async function saveMaxHrPreference(
    env: Env,
    userId: string,
    maxHR: number,
): Promise<void> {
    await env.DB.prepare(
        `INSERT INTO user_preferences (user_id, max_hr, created_at, updated_at)
         VALUES (?, ?, unixepoch(), unixepoch())
         ON CONFLICT(user_id) DO UPDATE SET
           max_hr = excluded.max_hr,
           updated_at = unixepoch()`,
    ).bind(userId, Math.round(maxHR)).run();
}

export async function getMaxHrPreference(
    env: Env,
    userId: string,
): Promise<{ maxHR: number | null; updatedAt: number | null }> {
    const row = await env.DB.prepare(
        'SELECT max_hr, updated_at FROM user_preferences WHERE user_id = ?',
    ).bind(userId).first<{ max_hr: number | null; updated_at: number | null }>();

    return {
        maxHR: row?.max_hr ?? null,
        updatedAt: row?.updated_at ?? null,
    };
}

export async function clearMaxHrPreference(env: Env, userId: string): Promise<void> {
    await env.DB.prepare(
        'DELETE FROM user_preferences WHERE user_id = ?',
    ).bind(userId).run();
}
