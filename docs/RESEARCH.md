# Riset Teknis — Automated Inventory & Order Fulfillment Dashboard

> **Tanggal:** 2026-09-27
> **Fase:** 2 (Repository & Web Discovery)
> **Status:** SELESAI — input untuk `docs/PRD.md`

---

## 1. Drizzle ORM + Neon DB: Driver Selection (KRITIS)

### 1.1 Temuan Utama

Neon menyediakan 3 driver melalui Drizzle. Pilihan salah = transaksi FIFO tidak bisa jalan.

| Driver | Transport | Transaksi | `FOR UPDATE` | Cocok untuk |
|---|---|---|---|---|
| `drizzle-orm/neon-http` | HTTP (fetch) | **Non-interactive saja** (batch) | ❌ Tidak bisa | Serverless one-shot (Vercel Edge, Cloudflare) |
| `drizzle-orm/neon-serverless` | WebSocket (`Pool`) | ✅ Interactive | ✅ Bisa | Serverless yang butuh transaksi multi-step |
| `drizzle-orm/node-postgres` | TCP (`pg.Pool`) | ✅ Interactive | ✅ Bisa | **Server long-running (NestJS)** ← PILIHAN KITA |

**Alasan:** Drizzle `db.transaction(async (tx) => { ... })` membutuhkan **interactive transaction** — sesi DB hidup selama beberapa statement. neon-http hanya mendukung batch non-interactive (semua statement dikirim sekaligus), sehingga `SELECT ... FOR UPDATE` + loop + `UPDATE` + `INSERT` tidak bisa dieksekusi.

**Keputusan:** Backend NestJS adalah server long-running, jadi `drizzle-orm/node-postgres` adalah pilihan native dan paling kompatibel (`pg.Pool`).

### 1.2 Connection String Neon

Neon membedakan pooled vs direct connection:

```text
# Pooled (untuk aplikasi — lewat PgBouncer)
postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require

# Direct/Unpooled (untuk Drizzle Kit migrasi)
postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

- Aplikasi pakai **pooled** (`DATABASE_URL`).
- Migrasi Drizzle Kit pakai **unpooled** (`DATABASE_URL_UNPOOLED`) — PgBouncer di pooled mode mengganggu migrasi DDL.

### 1.3 Inisialisasi Client

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

Bungkus dalam NestJS provider (`@Module`), jangan instantiate global acak.

---

## 2. Drizzle Schema: Tipe Data untuk Tabel Inti

### 2.1 UUID Primary Key

```typescript
import { pgUUID, pgTable } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: pgUUID('id').primaryKey().defaultRandom(),
  // ...
});
```

`defaultRandom()` menghasilkan `gen_random_uuid()` di level DB — aman untuk concurrent insert.

### 2.2 Currency: `numeric` vs `double precision`

Gunakan `numeric` (bukan `double precision`) untuk harga — floating point menyebabkan rounding error pada perhitungan keuangan:

```typescript
import { numeric } from 'drizzle-orm/pg-core';

purchasePrice: numeric('purchase_price', { precision: 15, scale: 2 }).notNull(),
```

- `precision: 15` = total digit (maks 999,999,999,999.99)
- `scale: 2` = 2 angka di belakang koma

**Catatan:** `numeric` dikembalikan sebagai `string` oleh node-postgres driver (bukan number). Wajib parse di repository layer: `Number(row.purchase_price)` atau `parseFloat`. Buat helper khusus.

### 2.3 Enum Status Order

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const orderStatus = pgEnum('order_status', [
  'DRAFT',
  'RESERVED',
  'PACKED',
  'SHIPPED',
  'CANCELLED',
]);

export const orderChannel = pgEnum('order_channel', ['WEB', 'POS']);
```

`pgEnum` membuat tipe ENUM native PostgreSQL di DB — constraint di level database, bukan hanya aplikasi.

### 2.4 Timestamp

```typescript
import { timestamp } from 'drizzle-orm/pg-core';

receivedAt: timestamp('received_at', { mode: 'date' }).notNull(),
createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
```

`mode: 'date'` mengembalikan objek `Date` JS (bukan string). Penting untuk sorting FIFO `ORDER BY received_at ASC`.

---

## 3. FIFO Alokasi Stok: `SELECT ... FOR UPDATE` di Drizzle

### 3.1 API Native Drizzle

Drizzle memiliki method `.for()` native (PostgreSQL only), sejak versi 0.28.x+:

