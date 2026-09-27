import { Injectable } from '@nestjs/common';
import type {
  CreateProductDto,
  LotDto,
  ProductDetailDto,
  ProductDto,
  UpdateProductDto,
} from '@repo/shared-types';
import { ConflictAppError, NotFoundAppError } from '../../core/errors/app-error';
import { paginate, offsetOf, type Pagination } from '../../core/http/pagination';
import { ProductsRepository, type ProductListQuery } from './products.repository';
import { toLotDto, toProductDto } from './products.mapper';

export interface ListProductsInput {
  pagination: Pagination;
  search?: string;
  sort?: string;
}

@Injectable()
export class ProductsService {
  constructor(private readonly repository: ProductsRepository) {}

  async list(input: ListProductsInput) {
    const query = this.toQuery(input);
    const [rows, total] = await Promise.all([
      this.repository.list(query),
      this.repository.count(query),
    ]);
    return paginate(rows.map(toProductDto), total, input.pagination);
  }

  async findOne(id: string): Promise<ProductDetailDto> {
    const product = await this.repository.findById(id);
    if (!product) {
      throw new NotFoundAppError('Produk tidak ditemukan.', 'NOT_FOUND');
    }

    const lots = await this.repository.findActiveLots(id);
    return { ...toProductDto(product), lots: lots.map(toLotDto) };
  }

  async create(dto: CreateProductDto): Promise<ProductDto> {
    const existing = await this.repository.findBySku(dto.sku);
    if (existing) {
      throw new ConflictAppError('SKU sudah terdaftar.', 'SKU_ALREADY_EXISTS');
    }

    const created = await this.repository.create({
      sku: dto.sku,
      name: dto.name,
      minBufferStock: dto.min_buffer_stock,
    });
    return toProductDto({ ...created, availableStock: 0 });
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDto> {
    await this.ensureExists(id);

    if (dto.sku) {
      const existing = await this.repository.findBySku(dto.sku);
      if (existing && existing.id !== id) {
        throw new ConflictAppError('SKU sudah terdaftar.', 'SKU_ALREADY_EXISTS');
      }
    }

    const updated = await this.repository.update(id, {
      ...(dto.sku !== undefined && { sku: dto.sku }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.min_buffer_stock !== undefined && { minBufferStock: dto.min_buffer_stock }),
    });
    const availableStock = await this.repository.totalStock(id);
    return toProductDto({ ...updated, availableStock });
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    const total = await this.repository.totalStock(id);
    if (total > 0) {
      throw new ConflictAppError(
        'Tidak bisa menghapus produk yang masih memiliki stok.',
        'PRODUCT_HAS_STOCK',
      );
    }
    await this.repository.remove(id);
  }

  async activeLots(productId: string): Promise<LotDto[]> {
    const lots = await this.repository.findActiveLots(productId);
    return lots.map(toLotDto);
  }

  private async ensureExists(id: string): Promise<void> {
    const product = await this.repository.findById(id);
    if (!product) {
      throw new NotFoundAppError('Produk tidak ditemukan.', 'NOT_FOUND');
    }
  }

  private toQuery(input: ListProductsInput): ProductListQuery {
    const [field, dir] = (input.sort ?? 'created_at:desc').split(':');
    const sortField =
      field === 'sku' || field === 'name' || field === 'updated_at' ? field : 'created_at';
    return {
      limit: input.pagination.limit,
      offset: offsetOf(input.pagination),
      search: input.search,
      sortField,
      sortDir: dir === 'asc' ? 'asc' : 'desc',
    };
  }
}