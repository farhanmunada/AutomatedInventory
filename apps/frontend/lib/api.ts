import type { ApiError } from '@repo/shared-types';

const TOKEN_KEY = 'inv_token';
const USER_KEY = 'inv_user';

export interface StoredUser {
  id: string;
  username: string;
}

export class ApiException extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiException';
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as StoredUser) : null;
}

export function setSession(token: string, user: StoredUser): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

/** Sends `{ [key]: value }` as a query string, skipping empty values. */
export function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Thin fetch wrapper: relative `/api` path (proxied to NestJS by next.config),
 * bearer token injection, and the PRD §7.1 error envelope mapped to ApiException.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (res.status === 204) return undefined as T;

  const payload = (await res.json().catch(() => null)) as ApiError | null;

  if (!res.ok) {
    // A 401 from anywhere except the login call itself means the token died:
    // drop the session and bounce. Login failures must stay on the form so the
    // caller can show the error.
    const isLoginAttempt = path.endsWith('/auth/login');
    if (res.status === 401 && !isLoginAttempt && typeof window !== 'undefined') {
      clearSession();
      window.location.assign('/login');
    }
    throw new ApiException(
      res.status,
      payload?.error?.code ?? 'INTERNAL_ERROR',
      payload?.error?.message ?? `Permintaan gagal (HTTP ${res.status}).`,
    );
  }

  return payload as T;
}
