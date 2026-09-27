import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { AppDb, DB_TOKEN } from '../../core/database/db.module';
import { inventoryLots, products } from '../../core/database/schema';

export interface ProductListQuery {
  limit: number;
  offset: number;
  search?: string;
  sortField: 'sku' | 'name' | 'created_at' | 'updated_at';
  sortDir: 'asc' | 'desc';
}

const SORT_COLUMNS = {
  sku: products.sku,
  name: products.name,
  created_at: products.createdAt,
  updated_at: products.updatedAt,
} as const;

/**
 * Per-product available stock as a joinable derived table.
 *
 * A correlated subquery is deliberately avoided: drizzle-orm 0.39 renders the
 * outer `products.id` reference as unqualified `"id"`, which PostgreSQL then
 * resolves against the inner `inventory_lots` scope, silently yielding 0.
 */
function stockByProduct(db: AppDb) {
  return db
    .select({
      productId: inventoryLots.productId,
      total: sql`coalesce(sum(${inventoryLots.availableQty}), 0)::int`.as('total'),
    })
    .from(inventoryLots)
    .groupBy(inventoryLots.productId)
    .as('stock');
}

@Injectable()
export class ProductsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: AppDb) {}

  private buildFilters(query: ProductListQuery): SQL | undefined {
    if (!query.search) return undefined;
    const term = `%${query.search}%`;
    return or(ilike(products.sku, term), ilike(products.name, term));
  }

  async list(query: ProductListQuery) {
    const stock = stockByProduct(this.db);
    const column = SORT_COLUMNS[query.sortField];
    const order = query.sortDir === 'asc' ? asc(column) : desc(column);

    return this.db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        minBufferStock: products.minBufferStock,
        availableStock: sql<number>`coalesce(${stock.total}, 0)::int`,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(this.buildFilters(query))
      .orderBy(order)
      .limit(query.limit)
      .offset(query.offset);
  }

  async count(query: ProductListQuery): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(this.buildFilters(query));
    return rows[0]?.total ?? 0;
  }

  async findById(id: string) {
    const stock = stockByProduct(this.db);
    const rows = await this.db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        minBufferStock: products.minBufferStock,
        availableStock: sql<number>`coalesce(${stock.total}, 0)::int`,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(eq(products.id, id))
      .limit(1);
    return rows[0];
  }

  async findActiveLots(productId: string) {
    return this.db
      .select()
      .from(inventoryLots)
      .where(and(eq(inventoryLots.productId, productId), sql`${inventoryLots.availableQty} > 0`))
      .orderBy(asc(inventoryLots.receivedAt));
  }

  async findBySku(sku: string) {
    const rows = await this.db.select().from(products).where(eq(products.sku, sku)).limit(1);
    return rows[0];
  }

  async create(data: { sku: string; name: string; minBufferStock: number }) {
    const rows = await this.db.insert(products).values(data).returning();
    return rows[0];
  }

  async update(
    id: string,
    data: Partial<{ sku: string; name: string; minBufferStock: number }>,
  ) {
    const rows = await this.db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return rows[0];
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(products).where(eq(products.id, id));
  }

  async totalStock(productId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`coalesce(sum(${inventoryLots.availableQty}), 0)::int` })
      .from(inventoryLots)
      .where(eq(inventoryLots.productId, productId));
    return rows[0]?.total ?? 0;
  }
}