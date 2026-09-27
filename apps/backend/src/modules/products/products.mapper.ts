import type { LotDto, ProductDto } from '@repo/shared-types';

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  minBufferStock: number;
  availableStock: number;
  createdAt: Date;
  updatedAt: Date;
}

interface LotRow {
  id: string;
  productId: string;
  purchasePrice: string;
  initialQty: number;
  availableQty: number;
  receivedAt: Date;
  createdAt: Date;
}

export function toProductDto(row: ProductRow): ProductDto {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    min_buffer_stock: row.minBufferStock,
    available_stock: row.availableStock,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toLotDto(row: LotRow): LotDto {
  return {
    id: row.id,
    product_id: row.productId,
    purchase_price: row.purchasePrice,
    initial_qty: row.initialQty,
    available_qty: row.availableQty,
    received_at: row.receivedAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}