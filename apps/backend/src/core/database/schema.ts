import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const orderStatus = pgEnum('order_status', [
  'DRAFT',
  'RESERVED',
  'PACKED',
  'SHIPPED',
  'CANCELLED',
]);

export const orderChannel = pgEnum('order_channel', ['WEB', 'POS']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: varchar('sku', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    minBufferStock: integer('min_buffer_stock').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('products_sku_idx').on(t.sku),
    check('products_min_buffer_non_negative', sql`${t.minBufferStock} >= 0`),
  ],
);

export const inventoryLots = pgTable(
  'inventory_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    purchasePrice: numeric('purchase_price', { precision: 15, scale: 2 }).notNull(),
    initialQty: integer('initial_qty').notNull(),
    availableQty: integer('available_qty').notNull(),
    receivedAt: timestamp('received_at', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_lots_fifo').on(t.productId, t.availableQty, t.receivedAt),
    check('lots_initial_qty_positive', sql`${t.initialQty} > 0`),
    check(
      'lots_available_qty_range',
      sql`${t.availableQty} >= 0 AND ${t.availableQty} <= ${t.initialQty}`,
    ),
    check('lots_purchase_price_non_negative', sql`${t.purchasePrice} >= 0`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNumber: varchar('order_number', { length: 20 }).notNull().unique(),
    channel: orderChannel('channel').notNull(),
    status: orderStatus('status').notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [index('idx_orders_status').on(t.status, t.createdAt)],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    requestedQty: integer('requested_qty').notNull(),
  },
  (t) => [
    index('idx_order_items_order').on(t.orderId),
    index('idx_order_items_product').on(t.productId),
    check('order_items_requested_qty_positive', sql`${t.requestedQty} > 0`),
  ],
);

export const orderItemAllocations = pgTable(
  'order_item_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => inventoryLots.id, { onDelete: 'restrict' }),
    allocatedQty: integer('allocated_qty').notNull(),
  },
  (t) => [
    index('idx_allocations_order_item').on(t.orderItemId),
    index('idx_allocations_lot').on(t.lotId),
    check('allocations_qty_positive', sql`${t.allocatedQty} > 0`),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Lot = typeof inventoryLots.$inferSelect;
export type NewLot = typeof inventoryLots.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderItemAllocation = typeof orderItemAllocations.$inferSelect;