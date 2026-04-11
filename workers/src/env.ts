export interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    ACTIVITY_VECTORS: VectorizeIndex;
    TOKENS: KVNamespace;
    RUNVIZ_KV: KVNamespace;
    AI: {
        run(model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast', options: {
            messages: Array<{ role: 'system' | 'user'; content: string }>;
            max_tokens: number;
        }): Promise<{ response?: string }>;
        run(model: '@cf/baai/bge-large-en-v1.5', options: {
            text: string[];
        }): Promise<{ data: number[][] }>;
    };
    BETTER_AUTH_SECRET: string;
    RESEND_API_KEY: string;
    FRONTEND_URL: string;
    FRONTEND_PREVIEW_HOST?: string;
    ADDITIONAL_FRONTEND_URLS?: string;
    ORS_API_KEY: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI: string;
    ENVIRONMENT?: string;
}
