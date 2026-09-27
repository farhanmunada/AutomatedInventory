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

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['RESERVED', 'CANCELLED'],
  RESERVED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: [],
  CANCELLED: [],
};

export const AUTO_RELEASE_TIMEOUT_MS = 60 * 60 * 1000;
export const LOW_STOCK_CHECK_MS = 5 * 60 * 1000;
export const STOCK_CACHE_KEY = 'inventory:stock';
export const LOW_STOCK_CACHE_KEY = 'alerts:low-stock';
