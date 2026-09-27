import type { OrderDetailDto, OrderDto, OrderItemDto } from '@repo/shared-types';
import type { orders } from '../../core/database/schema';

interface OrderRow {
  id: string;
  orderNumber: string;
  channel: 'WEB' | 'POS';
  status: 'DRAFT' | 'RESERVED' | 'PACKED' | 'SHIPPED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

interface ItemRow {
  id: string;
  productId: string;
  requestedQty: number;
  sku: string;
  name: string;
}

interface AllocationRow {
  orderItemId: string;
  lotId: string;
  allocatedQty: number;
  lotReceivedAt: Date;
}

export function toOrderDto(row: OrderRow | typeof orders.$inferSelect): OrderDto {
  return {
    id: row.id,
    order_number: row.orderNumber,
    channel: row.channel,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toOrderDetailDto(
  row: OrderRow | typeof orders.$inferSelect,
  items: ItemRow[],
  allocations: AllocationRow[],
): OrderDetailDto {
  const itemsDto: OrderItemDto[] = items.map((item) => ({
    id: item.id,
    product_id: item.productId,
    sku: item.sku,
    name: item.name,
    requested_qty: item.requestedQty,
    allocations: allocations
      .filter((a) => a.orderItemId === item.id)
      .map((a) => ({
        lot_id: a.lotId,
        lot_received_at: a.lotReceivedAt.toISOString(),
        allocated_qty: a.allocatedQty,
      })),
  }));

  return { ...toOrderDto(row), items: itemsDto };
}