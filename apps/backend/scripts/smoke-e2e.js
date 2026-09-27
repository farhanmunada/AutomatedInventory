/**
 * Tier 2 end-to-end smoke test — runs against a REAL Neon database and a REAL
 * HTTP server. No mocks: every assertion checks observable behaviour.
 *
 * Usage:  pnpm --filter @repo/backend test
 * Requires DATABASE_URL(_UNPOOLED) + JWT_SECRET in the root .env.
 *
 * Test rows are tagged with an "E2E-<timestamp>" SKU prefix and are deleted at
 * the end, so the suite is repeatable and never touches unrelated data.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');
const { config } = require('dotenv');

config({ path: path.resolve(process.cwd(), '../../.env') });

const PORT = Number(process.env.SMOKE_PORT || 3999);
const BASE = `http://localhost:${PORT}/api`;
const STAMP = Date.now();
const PREFIX = `E2E-${STAMP}`;

let token = '';
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

async function req(method, apiPath, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!opts.noAuth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${apiPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, body: json };
}

async function waitForServer(client, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet — also verify the child did not die */
      const alive = await client.query('select 1 as ok').catch(() => null);
      if (!alive) throw new Error('database connection lost while waiting for server');
    }
    if (Date.now() > deadline) throw new Error('server did not become healthy in time');
    await new Promise((r) => setTimeout(r, 500));
  }
}

