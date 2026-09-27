import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

export const DB_TOKEN = Symbol('DB_TOKEN');
export const PG_POOL_TOKEN = Symbol('PG_POOL_TOKEN');
export type AppDb = NodePgDatabase<typeof schema>;

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: true },
  });

  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('Unexpected PG pool error:', err);
  });

  return pool;
}

@Global()
@Module({
  providers: [
    { provide: PG_POOL_TOKEN, useFactory: createPool },
    {
      provide: DB_TOKEN,
      useFactory: (pool: Pool): AppDb => drizzle(pool, { schema }),
      inject: [PG_POOL_TOKEN],
    },
  ],
  exports: [DB_TOKEN, PG_POOL_TOKEN],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL_TOKEN) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}