```typescript
type LockStrength = 'update' | 'no key update' | 'share' | 'key share';

// Basic
db.select().from(lots).where(eq(lots.productId, id)).for('update')

// Variants
.for('update', { noWait: true })      // FOR UPDATE NOWAIT
.for('update', { skipLocked: true })  // FOR UPDATE SKIP LOCKED
.for('update', { of: lots })          // FOR UPDATE OF inventory_lots
```

**Batasan:** `.for()` bekerja di query builder (`db.select().from()`), **TIDAK** di relational query (`db.query.table.findMany()`).

### 3.2 Pola Lengkap: Lock → Deduct → Insert dalam Satu Transaksi

```typescript
import { and, asc, eq, gt, sql } from 'drizzle-orm';

async function allocateFifo(
  tx: NodePgTransaction<Record<string, never>, Record<string, never>>,
  orderItemId: string,
  productId: string,
  requestedQty: number,
): Promise<void> {
  // 1. Lock batch tertua yang masih ada stok
  const lots = await tx
    .select({
      id: inventoryLots.id,
      availableQty: inventoryLots.availableQty,
    })
    .from(inventoryLots)
    .where(
      and(
        eq(inventoryLots.productId, productId),
        gt(inventoryLots.availableQty, 0),
      ),
    )
    .orderBy(asc(inventoryLots.receivedAt))
    .for('update');

  // 2. Validasi stok cukup
  const totalAvailable = lots.reduce((sum, l) => sum + l.availableQty, 0);
  if (totalAvailable < requestedQty) {
    tx.rollback();
    throw new InsufficientStockError(productId, requestedQty, totalAvailable);
  }

  // 3. Deduct FIFO
  let remaining = requestedQty;
  for (const lot of lots) {
    if (remaining <= 0) break;

    const deduct = Math.min(lot.availableQty, remaining);
    await tx
      .update(inventoryLots)
      .set({ availableQty: sql`${inventoryLots.availableQty} - ${deduct}` })
      .where(eq(inventoryLots.id, lot.id));

    await tx.insert(orderItemAllocations).values({
      orderItemId,
      lotId: lot.id,
      allocatedQty: deduct,
    });

    remaining -= deduct;
  }
}
```

### 3.3 Isolation Level

Default PostgreSQL `READ COMMITTED` sudah cukup karena `FOR UPDATE` mengunci baris secara eksplisit. Tidak perlu `SERIALIZABLE` (lebih lambat, lebih sering deadlock).

Eksplicit config di Drizzle:

```typescript
await db.transaction(
  async (tx) => { /* ... */ },
  { isolationLevel: 'read committed' },
);
```

### 3.4 Deadlock Prevention

Deadlock terjadi jika 2 transaksi lock produk A→B dan B→A secara bersamaan. **Mitigasi:**

1. **Urutkan lock by product ID** — selalu lock produk dalam urutan yang sama (sort `productId` ASC) saat order berisi multiple items.
2. **Lock window kecil** — hanya lot dengan `available_qty > 0`, bukan seluruh tabel.
3. **Jangan hold lock saat panggil Redis** — update cache Redis di luar transaksi atau di posisi terakhir.

```typescript
// Sort items untuk konsistensi lock order
const sortedItems = [...orderItems].sort((a, b) =>
  a.productId.localeCompare(b.productId),
);
```

---

## 4. BullMQ Worker Idempotent (NestJS)

### 4.1 Integrasi NestJS

Pakai `@nestjs/bullmq` dengan `@Processor` decorator + `extends WorkerHost`:

```typescript
@Processor('orders', { concurrency: 5 })
export class OrdersProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'auto-release':
        return this.handleAutoRelease(job);
      case 'low-stock-check':
        return this.handleLowStock(job);
    }
  }
}
```

### 4.2 Auto-Release Job (60 Menit Timeout)

**Trigger** saat order masuk status RESERVED:

```typescript
await this.ordersQueue.add(
  'auto-release',
  { orderId: order.id },
  {
    delay: AUTO_RELEASE_TIMEOUT_MS, // 3_600_000
    jobId: `auto-release-${order.id}`,
  },
);
```

**Tiga lapis idempotency:**

| Lapis | Mekanisme | Proteksi |
|---|---|---|
| 1. Queue | `jobId: auto-release-${orderId}` | BullMQ tolak job duplikat |
| 2. DB Guard | `UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND status = 'RESERVED'` | Cek `affected === 0` → skip (sudah diproses/dibatalkan) |
| 3. Job Removal | Saat order berubah PACKED/SHIPPED → `job.remove()` | Hapus delayed job yang tidak lagi relevan |

