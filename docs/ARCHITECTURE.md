# Arsitektur Sistem — Automated Inventory & Order Fulfillment Dashboard

> **Versi:** 1.1
> **Tanggal:** 2026-09-27
> **Status:** `APPROVED` — Gerbang 2 disetujui; implementasi berjalan.
> **PRD pendukung:** `docs/PRD.md` (APPROVED)
> **Riset pendukung:** `docs/RESEARCH.md`
> **Catatan implementasi:** lihat §11 (Deviasi & Keputusan Saat Implementasi).

---

## 1. Diagram Arsitektur Tingkat Tinggi

```text
┌──────────────────────────────────────────────────────────────┐
│                        BROWSER (User)                         │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼─────────────────────────────────┐
│              FRONTEND — Next.js App Router                    │
│              (localhost:3000 / Vercel)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐   │
│  │ app/         │ │ features/    │ │ TanStack Query cache  │   │
│  │ (routing)    │ │ (logic)      │ │ (stale data display)  │   │
│  └──────────────┘ └──────────────┘ └──────────────────────┘   │
└────────────────────────────┬─────────────────────────────────┘
                             │ /api/* (rewrites dev, same-origin prod)
┌────────────────────────────▼─────────────────────────────────┐
│              BACKEND — NestJS (long-running)                  │
│              (localhost:3001)                                 │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Guards  │ │ Pipes    │ │ Modules  │ │ Exception Filter  │   │
│  │ (JWT)   │ │ (DTO)    │ │ (feature)│ │ (centralized)     │   │
│  └─────────┘ └──────────┘ └────┬─────┘ └──────────────────┘   │
│                              │                               │
│  ┌───────────────────────────┼─────────────────────────────┐  │
│  │        Layer: Controller → Service → Repository         │  │
│  └───────────────────────────┼─────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
┌─────────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────────────┐
│  PostgreSQL (Neon)  │ │  Redis       │ │  BullMQ Workers      │
│  ┌──────────────┐   │ │  ┌────────┐  │ │  ┌────────────────┐  │
│  │ Drizzle ORM │   │ │  │ Cache: │  │ │  │ auto-release   │  │
│  │ pg.Pool     │   │ │  │ HASH   │  │ │  │ (60 min timeout)│  │
│  │ (pooled)    │   │ │  │        │  │ │  ├────────────────┤  │
│  └──────────────┘   │ │  │ Queue: │  │ │  │ low-stock-check│  │
│  Migrasi: unpooled  │ │  │ orders │  │ │  │ (every 5 min)  │  │
└─────────────────────┘ └──────────────┘ └──────────────────────┘
```

---

## 2. Struktur Monorepo

```text
automated-inventory/
├── pnpm-workspace.yaml
├── package.json                    (root: scripts dev/build/test)
├── tsconfig.base.json              (strict, shared compilerOptions)
├── .gitignore
├── .env.example                    (template, tanpa nilai asli)
├── docs/                           (PRD, ARCHITECTURE, RESEARCH)
│
├── apps/
│   ├── backend/                    @repo/backend
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── core/
│   │   │   │   ├── config/env.ts           (Zod schema .env)
│   │   │   │   ├── database/
│   │   │   │   │   ├── db.module.ts        (pg.Pool provider)
│   │   │   │   │   └── schema.ts           (Drizzle tables)
│   │   │   │   ├── redis/redis.module.ts   (ioredis provider)
│   │   │   │   ├── errors/
│   │   │   │   │   ├── app-error.ts
│   │   │   │   │   └── global-filter.ts
│   │   │   │   └── auth/
│   │   │   │       ├── jwt.strategy.ts
│   │   │   │       ├── jwt-auth.guard.ts
│   │   │   │       └── auth.module.ts
│   │   │   └── modules/
│   │   │       ├── users/
│   │   │       ├── products/
│   │   │       ├── lots/
│   │   │       ├── orders/
│   │   │       │   ├── orders.controller.ts
│   │   │       │   ├── orders.service.ts
│   │   │       │   ├── orders.repository.ts
│   │   │       │   ├── dto/
│   │   │       │   └── state-machine.ts    (transisi valid)
│   │   │       ├── allocations/
│   │   │       │   └── fifo.service.ts     (FOR UPDATE lock)
│   │   │       ├── stock-cache/
│   │   │       │   └── stock-cache.service.ts
│   │   │       ├── workers/
│   │   │       │   ├── orders.processor.ts (auto-release)
│   │   │       │   └── low-stock.processor.ts
│   │   │       └── dashboard/
│   │   ├── drizzle/                        (generated migrations)
│   │   ├── drizzle.config.ts
│   │   ├── scripts/seed-admin.ts
│   │   └── package.json
│   │
│   └── frontend/                   @repo/frontend
│       ├── app/
│       │   ├── (auth)/login/page.tsx
│       │   ├── (dashboard)/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx                 (Dashboard)
│       │   │   ├── products/
│       │   │   │   ├── page.tsx
│       │   │   │   └── [id]/page.tsx
│       │   │   ├── lots/page.tsx
│       │   │   └── orders/
│       │   │       ├── page.tsx
│       │   │       ├── [id]/page.tsx
│       │   │       └── new/page.tsx
│       │   └── globals.css
│       ├── src/
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── products/
│       │   │   ├── lots/
│       │   │   ├── orders/
│       │   │   └── dashboard/
│       │   └── shared/
│       │       ├── api/client.ts           (fetch wrapper)
│       │       └── components/ui/          (shadcn primitives)
│       ├── next.config.ts                  (rewrites + transpile)
│       └── package.json
│
└── packages/
    └── shared-types/               @repo/shared-types
        └── src/
            ├── index.ts
            ├── enums.ts            (OrderStatus, Channel)
            ├── dtos.ts             (ProductDto, OrderDto, ...)
            └── api-paths.ts        (endpoint constants)
```

