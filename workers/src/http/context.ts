import type { Auth } from '../auth';
import type { Env } from '../env';

export interface RequestContext {
    request: Request;
    url: URL;
    env: Env;
    origin: string;
    auth: Auth;
}
