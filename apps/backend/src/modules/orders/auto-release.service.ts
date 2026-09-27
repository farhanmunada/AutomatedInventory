import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AUTO_RELEASE_TIMEOUT_MS } from '@repo/shared-types';
import { OrdersRepository } from '../orders/orders.repository';

/**
 * Auto-cancels orders that were reserved but never packed.
 *
 * Uses a DB scan instead of a delayed queue: idempotent by construction
 * (conditional update on status) and restart-safe without reconciliation.
 */
@Injectable()
export class AutoReleaseService {
  private readonly logger = new Logger(AutoReleaseService.name);

  constructor(private readonly ordersRepository: OrdersRepository) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scanExpiredReservations(): Promise<void> {
    const cutoff = new Date(Date.now() - AUTO_RELEASE_TIMEOUT_MS);
    const expired = await this.ordersRepository.findExpiredDrafts(cutoff);

    for (const order of expired) {
      try {
        const { changed } = await this.ordersRepository.cancel(order.id);
        if (changed) {
          this.logger.log(`Auto-released order ${order.id} (reserved > 60 min)`);
        }
      } catch (error) {
        this.logger.error(`Auto-release failed for order ${order.id}: ${(error as Error).message}`);
      }
    }
  }

  /** Runs once on boot so reservations that expired during downtime are handled. */
  async onApplicationBootstrap(): Promise<void> {
    await this.scanExpiredReservations();
  }
}