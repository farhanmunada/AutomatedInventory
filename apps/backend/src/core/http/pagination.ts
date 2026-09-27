import { z } from 'zod';
import type { PaginatedResponse } from '@repo/shared-types';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function offsetOf({ page, limit }: Pagination): number {
  return (page - 1) * limit;
}

export function paginate<T>(
  data: T[],
  total: number,
  { page, limit }: Pagination,
): PaginatedResponse<T> {
  return { data, meta: { page, limit, total } };
}