**Processor:**

```typescript
async handleAutoRelease(job: Job<{ orderId: string }>): Promise<void> {
  const { orderId } = job.data;

  // Guard: cek status dulu
  const result = await db
    .update(orders)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'RESERVED')))
    .returning({ id: orders.id });

  if (result.length === 0) return; // Sudah diproses, skip idempotent

  await this.rollbackStock(orderId);
}
```

### 4.3 Rollback Stok saat CANCELLED

```typescript
async rollbackStock(orderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Ambil semua alokasi untuk order ini
    const allocations = await tx
      .select({
        allocationId: orderItemAllocations.id,
        lotId: orderItemAllocations.lotId,
        allocatedQty: orderItemAllocations.allocatedQty,
      })
      .from(orderItemAllocations)
      .innerJoin(orderItems, eq(orderItems.id, orderItemAllocations.orderItemId))
      .where(eq(orderItems.orderId, orderId))
      .for('update');

    // 2. Kembalikan qty ke lot
    for (const alloc of allocations) {
      await tx
        .update(inventoryLots)
        .set({
          availableQty: sql`${inventoryLots.availableQty} + ${alloc.allocatedQty}`,
        })
        .where(eq(inventoryLots.id, alloc.lotId));
    }

    // 3. Hapus alokasi
    await tx
      .delete(orderItemAllocations)
      .where(
        inArray(
          orderItemAllocations.id,
          allocations.map((a) => a.allocationId),
        ),
      );
  });

  // 4. Update Redis cache (di luar transaksi)
  for (const alloc of allocations) {
    await this.stockCache.adjustStock(alloc.lotProductId, alloc.allocatedQty);
  }
}
```

### 4.4 Low Stock Alert (Scheduled)

BullMQ `upsertJobScheduler` (Pengganti API `repeat` lama):

```typescript
// Setup saat app boot
await this.ordersQueue.upsertJobScheduler(
  'low-stock-check',
  { every: LOW_STOCK_CHECK_MS }, // 300_000 (5 menit)
  { name: 'low-stock-check' },
);
```

Idempotent by design — read-only check, tidak ada mutasi. Query produk di mana total `available_qty` ≤ `min_buffer_stock`, simpan ke tabel `low_stock_alerts` atau emit event.

---

## 5. Redis: Cache Stok Real-Time

### 5.1 Struktur Data: HASH

```text
Key:    inventory:stock
Field:  <productId>
Value:  <totalAvailableQty>
```

**Kenapa HASH, bukan String/Sorted Set:**

| Struktur | Kelebihan | Kekurangan |
|---|---|---|
| **HASH** ✅ | Single key, `HGETALL` full catalog, `HMGET` batch, `HINCRBY` atomic O(1), memory-efficient (ziplist <128 fields) | Tidak ada range query — tidak butuh di sini |
| String per produk | Sederhana | 10x lebih boros memory, tidak ada batch read native |
| Sorted Set | Range query by score | Overkill — tidak butuh ranking stok |

### 5.2 Strategi: Write-Through

```text
Client → Service → [1. DB Transaction COMMIT] → [2. HINCRBY Redis] → Response
```

**Kenapa write-through:**

| Strategi | Trade-off |
|---|---|
| **Write-through** ✅ | Konsisten dalam request yang sama. Sederhana. Latency tambahan ~0.5ms (minimal vs DB write) |
| Write-behind | Risk data loss jika app crash antara DB write & cache update |
| Event-driven (CDC/pg_notify) | Butuh infra tambahan (Debezium/trigger). Overkill untuk single-service POS |

### 5.3 Operasi Cache

```typescript
// Single product
const qty = await redis.hget('inventory:stock', productId);

// Batch (untuk TanStack Table pagination)
const qtys = await redis.hmget('inventory:stock', ...productIds);

// Atomic update setelah alokasi
await redis.hincrby('inventory:stock', productId, -deductedQty);

// Kembali saat cancel
await redis.hincrby('inventory:stock', productId, +returnedQty);
```

### 5.4 Rekonsiliasi (Safety Net)

Drift bisa terjadi jika DB transaction rollback setelah cache update. **Mitigasi:**

1. **Warm-up saat boot** — `onModuleInit` query `SUM(available_qty) GROUP BY product_id`, rebuild hash.
2. **Cron rekonsiliasi setiap 5 menit** — full refresh dari DB sebagai safety net.