**Aturan module boundary:** Modul backend hanya communicate via public interface (controller). Dilarang deep-piercing import (`modules/orders/internal/...`). `shared-types` hanya export plain type/interface — dilarang export decorator NestJS.

---

## 3. Skema Database (Drizzle Schema)

```typescript
// apps/backend/src/core/database/schema.ts

// products
products: pgTable('products', {
  id: pgUUID('id').primaryKey().defaultRandom(),
  sku: varchar('sku', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  minBufferStock: integer('min_buffer_stock').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
})

// inventory_lots
inventoryLots: pgTable('inventory_lots', {
  id: pgUUID('id').primaryKey().defaultRandom(),
  productId: pgUUID('product_id').notNull().references(() => products.id),
  purchasePrice: numeric('purchase_price', { precision: 15, scale: 2 }).notNull(),
  initialQty: integer('initial_qty').notNull(),
  availableQty: integer('available_qty').notNull(),
  receivedAt: timestamp('received_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
})

// orders
orders: pgTable('orders', {
  id: pgUUID('id').primaryKey().defaultRandom(),
  orderNumber: varchar('order_number', { length: 20 }).notNull().unique(),
  channel: orderChannel('channel').notNull(),
  status: orderStatus('status').notNull().default('DRAFT'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
})

// order_items
orderItems: pgTable('order_items', {
  id: pgUUID('id').primaryKey().defaultRandom(),
  orderId: pgUUID('order_id').notNull().references(() => orders.id),
  productId: pgUUID('product_id').notNull().references(() => products.id),
  requestedQty: integer('requested_qty').notNull(),
})

// order_item_allocations
orderItemAllocations: pgTable('order_item_allocations', {
  id: pgUUID('id').primaryKey().defaultRandom(),
  orderItemId: pgUUID('order_item_id').notNull().references(() => orderItems.id),
  lotId: pgUUID('lot_id').notNull().references(() => inventoryLots.id),
  allocatedQty: integer('allocated_qty').notNull(),
})

// users
users: pgTable('users', {
  id: pgUUID('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
})
```

### Indeks & Constraint

```typescript
// Index FIFO (query alokasi)
idx_lots_fifo: index('idx_lots_fifo').on(
  inventoryLots.productId,
  inventoryLots.availableQty,
  inventoryLots.receivedAt,
)

// Index auto-release worker
idx_orders_status: index('idx_orders_status').on(orders.status, orders.createdAt)

// Check constraint level SQL (di migration)
ALTER TO inventory_lots ADD CONSTRAINT lots_qty_nonneg CHECK (available_qty >= 0);
```

---

## 4. Alur Data Kritis

