import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ORDER_CHANNEL, ORDER_STATUS } from '@repo/shared-types';
import type { OrderChannel, OrderStatus } from '@repo/shared-types';
import { paginationSchema } from '../../core/http/pagination';
import { OrdersService } from './orders.service';

class ListOrdersQuery {
  @IsOptional()
  @IsIn(Object.values(ORDER_STATUS))
  status?: string;

  @IsOptional()
  @IsIn(Object.values(ORDER_CHANNEL))
  channel?: string;

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

class CreateOrderItemBody {
  @IsUUID()
  product_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  requested_qty!: number;
}

class CreateOrderBody {
  @IsIn(Object.values(ORDER_CHANNEL))
  channel!: OrderChannel;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemBody)
  items!: CreateOrderItemBody[];
}

class TransitionBody {
  @IsIn(Object.values(ORDER_STATUS))
  status!: OrderStatus;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Query() query: ListOrdersQuery) {
    const pagination = paginationSchema.parse({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return this.ordersService.list({
      pagination,
      status: query.status,
      channel: query.channel,
    });
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateOrderBody) {
    return this.ordersService.create({
      channel: body.channel,
      items: body.items.map((item) => ({
        product_id: item.product_id,
        requested_qty: item.requested_qty,
      })),
    });
  }

  @Patch(':id/status')
  transition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionBody,
  ) {
    return this.ordersService.transition(id, body.status);
  }
}