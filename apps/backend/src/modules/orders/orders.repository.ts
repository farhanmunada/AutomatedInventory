import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { AppDb, DB_TOKEN, PG_POOL_TOKEN } from '../../core/database/db.module';
import {
  inventoryLots,
  orderItemAllocations,
  orderItems,
  orders,
  products,
} from '../../core/database/schema';
import { Pool, type PoolClient } from 'pg';

export interface OrderListQuery {
  limit: number;
  offset: number;
  status?: string;
  channel?: string;
  sortDir: 'asc' | 'desc';
}

export interface RequestedItem {
  productId: string;
  requestedQty: number;
}

export interface AllocationResult {
  orderItemId: string;
  lotId: string;
  allocatedQty: number;
}

export interface ReserveOutcome {
  order: typeof orders.$inferSelect;
  allocations: AllocationResult[];
}

@Injectable()
export class OrdersRepository {
  constructor(
    @Inject(DB_TOKEN) private readonly db: AppDb,
    @Inject(PG_POOL_TOKEN) private readonly pool: Pool,
  ) {}

  private buildFilters(query: OrderListQuery): SQL | undefined {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(sql`${orders.status} = ${query.status}`);
    if (query.channel) conditions.push(sql`${orders.channel} = ${query.channel}`);
    if (conditions.length === 0) return undefined;
    return conditions.length === 1 ? conditions[0] : sql`${conditions[0]} and ${conditions[1]}`;
  }

  async list(query: OrderListQuery) {
    const order =
      query.sortDir === 'asc' ? asc(orders.createdAt) : desc(orders.createdAt);
    return this.db
      .select()
      .from(orders)
      .where(this.buildFilters(query))
      .orderBy(order)
      .limit(query.limit)
      .offset(query.offset);
  }