```typescript
async reconcile(): Promise<void> {
  const rows = await db
    .select({
      productId: inventoryLots.productId,
      total: sql<number>`SUM(${inventoryLots.availableQty})`,
    })
    .from(inventoryLots)
    .groupBy(inventoryLots.productId);

  const pipeline = redis.pipeline();
  pipeline.del(STOCK_KEY);
  for (const row of rows) {
    pipeline.hset(STOCK_KEY, row.productId, row.total);
  }
  await pipeline.exec();
}
```

**Urutan update cache penting:** panggil `HINCRBY` SETELAH DB commit berhasil. Jika cache update gagal, cron 5 menit akan memperbaiki.

---

## 6. Monorepo: pnpm Workspace (NestJS + Next.js + Shared Types)

### 6.1 Layout & Konfigurasi

```text
automated-inventory/
├── pnpm-workspace.yaml
├── package.json              (root, private: true)
├── tsconfig.base.json
├── apps/
│   ├── backend/              @repo/backend   → localhost:3001
│   └── frontend/             @repo/frontend  → localhost:3000
└── packages/
    └── shared-types/         @repo/shared-types
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Catatan pnpm 10+:** workspace hanya dibaca dari file ini. Jangan taruh `workspaces` di root `package.json` (diabaikan, dan sejak v12.4.1 memunculkan warning).

### 6.2 Shared Types tanpa Build Step

`packages/shared-types/package.json` arahkan langsung ke source `.ts`:

```json
{
  "name": "@repo/shared-types",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

`workspace:*` memaksa resolusi paket lokal — install gagal jika paket tidak ada, mencegah nyasar ke npm registry.

**Aturan sharing:** Hanya export plain `interface`/`type`/`enum` + konstanta route (`ProductDto`, `OrderStatus`, endpoint path). **DILARANG** export decorator `class-validator` — runtime Nest tidak boleh bocor ke bundle frontend.

### 6.3 Turborepo: TIDAK PERLU

**Ponytail:** 2 app + 1 paket, tanpa DAG build kompleks. pnpm workspace saja cukup.

```json
"scripts": { "dev": "pnpm -r --parallel dev" }
```

Tambah Turbo hanya jika: CI build caching melambat, >3 paket dengan urutan build nyata, atau butuh remote cache. Sekarang = overhead tanpa return.

### 6.4 TypeScript Config

`tsconfig.base.json` (root) berisi `compilerOptions` bersama (`strict`, `target`, `moduleResolution: "bundler"`). Tiap app `extends` + tambah `paths`:

```jsonc
// apps/frontend/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": { "@repo/shared-types": ["../../packages/shared-types/src/index.ts"] }
  }
}
```

Frontend butuh `transpilePackages` di `next.config.ts` (App Router + Turbopack tidak transpile paket workspace otomatis):

```typescript
const nextConfig: NextConfig = {
  transpilePackages: ['@repo/shared-types'],
  // ...
};
```

### 6.5 Frontend → Backend di Dev (Rewrites)

```typescript
async rewrites() {
  return [
    { source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' },
  ];
}
```

Backend: `app.setGlobalPrefix('api')` + `app.listen(3001)`. Frontend fetch `/api/products` → proxy ke `localhost:3001/api/products`, same-origin → **no CORS**. Produksi: satukan di satu origin (reverse proxy) atau pakai `NEXT_PUBLIC_API_URL`.

### 6.6 Root Scripts

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r exec tsc --noEmit",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test"
  }
}
```

---

## 7. Frontend: Shadcn/ui + TanStack Table + TanStack Query

### 7.1 Shadcn/ui Init (Next.js App Router, Tailwind v4)

```bash
pnpm dlx shadcn@latest init
```

Tailwind v4 CSS-first config (tidak ada `tailwind.config.js` lagi — pakai `@theme` di `globals.css`).

### 7.2 TanStack Table v8 + Shadcn Data Table

> **Catatan versi:** Dokumentasi shadcn 2026 sudah migrasi ke **TanStack Table v9** (`tableFeatures()`/`useTable`). Kita tetap pakai **v8** — stabil, ekosistem besar, dokumentasi community lengkap.

Pola standar: `useReactTable` + `flexRender` dengan Shadcn Table primitives:

```typescript
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  manualPagination: true,   // server-side
  pageCount,
  state: { pagination },
  onPaginationChange: setPagination,
});
```

**Trap:** Jangan pakai `getPaginationRowModel()` saat `manualPagination: true` — konflik.

### 7.3 Server-Side Pagination dengan TanStack Query

```typescript
const { data, isFetching, isPlaceholderData } = useQuery({
  queryKey: ['products', pagination, filters],
  queryFn: () => fetchProducts({ page, limit, ...filters }),
  placeholderData: keepPreviousData,  // UI tidak flash saat ganti page
});
```

State pagination & filter masuk ke `queryKey` — cache otomatis per page.

### 7.4 Form Create Order (Multi-Item)

React Hook Form + Zod + `useFieldArray`:

```typescript
const form = useForm<OrderFormValues>({
  resolver: zodResolver(orderSchema),
  defaultValues: { channel: 'WEB', items: [{ productId: '', qty: 1 }] },
});

