import { Module } from '@nestjs/common';
import { LotsController } from './lots.controller';
import { LotsRepository } from './lots.repository';
import { LotsService } from './lots.service';

@Module({
  controllers: [LotsController],
  providers: [LotsRepository, LotsService],
  exports: [LotsRepository],
})
export class LotsModule {}