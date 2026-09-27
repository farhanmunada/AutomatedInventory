import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { AppDb, DB_TOKEN } from '../../core/database/db.module';
import { inventoryLots, products } from '../../core/database/schema';

export interface LotListQuery {
  limit: number;
  offset: number;
  productId?: string;
  onlyInStock: boolean;
  sortDir: 'asc' | 'desc';
}

@Injectable()
export class LotsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: AppDb) {}

  private buildFilters(query: LotListQuery): SQL | undefined {
    const conditions: SQL[] = [];
    if (query.productId) conditions.push(eq(inventoryLots.productId, query.productId));
    if (query.onlyInStock) conditions.push(sql`${inventoryLots.availableQty} > 0`);
    if (conditions.length === 0) return undefined;
    return conditions.length === 1 ? conditions[0] : sql`${conditions[0]} and ${conditions[1]}`;
  }

  async list(query: LotListQuery) {
    const order = query.sortDir === 'asc' ? asc(inventoryLots.receivedAt) : desc(inventoryLots.receivedAt);
    return this.db
      .select()
      .from(inventoryLots)
      .where(this.buildFilters(query))
      .orderBy(order)
      .limit(query.limit)
      .offset(query.offset);
  }

  async count(query: LotListQuery): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(inventoryLots)
      .where(this.buildFilters(query));
    return rows[0]?.total ?? 0;
  }

  async productExists(productId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    return rows.length > 0;
  }

  async create(data: {
    productId: string;
    purchasePrice: string;
    initialQty: number;
    receivedAt: Date;
  }) {
    const rows = await this.db
      .insert(inventoryLots)
      .values({ ...data, availableQty: data.initialQty })
      .returning();
    return rows[0];
  }
}