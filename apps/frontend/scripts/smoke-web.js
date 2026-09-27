/**
 * Tier 2 smoke test for the Next.js frontend: real `next build` output served
 * by `next start`, proxying /api to the running NestJS backend.
 *
 * Usage (from repo root, backend must be up on API_URL, default :3001):
 *   pnpm --filter @repo/frontend test
 *
 * Checks SSR HTML for page-specific markup and exercises the /api rewrite so a
 * broken proxy or a mis-routed page fails loudly.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.SMOKE_FE_PORT || 3000);
const BASE = `http://localhost:${PORT}`;
const API_BASE = `${BASE}/api`;
const BACKEND_RESTARTED = !process.env.FRONTEND_TEST_NO_BACKEND_SPAWN;

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label} ${detail}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, options = {}) {
  const res = await fetch(url, { redirect: 'manual', ...options });
  const body = await res.text();
  return { status: res.status, location: res.headers.get('location'), body };
}

function start(command, args, env, cwd = process.cwd()) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.logs = [];
  const capture = (stream) => stream.on('data', (chunk) => child.logs.push(chunk.toString()));
  capture(child.stdout);
  capture(child.stderr);
  return child;
}

async function waitForHttp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(url).catch(() => null);
    if (res) return true;
    if (Date.now() > deadline) return false;
    await sleep(500);
  }
}

async function pageTests() {
  const routes = [
    ['/login', 'Masuk ke Dashboard'],
    ['/', 'Dashboard'],
    ['/products', 'Produk'],
    ['/lots', 'Inventory Lots'],
    ['/orders', 'Pesanan'],
    ['/orders/new', 'Buat Pesanan'],
  ];

  for (const [route, marker] of routes) {
    const res = await get(`${BASE}${route}`);
    check(
      `SSR ${route} renders 200 with "${marker}"`,
      res.status === 200 && res.body.includes(marker) && !res.body.includes('__next_error__'),
      `status=${res.status}`,
    );
  }

  const detail = await get(`${BASE}/products/00000000-0000-4000-8000-000000000000`);
  check('SSR dynamic /products/[id] renders', detail.status === 200 && !detail.body.includes('__next_error__'));

  const orderDetail = await get(`${BASE}/orders/00000000-0000-4000-8000-000000000000`);
  check('SSR dynamic /orders/[id] renders', orderDetail.status === 200 && !orderDetail.body.includes('__next_error__'));
}

async function proxyTests() {
  const health = await get(`${API_BASE}/health`);
  check('/api/health reachable through the Next rewrite', health.status === 200, `status=${health.status}`);

  const noAuth = await get(`${API_BASE}/products`);
  check('/api/products without token -> 401 (not swallowed by Next)', noAuth.status === 401, `status=${noAuth.status}`);

  const bad = await get(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'definitely-wrong-1' }),
  });
  check(
    'login via proxy returns the API error envelope (survives to the form)',
    bad.status === 401 && JSON.parse(bad.body).error.code === 'INVALID_CREDENTIALS',
    `status=${bad.status} body=${bad.body.slice(0, 120)}`,
  );

  const login = await get(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: process.env.SEED_PASSWORD || 'admin123',
    }),
  });
  const token = JSON.parse(login.body).access_token;
  check('login via proxy yields a token', login.status === 200 && Boolean(token), `status=${login.status}`);

  const protectedGet = await get(`${API_BASE}/dashboard/order-stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(
    'authenticated API call through the proxy returns data',
    protectedGet.status === 200 && typeof JSON.parse(protectedGet.body).total === 'number',
    `status=${protectedGet.status} body=${protectedGet.body.slice(0, 120)}`,
  );

  const validation = await get(`${API_BASE}/products?limit=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(
    'backend validation error surfaces as 400 through the proxy',
    validation.status === 400 && JSON.parse(validation.body).error.code === 'VALIDATION_ERROR',
    `status=${validation.status}`,
  );
}

async function main() {
  const missingBuild = !require('node:fs').existsSync(path.join(process.cwd(), '.next', 'BUILD_ID'));
  if (missingBuild) {
    console.error('PRECONDITION FAILED: run `pnpm --filter @repo/frontend build` first.');
    process.exit(1);
  }

  const backendDir = path.resolve(__dirname, '../../../apps/backend');
  const backend = BACKEND_RESTARTED
    ? start(process.execPath, [path.join(backendDir, 'dist', 'src', 'main.js')], { PORT: '3001' }, backendDir)
    : null;
  if (backend) {
    const up = await waitForHttp('http://localhost:3001/api/health');
    if (!up) {
      console.error('backend did not start:', backend.logs.join('').slice(-2000));
      process.exit(1);
    }
  }

// next's CLI is invoked through node so child.kill() terminates the actual
// server rather than leaving a grandchild behind on Windows.
const NEXT_BIN = path.resolve(__dirname, '../node_modules/next/dist/bin/next');
const frontend = start(process.execPath, [NEXT_BIN, 'start', '-p', String(PORT)], {
  API_URL: process.env.API_URL || 'http://localhost:3001/api',
});

  try {
    const up = await waitForHttp(`${BASE}/login`);
    if (!up) {
      console.error('frontend did not start:', frontend.logs.join('').slice(-2000));
      failures.push('runner: frontend never became reachable');
    } else {
      console.log(`frontend up on :${PORT} (proxy -> ${process.env.API_URL || 'http://localhost:3001/api'})`);
      await pageTests();
      await proxyTests();
    }
  } catch (error) {
    failures.push(`runner: ${error.message}`);
    console.error('RUNNER ERROR', error);
    console.error('--- frontend log ---');
    console.error(frontend.logs.join('').slice(-4000));
  } finally {
    frontend.kill();
    backend?.kill();
  }

  console.log(`\nRESULT: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('failed:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main();
