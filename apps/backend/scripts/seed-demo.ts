/**
 * Seeds realistic demo data (products, FIFO lots, orders in every status)
 * through the service layer so stock invariants stay valid.
 *
 * Idempotent: SKUs use the "DEMO-" prefix; re-running skips existing products
 * and skips order creation once enough orders exist.
 *
 * Usage: pnpm seed:demo
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { NestFactory } from '@nestjs/core';
import type {
  CreateLotDto,
  CreateProductDto,
  OrderStatus,
} from '@repo/shared-types';
import { ORDER_CHANNEL } from '@repo/shared-types';
import { AppModule } from '../src/app.module';
import { DB_TOKEN, type AppDb } from '../src/core/database/db.module';
import { orders as ordersTable } from '../src/core/database/schema';
import { LotsService } from '../src/modules/lots/lots.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { ProductsService } from '../src/modules/products/products.service';

const DAY_MS = 24 * 60 * 60 * 1000;

interface LotSpec {
  price: string;
  qty: number;
  daysAgo: number;
}

interface ProductSpec {
  sku: string;
  name: string;
  buffer: number;
  lots: LotSpec[];
}

const PRODUCTS: ProductSpec[] = [
  { sku: 'DEMO-RICE-5KG', name: 'Beras Premium 5 kg', buffer: 40, lots: [
    { price: '62000', qty: 120, daysAgo: 40 },
    { price: '63500', qty: 80, daysAgo: 12 },
  ] },
  { sku: 'DEMO-OIL-2L', name: 'Minyak Goreng 2 L', buffer: 60, lots: [
    { price: '34000', qty: 200, daysAgo: 30 },
    { price: '35200', qty: 90, daysAgo: 6 },
  ] },
  { sku: 'DEMO-SUGAR-1KG', name: 'Gula Pasir 1 kg', buffer: 50, lots: [
    { price: '16500', qty: 140, daysAgo: 25 },
  ] },
  { sku: 'DEMO-COFFEE-165G', name: 'Kopi Sachet 165 g', buffer: 100, lots: [
    { price: '11200', qty: 300, daysAgo: 18 },
    { price: '11800', qty: 150, daysAgo: 3 },
  ] },
  { sku: 'DEMO-TEA-BOX', name: 'Teh Celup isi 25', buffer: 40, lots: [
    { price: '9800', qty: 60, daysAgo: 22 },
  ] },
  { sku: 'DEMO-MILK-1L', name: 'Susu UHT 1 L', buffer: 80, lots: [
    { price: '18500', qty: 100, daysAgo: 9 },
    { price: '19000', qty: 70, daysAgo: 2 },
  ] },
  { sku: 'DEMO-NOODLE-DUS', name: 'Mie Instan dus (40)', buffer: 30, lots: [
    { price: '103000', qty: 55, daysAgo: 35 },
  ] },
  { sku: 'DEMO-FLOUR-1KG', name: 'Tepung Terigu 1 kg', buffer: 45, lots: [
    { price: '12400', qty: 90, daysAgo: 15 },
    { price: '12900', qty: 40, daysAgo: 4 },
  ] },
  { sku: 'DEMO-EGG-TRAY', name: 'Telur Ayam tray (30)', buffer: 25, lots: [
    { price: '48000', qty: 35, daysAgo: 5 },
  ] },
  { sku: 'DEMO-GAS-3KG', name: 'Gas LPG 3 kg', buffer: 20, lots: [
    { price: '21000', qty: 18, daysAgo: 8 },
  ] },
  { sku: 'DEMO-SOAP-BOX', name: 'Sabun Mandi box (12)', buffer: 30, lots: [
    { price: '38500', qty: 26, daysAgo: 20 },
  ] },
  { sku: 'DEMO-WATER-GALON', name: 'Air Minum Galon 19 L', buffer: 35, lots: [
    { price: '22000', qty: 50, daysAgo: 7 },
    { price: '22500', qty: 30, daysAgo: 1 },
  ] },
];

interface OrderSpec {
  items: Array<[string, number]>;
  channel: 'WEB' | 'POS';
  steps: OrderStatus[];
  createdDaysAgo: number;
}

const ORDER_SPECS: OrderSpec[] = [
  { items: [['DEMO-RICE-5KG', 30], ['DEMO-OIL-2L', 24]], channel: 'WEB', steps: ['RESERVED', 'PACKED', 'SHIPPED'], createdDaysAgo: 9 },
  { items: [['DEMO-COFFEE-165G', 100], ['DEMO-TEA-BOX', 20]], channel: 'WEB', steps: ['RESERVED', 'PACKED', 'SHIPPED'], createdDaysAgo: 6 },
  { items: [['DEMO-MILK-1L', 40], ['DEMO-WATER-GALON', 12]], channel: 'POS', steps: ['RESERVED', 'PACKED', 'SHIPPED'], createdDaysAgo: 4 },
  { items: [['DEMO-NOODLE-DUS', 15], ['DEMO-SUGAR-1KG', 30]], channel: 'WEB', steps: ['RESERVED', 'PACKED'], createdDaysAgo: 2 },
  { items: [['DEMO-FLOUR-1KG', 40], ['DEMO-EGG-TRAY', 10]], channel: 'POS', steps: ['RESERVED', 'PACKED'], createdDaysAgo: 1 },
  { items: [['DEMO-OIL-2L', 50], ['DEMO-SOAP-BOX', 8]], channel: 'WEB', steps: ['RESERVED'], createdDaysAgo: 1 },
  { items: [['DEMO-GAS-3KG', 6], ['DEMO-RICE-5KG', 10]], channel: 'POS', steps: ['RESERVED'], createdDaysAgo: 0 },
  { items: [['DEMO-COFFEE-165G', 60]], channel: 'WEB', steps: [], createdDaysAgo: 0 },
  { items: [['DEMO-WATER-GALON', 10], ['DEMO-MILK-1L', 12]], channel: 'POS', steps: [], createdDaysAgo: 0 },
  { items: [['DEMO-SUGAR-1KG', 20], ['DEMO-TEA-BOX', 15]], channel: 'WEB', steps: ['RESERVED', 'CANCELLED'], createdDaysAgo: 3 },
];

async function ensureProducts(products: ProductsService, lots: LotsService) {
  const bySku = new Map<string, string>();
  for (const spec of PRODUCTS) {
    const list = await products.list({
      pagination: { page: 1, limit: 50 },
      search: spec.sku,
    });
    const hit = list.data.find((p) => p.sku === spec.sku);
    const product =
      hit ??
      (await products.create({
        sku: spec.sku,
        name: spec.name,
        min_buffer_stock: spec.buffer,
      } satisfies CreateProductDto));
    bySku.set(spec.sku, product.id);
    if (hit) continue;
    for (const lot of spec.lots) {
      await lots.create({
        product_id: product.id,
        purchase_price: lot.price,
        initial_qty: lot.qty,
        received_at: new Date(Date.now() - lot.daysAgo * DAY_MS).toISOString(),
      } satisfies CreateLotDto);
    }
  }
  return bySku;
}

async function seedOrders(db: AppDb, orders: OrdersService, bySku: Map<string, string>) {
  const existing = await orders.list({ pagination: { page: 1, limit: 1 } });
  if (existing.meta.total >= ORDER_SPECS.length) {
    return `Order sudah ada (${existing.meta.total}); lewati pembuatan order.`;
  }
  let drafts = 0;
  for (const spec of ORDER_SPECS) {
    const order = await orders.create({
      channel: spec.channel === ORDER_CHANNEL.WEB ? ORDER_CHANNEL.WEB : ORDER_CHANNEL.POS,
      items: spec.items.map(([sku, qty]) => ({
        product_id: bySku.get(sku)!,
        requested_qty: qty,
      })),
    });
    for (const step of spec.steps) {
      await orders.transition(order.id, step);
    }
    if (spec.steps.length === 0) drafts += 1;
    // Backdate so list/timeline show realistic elapsed history (write path only).
    const when = sql`now() - (${String(spec.createdDaysAgo)} * interval '1 day')`;
    await db
      .update(ordersTable)
      .set({ createdAt: when, updatedAt: when })
      .where(sql`${ordersTable.id} = ${order.id}`);
  }
  return `Order dibuat: ${ORDER_SPECS.length} (DRAFT terbuka: ${drafts}).`;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  app.enableShutdownHooks();
  try {
    const bySku = await ensureProducts(app.get(ProductsService), app.get(LotsService));
    console.log(`Produk demo siap: ${bySku.size} SKU.`);
    console.log(await seedOrders(app.get<AppDb>(DB_TOKEN), app.get(OrdersService), bySku));
    console.log('Selesai. Login: admin / admin123');
  } finally {
    await app.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('Seed demo failed:', err);
    process.exit(1);
  },
);
