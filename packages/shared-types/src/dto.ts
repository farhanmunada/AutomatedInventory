import type { OrderChannel, OrderStatus } from './constants';

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  min_buffer_stock: number;
  available_stock: number;
  created_at: string;
  updated_at: string;
}

export interface ProductDetailDto extends ProductDto {
  lots: LotDto[];
}

export interface CreateProductDto {
  sku: string;
  name: string;
  min_buffer_stock: number;
}

export interface UpdateProductDto {
  sku?: string;
  name?: string;
  min_buffer_stock?: number;
}

export interface LotDto {
  id: string;
  product_id: string;
  purchase_price: string;
  initial_qty: number;
  available_qty: number;
  received_at: string;
  created_at: string;
}

export interface CreateLotDto {
  product_id: string;
  purchase_price: string;
  initial_qty: number;
  received_at: string;
}

export interface OrderItemAllocationDto {
  lot_id: string;
  lot_received_at: string;
  allocated_qty: number;
}

export interface OrderItemDto {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  requested_qty: number;
  allocations: OrderItemAllocationDto[];
}

export interface OrderDto {
  id: string;
  order_number: string;
  channel: OrderChannel;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface OrderDetailDto extends OrderDto {
  items: OrderItemDto[];
}

export interface CreateOrderItemDto {
  product_id: string;
  requested_qty: number;
}

export interface CreateOrderDto {
  channel: OrderChannel;
  items: CreateOrderItemDto[];
}

export interface TransitionStatusDto {
  status: OrderStatus;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface AuthResponseDto {
  access_token: string;
  user: { id: string; username: string };
}

export interface StockSummaryDto {
  product_id: string;
  sku: string;
  name: string;
  total_qty: number;
}

export interface ValuationDto {
  product_id: string;
  sku: string;
  name: string;
  total_qty: number;
  total_value: string;
}

export interface LowStockDto {
  product_id: string;
  sku: string;
  name: string;
  total_qty: number;
  min_buffer_stock: number;
}

export interface OrderStatsDto {
  by_status: Record<OrderStatus, number>;
  by_channel: Record<OrderChannel, number>;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}