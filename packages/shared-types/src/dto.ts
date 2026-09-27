import {
  ORDER_CHANNEL,
  ORDER_STATUS,
  type OrderChannel,
  type OrderStatus,
} from './constants';

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  minBufferStock: number;
  availableStock: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductDto {
  sku: string;
  name: string;
  minBufferStock: number;
}

export interface UpdateProductDto {
  sku?: string;
  name?: string;
  minBufferStock?: number;
}

export interface LotDto {
  id: string;
  productId: string;
  purchasePrice: string;
  initialQty: number;
  availableQty: number;
  receivedAt: string;
  createdAt: string;
}

export interface CreateLotDto {
  productId: string;
  purchasePrice: string;
  initialQty: number;
  receivedAt: string;
}

export interface OrderItemAllocationDto {
  lotId: string;
  lotReceivedAt: string;
  allocatedQty: number;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  sku: string;
  name: string;
  requestedQty: number;
  allocations: OrderItemAllocationDto[];
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetailDto extends OrderDto {
  items: OrderItemDto[];
}

export interface CreateOrderItemDto {
  productId: string;
  requestedQty: number;
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

export interface ValuationRowDto {
  productId: string;
  sku: string;
  name: string;
  totalQty: number;
  valuation: string;
}

export interface LowStockRowDto {
  productId: string;
  sku: string;
  name: string;
  totalQty: number;
  minBufferStock: number;
}

export interface OrderStatsDto {
  byStatus: Record<OrderStatus, number>;
  byChannel: Record<OrderChannel, number>;
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
