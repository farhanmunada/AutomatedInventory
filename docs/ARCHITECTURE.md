# Arsitektur Sistem — Automated Inventory & Order Fulfillment Dashboard

> **Versi:** 1.1
> **Tanggal:** 2026-09-27
> **Status:** `APPROVED` — Gerbang 2 disetujui. **Revisi v1.2 (2026-09-27): Redis & BullMQ DIHAPUS** atas keputusan operator. Seluruh mekanisme cache/queue/worker di dokumen ini **tidak lagi berlaku**, digantikan scan DB + cron in-process (`AutoReleaseService`). Bagian terdampak ditandai *(superseded)*; riwayat desain tetap ada. Deviasi §11. Backend Tahap 2 selesai: 64/64 assertion E2E vs Neon nyata.
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
                    ┌──────────┴───────────┐
                    │                      │
┌─────────────▼────────────┐ ┌──────────────────────────────────┐
│  PostgreSQL (Neon)        │ │ In-process cron (@nestjs/schedule)│
│  ┌────────────────────┐   │ │  ┌─────────────────────────────┐ │
│  │ Drizzle ORM        │   │ │  │ auto-release scan (1 min)   │ │
│  │ pg.Pool (pooled)   │   │ │  │  RESERVED > 60 min          │ │
│  │ raw Pool (FIFO tx) │   │ │  ├─────────────────────────────┤ │
│  └────────────────────┘   │ │  │ startup reconciliation      │ │
│  Migrasi: unpooled        │ │  │  (onApplicationBootstrap)   │ │
│  CHECK + index + sequence │ │  └─────────────────────────────┘ │
└───────────────────────────┘ │  Tidak ada state antrean terpisah│
  • stok = SUM(available_qty) └──────────────────────────────────┘
    di atas indeks produk
  • low-stock dihitung langsung
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
│   │   │   ├── main.ts                     (prefix /api, ValidationPipe, shutdown hooks)
│   │   │   ├── app.module.ts
│   │   │   ├── core/
│   │   │   │   ├── health.controller.ts    (@Public)
│   │   │   │   ├── config/env.ts           (Zod schema .env)
│   │   │   │   ├── database/
│   │   │   │   │   ├── db.module.ts        (pg.Pool provider + OnApplicationShutdown)
│   │   │   │   │   └── schema.ts           (Drizzle tables + CHECK + index + sequence)
│   │   │   │   ├── errors/
│   │   │   │   │   ├── app-error.ts
│   │   │   │   │   └── global-filter.ts    (BadRequest 400 -> VALIDATION_ERROR)
│   │   │   │   ├── http/pagination.ts      (ParsePaginationQuery, maks 100)
│   │   │   │   └── auth/
│   │   │   │       ├── auth.module.ts      (APP_GUARD global)
│   │   │   │       ├── auth.controller.ts  (POST /auth/login, @Public)
│   │   │   │       ├── jwt.strategy.ts
│   │   │   │       ├── jwt-auth.guard.ts
│   │   │   │       └── public.decorator.ts
│   │   │   └── modules/
│   │   │       ├── users/                  (repository + service, bcrypt compare)
│   │   │       ├── products/               (controller/service/repository/mapper)
│   │   │       ├── lots/                   (controller/service/repository)
│   │   │       ├── orders/
│   │   │       │   ├── orders.controller.ts
│   │   │       │   ├── orders.service.ts   (validasi + transisi status)
│   │   │       │   ├── orders.repository.ts (FIFO FOR UPDATE, rollback atomik, nextval)
│   │   │       │   ├── orders.mapper.ts    (DTO + agregat total)
│   │   │       │   ├── state-machine.ts    (DRAFT->RESERVED->PACKED->SHIPPED)
│   │   │       │   └── auto-release.service.ts (cron 1 menit + scan saat boot)
│   │   │       └── dashboard/              (stock-summary, valuation, low-stock, order-stats)
│   │   ├── scripts/
│   │   │   ├── seed-admin.ts               (dijalankan via dist/scripts/seed-admin.js)
│   │   │   └── smoke-e2e.js                (64 assertion, DB nyata, self-cleanup)
│   │   ├── drizzle/                        (generated migrations)
│   │   ├── drizzle.config.ts
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

