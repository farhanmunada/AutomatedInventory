import { Injectable } from '@nestjs/common';
import type { CreateLotDto, LotDto } from '@repo/shared-types';
import { NotFoundAppError, ValidationError } from '../../core/errors/app-error';
import { offsetOf, paginate, type Pagination } from '../../core/http/pagination';
import { toLotDto } from '../products/products.mapper';
import { LotsRepository, type LotListQuery } from './lots.repository';

export interface ListLotsInput {
  pagination: Pagination;
  productId?: string;
  onlyInStock?: boolean;
}

@Injectable()
export class LotsService {
  constructor(private readonly repository: LotsRepository) {}

  async list(input: ListLotsInput) {
    const query: LotListQuery = {
      limit: input.pagination.limit,
      offset: offsetOf(input.pagination),
      productId: input.productId,
      onlyInStock: input.onlyInStock ?? false,
      sortDir: 'asc',
    };
    const [rows, total] = await Promise.all([
      this.repository.list(query),
      this.repository.count(query),
    ]);
    return paginate(rows.map(toLotDto), total, input.pagination);
  }

  async create(dto: CreateLotDto): Promise<LotDto> {
    if (!Number.isInteger(dto.initial_qty) || dto.initial_qty <= 0) {
      throw new ValidationError('Initial qty harus lebih besar dari 0.');
    }

    const exists = await this.repository.productExists(dto.product_id);
    if (!exists) {
      throw new NotFoundAppError('Produk tidak ditemukan.', 'PRODUCT_NOT_FOUND');
    }

    const created = await this.repository.create({
      productId: dto.product_id,
      purchasePrice: dto.purchase_price,
      initialQty: dto.initial_qty,
      receivedAt: new Date(dto.received_at),
    });
    return toLotDto(created);
  }
}