import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:3001/api';

/**
 * Same-origin during dev: the browser only ever talks to the Next.js origin and
 * `/api/*` is proxied to NestJS. That removes CORS entirely (per ADR-8) and lets
 * the client keep a relative base URL.
 */
const config: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

export default config;
