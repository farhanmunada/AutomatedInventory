import { Injectable } from '@nestjs/common';
import {
  ORDER_STATUS,
  VALID_TRANSITIONS,
  type CreateOrderDto,
  type OrderDetailDto,
  type OrderDto,
  type OrderStatus,
} from '@repo/shared-types';
import {
  ConflictAppError,
  NotFoundAppError,
  ValidationError,
} from '../../core/errors/app-error';
import { offsetOf, paginate, type Pagination } from '../../core/http/pagination';
import { OrdersRepository, type OrderListQuery } from './orders.repository';
import { toOrderDetailDto, toOrderDto } from './orders.mapper';

export interface ListOrdersInput {
  pagination: Pagination;
  status?: string;
  channel?: string;
}

@Injectable()
export class OrdersService {
  constructor(private readonly repository: OrdersRepository) {}

  async list(input: ListOrdersInput) {
    const query: OrderListQuery = {
      limit: input.pagination.limit,
      offset: offsetOf(input.pagination),
      status: input.status,
      channel: input.channel,
      sortDir: 'desc',
    };
    const [rows, total] = await Promise.all([
      this.repository.list(query),
      this.repository.count(query),
    ]);
    return paginate(rows.map(toOrderDto), total, input.pagination);
  }

  async findOne(id: string): Promise<OrderDetailDto> {
    const order = await this.repository.findById(id);
    if (!order) throw new NotFoundAppError('Order tidak ditemukan.');

    const items = await this.repository.findItems(id);
    const allocations = await this.repository.findAllocations(items.map((i) => i.id));
    return toOrderDetailDto(order, items, allocations);
  }

  async create(dto: CreateOrderDto): Promise<OrderDto> {
    const productIds = dto.items.map((item) => item.product_id);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      throw new ValidationError(
        'Produk tidak boleh muncul dua kali. Gabungkan kuantitasnya.',
      );
    }

    const found = await this.repository.productsExist(productIds);
    const missing = productIds.filter((id) => !found.includes(id));
    if (missing.length > 0) {
      throw new NotFoundAppError(
        `Produk tidak ditemukan: ${missing.join(', ')}`,
        'PRODUCT_NOT_FOUND',
      );
    }

    const orderNumber = await this.repository.nextOrderNumber();
    const { order } = await this.repository.createWithItems(
      orderNumber,
      dto.channel,
      dto.items.map((item) => ({
        productId: item.product_id,
        requestedQty: item.requested_qty,
      })),
    );
    return toOrderDto(order);
  }

  async transition(id: string, next: OrderStatus): Promise<OrderDto> {
    const order = await this.repository.findById(id);
    if (!order) throw new NotFoundAppError('Order tidak ditemukan.');

    if (!VALID_TRANSITIONS[order.status].includes(next)) {
      throw new ConflictAppError(
        `Transisi ${order.status} → ${next} tidak diizinkan.`,
        'INVALID_TRANSITION',
      );
    }

    if (next === ORDER_STATUS.RESERVED) {
      return this.reserve(id);
    }

    if (next === ORDER_STATUS.CANCELLED) {
      return this.cancel(id);
    }

    const changed = await this.repository.transitionStatus(id, order.status, next);
    if (!changed) {
      throw new ConflictAppError('Order sudah berubah status.', 'INVALID_TRANSITION');
    }
    const updated = await this.repository.findById(id);
    return toOrderDto(updated!);
  }

  private async reserve(id: string): Promise<OrderDto> {
    const items = await this.repository.findItems(id);
    if (items.length === 0) {
      throw new ConflictAppError('Order tidak memiliki item.', 'INSUFFICIENT_STOCK');
    }

    try {
      const outcome = await this.repository.reserve(
        id,
        items.map((item) => ({
          productId: item.productId,
          requestedQty: item.requestedQty,
        })),
      );
      return toOrderDto(outcome.order);
    } catch (error) {
      const code = (error as Error).message;
      if (code === 'INSUFFICIENT_STOCK') {
        throw new ConflictAppError(
          'Stok tidak mencukupi untuk salah satu item.',
          'INSUFFICIENT_STOCK',
        );
      }
      if (code === 'INVALID_TRANSITION') {
        throw new ConflictAppError('Status order sudah berubah.', 'INVALID_TRANSITION');
      }
      if (code === 'ORDER_NOT_FOUND') {
        throw new NotFoundAppError('Order tidak ditemukan.');
      }
      throw error;
    }
  }

  private async cancel(id: string): Promise<OrderDto> {
    try {
      await this.repository.cancel(id);
    } catch (error) {
      const code = (error as Error).message;
      if (code === 'ORDER_NOT_FOUND') {
        throw new NotFoundAppError('Order tidak ditemukan.');
      }
      if (code === 'INVALID_TRANSITION') {
        throw new ConflictAppError(
          'Order yang sudah dikirim tidak bisa dibatalkan.',
          'INVALID_TRANSITION',
        );
      }
      throw error;
    }

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundAppError('Order tidak ditemukan.');
    return toOrderDto(updated);
  }
}