### 4.1 Alokasi FIFO (DRAFT -> RESERVED)

```text
PATCH /api/orders/:id/status { status: "RESERVED" }
    |
    v
OrdersController (validasi DTO, JWT guard)
    |
    v
OrdersService.transitionStatus()
    |  |-- cek state machine (INVALID_TRANSITION -> 409)
    |  `-- sort items by product_id ASC (anti-deadlock)
    v
db.transaction(async (tx) => {
     |-- 1. SELECT lots WHERE product_id = ? AND available_qty > 0
     |       ORDER BY received_at ASC FOR UPDATE      (row lock)
     |
     |-- 2. Validasi total >= requested
     |       (INSUFFICIENT_STOCK -> ROLLBACK -> 409)
     |
     |-- 3. Loop FIFO: UPDATE inventory_lots SET available_qty = available_qty - deduct
     |                INSERT order_item_allocations
     |
     `-- 4. UPDATE orders SET status = 'RESERVED'
})
     |
     v (commit DB -> satu-satunya sumber kebenaran stok)
Response 200
```

**Kenapa tanpa cache stok:** satu-satunya angka berasal dari `SUM(inventory_lots.available_qty)` di atas indeks `(product_id, available_qty, received_at)`. Tidak ada state kedua = tidak ada drift yang perlu direkonsiliasi.

### 4.2 Rollback Stok (-> CANCELLED)

```text
OrdersService.transitionStatus(orderId, CANCELLED)
     |
     +-- state-machine.ts: tolak 409 INVALID_TRANSITION jika SHIPPED/CANCELLED
     |
     v
db.transaction(async (tx) => {
     |-- 1. SELECT ... FROM orders WHERE id = ? FOR UPDATE   (kunci baris order dulu)
     |-- 2. UPDATE orders SET status='CANCELLED'
     |       WHERE id = ? AND status IN ('RESERVED','PACKED')
     |       (affected = 0 -> skip, idempotent)
     |-- 3. UPDATE inventory_lots SET available_qty = available_qty + allocated_qty
     |       (per alokasi, via helper `lotProductId` agar tidak kena bug Drizzle)
     `-- 4. DELETE FROM order_item_allocations WHERE order_item_id IN (...)
})
     |
     v (commit -> selesai; tidak ada cache/queue yang perlu disinkronkan)
```

Seluruh rollback terjadi dalam **satu transaksi** sehingga balapan "cancel + auto-release" tidak bisa mengembalikan stok dua kali: pihak yang kalah menunggu lock `orders` dan kemudian melihat status sudah `CANCELLED`.

### 4.3 Auto-Release (cron in-process)

```text
@Cron(CRON_EVERY_MINUTE) AutoReleaseService.scanAndRelease()
     |
     +-- SELECT id FROM orders
     |   WHERE status = 'RESERVED'
     |     AND updated_at < NOW() - INTERVAL '60 minutes'
     |
     v
untuk setiap orderId -> transitionStatus(CANCELLED)  [jalur yang sama dgn 4.2]
```

**Startup reconciliation:** `onApplicationBootstrap()` memanggil `scanAndRelease()` sekali, sehingga order yang sudah lewat timeout saat server mati tetap dilepaskan. Tidak ada state antrean yang perlu dipulihkan.

**Kenapa bukan BullMQ delayed job:** butuh Redis (tidak dipakai di lingkungan ini), dan delayed job hilang saat restart sehingga tetap butuh scan rekonsiliasi. Scan DB 1 menit lebih sederhana, idempoten, dan bounded (indeks `orders(status, updated_at)`).

### 4.4 Low Stock

```text
GET /api/dashboard/low-stock   (dipanggil polling oleh halaman Dashboard)
     |
     v
