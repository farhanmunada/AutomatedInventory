import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { paginationSchema } from '../../core/http/pagination';
import { LotsService } from './lots.service';

class ListLotsQuery {
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @IsOptional()
  @IsBooleanString()
  in_stock?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

class CreateLotBody {
  @IsUUID()
  product_id!: string;

  @IsNumberString()
  purchase_price!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  initial_qty!: number;

  @IsDateString()
  received_at!: string;
}

@Controller('lots')
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Get()
  list(@Query() query: ListLotsQuery) {
    const pagination = paginationSchema.parse({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return this.lotsService.list({
      pagination,
      productId: query.product_id,
      onlyInStock: query.in_stock === 'true',
    });
  }

  @Post()
  create(@Body() body: CreateLotBody) {
    return this.lotsService.create(body);
  }
}