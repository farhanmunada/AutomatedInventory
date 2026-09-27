import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './core/database/db.module';
import { RedisModule } from './core/redis/redis.module';
import { AuthCoreModule } from './core/auth/auth.module';
import { HealthController } from './core/health.controller';
import { UsersModule } from './modules/users/users.module';
import { StockCacheModule } from './modules/stock-cache/stock-cache.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    RedisModule,
    AuthCoreModule,
    UsersModule,
    StockCacheModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
