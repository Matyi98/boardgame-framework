/**
 * Tiny fetch wrapper that targets the API gateway (Traefik). All requests are
 * relative — Traefik routes `/api/auth`, `/api/lobby`, `/api/games` to the
 * right service. In dev, set `VITE_API_BASE` if not co-hosted.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export interface ApiOptions {
  token?: string | null;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: ApiOptions = {}): Promise<T> {
  const qs = opts.query
    ? '?' + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()
    : '';
  const res = await fetch(`${API_BASE}${path}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errBody.message ?? res.statusText, errBody.code);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
