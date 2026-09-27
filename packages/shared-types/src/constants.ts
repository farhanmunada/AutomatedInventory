export const ORDER_STATUS = {
  DRAFT: 'DRAFT',
  RESERVED: 'RESERVED',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_CHANNEL = {
  WEB: 'WEB',
  POS: 'POS',
} as const;

export type OrderChannel = (typeof ORDER_CHANNEL)[keyof typeof ORDER_CHANNEL];

/**
 * Allowed status transitions. Enforcement happens in the order service;
 * the table below is the single source of truth for the rule.
 */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['RESERVED', 'CANCELLED'],
  RESERVED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: [],
  CANCELLED: [],
};

/** Draft orders older than this are auto-cancelled and their stock released. */
export const AUTO_RELEASE_TIMEOUT_MS = 60 * 60 * 1000;

/** Interval of the low-stock scan cron job. */
export const LOW_STOCK_CHECK_INTERVAL_MS = 5 * 60 * 1000;