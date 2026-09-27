import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import IORedis from 'ioredis';
import { AppDb, DB_TOKEN } from '../../core/database/db.module';
import { REDIS_TOKEN } from '../../core/redis/redis.module';
import { inventoryLots } from '../../core/database/schema';
import { STOCK_CACHE_KEY } from '@repo/shared-types';

@Injectable()
export class StockCacheService implements OnModuleInit {
  constructor(
    @Inject(DB_TOKEN) private readonly db: AppDb,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.reconcile();
    } catch (err) {
      // Cache warm-up must not block application boot.
      new Logger(StockCacheService.name).warn(
        `Stock cache warm-up skipped: ${(err as Error).message}`,
      );
    }
  }

  async getStock(productId: string): Promise<number> {
    const raw = await this.redis.hget(STOCK_CACHE_KEY, productId);
    return raw ? Number(raw) : 0;
  }

  async getStockBatch(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const values = await this.redis.hmget(STOCK_CACHE_KEY, ...productIds);
    const result = new Map<string, number>();

    productIds.forEach((id, index) => {
      const raw = values[index];
      result.set(id, raw ? Number(raw) : 0);
    });

    return result;
  }

  async adjustStock(productId: string, delta: number): Promise<number> {
    return this.redis.hincrby(STOCK_CACHE_KEY, productId, delta);
  }

  async reconcile(): Promise<void> {
    const rows = await this.db
      .select({
        productId: inventoryLots.productId,
        total: sql<number>`coalesce(sum(${inventoryLots.availableQty}), 0)`,
      })
      .from(inventoryLots)
      .groupBy(inventoryLots.productId);

    if (rows.length === 0) {
      await this.redis.del(STOCK_CACHE_KEY);
      return;
    }

    const pipeline = this.redis.pipeline();
    pipeline.del(STOCK_CACHE_KEY);
    for (const row of rows) {
      pipeline.hset(STOCK_CACHE_KEY, row.productId, String(row.total));
    }
    await pipeline.exec();
  }
}
