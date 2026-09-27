import {
  API_PATHS,
  type AuthResponseDto,
  type CreateLotDto,
  type CreateOrderDto,
  type CreateProductDto,
  type LowStockDto,
  type LotDto,
  type OrderDetailDto,
  type OrderDto,
  type OrderStatsDto,
  type PaginatedResponse,
  type ProductDetailDto,
  type ProductDto,
  type StockSummaryDto,
  type UpdateProductDto,
  type ValuationDto,
} from '@repo/shared-types';
import { api, toQuery } from './api';

export function login(body: { username: string; password: string }): Promise<AuthResponseDto> {
  return api<AuthResponseDto>(API_PATHS.auth.login, { method: 'POST', body });
}

export function listProducts(params: {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
}): Promise<PaginatedResponse<ProductDto>> {
  return api(API_PATHS.products.list + toQuery(params));
}

export function getProduct(id: string): Promise<ProductDetailDto> {
  return api(API_PATHS.products.detail(id));
}

export function createProduct(body: CreateProductDto): Promise<ProductDto> {
  return api(API_PATHS.products.create, { method: 'POST', body });
}

export function updateProduct(id: string, body: UpdateProductDto): Promise<ProductDto> {
  return api(API_PATHS.products.update(id), { method: 'PATCH', body });
}

export function deleteProduct(id: string): Promise<void> {
  return api<void>(API_PATHS.products.delete(id), { method: 'DELETE' });
}

export function listLots(params: {
  page: number;
  limit: number;
  product_id?: string;
  in_stock?: string;
}): Promise<PaginatedResponse<LotDto>> {
  return api(API_PATHS.lots.list + toQuery(params));
}

export function createLot(body: CreateLotDto): Promise<LotDto> {
  return api(API_PATHS.lots.create, { method: 'POST', body });
}

export function listOrders(params: {
  page: number;
  limit: number;
  status?: string;
  channel?: string;
}): Promise<PaginatedResponse<OrderDto>> {
  return api(API_PATHS.orders.list + toQuery(params));
}

export function getOrder(id: string): Promise<OrderDetailDto> {
  return api(API_PATHS.orders.detail(id));
}

export function createOrder(body: CreateOrderDto): Promise<OrderDto> {
  return api(API_PATHS.orders.create, { method: 'POST', body });
}

export function transitionOrder(id: string, status: string): Promise<OrderDto> {
  return api(API_PATHS.orders.transition(id), { method: 'PATCH', body: { status } });
}

export function getStockSummary(): Promise<StockSummaryDto[]> {
  return api(API_PATHS.dashboard.stockSummary);
}

export function getValuation(): Promise<ValuationDto[]> {
  return api(API_PATHS.dashboard.stockValuation);
}

export function getLowStock(): Promise<LowStockDto[]> {
  return api(API_PATHS.dashboard.lowStock);
}

export function getOrderStats(): Promise<OrderStatsDto> {
  return api(API_PATHS.dashboard.orderStats);
}
