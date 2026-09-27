import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AutoReleaseService } from './auto-release.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService, AutoReleaseService],
  exports: [OrdersRepository],
})
export class OrdersModule {}