### 4.1 Alokasi FIFO (DRAFT → RESERVED)

```text
PATCH /api/orders/:id/status { status: "RESERVED" }
    │
    ▼
OrdersController (validasi DTO, JWT guard)
    │
    ▼
OrdersService.transitionStatus()
    │  ├─ cek state machine (INVALID_TRANSITION → 409)
    │  └─ sort items by productId (deadlock prevention)
    ▼
db.transaction(async (tx) => {
    │
    ├─ 1. SELECT lots WHERE product_id, available_qty > 0
    │      ORDER BY received_at ASC FOR UPDATE     ← row lock
    │
    ├─ 2. Validasi total >= requested
    │      (INSUFFICIENT_STOCK → rollback → 409)
    │
    ├─ 3. Loop FIFO: UPDATE lots SET available_qty -= deduct
    │                INSERT order_item_allocations
    │
    └─ 4. UPDATE orders SET status = 'RESERVED'
})
    │
    ▼ (commit DB)
StockCacheService.adjustStock(productId, -qty)   ← HINCRBY Redis
    │
    ▼
OrdersQueue.add('auto-release', { orderId }, { delay: 3600000 })
    │
    ▼
Response 200
```

**Kenapa Redis update di luar transaksi:** Holding DB lock selama operasi network Redis memperbesar window deadlock. Drift ditangani cron rekonsiliasi 5 menit.

### 4.2 Rollback Stok (→ CANCELLED)

```text
OrdersService.transitionStatus(CANCELLED)
    │
    ├─ cek: status saat ini DRAFT / RESERVED / PACKED
    │   └─ DRAFT → tidak ada rollback, langsung update status
    │
    ▼
db.transaction(async (tx) => {
    ├─ 1. SELECT allocations JOIN order_items WHERE order_id
    │      FOR UPDATE
    ├─ 2. UPDATE orders SET status = 'CANCELLED'
    │      WHERE id = ? AND status IN ('RESERVED','PACKED')
    │      (affected = 0 → skip, idempotent)
    ├─ 3. UPDATE lots SET available_qty += allocated_qty (per lot)
    └─ 4. DELETE order_item_allocations
})
    │
    ▼ (commit)
StockCacheService.adjustStock(productId, +qty)   ← per lot, kumpulkan
OrdersQueue.getJob().remove()                    ← hapus delayed auto-release
```

### 4.3 Auto-Release Worker

```text
BullMQ delayed job (delay: 60 menit)
    │  trigger: order masuk RESERVED
    ▼
OrdersProcessor.handleAutoRelease({ orderId })
    │
    ├─ UPDATE orders SET status='CANCELLED'
    │  WHERE id = ? AND status = 'RESERVED'     ← guard idempotency
    │
    ├─ affected = 0 → return (sudah diproses/dibatalkan user)
    │
    └─ affected = 1 → rollbackStock(orderId)    ← sama dengan 4.2
```

**Startup reconciliation:** saat app boot, scan `SELECT id FROM orders WHERE status='RESERVED' AND created_at < NOW() - INTERVAL '60 minutes'`, proses sisanya. Melindungi job yang hilang saat restart.

### 4.4 Low Stock Check

```text
upsertJobScheduler('low-stock-check', { every: 300_000 })
    │
    ▼
SELECT product_id, SUM(available_qty) AS total
FROM inventory_lots GROUP BY product_id
HAVING SUM(available_qty) <= min_buffer_stock
    │
    ▼
Cache hasil ke Redis key 'alerts:low-stock' (TTL 10 menit)
    │
    ▼
Frontend GET /api/dashboard/low-stock (baca dari cache)
```

---

## 5. Layer Separation Contract

| Layer | Boleh | DILARANG |
|---|---|---|
| **Controller** | Parse req, validasi DTO, panggil service, format response | Query SQL langsung, logika bisnis |
| **Service** | Orkestrasi, transaksi, state machine, domain error | Import `req`/`res`, akses HTTP layer |
| **Repository** | Query Drizzle, mapping entity → DTO | Status HTTP, keputusan bisnis |
| **FifoService** | Lock + deduct + insert allocation dalam tx | Dipanggil langsung dari controller |

**Dependency flow:** `Controller → Service → (Repository + FifoService + StockCacheService)`

