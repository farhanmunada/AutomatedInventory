import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { AppDb, DB_TOKEN } from '../../core/database/db.module';
import { inventoryLots, orders, products } from '../../core/database/schema';

export interface StockRow {
  productId: string;
  sku: string;
  name: string;
  totalQty: number;
}

export interface ValuationRow extends StockRow {
  totalValue: string;
}

export interface LowStockRow extends StockRow {
  minBufferStock: number;
}

const TOTAL_QTY = sql<number>`coalesce(sum(${inventoryLots.availableQty}), 0)::int`;
const TOTAL_VALUE = sql<string>`coalesce(sum(${inventoryLots.availableQty} * ${inventoryLots.purchasePrice}), 0)::numeric(18,2)`;

@Injectable()
export class DashboardRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: AppDb) {}

  async stockSummary(): Promise<StockRow[]> {
    return this.db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        totalQty: TOTAL_QTY,
      })
      .from(products)
      .leftJoin(inventoryLots, eq(inventoryLots.productId, products.id))
      .groupBy(products.id, products.sku, products.name)
      .orderBy(asc(products.sku));
  }

  async stockValuation(): Promise<ValuationRow[]> {
    return this.db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        totalQty: TOTAL_QTY,
        totalValue: TOTAL_VALUE,
      })
      .from(products)
      .leftJoin(inventoryLots, eq(inventoryLots.productId, products.id))
      .groupBy(products.id, products.sku, products.name)
      .orderBy(desc(TOTAL_VALUE));
  }

  async lowStock(): Promise<LowStockRow[]> {
    return this.db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        totalQty: TOTAL_QTY,
        minBufferStock: products.minBufferStock,
      })
      .from(products)
      .leftJoin(inventoryLots, eq(inventoryLots.productId, products.id))
      .groupBy(products.id, products.sku, products.name, products.minBufferStock)
      .having(sql`coalesce(sum(${inventoryLots.availableQty}), 0) <= ${products.minBufferStock}`)
      .orderBy(asc(products.sku));
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