export const API_PATHS = {
  auth: {
    login: '/api/auth/login',
  },
  products: {
    list: '/api/products',
    detail: (id: string) => `/api/products/${id}`,
    create: '/api/products',
    update: (id: string) => `/api/products/${id}`,
    delete: (id: string) => `/api/products/${id}`,
  },
  lots: {
    list: '/api/lots',
    create: '/api/lots',
  },
  orders: {
    list: '/api/orders',
    detail: (id: string) => `/api/orders/${id}`,
    create: '/api/orders',
    transition: (id: string) => `/api/orders/${id}/status`,
  },
  dashboard: {
    stockSummary: '/api/dashboard/stock-summary',
    stockValuation: '/api/dashboard/stock-valuation',
    lowStock: '/api/dashboard/low-stock',
    orderStats: '/api/dashboard/order-stats',
  },
} as const;