Cross-module communication hanya via controller public API atau event. Dilarang `OrdersService` mengimpor `ProductsRepository` langsung — gunakan `ProductsService` public method.

---

## 6. Dependency Manifest (Perlu Konfirmasi Manusia)

### 6.1 Backend (`apps/backend`)

| Package | Kategori | Alasan |
|---|---|---|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | core | Framework |
| `reflect-metadata`, `rxjs` | core | NestJS peer |
| `@nestjs/config` | config | `.env` loading |
| `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt` | auth | JWT auth v1 |
| `bcrypt` | auth | Password hashing |
| `drizzle-orm` | db | ORM |
| `pg` | db | Driver node-postgres (interactive transaction) |
| `ioredis` | cache/queue | Redis client |
| `@nestjs/bullmq`, `bullmq` | queue | Background workers |
| `zod` | validation | Env schema + (frontend form schema reuse) |
| `class-validator`, `class-transformer` | validation | NestJS DTO pipes |
| `@nestjs/schedule` | cron | Reconciliation cron 5 menit |
| **Dev:** `drizzle-kit`, `tsx`, `typescript`, `eslint` | dev | Migrasi, seed, lint |

### 6.2 Frontend (`apps/frontend`)

| Package | Kategori | Alasan |
|---|---|---|
| `next`, `react`, `react-dom` | core | Framework |
| `@tanstack/react-table` | data | v8 — server-side table |
| `@tanstack/react-query` | data | v5 — caching & pagination |
| `react-hook-form` | form | Create Order multi-item |
| `@hookform/resolvers` | form | Zod resolver bridge |
| `tailwindcss` v4 | styling | Shadcn base |
| Shadcn primitives (copy-in, **bukan dependency npm**) | UI | Button, Input, Table, Dialog, Badge, Toast |

> **Ponytail:** Turborepo **tidak** ditambahkan — 2 app + 1 paket cukup dengan `pnpm -r`.

### 6.3 Shared

| Package | Alasan |
|---|---|
| `@repo/shared-types` (workspace) | Tipe DTO & enum shared BE/FE |
| `zod` (di kedua app) | Schema validation reusable |

---

## 7. Keputusan Arsitektur Kritis (ADR Ringkas)

| # | Keputusan | Alternatif Ditolak | Alasan |
|---|---|---|---|
| ADR-1 | `node-postgres` + `pg.Pool` | `neon-http` | HTTP driver tidak support interactive transaction (FIFO `FOR UPDATE` butuh multi-step tx) |
| ADR-2 | Drizzle ORM | Prisma / TypeORM / raw SQL | Drizzle punya `.for()` native, type-safe, migrasi ringan |
| ADR-3 | Redis HASH + write-through | String per-key / CDC event | Atomic `HINCRBY`, batch `HMGET`, reconciliation cron sebagai safety net |
| ADR-4 | BullMQ jobId + DB guard | Distributed lock Redis | Idempotency 3 lapis tanpa kompleksitas lock manager |
| ADR-5 | Monorepo pnpm (no Turborepo) | Polyrepo / Nx / Turborepo | Ponytail — kompleksitas minimal untuk 2 app + 1 paket |
| ADR-6 | Shadcn/ui (copy-in) | MUI / Ant Design / custom | Bebas template klise (per `skill-frontend-design`), tidak tambah dependency runtime |
| ADR-7 | Numeric(15,2) untuk currency | double precision | Anti rounding error perhitungan keuangan |
| ADR-8 | Next.js rewrites dev (no CORS) | CORS config | Same-origin, konfigurasi minimal |

---

## 8. Task Decomposition (Urutan Eksekusi)

Fase implementasi dipecah menjadi sub-tugas independen. Tiap sub-tugas = 1 unit yang bisa diuji & di-commit atomik.

### Tahap 1 — Fondasi (backend)
| # | Sub-tugas | File Utama | Verifikasi |
|---|---|---|---|
| 1.1 | Setup monorepo pnpm + tsconfig base + scripts | `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json` | `pnpm install` sukses, workspace resolve |
| 1.2 | Backend skeleton NestJS + global prefix + validation pipe + exception filter | `main.ts`, `app.module.ts`, `global-filter.ts` | `pnpm dev` jalan di :3001, `GET /api/health` 200 |
| 1.3 | Drizzle schema + migrasi Neon + db module | `schema.ts`, `db.module.ts`, `drizzle.config.ts` | `drizzle-kit push` ke DB asli, `SELECT 1` |
| 1.4 | Redis module + stock cache service | `redis.module.ts`, `stock-cache.service.ts` | `HSET`/`HGET` round-trip |
| 1.5 | Auth module + JWT guard + seed admin script | `jwt.strategy.ts`, `scripts/seed-admin.ts` | Login 200, protected route 401 tanpa token |

