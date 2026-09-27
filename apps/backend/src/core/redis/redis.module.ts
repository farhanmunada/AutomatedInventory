import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '../config/env';

export const REDIS_TOKEN = Symbol('REDIS_TOKEN');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_TOKEN,
      useFactory: (): IORedis => {
        const client = env.REDIS_URL
          ? new IORedis(env.REDIS_URL, {
              maxRetriesPerRequest: 3,
              enableReadyCheck: true,
            })
          : new IORedis({
              host: env.REDIS_HOST,
              port: env.REDIS_PORT,
              maxRetriesPerRequest: 3,
              enableReadyCheck: true,
            });

        // Prevent unhandled 'error' events from crashing the process when Redis is unavailable.
        client.on('error', (err) => {
          new Logger('Redis').warn(`Redis connection error: ${err.message}`);
        });

        return client;
      },
    },
  ],
  exports: [REDIS_TOKEN],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_TOKEN) private readonly redis: IORedis) {}

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}