  async count(query: OrderListQuery): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(this.buildFilters(query));
    return rows[0]?.total ?? 0;
  }

  async findById(id: string) {
    const rows = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return rows[0];
  }

  async findItems(orderId: string) {
    return this.db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        requestedQty: orderItems.requestedQty,
        sku: products.sku,
        name: products.name,
      })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, orderId));
  }

  async findAllocations(orderItemIds: string[]) {
    if (orderItemIds.length === 0) return [];
    return this.db
      .select({
        orderItemId: orderItemAllocations.orderItemId,
        lotId: orderItemAllocations.lotId,
        allocatedQty: orderItemAllocations.allocatedQty,
        lotReceivedAt: inventoryLots.receivedAt,
      })
      .from(orderItemAllocations)
      .innerJoin(inventoryLots, eq(inventoryLots.id, orderItemAllocations.lotId))
      .where(inArray(orderItemAllocations.orderItemId, orderItemIds))
      .orderBy(asc(inventoryLots.receivedAt));
  }

  async productsExist(productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return [];
    const rows = await this.db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, productIds));
    return rows.map((r) => r.id);
  }

  async nextOrderNumber(): Promise<string> {
    // Raw driver call: drizzle-orm 0.39 interpolates a PgSequence reference as its
    // JSON payload instead of the bare sequence name, breaking nextval().
    const result = await this.pool.query(
      `select nextval('order_number_seq')::int as value`,
    );
    return `ORD-${String(result.rows[0].value).padStart(6, '0')}`;
  }

  async createWithItems(
    orderNumber: string,
    channel: string,
    items: RequestedItem[],
  ) {
    return this.db.transaction(async (tx) => {
      const insertedOrders = await tx
        .insert(orders)
        .values({ orderNumber, channel: channel as 'WEB' | 'POS' })
        .returning();
      const order = insertedOrders[0];

      const insertedItems = await tx
        .insert(orderItems)
        .values(
          items.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            requestedQty: item.requestedQty,
          })),
        )
        .returning();

      return { order, items: insertedItems };
    });
  }

  /**
   * Claims stock for every item inside one transaction. Items are locked in
   * ascending productId order to make concurrent reservations deadlock-free.
   */
  async reserve(orderId: string, items: RequestedItem[]): Promise<ReserveOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const locked = await client.query<{ id: string; status: string }>(
        `select id, status from orders where id = $1 for update`,
        [orderId],
      );
      if (locked.rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
      }

      const ordered = [...items].sort((a, b) => a.productId.localeCompare(b.productId));
      const created: AllocationResult[] = [];

      for (const item of ordered) {
        const allocations = await this.allocateItem(client, orderId, item);
        created.push(...allocations);
      }

      const updated = await client.query<{ id: string; status: string }>(
        `update orders set status = 'RESERVED', updated_at = now()
         where id = $1 and status = 'DRAFT' returning id, status`,
        [orderId],
      );
      if (updated.rows.length === 0) {
        throw new Error('INVALID_TRANSITION');
      }

      await client.query('COMMIT');
      const order = await this.findById(orderId);
      return { order: order as typeof orders.$inferSelect, allocations: created };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async allocateItem(
    client: PoolClient,
    orderId: string,
    item: RequestedItem,
  ): Promise<AllocationResult[]> {
    const lots = await client.query<{ id: string; available_qty: number }>(
      `select id, available_qty from inventory_lots
       where product_id = $1 and available_qty > 0
       order by received_at asc, id asc
       for update`,
      [item.productId],
    );

    const total = lots.rows.reduce((sum, lot) => sum + lot.available_qty, 0);
    if (total < item.requestedQty) {
      throw new Error('INSUFFICIENT_STOCK');
    }

    const itemRows = await client.query<{ id: string }>(
      `select id from order_items where order_id = $1 and product_id = $2 limit 1`,
      [orderId, item.productId],
    );
    const orderItemId = itemRows.rows[0].id;

    const created: AllocationResult[] = [];
    let remaining = item.requestedQty;

    for (const lot of lots.rows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lot.available_qty);
      remaining -= take;

      await client.query(
        `update inventory_lots set available_qty = available_qty - $1 where id = $2`,
        [take, lot.id],
      );
      await client.query(
        `insert into order_item_allocations (order_item_id, lot_id, allocated_qty)
         values ($1, $2, $3)`,
        [orderItemId, lot.id, take],
      );
      created.push({ orderItemId, lotId: lot.id, allocatedQty: take });
    }

    return created;
  }

  /**
   * Cancels an order and returns its stock in a single transaction.
   * The order row is locked first, so two concurrent cancels cannot
   * return the same allocation twice. Already-cancelled orders are a no-op.
   */
  async cancel(orderId: string): Promise<{ changed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const locked = await client.query<{ status: string }>(
        `select status from orders where id = $1 for update`,
        [orderId],
      );
      if (locked.rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
      }

      const { status } = locked.rows[0];
      if (status === 'CANCELLED') {
        await client.query('COMMIT');
        return { changed: false };
      }
      if (status !== 'DRAFT' && status !== 'RESERVED' && status !== 'PACKED') {
        throw new Error('INVALID_TRANSITION');
      }

      if (status === 'RESERVED' || status === 'PACKED') {
        const allocations = await client.query<{ lot_id: string; allocated_qty: number }>(
          `select a.lot_id, a.allocated_qty
           from order_item_allocations a
           join order_items i on i.id = a.order_item_id
           where i.order_id = $1
           order by a.lot_id asc
           for update of a`,
          [orderId],
        );

        for (const row of allocations.rows) {
          await client.query(
            `update inventory_lots set available_qty = available_qty + $1 where id = $2`,
            [row.allocated_qty, row.lot_id],
          );
        }

        await client.query(
          `delete from order_item_allocations a
           using order_items i
           where a.order_item_id = i.id and i.order_id = $1`,
          [orderId],
        );
      }

      await client.query(
        `update orders set status = 'CANCELLED', updated_at = now() where id = $1`,
        [orderId],
      );

      await client.query('COMMIT');
      return { changed: true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Conditional transition: 0 affected rows means the order already moved on. */
  async transitionStatus(
    orderId: string,
    from: string,
    to: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(orders)
      .set({ status: to as 'DRAFT', updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, from as 'DRAFT')))
      .returning({ id: orders.id });
    return rows.length > 0;
  }

  async findExpiredDrafts(cutoff: Date) {
    return this.db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'RESERVED'),
          sql`${orders.updatedAt} < ${cutoff}`,
        ),
      );
  }

  async findReserved() {
    return this.db
      .select({ id: orders.id, updatedAt: orders.updatedAt })
      .from(orders)
      .where(eq(orders.status, 'RESERVED'));
  }

  async orderStats() {
    const statusRows = await this.db
      .select({ status: orders.status, total: sql<number>`count(*)::int` })
      .from(orders)
      .groupBy(orders.status);
    const channelRows = await this.db
      .select({ channel: orders.channel, total: sql<number>`count(*)::int` })
      .from(orders)
      .groupBy(orders.channel);
    return { statusRows, channelRows };
  }
}