### Tahap 2 — Domain Core
| # | Sub-tugas | File Utama | Verifikasi |
|---|---|---|---|
| 2.1 | Products module (CRUD) | `products/*.ts` | 5 kriteria Story 2.x lulus |
| 2.2 | Lots module (CRUD + cache sync) | `lots/*.ts` | 3 kriteria Story 3.x lulus |
| 2.3 | Orders module + state machine | `orders/state-machine.ts`, `orders.service.ts` | Transisi valid/invalid (5.1.4) |
| 2.4 | FIFO allocation service | `allocations/fifo.service.ts` | Kriteria 5.1.1 + 5.1.2 |
| 2.5 | Rollback stok (cancel) | `orders.service.ts` | Kriteria 5.4.1–5.4.5 |

### Tahap 3 — Background Workers
| # | Sub-tugas | File Utama | Verifikasi |
|---|---|---|---|
| 3.1 | BullMQ queue module + auto-release processor | `workers/orders.processor.ts` | Kriteria 6.1.1–6.1.4 |
| 3.2 | Low stock check scheduler + cache | `workers/low-stock.processor.ts` | Kriteria 6.2.1–6.2.2 |
| 3.3 | Reconciliation cron (cache drift + startup scan) | `stock-cache.service.ts` | Redis di-corrupt → sembuh ≤ 5 menit |

### Tahap 4 — Dashboard API
| # | Sub-tugas | File Utama | Verifikasi |
|---|---|---|---|
| 4.1 | Stock summary + valuation endpoints | `dashboard/*.ts` | Kriteria 7.1.1, 7.1.3 |
| 4.2 | Order stats + low stock endpoints | `dashboard/*.ts` | Kriteria 7.2.1 |

### Tahap 5 — Frontend
| # | Sub-tugas | File Utama | Verifikasi |
|---|---|---|---|
| 5.1 | Next.js skeleton + shadcn init + auth flow | `app/(auth)/login/`, `features/auth/` | Login redirect ke dashboard |
| 5.2 | Shared layout + TanStack Query provider | `app/(dashboard)/layout.tsx` | Persist token, logout |
| 5.3 | Dashboard page | `features/dashboard/` | Kriteria 7.1.1, 7.2.1 di UI |
| 5.4 | Products list + detail | `features/products/` | Kriteria 2.1.1–2.1.4 |
| 5.5 | Lots list + create form | `features/lots/` | Kriteria 3.x |
| 5.6 | Orders list + detail + status action | `features/orders/` | Kriteria 5.x di UI |
| 5.7 | Create order form (multi-item) | `features/orders/new/` | Kriteria 4.1.1–4.1.3 |

### Tahap 6 — Verifikasi & Seal
| # | Sub-tugas | Verifikasi |
|---|---|---|
| 6.1 | Concurrency test (10 order paralel) | Zero oversell (G1) |
| 6.2 | Full regression + typecheck + lint | `pnpm -r exec tsc --noEmit` 0 error |
| 6.3 | Production build | `pnpm build` sukses |
| 6.4 | Dokumentasi sync + commit final | `docs/` up-to-date |

---

## 9. Risiko & Mitigasi

| Risiko | Probabilitas | Mitigasi |
|---|---|---|
| Deadlock saat alokasi multi-produk konkuren | Sedang | Sort `productId` ASC sebelum lock; lock window kecil (`available_qty > 0` saja) |
| Redis drift dari DB | Rendah | Rekonsiliasi cron 5 menit + warm-up boot |
| Neon cold start di migrasi | Rendah | Unpooled connection untuk Drizzle Kit; retry 1x |
| Delayed job hilang saat restart | Sedang | Startup reconciliation scan order RESERVED kedaluwarsa |
| Hydration mismatch timestamp frontend | Sedang | `Intl.DateTimeFormat` dengan `timeZone: 'Asia/Jakarta'` eksplisit |
| Scope creep | Sedang | Non-Goals eksplisit (10 butir) di PRD |

