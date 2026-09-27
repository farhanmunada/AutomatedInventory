import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stock-summary')
  stockSummary() {
    return this.dashboardService.stockSummary();
  }

  @Get('stock-valuation')
  stockValuation() {
    return this.dashboardService.stockValuation();
  }

  @Get('low-stock')
  lowStock() {
    return this.dashboardService.lowStock();
  }

  @Get('order-stats')
  orderStats() {
    return this.dashboardService.orderStats();
  }
}