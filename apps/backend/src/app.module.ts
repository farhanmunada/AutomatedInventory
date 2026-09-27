import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthCoreModule } from './core/auth/auth.module';
import { DbModule } from './core/database/db.module';
import { HealthController } from './core/health.controller';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LotsModule } from './modules/lots/lots.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthCoreModule,
    UsersModule,
    ProductsModule,
    LotsModule,
    OrdersModule,
    DashboardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}