const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
```

**Trap wajib:** `key={item.id}` (bukan `index`) di field array — kalau pakai index, React reuse input secara salah saat hapus item tengah.

### 7.5 Timestamp Display (Anti Hydration Mismatch)

```typescript
const fmt = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',  // WAJIB eksplisit
});
```

Tanpa `timeZone` eksplisit, server (UTC) dan client (local TZ) render berbeda → hydration error di Next.js App Router.

---

## 8. NestJS: Auth JWT (v1 Single-Role)

Stack minimal untuk v1:

- `@nestjs/jwt` + `@nestjs/passport` (strategy `JWT`)
- Password hash: `bcrypt` (10 rounds)
- Guard global: `APP_GUARD` dengan `JwtAuthGuard`, whitelist `/api/auth/login`
- DTO validation: `class-validator` + `class-transformer` via `ValidationPipe` global

```typescript
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // strip properti tidak terdaftar di DTO
    transform: true,           // payload → instance DTO
    forbidNonWhitelisted: true,
  }),
);
app.setGlobalPrefix('api');
```

**ponytail:** v1 tanpa RBAC — semua user terautentikasi punya akses penuh. Tambah komentar `// ponytail: RBAC tidak ada di v1. Tambah roles guard saat butuh pembagian hak akses.` di module auth untuk upgrade path.

---

## 9. Error Handling & Kontrak API

### 9.1 Centralized HTTP Error (Pola A — REST API)

```typescript
// src/core/errors/app-error.ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, `${resource} dengan ID ${id} tidak ditemukan`, 'NOT_FOUND');
  }
}

export class InsufficientStockError extends AppError {
  constructor(productId: string, requested: number, available: number) {
    super(
      409,
      `Stok tidak cukup untuk produk ${productId}. Diminta ${requested}, tersedia ${available}.`,
      'INSUFFICIENT_STOCK',
    );
  }
}
```

### 9.2 Response Format Seragam

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stok tidak cukup untuk produk ABC. Diminta 10, tersedia 3."
  }
}
```

Sukses:

```json
{
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 145 }
}
```

### 9.3 Exception Filter Global

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof AppError) {
      return response.status(exception.statusCode).json({
        error: { code: exception.code, message: exception.message },
      });
    }
    // Fallback 500 tanpa bocor stack trace
    return response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal.' },
    });
  }
}
```

---

## 10. Ringkasan Keputusan Teknis

| Area | Keputusan | Alasan |
|---|---|---|
| DB Driver | `drizzle-orm/node-postgres` + `pg.Pool` | Interactive transaction untuk `FOR UPDATE`; NestJS = server long-running |
| Migrasi | Drizzle Kit + unpooled connection | PgBouncer mengganggu DDL |
| Currency | `numeric(15,2)` | Anti rounding error; parse `string` → `number` di repository |
| Primary Key | `pgUUID` + `defaultRandom()` | Aman concurrent, tidak sequential |
| Enum | `pgEnum` native | Constraint di level DB |
| FIFO Lock | `.for('update')` native Drizzle | Tidak perlu raw SQL |
| Lock Order | Sort `productId` ASC | Deadlock prevention |
| Queue | `@nestjs/bullmq` + `WorkerHost` | DI NestJS, graceful shutdown |
| Idempotency | `jobId` + DB guard `WHERE status` + `job.remove()` | 3 lapis proteksi double-processing |
| Scheduler | `upsertJobScheduler` | Pengganti API `repeat` |
| Cache | Redis HASH + `HINCRBY` write-through | Atomic O(1), batch read via `HMGET` |
| Drift Protection | Rekonsiliasi cron 5 menit + warm-up | Safety net tanpa infra kompleks |
| Monorepo | pnpm workspace (tanpa Turborepo) | Ponytail — 2 app + 1 paket |
| Frontend | Shadcn/ui + TanStack Table v8 + TanStack Query | Server-side pagination, type-safe |
| Auth | JWT + bcrypt, single-role v1 | Ponytail — RBAC di v2 |