---

## 10. Lingkup Eksekusi Sekarang

**Yang akan dikerjakan setelah approval Gerbang 2:**
- Tahap 1.1 → 1.5 (fondasi backend), lalu berhenti untuk checkpoint.
- Setiap sub-tugas: implementasi → verifikasi → commit atomik.

**Tidak termasuk eksekusi ini:** deployment production, CI/CD pipeline, observability setup (post-MVP per `skill-observability-and-instrumentation`).

---

## 11. Deviasi & Keputusan Saat Implementasi

Perubahan terhadap rencana awal, dicatat sebagai memori persisten.

| # | Item | Rencana Awal | Realisasi | Alasan |
|---|---|---|---|---|
| D-1 | Verifikasi skema DB | `drizzle-kit push` | `drizzle-kit generate` + `drizzle-kit migrate` (file SQL di `apps/backend/drizzle/`) | `push` mencoba drop PK/not-null dan meninggalkan DB tanpa CHECK constraint; migrasi = source of truth & aman |
| D-2 | Struktur build backend | `dist/main.js` | `dist/src/main.js` (`rootDir: ./`) | `scripts/seed-admin.ts` berada di luar `src/`, sehingga `rootDir` harus mencakup keduanya |
| D-3 | Package `shared-types` | source-only (`main: src/index.ts`) | punya build step sendiri (`tsc` → `dist/`) | `tsc` backend ikut meng-emit source `shared-types` ke `dist/` (nesting `dist/apps`, `dist/packages`) bila tanpa build step |
| D-4 | Format `JWT_EXPIRES_IN` | string `'24h'` | number detik (`86400`) | `@nestjs/jwt` v11 butuh tipe `StringValue` dari `ms`; number menghindari dependency tipe tambahan |
| D-5 | Secret loader | `@nestjs/config` saja | `env.ts` memuat root `.env` via `dotenv`; `@nestjs/config` tetap aktif | `env` divalidasi di module-scope sebelum `ConfigModule` init; `.env` berada di root monorepo |
| D-6 | Approval build script pnpm 12 | `pnpm.onlyBuiltDependencies` (package.json) | `allowBuilds` di `pnpm-workspace.yaml` | pnpm ≥ 11 mengganti mekanisme approval build script |
| D-7 | Lifecycle shutdown | tidak dispesifikasi | `OnApplicationShutdown` di `DbModule` (`pool.end`) & `RedisModule` (`disconnect`) + `app.enableShutdownHooks()` | Tanpa ini, seed/CLI script menggantung (open handle) |
| D-8 | Guard JWT | disebut di riset | `APP_GUARD` global + `@Public()` decorator | PRD §(autentikasi) mensyaratkan semua endpoint terlindungi kecuali login |
| D-9 | Redis provisioning | diasumsikan lokal | `REDIS_URL` ATAU `REDIS_HOST/PORT`; boot tetap sukses tanpa Redis (degradasi cache + warning) | Belum ada Redis lokal/Docker di mesin dev |
| D-10 | Constraint integritas | hanya FK/unique | + CHECK constraints (`available_qty` range, qty positif, harga ≥ 0) & index FK | Invariant stok harus dijaga di DB, bukan hanya di service layer |

### Status Verifikasi Tahap 1

| Sub-tugas | Status | Bukti |
|---|---|---|
| 1.1 Monorepo pnpm | ✅ | `pnpm install` sukses; `allowBuilds` aktif; `bcrypt` native binding terpasang |
| 1.2 Skeleton NestJS | ✅ | Build bersih; `GET /api/health` → `200` |
| 1.3 Drizzle schema + migrasi | ✅ Tier 2 | 6 tabel, 2 enum, PK/FK/CHECK/index ter-apply di Neon; smoke test 8 asersi lulus lalu `ROLLBACK` bersih |
| 1.4 Redis module + stock cache | ⚠️ Parsial | Modul + lifecycle selesai; smoke test nyata menunggu Redis tersedia |
| 1.5 Auth + JWT + seed | ✅ | `POST /api/auth/login` → `200` + `access_token` + `user`; password salah → `401`; seed admin idempoten |
