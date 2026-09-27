import { Module } from '@nestjs/common';
import { StockCacheService } from './stock-cache.service';

@Module({
  providers: [StockCacheService],
  exports: [StockCacheService],
})
export class StockCacheModule {}