function startServer() {
  const main = path.join(process.cwd(), 'dist', 'src', 'main.js');
  const child = spawn(process.execPath, [main], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  const capture = (stream) => stream.on('data', (chunk) => logs.push(chunk.toString()));
  capture(child.stdout);
  capture(child.stderr);
  child.logs = logs;
  return child;
}

const sku = (letter) => `${PREFIX}-${letter}`;

async function loginTests() {
  const bad = await req('POST', '/auth/login', { username: 'admin', password: 'wrongpassword' }, { noAuth: true });
  check('login wrong password -> 401 INVALID_CREDENTIALS', bad.status === 401 && bad.body?.error?.code === 'INVALID_CREDENTIALS', JSON.stringify(bad.body));

  const login = await req('POST', '/auth/login', { username: 'admin', password: process.env.SEED_PASSWORD || 'admin123' }, { noAuth: true });
  check('login -> 200 + access_token + user', login.status === 200 && !!login.body?.access_token && login.body?.user?.username === 'admin', JSON.stringify(login.body));
  token = login.body?.access_token ?? '';

  const noAuth = await req('GET', '/products', null, { noAuth: true });
  check('GET /products without token -> 401', noAuth.status === 401, `got ${noAuth.status}`);
}

async function productTests() {
  const a = await req('POST', '/products', { sku: sku('A'), name: 'Kopi A', min_buffer_stock: 20 });
  check('create product -> 201 with available_stock 0', a.status === 201 && a.body.available_stock === 0 && !!a.body.id, JSON.stringify(a.body));

  const b = await req('POST', '/products', { sku: sku('B'), name: 'Kopi B', min_buffer_stock: 5 });
  check('create 2nd product -> 201', b.status === 201);

  const dup = await req('POST', '/products', { sku: sku('A'), name: 'Dup', min_buffer_stock: 1 });
  check('duplicate SKU -> 409 SKU_ALREADY_EXISTS', dup.status === 409 && dup.body?.error?.code === 'SKU_ALREADY_EXISTS', JSON.stringify(dup.body));

  const missing = await req('POST', '/products', { sku: sku('M'), name: 'X' });
  check('missing min_buffer_stock -> 400 VALIDATION_ERROR', missing.status === 400 && missing.body?.error?.code === 'VALIDATION_ERROR', JSON.stringify(missing.body));

  const negative = await req('POST', '/products', { sku: sku('N'), name: 'X', min_buffer_stock: -5 });
  check('negative min_buffer_stock -> 400', negative.status === 400, `got ${negative.status}`);

  const patched = await req('PATCH', `/products/${b.body.id}`, { name: 'Kopi B Renamed' });
  check('PATCH product -> 200 with new name', patched.status === 200 && patched.body.name === 'Kopi B Renamed');

  return { a: a.body, b: b.body };
}

async function lotTests(products) {
  const lotA = await req('POST', '/lots', { product_id: products.a.id, purchase_price: '50000.00', initial_qty: 10, received_at: '2026-09-20T00:00:00.000Z' });
  check('create Lot-A (10 @ 50000, older) -> 201', lotA.status === 201 && lotA.body.available_qty === 10, JSON.stringify(lotA.body));

  const lotB = await req('POST', '/lots', { product_id: products.a.id, purchase_price: '55000.00', initial_qty: 100, received_at: '2026-09-27T00:00:00.000Z' });
  check('create Lot-B (100 @ 55000, newer) -> 201', lotB.status === 201 && lotB.body.available_qty === 100);

  const detail = await req('GET', `/products/${products.a.id}`);
  check('product detail aggregates stock across lots (110)', detail.status === 200 && detail.body.available_stock === 110 && detail.body.lots?.length === 2, `available_stock=${detail.body?.available_stock}`);

  const zeroQty = await req('POST', '/lots', { product_id: products.a.id, purchase_price: '1.00', initial_qty: 0, received_at: '2026-09-26T00:00:00.000Z' });
  check('lot initial_qty 0 rejected -> 400', zeroQty.status === 400, `got ${zeroQty.status}`);

  const ghost = await req('POST', '/lots', { product_id: '00000000-0000-4000-8000-000000000000', purchase_price: '1.00', initial_qty: 1, received_at: '2026-09-26T00:00:00.000Z' });
  check('lot for unknown product -> 404 PRODUCT_NOT_FOUND', ghost.status === 404 && ghost.body?.error?.code === 'PRODUCT_NOT_FOUND', `got ${ghost.status}`);

  return { lotA: lotA.body, lotB: lotB.body };
}

async function stockOf(productId) {
  const res = await req('GET', `/products/${productId}`);
  return res.body?.available_stock;
}

async function qtyOf(lotId, productId) {
  const res = await req('GET', `/lots?product_id=${productId}`);
  return res.body.data.find((l) => l.id === lotId)?.available_qty;
}

async function fifoTests(products, lots) {
  const created = await req('POST', '/orders', { channel: 'WEB', items: [{ product_id: products.a.id, requested_qty: 12 }] });
  check('create order -> 201 DRAFT + order_number', created.status === 201 && created.body.status === 'DRAFT' && /^ORD-\d{6}$/.test(created.body.order_number), JSON.stringify(created.body));
  const orderId = created.body.id;

  const draftDetail = await req('GET', `/orders/${orderId}`);
  check('DRAFT order reserves nothing (no allocations, stock 110)', draftDetail.body.items[0].allocations.length === 0 && (await stockOf(products.a.id)) === 110);

  const reserved = await req('PATCH', `/orders/${orderId}/status`, { status: 'RESERVED' });
  check('DRAFT -> RESERVED -> 200', reserved.status === 200 && reserved.body.status === 'RESERVED', JSON.stringify(reserved.body));

  const detail = await req('GET', `/orders/${orderId}`);
  const allocs = detail.body.items[0].allocations;
  const fromA = allocs.find((x) => x.lot_id === lots.lotA.id)?.allocated_qty;
  const fromB = allocs.find((x) => x.lot_id === lots.lotB.id)?.allocated_qty;
  check('PRD 5.1.1 FIFO allocates oldest lot first: Lot-A=10, Lot-B=2', fromA === 10 && fromB === 2, JSON.stringify(allocs));
  check('PRD 5.1.1 lots depleted accordingly: Lot-A=0, Lot-B=98', (await qtyOf(lots.lotA.id, products.a.id)) === 0 && (await qtyOf(lots.lotB.id, products.a.id)) === 98);
  check('available_stock drops to 98', (await stockOf(products.a.id)) === 98);
  check('PRD 5.1.1 allocations ordered by lot received_at', allocs[0].lot_received_at < allocs[1].lot_received_at);

  const skipAhead = await req('PATCH', `/orders/${orderId}/status`, { status: 'SHIPPED' });
  check('RESERVED -> SHIPPED rejected 409 INVALID_TRANSITION', skipAhead.status === 409 && skipAhead.body?.error?.code === 'INVALID_TRANSITION', `got ${skipAhead.status}`);

  const packed = await req('PATCH', `/orders/${orderId}/status`, { status: 'PACKED' });
  check('RESERVED -> PACKED -> 200', packed.status === 200 && packed.body.status === 'PACKED');
  check('PRD 5.2.1 packing does not move stock', (await stockOf(products.a.id)) === 98);

  const shipped = await req('PATCH', `/orders/${orderId}/status`, { status: 'SHIPPED' });
  check('PACKED -> SHIPPED -> 200 (final)', shipped.status === 200 && shipped.body.status === 'SHIPPED');

  const cancelShipped = await req('PATCH', `/orders/${orderId}/status`, { status: 'CANCELLED' });
  check('PRD 5.4.4 SHIPPED cannot be cancelled -> 409', cancelShipped.status === 409 && cancelShipped.body?.error?.code === 'INVALID_TRANSITION', `got ${cancelShipped.status}`);

  const audit = await req('GET', `/orders/${orderId}`);
  check('PRD 5.3.1 allocations preserved for audit after SHIPPED', audit.body.items[0].allocations.length === 2);

  return orderId;
}

async function insufficientStockTests(products) {
  await req('POST', '/lots', { product_id: products.b.id, purchase_price: '1000.00', initial_qty: 5, received_at: '2026-09-25T00:00:00.000Z' });
  const order = await req('POST', '/orders', { channel: 'POS', items: [{ product_id: products.b.id, requested_qty: 12 }] });
  const failed = await req('PATCH', `/orders/${order.body.id}/status`, { status: 'RESERVED' });
  check('PRD 5.1.2 insufficient stock -> 409 INSUFFICIENT_STOCK', failed.status === 409 && failed.body?.error?.code === 'INSUFFICIENT_STOCK', JSON.stringify(failed.body));

  const detail = await req('GET', `/orders/${order.body.id}`);
  const qty = await qtyOf((await req('GET', `/lots?product_id=${products.b.id}`)).body.data[0].id, products.b.id);
  check('PRD 5.1.2 order stays DRAFT with no allocations and stock intact', detail.body.status === 'DRAFT' && detail.body.items[0].allocations.length === 0 && qty === 5, `status=${detail.body.status} qty=${qty}`);
}

async function cancelTests(products, lots) {
  const order = await req('POST', '/orders', { channel: 'WEB', items: [{ product_id: products.a.id, requested_qty: 3 }] });
  const reserved = await req('PATCH', `/orders/${order.body.id}/status`, { status: 'RESERVED' });
  check('reserve 3 units from Lot-B -> 200', reserved.status === 200);
  check('Lot-B reduced to 95', (await qtyOf(lots.lotB.id, products.a.id)) === 95);

  const cancelled = await req('PATCH', `/orders/${order.body.id}/status`, { status: 'CANCELLED' });
  check('RESERVED -> CANCELLED -> 200', cancelled.status === 200 && cancelled.body.status === 'CANCELLED');
  check('PRD 5.4.1 stock returned to the exact lot (98)', (await qtyOf(lots.lotB.id, products.a.id)) === 98);
  const detail = await req('GET', `/orders/${order.body.id}`);
  check('PRD 5.4.1 allocation rows deleted', detail.body.items[0].allocations.length === 0);

  const second = await req('PATCH', `/orders/${order.body.id}/status`, { status: 'CANCELLED' });
  check('PRD 5.4.5 repeat cancel is idempotent no-op', [200, 409].includes(second.status), `got ${second.status}`);
  check('PRD 5.4.5 stock not double-returned', (await qtyOf(lots.lotB.id, products.a.id)) === 98);

  const draft = await req('POST', '/orders', { channel: 'POS', items: [{ product_id: products.b.id, requested_qty: 2 }] });
  const draftCancel = await req('PATCH', `/orders/${draft.body.id}/status`, { status: 'CANCELLED' });
  check('PRD 5.4.3 DRAFT cancel leaves stock untouched', draftCancel.status === 200 && (await stockOf(products.b.id)) === 5);
}

async function validationTests(products) {
  const ghost = await req('POST', '/orders', { channel: 'WEB', items: [{ product_id: '00000000-0000-4000-8000-000000000000', requested_qty: 1 }] });
  check('PRD 4.1.4 unknown product -> 404 PRODUCT_NOT_FOUND', ghost.status === 404 && ghost.body?.error?.code === 'PRODUCT_NOT_FOUND', JSON.stringify(ghost.body));

  const dupLine = await req('POST', '/orders', { channel: 'WEB', items: [{ product_id: products.a.id, requested_qty: 2 }, { product_id: products.a.id, requested_qty: 3 }] });
  check('PRD 4.1.3 duplicate line item -> 400', dupLine.status === 400, `got ${dupLine.status}`);

  const zeroQty = await req('POST', '/orders', { channel: 'WEB', items: [{ product_id: products.a.id, requested_qty: 0 }] });
  check('PRD 4.1.2 requested_qty 0 -> 400', zeroQty.status === 400, `got ${zeroQty.status}`);

  const emptyItems = await req('POST', '/orders', { channel: 'WEB', items: [] });
  check('order without items -> 400', emptyItems.status === 400, `got ${emptyItems.status}`);

  const badStatus = await req('POST', '/orders', { channel: 'EMAIL', items: [{ product_id: products.a.id, requested_qty: 1 }] });
  check('invalid channel -> 400', badStatus.status === 400, `got ${badStatus.status}`);
}

async function concurrencyTests(products) {
  const c = await req('POST', '/products', { sku: sku('C'), name: 'Kopi C', min_buffer_stock: 0 });
  await req('POST', '/lots', { product_id: c.body.id, purchase_price: '1000.00', initial_qty: 10, received_at: '2026-09-26T00:00:00.000Z' });
  const oA = await req('POST', '/orders', { channel: 'WEB', items: [{ product_id: c.body.id, requested_qty: 8 }] });
  const oB = await req('POST', '/orders', { channel: 'POS', items: [{ product_id: c.body.id, requested_qty: 8 }] });

  const [rA, rB] = await Promise.all([
    req('PATCH', `/orders/${oA.body.id}/status`, { status: 'RESERVED' }),
    req('PATCH', `/orders/${oB.body.id}/status`, { status: 'RESERVED' }),
  ]);
  const codes = [rA.status, rB.status].sort();
  check('PRD 5.1.3 concurrent reserve: exactly one 200, other 409', codes[0] === 200 && codes[1] === 409, `got ${JSON.stringify(codes)}`);
  check('PRD 5.1.3 no oversell: remaining stock is 2 of 10', (await stockOf(c.body.id)) === 2, `got ${await stockOf(c.body.id)}`);
}

async function queryTests(products, lots) {
  const filtered = await req('GET', '/orders?status=CANCELLED&page=1&limit=5');
  const allCancelled = filtered.body.data.every((o) => o.status === 'CANCELLED');
  check('GET /orders?status=CANCELLED filters rows + honours limit', filtered.status === 200 && allCancelled && filtered.body.meta.limit === 5);

  const channel = await req('GET', '/orders?channel=POS');
  check('GET /orders?channel=POS filters rows', channel.status === 200 && channel.body.data.every((o) => o.channel === 'POS'));

  const search = await req('GET', `/products?search=${sku('A')}`);
  check('GET /products?search= matches SKU', search.status === 200 && search.body.data.length === 1 && search.body.meta.total === 1);

  const sorted = await req('GET', '/products?sort=sku:asc');
  const skus = sorted.body.data.map((p) => p.sku);
  check('GET /products?sort=sku:asc sorts ascending', sorted.status === 200 && JSON.stringify(skus) === JSON.stringify([...skus].sort()));

  const capped = await req('GET', '/products?limit=500');
  check('pagination rejects limit above 100', capped.status === 400, `got ${capped.status}`);

  const badUuid = await req('GET', '/products/not-a-uuid');
  check('invalid UUID param -> 400', badUuid.status === 400, `got ${badUuid.status}`);

  const missing = await req('GET', '/products/00000000-0000-4000-8000-000000000000');
  check('unknown product id -> 404 NOT_FOUND', missing.status === 404 && missing.body?.error?.code === 'NOT_FOUND', `got ${missing.status}`);

  const unknownOrder = await req('PATCH', '/orders/00000000-0000-4000-8000-000000000000/status', { status: 'RESERVED' });
  check('transition on unknown order -> 404', unknownOrder.status === 404, `got ${unknownOrder.status}`);

  return { productId: products.a.id, lotId: lots.lotB.id };
}

async function dashboardTests(products, lots, client) {
  const summary = await req('GET', '/dashboard/stock-summary');
  const row = summary.body.find((r) => r.product_id === products.a.id);
  check('stock-summary returns per-product totals', summary.status === 200 && row?.total_qty === 98, JSON.stringify(row));

  const valuation = await req('GET', '/dashboard/stock-valuation');
  const val = valuation.body.find((r) => r.product_id === products.a.id);
  const expected = 98 * 55000 + 0 * 50000;
  check(`stock-valuation = sum(qty x price) FIFO (${expected})`, Number(val?.total_value) === expected, `got ${val?.total_value}`);
  const values = valuation.body.map((r) => Number(r.total_value));
  check('stock-valuation sorted descending by value', JSON.stringify(values) === JSON.stringify([...values].sort((x, y) => y - x)));

  const low = await req('GET', '/dashboard/low-stock');
  const lowB = low.body.find((r) => r.product_id === products.b.id);
  check('low-stock lists product at/below buffer (5 <= 5)', !!lowB && lowB.total_qty === 5 && lowB.min_buffer_stock === 5, JSON.stringify(lowB));
  check('low-stock excludes healthy product (A: 98 > 20)', !low.body.some((r) => r.product_id === products.a.id));

  // Cross-check order stats against an independent DB aggregate.
  const stats = await req('GET', '/dashboard/order-stats');
  const dbStats = await client.query(
    `select status, count(*)::int as total from orders group by status`,
  );
  const expectedByStatus = Object.fromEntries(dbStats.rows.map((r) => [r.status, r.total]));
  const dbTotal = dbStats.rows.reduce((sum, r) => sum + r.total, 0);

  const matches = Object.entries(expectedByStatus).every(([status, total]) => stats.body.by_status[status] === total);
  check('order-stats by_status matches database', matches && stats.body.total === dbTotal, `api=${JSON.stringify(stats.body.by_status)} db=${JSON.stringify(expectedByStatus)}`);
  check('order-stats includes all five statuses', Object.keys(stats.body.by_status).length === 5);
  check('order-stats by_channel sums to total', Object.values(stats.body.by_channel).reduce((x, y) => x + y, 0) === stats.body.total, JSON.stringify(stats.body.by_channel));
  check('order-stats counts the cancelled test orders', stats.body.by_status.CANCELLED >= 2);
}

async function deleteTests(products) {
  const withStock = await req('DELETE', `/products/${products.a.id}`);
  check('PRD 2.3.1 delete product that has stock -> 409 PRODUCT_HAS_STOCK', withStock.status === 409 && withStock.body?.error?.code === 'PRODUCT_HAS_STOCK', `got ${withStock.status}`);

  const empty = await req('POST', '/products', { sku: sku('D'), name: 'Kopi D', min_buffer_stock: 0 });
  const deleted = await req('DELETE', `/products/${empty.body.id}`);
  check('PRD 2.3.2 delete empty product -> 204', deleted.status === 204, `got ${deleted.status}`);

  const again = await req('DELETE', `/products/${empty.body.id}`);
  check('delete already-deleted product -> 404', again.status === 404, `got ${again.status}`);
}

async function rateLimitTests() {
  // loginTests() already consumed 2 attempts, and earlier ones may have slid
  // out of the window while the suite ran — assert the ceiling, not the exact count.
  let granted = 0;
  let limited = null;
  for (let i = 0; i < 12; i += 1) {
    const res = await req('POST', '/auth/login', { username: 'admin', password: 'wrongpassword' }, { noAuth: true });
    if (res.status === 429) {
      limited = res;
      break;
    }
    granted += 1;
  }

  check('PRD 4.2 login rate limit -> 429 RATE_LIMITED', limited?.body?.error?.code === 'RATE_LIMITED', JSON.stringify(limited?.body));
  check(`PRD 4.2 at most 10 login attempts per minute (observed ${granted} granted before the block)`, limited !== null && granted <= 10, `granted=${granted}`);

  const protectedRes = await req('GET', '/products');
  check('rate limiting does not affect authenticated reads', protectedRes.status === 200);
}

async function cleanup(client) {
  await client.query(`
    with e2e_products as (
      select id from products where sku like '${PREFIX}%'
    ),
    e2e_orders as (
      select distinct i.order_id as id
      from order_items i join e2e_products p on p.id = i.product_id
    ),
    drop_allocations as (
      delete from order_item_allocations a
      where a.order_item_id in (select i.id from order_items i join e2e_orders o on o.id = i.order_id)
    ),
    drop_items as (
      delete from order_items i where i.order_id in (select id from e2e_orders)
    ),
    drop_lots as (
      delete from inventory_lots l where l.product_id in (select id from e2e_products)
    ),
    drop_orders as (
      delete from orders o where o.id in (select id from e2e_orders)
    )
    delete from products where sku like '${PREFIX}%'
  `);

  const left = await client.query(
    `select (select count(*) from products where sku like '${PREFIX}%') as tagged_products,
            (select count(*) from orders) as remaining_orders,
            (select count(*) from inventory_lots) as remaining_lots`,
  );
  console.log('cleanup report:', JSON.stringify(left.rows[0]));
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();

  const admins = await client.query(`select count(*)::int as n from users where username = 'admin'`);
  if (admins.rows[0].n === 0) {
    console.error("PRECONDITION FAILED: no 'admin' user. Run: pnpm seed:admin --username=admin --password=admin123");
    await client.end();
    process.exit(1);
  }

  const server = startServer();
  try {
    await waitForServer(client);
    console.log(`server up on :${PORT}`);

    await loginTests();
    const products = await productTests();
    const lots = await lotTests(products);
    await fifoTests(products, lots);
    await insufficientStockTests(products);
    await cancelTests(products, lots);
    await validationTests(products);
    await concurrencyTests(products);
    await queryTests(products, lots);
    await dashboardTests(products, lots, client);
    await deleteTests(products);
    await rateLimitTests();
  } catch (error) {
    failures.push(`runner: ${error.message}`);
    console.error('RUNNER ERROR', error);
    console.log('--- server log ---');
    console.log(server.logs.join('').slice(-4000));
  } finally {
    server.kill();
    await cleanup(client).catch((e) => console.error('cleanup failed:', e.message));
    await client.end();
  }

  console.log(`\nRESULT: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('failed:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main();