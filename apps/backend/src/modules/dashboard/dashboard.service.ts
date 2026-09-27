import { Injectable } from '@nestjs/common';
import {
  ORDER_CHANNEL,
  ORDER_STATUS,
  type LowStockDto,
  type OrderChannel,
  type OrderStatsDto,
  type OrderStatus,
  type StockSummaryDto,
  type ValuationDto,
} from '@repo/shared-types';
import { DashboardRepository } from './dashboard.repository';

@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async stockSummary(): Promise<StockSummaryDto[]> {
    const rows = await this.repository.stockSummary();
    return rows.map((row) => ({
      product_id: row.productId,
      sku: row.sku,
      name: row.name,
      total_qty: row.totalQty,
    }));
  }

  async stockValuation(): Promise<ValuationDto[]> {
    const rows = await this.repository.stockValuation();
    return rows.map((row) => ({
      product_id: row.productId,
      sku: row.sku,
      name: row.name,
      total_qty: row.totalQty,
      total_value: row.totalValue,
    }));
  }

  async lowStock(): Promise<LowStockDto[]> {
    const rows = await this.repository.lowStock();
    return rows.map((row) => ({
      product_id: row.productId,
      sku: row.sku,
      name: row.name,
      total_qty: row.totalQty,
      min_buffer_stock: row.minBufferStock,
    }));
  }

  async orderStats(): Promise<OrderStatsDto> {
    const { statusRows, channelRows } = await this.repository.orderStats();

    const byStatus = Object.fromEntries(
      Object.values(ORDER_STATUS).map((status) => [status, 0]),
    ) as Record<OrderStatus, number>;
    const byChannel = Object.fromEntries(
      Object.values(ORDER_CHANNEL).map((channel) => [channel, 0]),
    ) as Record<OrderChannel, number>;

    let total = 0;
    for (const row of statusRows) {
      byStatus[row.status] = row.total;
      total += row.total;
    }
    for (const row of channelRows) {
      byChannel[row.channel] = row.total;
    }

    return { by_status: byStatus, by_channel: byChannel, total };
  }
}