SELECT p.id, p.sku, p.name, p.min_buffer_stock, COALESCE(SUM(l.available_qty),0) AS available
FROM products p LEFT JOIN inventory_lots l ON l.product_id = p.id
GROUP BY p.id HAVING COALESCE(SUM(l.available_qty),0) <= p.min_buffer_stock
ORDER BY available ASC
```

Tidak ada scheduler dan tidak ada key `alerts:low-stock`: daftar dihitung langsung saat dibaca sehingga selalu benar.
---

## 5. Layer Separation Contract

| Layer | Boleh | DILARANG |
|---|---|---|
| **Controller** | Parse req, validasi DTO, panggil service, format response | Query SQL langsung, logika bisnis |
| **Service** | Orkestrasi, transaksi, state machine, domain error | Import `req`/`res`, akses HTTP layer |
| **Repository** | Query Drizzle, mapping entity → DTO | Status HTTP, keputusan bisnis |
| **FifoService** | Lock + deduct + insert allocation dalam tx | Dipanggil langsung dari controller |

**Dependency flow:** `Controller → Service → Repository` (FIFO ada di `OrdersRepository.reserveStock`; auto-release ada di `AutoReleaseService` yang memanggil `OrdersService`).

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
| `zod` | validation | Env schema + (frontend form schema reuse) |
| `class-validator`, `class-transformer` | validation | NestJS DTO pipes |
| `@nestjs/schedule` | cron | Auto-release scan tiap 1 menit |
| **Dev:** `drizzle-kit`, `tsx`, `typescript`, `eslint` | dev | Migrasi, seed, lint |

> ~~`ioredis`~~, ~~`@nestjs/bullmq`~~, ~~`bullmq`~~ — **dihapus** dari manifest (revisi v1.2). Tidak dipakai.

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
| ADR-3 | *(superseded v1.2)* — tanpa cache stok; angka dibaca langsung dari agregasi `inventory_lots` | Redis HASH write-through; materialized view; Redis String per-key | Satu sumber kebenaran = nol drift. Agregasi `SUM()` di atas indeks `(product_id, available_qty, received_at)` sudah di bawah batas 200ms untuk dataset MVP. Operator juga tidak memakai Redis di lingkungannya |
| ADR-4 | *(superseded v1.2)* — auto-release via scan DB `@Cron(everyMinute)` + guard status di transaksi | BullMQ delayed job + jobId dedup | Delayed job hilang saat restart sehingga tetap butuh scan rekonsiliasi DB; scan 1 menit lebih sederhana dan idempoten lewat lock `FOR UPDATE` + update kondisional |
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
| 1.3 | Drizzle schema + migrasi Neon + db module | `schema.ts`, `db.module.ts`, `drizzle.config.ts` | `drizzle-kit migrate` ke DB asli (lihat D-1), `SELECT 1` |
| ~~1.4~~ | ~~Redis module + stock cache service~~ | — | **Dihapus (v1.2)** — tidak ada cache |
| 1.5 | Auth module + JWT guard + seed admin script | `jwt.strategy.ts`, `scripts/seed-admin.ts` | Login 200, protected route 401 tanpa token |

### Tahap 2 — Domain Core ✅ SELESAI
| # | Sub-tugas | File Utama | Verifikasi |
|---|---|---|---|
| 2.1 | Products module (CRUD + stok terderive) | `products/*.ts` | ✅ Kriteria 2.1.1–2.1.4 lulus (smoke-e2e) |
| 2.2 | Lots module (CRUD + guard edit) | `lots/*.ts` | ✅ Kriteria 3.1.1–3.1.3 lulus |
| 2.3 | Orders module + state machine | `orders/state-machine.ts`, `orders.service.ts` | ✅ Kriteria 4.x, 5.1.4, 5.4.4 lulus |
| 2.4 | FIFO allocation + anti-oversell | `orders.repository.ts` (`reserveStock`) | ✅ Kriteria 5.1.1–5.1.3 + konkurensi 10 paralel (G1) lulus |
| 2.5 | Rollback stok (cancel atomik) | `orders.repository.ts` (`cancelWithRollback`) | ✅ Kriteria 5.4.1–5.4.3 lulus |
| 2.6 | Dashboard API (stock-summary, valuation, low-stock, order-stats) | `dashboard/*.ts` | ✅ Kriteria 7.1.1, 7.1.3, 7.2.1 lulus |
| 2.7 | Auto-release cron + reconciliation boot | `orders/auto-release.service.ts` | ✅ Kriteria 6.1.1–6.1.4 (scan DB, tanpa queue) |

### Tahap 3 — Frontend (berjalan)
| # | Sub-tugas | File Utama | Verifikasi |
|---|---|---|---|
| 3.1 | Next.js skeleton + shadcn init + API client + auth flow | `app/(auth)/login/`, `lib/api.ts`, `features/auth/` | Login redirect ke dashboard |
| 3.2 | Shared layout + TanStack Query provider | `app/(dashboard)/layout.tsx` | Persist token, logout |
| 3.3 | Dashboard page | `features/dashboard/` | Kriteria 7.1.1, 7.2.1 di UI |
| 3.4 | Products list + detail | `features/products/` | Kriteria 2.1.1–2.1.4 |
| 3.5 | Lots list + create form | `features/lots/` | Kriteria 3.x |
| 3.6 | Orders list + detail + status action | `features/orders/` | Kriteria 5.x di UI |
| 3.7 | Create order form (multi-item) | `features/orders/new/` | Kriteria 4.1.1–4.1.3 |

### Tahap 4 — Verifikasi & Seal
| # | Sub-tugas | Verifikasi |
|---|---|---|
| 4.1 | Concurrency test (10 order paralel) | Zero oversell (G1) — ✅ lulus di smoke-e2e |
| 4.2 | Full regression + typecheck + lint | `pnpm -r exec tsc --noEmit` 0 error |
| 4.3 | Production build | `pnpm build` sukses |
| 4.4 | Dokumentasi sync + commit final | `docs/` up-to-date |

---

## 9. Risiko & Mitigasi

| Risiko | Probabilitas | Mitigasi |
|---|---|---|
| Deadlock saat alokasi multi-produk konkuren | Sedang | Sort `product_id` ASC sebelum lock; lock per lot `FOR UPDATE ... ORDER BY received_at`; diverifikasi 10 order paralel |
| Scan auto-release membebani DB | Rendah | Query terindeks `orders(status, updated_at)`, interval 1 menit, hasil dibatasi; upgrade path = `LISTEN/NOTIFY` atau queue bila volume naik |
| Agregasi stok melambat saat dataset besar | Rendah | Indeks `(product_id, available_qty, received_at)`; upgrade path = materialized view / kolom cache di `products` |
| Neon cold start di migrasi | Rendah | Unpooled connection untuk Drizzle Kit; retry 1x |
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
| D-7 | Lifecycle shutdown | tidak dispesifikasi | `OnApplicationShutdown` di `DbModule` (`pool.end`) + `app.enableShutdownHooks()` | Tanpa ini, seed/CLI script menggantung (open handle) |
| D-8 | Guard JWT | disebut di riset | `APP_GUARD` global + `@Public()` decorator | PRD §4.2 mensyaratkan semua endpoint terlindungi kecuali login |
| D-9 | ~~Redis provisioning~~ | diasumsikan lokal | **Redis & BullMQ dihapus total** dari projek | Operator tidak memakai Redis ("yang penting jadi dulu"); agregasi DB terindeks sudah memenuhi target ≤ 200ms, sehingga cache tidak memberi nilai |
| D-10 | Constraint integritas | hanya FK/unique | + CHECK constraints (`available_qty` range, qty positif, harga ≥ 0) & index FK | Invariant stok harus dijaga di DB, bukan hanya di service layer |
| D-11 | Auto-release | BullMQ delayed job 60 menit | `@Cron(EVERY_MINUTE)` scan `status='RESERVED' AND updated_at < now()-60min` + scan sekali saat `onApplicationBootstrap` | Tanpa queue tetap memenuhi G4 (≤ 61 menit) dan restart-proof |
| D-12 | Low-stock | scheduler 5 menit + cache key | dihitung on-demand oleh `GET /api/dashboard/low-stock`; frontend polling | Menghilangkan 1 cron + 1 state; hasil selalu benar |
| D-13 | Nomor order | `count(*)`/uuid | sequence PostgreSQL `order_number_seq` → `ORD-%06d` | Atomik di bawah konkurensi tanpa tabel pembantu |
| D-14 | `nextval` via Drizzle | `sql`nextval(...)`` pada query builder | raw `pool.query('SELECT nextval(...)')` | Drizzle 0.39 me-render objek sequence sebagai JSON → `nextval(integer)` error |
| D-15 | Stok per produk (list) | correlated subquery di `select()` | `LEFT JOIN` ke derived table `stockByProduct()` | Drizzle 0.39 me-render `"id"` subquery tanpa kualifikasi → resolve ke scope dalam → stok selalu `0` (bug senyap) |
| D-16 | Seed admin | `tsx scripts/seed-admin.ts` | `nest build` + `node dist/scripts/seed-admin.js` | esbuild/tsx tidak meng-emit `emitDecoratorMetadata` → DI NestJS rusak |
| D-17 | Rate limiting login | tidak dispesifikasi detail | `LoginRateLimitGuard` (Map in-memory, sliding window 10/menit/IP) + `@Public()` | PRD §4.2 mewajibkan; tanpa Redis, store bersama tidak tersedia. Skala >1 instance → pindahkan ke store bersama |

### Status Verifikasi Tahap 1

| Sub-tugas | Status | Bukti |
|---|---|---|
| 1.1 Monorepo pnpm | ✅ | `pnpm install` sukses; `allowBuilds` aktif; `bcrypt` native binding terpasang |
| 1.2 Skeleton NestJS | ✅ | Build bersih; `GET /api/health` → `200` |
| 1.3 Drizzle schema + migrasi | ✅ Tier 2 | 6 tabel, 2 enum, PK/FK/CHECK/index ter-apply di Neon; smoke test 8 asersi lulus lalu `ROLLBACK` bersih |
| ~~1.4 Redis module + stock cache~~ | ➖ Batal | Dihapus sesuai keputusan operator (D-9) |
| 1.5 Auth + JWT + seed | ✅ | `POST /api/auth/login` → `200` + `access_token` + `user`; password salah → `401`; seed admin idempoten |

### Status Verifikasi Tahap 2 (backend domain + background jobs)

Runner: `pnpm --filter @repo/backend test` → `node scripts/smoke-e2e.js`.
Server diboot nyata di `:3999`, DB Neon produksi-mirip, data uji bertag `E2E-<timestamp>` dan dibersihkan sendiri.

| Area | Status | Bukti |
|---|---|---|
| Products CRUD + search/sort/pagination | ✅ | Kriteria 2.1.1–2.1.4 (SKU duplikat → 409 `DUPLICATE_SKU`; produk dengan lot/order → 409 `PRODUCT_IN_USE`) |
| Lots (create, edit guard, koreksi FIFO) | ✅ | Kriteria 3.1.1–3.1.3 (`INSUFFICIENT_STOCK` saat qty < sudah dialokasikan) |
| Orders create + state machine | ✅ | Kriteria 4.1.1–4.1.3, 5.1.4, 5.4.4 (`INVALID_TRANSITION`) |
| FIFO alokasi (urutan `received_at`) | ✅ | Kriteria 5.1.1–5.1.3; alokasi Lot-A(10)+Lot-B(2) terekam di `order_item_allocations` |
| Anti-oversell konkuren | ✅ Tier 2 | 10 order paralel @15 unit pada stok 20 → tepat 1× `200`, 9× `409`, stok akhir `5` ≥ 0 |
| Rollback cancel atomik | ✅ | Kriteria 5.4.1–5.4.3; `available_qty` pulih persis, alokasi terhapus |
| Auto-release scan | ✅ | Kriteria 6.1.1–6.1.4 (scan kondisional + guard lock baris) |
| Dashboard stock-summary / valuation / low-stock / order-stats | ✅ | Kriteria 7.1.1, 7.1.3, 7.2.1; angka cross-checked terhadap agregasi SQL mentah |
| **Total** | **64 assertion lulus, 0 gagal** | `apps/backend/scripts/smoke-e2e.js` |
