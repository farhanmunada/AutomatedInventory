# Product Requirements Document (PRD): Automated Inventory & Order Fulfillment Dashboard

> **Versi:** 2.0
> **Tanggal:** 2026-09-27
> **Status:** `APPROVED` ✅ — Disetujui operator manusia 2026-09-27.
> **Riset pendukung:** `docs/RESEARCH.md`

---

## 1. Problem Statement

### 1.1 Latar Belakang

Perusahaan menjual produk melalui dua kanal: **Web Store** dan **POS** (Point of Sale). Saat ini, kedua kanal tidak memiliki visibilitas stok terpusat. Stok dicatat manual di spreadsheet, sehingga:

1. **Overselling:** Web Store dan POS bisa menjual unit yang sama secara bersamaan karena tidak ada pemesanan stok (*stock reservation*) real-time.
2. **Valuasi tidak akurat:** Harga beli berbeda per batch penerimaan barang, tetapi tidak ada metode akuntansi konsisten (FIFO) untuk menghitung nilai stok.
3. **Stok terkunci phantom:** Pesanan yang dibuat tetapi tidak diselesaikan tetap menahan stok tanpa batas waktu, mengurangi ketersediaan artifisial.
4. **Tidak ada peringatan stok rendah:** Kehabisan stok terjadi tanpa antisipasi karena tidak ada pemantauan terhadap batas minimum.

### 1.2 Siapa yang Terdampak

| Persona | Dampak jika Masalah Tidak Diselesaikan |
|---|---|
| **Warehouse Operator** | Bingung lot mana yang harus dipick karena tidak ada catatan alokasi; kesalahan pengambilan barang |
| **Sales/CS Staff** | Menjual produk yang sudah habis → pesanan gagal, komplain pelanggan, refund manual |
| **Inventory Manager** | Tidak bisa melaporkan valuasi stok secara akurat; keputusan pembelian ulang terlambat |

### 1.3 Tujuan Produk

Membangun dashboard terpusat yang:
- Mencegah overselling antar-kanal melalui alokasi stok FIFO dengan row-level locking.
- Menghitung valuasi stok otomatis berdasarkan metode batch FIFO.
- Melepaskan stok dari pesanan stagnan secara otomatis (timeout 60 menit).
- Memberi peringatan dini saat stok menyentuh batas minimum.

---

## 2. Target Goals & Non-Goals

### 2.1 Goals (In-Scope) — WAJIB DIBUAT di v1

| # | Goal | Metrik Sukses |
|---|---|---|
| G1 | Mencegah overselling antar kanal Web Store & POS | **Zero oversell** pada uji konkurensi 10+ order paralel terhadap produk yang sama |
| G2 | Alokasi stok otomatis dari batch tertua (FIFO) | Alokasi 100% sesuai urutan `received_at ASC`; verifikasi via `order_item_allocations` |
| G3 | Rollback stok otomatis saat order dibatalkan | `available_qty` di `inventory_lots` kembali dalam ≤ 1 detik setelah status `CANCELLED` |
| G4 | Auto-release pesanan RESERVED yang stagnan | Order dibatalkan & stok dikembalikan dalam ≤ 61 menit (60 menit timeout + interval scan 1 menit) |
| G5 | Peringatan stok rendah | Alert terdeteksi ≤ 5 menit setelah stok menyentuh `min_buffer_stock` |
| G6 | Valuasi stok FIFO real-time | Total valuasi = `SUM(purchase_price × available_qty)` per lot; response ≤ 200ms |
| G7 | Dashboard stok real-time | Latency read stok ≤ 200ms (query DB terindeks, tanpa cache terpisah) |
| G8 | CRUD lengkap produk, lot, order via UI | Semua 7 halaman fungsional end-to-end |

### 2.2 Non-Goals (Out-of-Scope) — EKSPLISIT TIDAK DIBUAT di v1

1. **Multi-warehouse / multi-gudang** — satu lokasi fisik saja.
2. **Integrasi marketplace eksternal** (Tokopedia, Shopee, TikTok Shop) — tidak ada sinkronisasi stok otomatis ke platform luar.
3. **Role-Based Access Control (RBAC)** — v1 single-role; semua staf terautentikasi punya akses penuh. Upgrade di v2.
4. **Pemrosesan pembayaran (payment gateway)** — sistem ini mengelola inventori & fulfillment, bukan pembayaran.
5. **Barcode / QR scanning** — input manual via form.
6. **Multi-currency** — IDR saja.
7. **Audit trail / activity log** — tidak ada riwayat aksi user di v1.
8. **Mobile app** — web dashboard responsive saja.
9. **Laporan keuangan lengkap** (HPP, laba-rugi, neraca) — hanya valuasi stok FIFO.
10. **Multi-tenant** — satu organisasi.

---

## 3. User Stories & Kriteria Penerimaan (GIVEN/WHEN/THEN)

### 3.1 Modul Autentikasi

#### Story 1.1: Login
> Sebagai staf gudang, saya ingin login dengan username & password agar bisa mengakses dashboard.

- **Kriteria 1.1.1:**
  - **GIVEN** user terdaftar dengan username `staff01` dan password yang benar
  - **WHEN** mengirim `POST /api/auth/login` dengan credentials tersebut
  - **THEN** response `200` berisi `access_token` (JWT) dan user diarahkan ke halaman Dashboard

- **Kriteria 1.1.2:**
  - **GIVEN** password yang dimasukkan salah
  - **WHEN** mengirim `POST /api/auth/login`
  - **THEN** response `401` dengan `error.code = "INVALID_CREDENTIALS"` dan pesan "Username atau password salah."

- **Kriteria 1.1.3:**
  - **GIVEN** request ke `GET /api/products` **tanpa** Authorization header
  - **WHEN** request dikirim
  - **THEN** response `401` dengan `error.code = "UNAUTHORIZED"`

- **Kriteria 1.1.4:**
  - **GIVEN** password disimpan di database
  - **WHEN** dilihat langsung di tabel `users`
  - **THEN** nilai kolom `password_hash` adalah hash bcrypt, **bukan** plaintext

- **Kriteria 1.1.5 (Seed admin awal):**
  - **GIVEN** database baru saja di-migrate dan masih kosong
  - **WHEN** menjalankan perintah `pnpm seed:admin --username=admin --password=<password>`
  - **THEN** terbentuk 1 record di tabel `users` dengan `password_hash` bcrypt, dan login dengan credentials tersebut berhasil (response `200` + `access_token`)

  > **ponytail:** Seed via CLI satu kali, tanpa halaman UI manajemen user. RBAC & UI manajemen user di v2.

---

### 3.2 Modul Products

#### Story 2.1: Daftar Produk dengan Stok Real-Time
> Sebagai inventory manager, saya ingin melihat daftar produk beserta stok tersedia saat ini agar tahu apa yang masih bisa dijual.

- **Kriteria 2.1.1:**
  - **GIVEN** produk `SKU-001` memiliki total stok tersedia 50 unit (dari beberapa lot)
  - **WHEN** membuka halaman `/products`
  - **THEN** baris produk `SKU-001` menampilkan kolom "Stok Tersedia" = `50`

- **Kriteria 2.1.2:**
  - **GIVEN** produk `SKU-002` memiliki `min_buffer_stock = 20` dan stok saat ini `15`
  - **WHEN** membuka halaman `/products`
  - **THEN** baris produk `SKU-002` menampilkan badge "Stok Rendah" (warna kuning/merah)

- **Kriteria 2.1.3:**
  - **GIVEN** 145 produk di database, halaman menampilkan 20 per halaman
  - **WHEN** membuka halaman `/products`
  - **THEN** tabel menampilkan 20 baris pertama, pagination menunjukkan "Halaman 1 dari 8", total `145`

- **Kriteria 2.1.4:**
  - **GIVEN** user mengetik "SKU-00" di filter pencarian
  - **WHEN** mengetik selesai (debounce 300ms)
  - **THEN** tabel hanya menampilkan produk yang `sku` atau `name` mengandung "SKU-00"

#### Story 2.2: Tambah Produk Baru
> Sebagai inventory manager, saya ingin mendaftarkan produk baru dengan SKU unik agar bisa menerima stok.

- **Kriteria 2.2.1:**
  - **GIVEN** belum ada produk dengan SKU `SKU-999`
  - **WHEN** mengirim `POST /api/products` dengan `{ sku: "SKU-999", name: "Kopi Arabika 1kg", min_buffer_stock: 10 }`
  - **THEN** response `201` berisi produk baru dengan ID UUID, `created_at` terisi, stok tersedia = `0`

- **Kriteria 2.2.2:**
  - **GIVEN** sudah ada produk dengan SKU `SKU-001`
  - **WHEN** mengirim `POST /api/products` dengan `{ sku: "SKU-001", ... }`
  - **THEN** response `409` dengan `error.code = "SKU_ALREADY_EXISTS"`

- **Kriteria 2.2.3:**
  - **GIVEN** form tambah produk, field `min_buffer_stock` kosong
  - **WHEN** menekan tombol "Simpan"
  - **THEN** validasi muncul: "Buffer stok minimum wajib diisi." dan request tidak dikirim

#### Story 2.3: Hapus Produk
> Sebagai inventory manager, saya ingin menghapus produk yang sudah tidak dijual agar daftar produk bersih.

- **Kriteria 2.3.1:**
  - **GIVEN** produk `SKU-OLD` masih memiliki 5 unit stok tersedia
  - **WHEN** mengirim `DELETE /api/products/:id`
  - **THEN** response `409` dengan `error.code = "PRODUCT_HAS_STOCK"` dan pesan "Tidak bisa menghapus produk yang masih memiliki stok."

- **Kriteria 2.3.2:**
  - **GIVEN** produk `SKU-OLD` memiliki stok tersedia = 0
  - **WHEN** mengirim `DELETE /api/products/:id`
  - **THEN** response `204`, dan produk tidak lagi muncul di `GET /api/products`

---

### 3.3 Modul Inventory Lots

#### Story 3.1: Catat Penerimaan Lot Baru
> Sebagai warehouse operator, saya ingin mencatat penerimaan barang baru sebagai satu lot dengan harga beli tertentu agar FIFO bisa dihitung.

- **Kriteria 3.1.1:**
  - **GIVEN** produk `SKU-001` sudah ada
  - **WHEN** mengirim `POST /api/lots` dengan `{ product_id, purchase_price: 50000, initial_qty: 100, received_at: "2026-09-27T09:00:00Z" }`
  - **THEN** response `201`, lot baru dibuat dengan `available_qty = 100`, `initial_qty = 100`, dan total stok tersedia produk bertambah `100`

- **Kriteria 3.1.2:**
  - **GIVEN** lot diterima dengan `received_at = 2026-09-27`
  - **WHEN** ada lot lain dengan `received_at = 2026-09-20` untuk produk yang sama
  - **THEN** lot tanggal 20 September akan dialokasikan lebih dulu (FIFO)

- **Kriteria 3.1.3:**
  - **GIVEN** field `purchase_price` diisi dengan nilai `50.000,50` (format Indonesia)
  - **WHEN** form disubmit
  - **THEN** backend menerima `50000.50` (numeric), tersimpan sebagai `numeric(15,2)` di database

#### Story 3.2: Lihat Daftar Lot per Produk
> Sebagai warehouse operator, saya ingin melihat lot mana saja yang masih ada stok agar tahu dari batch mana pesanan akan dipick.

- **Kriteria 3.2.1:**
  - **GIVEN** produk `SKU-001` memiliki 3 lot (2 dengan stok, 1 habis)
  - **WHEN** membuka halaman `/lots` dengan filter produk `SKU-001`
  - **THEN** tabel menampilkan 3 baris dengan kolom: Nomor Lot, Tanggal Terima, Harga Beli, Qty Awal, Sisa Qty, Status (Aktif/Habis)

---

### 3.4 Modul Orders — Pembuatan

#### Story 4.1: Buat Order Baru (Multi-Item)
> Sebagai sales staff, saya ingin membuat order dengan beberapa item dari kanal WEB atau POS agar pencatatan penjualan terpusat.

- **Kriteria 4.1.1:**
  - **GIVEN** form Create Order dengan channel `WEB` dan 2 item: `SKU-001` qty 3, `SKU-002` qty 1
  - **WHEN** menekan tombol "Simpan Order"
  - **THEN** order dibuat dengan `status = "DRAFT"`, `order_number` auto-generated unik, dan 2 record di `order_items`. **Tidak ada stok dipotung** pada status DRAFT.

- **Kriteria 4.1.2:**
  - **GIVEN** form dengan item yang qty-nya `0` atau kosong
  - **WHEN** menekan "Simpan Order"
  - **THEN** validasi muncul "Qty minimal 1." di baris item tersebut, request tidak dikirim

- **Kriteria 4.1.3:**
  - **GIVEN** form dengan item duplikat: `SKU-001` qty 2 dan `SKU-001` qty 3
  - **WHEN** menekan "Simpan Order"
  - **THEN** validasi muncul "Produk tidak boleh muncul dua kali. Gabungkan kuantitasnya."

- **Kriteria 4.1.4:**
  - **GIVEN** request `POST /api/orders` dengan produk yang tidak ada di database
  - **WHEN** request dikirim
  - **THEN** response `404` dengan `error.code = "PRODUCT_NOT_FOUND"`

---

### 3.5 Modul Orders — Alokasi FIFO & State Machine

#### Story 5.1: Reservasi Stok (DRAFT → RESERVED)
> Sebagai sistem, saya ingin mengunci stok dari lot tertua saat order direservasi agar tidak terjual ke kanal lain.

- **Kriteria 5.1.1 (Alokasi FIFO dasar):**
  - **GIVEN** produk `SKU-001` memiliki lot: Lot-A (received 20 Sep, sisa 10), Lot-B (received 27 Sep, sisa 100)
  - **WHEN** order item `SKU-001` qty 12 direservasi (`PATCH /api/orders/:id/status` → `RESERVED`)
  - **THEN** terbentuk alokasi: Lot-A = 10 unit, Lot-B = 2 unit. `available_qty`: Lot-A = 0, Lot-B = 98.

- **Kriteria 5.1.2 (Stok tidak cukup):**
  - **GIVEN** produk `SKU-001` total stok tersedia = 5 unit
  - **WHEN** order item `SKU-001` qty 12 direservasi
  - **THEN** response `409` dengan `error.code = "INSUFFICIENT_STOCK"`, order **tetap** berstatus `DRAFT`, tidak ada stok dipotong, tidak ada alokasi dibuat

- **Kriteria 5.1.3 (Anti-oversell konkuren):**
  - **GIVEN** produk `SKU-001` stok tersedia = 10 unit
  - **WHEN** 2 order paralel masing-masing meminta 8 unit direservasi dalam waktu bersamaan
  - **THEN** salah satu order `201`/`200` (berhasil, sisa 2), order lain `409 INSUFFICIENT_STOCK`. **Tidak pernah** total alokasi melebihi 10. Diverifikasi via row-level lock `FOR UPDATE`.

- **Kriteria 5.1.4 (Transisi tidak valid ditolak):**
  - **GIVEN** order dengan status `SHIPPED`
  - **WHEN** mengirim `PATCH /api/orders/:id/status` → `RESERVED`
  - **THEN** response `409` dengan `error.code = "INVALID_TRANSITION"` dan status order tidak berubah

- **Kriteria 5.1.5 (Konsistensi stok terderive):**
  - **GIVEN** order berhasil direservasi, mengurangi 3 unit `SKU-001`
  - **WHEN** reservasi selesai
  - **THEN** `GET /api/products/:id` langsung menampilkan `available_stock` berkurang 3 (satu-satunya sumber angka adalah `inventory_lots`, tidak ada cache terpisah yang bisa drift)

#### Story 5.2: Packing (RESERVED → PACKED)
> Sebagai warehouse operator, saya ingin menandai order sudah dipacking agar jadwal pengiriman bisa dimulai.

- **Kriteria 5.2.1:**
  - **GIVEN** order berstatus `RESERVED` dengan alokasi lengkap
  - **WHEN** mengirim `PATCH /api/orders/:id/status` → `PACKED`
  - **THEN** response `200`, status menjadi `PACKED`, `updated_at` berubah, stok tidak berubah

- **Kriteria 5.2.2:**
  - **GIVEN** order berstatus `DRAFT` (belum direservasi)
  - **WHEN** mengirim `PATCH /api/orders/:id/status` → `PACKED`
  - **THEN** response `409 INVALID_TRANSITION` — harus lewat `RESERVED` dulu

#### Story 5.3: Pengiriman (PACKED → SHIPPED)
> Sebagai warehouse operator, saya ingin menandai order sudah dikirim agar status penjualan final.

- **Kriteria 5.3.1:**
  - **GIVEN** order berstatus `PACKED`
  - **WHEN** mengirim `PATCH /api/orders/:id/status` → `SHIPPED`
  - **THEN** response `200`, status menjadi `SHIPPED` (final), record `order_item_allocations` tetap utuh untuk audit

#### Story 5.4: Pembatalan & Rollback Stok
> Sebagai sales staff, saya ingin membatalkan order yang salah agar stoknya dikembalikan ke inventory.

- **Kriteria 5.4.1 (Rollback dari RESERVED):**
  - **GIVEN** order `RESERVED` dengan alokasi: Lot-A = 10, Lot-B = 2 untuk `SKU-001`
  - **WHEN** status diubah ke `CANCELLED`
  - **THEN** `available_qty` Lot-A bertambah 10, Lot-B bertambah 2, seluruh record `order_item_allocations` untuk order ini **dihapus**

- **Kriteria 5.4.2 (Rollback dari PACKED):**
  - **GIVEN** order `PACKED` dengan alokasi 5 unit dari Lot-C
  - **WHEN** status diubah ke `CANCELLED`
  - **THEN** `available_qty` Lot-C bertambah 5, alokasi dihapus

- **Kriteria 5.4.3 (DRAFT cancel tanpa efek stok):**
  - **GIVEN** order `DRAFT` (belum ada alokasi)
  - **WHEN** status diubah ke `CANCELLED`
  - **THEN** status menjadi `CANCELLED`, **tidak ada** perubahan di `inventory_lots`

- **Kriteria 5.4.4 (SHIPPED tidak bisa dibatalkan):**
  - **GIVEN** order berstatus `SHIPPED`
  - **WHEN** mengirim perubahan ke `CANCELLED`
  - **THEN** response `409 INVALID_TRANSITION` — stok sudah final dikeluarkan

- **Kriteria 5.4.5 (Idempotensi rollback):**
  - **GIVEN** scheduler auto-release memproses rollback untuk order yang **sudah** `CANCELLED` oleh user
  - **WHEN** scheduler mencoba transisi `RESERVED → CANCELLED` secara kondisional
  - **THEN** affected rows = 0, scheduler skip tanpa error, stok tidak dobel-dikembalikan

---

### 3.6 Modul Background Jobs (DB-backed scheduler)

> **Catatan implementasi:** scheduler dijalankan `@nestjs/schedule` (cron in-process) dengan scan berbasis DB, bukan antrean Redis/BullMQ. Semua kriteria di bawah tetap berlaku karena idempotensi dijamin oleh update kondisional pada baris `orders`.

#### Story 6.1: Auto-Release Pesanan Stagnan
> Sebagai inventory manager, saya ingin order RESERVED yang tidak diproses dalam 60 menit otomatis dibatalkan agar stok tidak tersangkut phantom.

- **Kriteria 6.1.1 (Trigger timeout):**
  - **GIVEN** order masuk status `RESERVED` pada pukul 10:00:00
  - **WHEN** waktu menunjukkan 11:00:00 dan order masih `RESERVED`
  - **THEN** scan berikutnya (interval 1 menit) membatalkan order → status `CANCELLED`, stok dikembalikan

- **Kriteria 6.1.2 (Order yang sudah diproses tidak disentuh):**
  - **GIVEN** order `RESERVED` yang kemudian diubah user menjadi `PACKED` pada menit ke-30
  - **WHEN** scan auto-release berjalan setelah lewat 60 menit
  - **THEN** order tidak dibatalkan — scan hanya mengambil baris dengan `status = 'RESERVED'`

- **Kriteria 6.1.3 (Aman terhadap eksekusi ganda):**
  - **GIVEN** dua instance scheduler (atau scan berurutan) mencoba memproses order `RESERVED` yang sama
  - **WHEN** keduanya mengeksekusi rollback
  - **THEN** hanya satu yang berhasil mengembalikan stok — baris `orders` dikunci `FOR UPDATE` dan status diperiksa ulang di dalam transaksi, sehingga eksekusi kedua tidak menemukan alokasi untuk dikembalikan

- **Kriteria 6.1.4 (Restart aman):**
  - **GIVEN** server di-restart setelah order sudah `RESERVED`
  - **WHEN** server kembali online
  - **THEN** scan berjalan saat startup (`onApplicationBootstrap`), mendeteksi order `RESERVED` yang sudah lewat timeout dan memprosesnya tanpa perlu state antrean yang dipulihkan

#### Story 6.2: Low Stock Alert
> Sebagai inventory manager, saya ingin diberi peringatan saat produk menyentuh batas stok minimum agar bisa segera order ulang.

- **Kriteria 6.2.1 (Deteksi):**
  - **GIVEN** produk `SKU-003` memiliki `min_buffer_stock = 20` dan total `available_qty` turun ke `20`
  - **WHEN** `GET /api/dashboard/low-stock` dipanggil (halaman Dashboard melakukan polling)
  - **THEN** produk `SKU-003` masuk ke daftar low stock dan muncul badge di Dashboard dalam ≤ 5 menit

- **Kriteria 6.2.2 (Sudah di bawah buffer):**
  - **GIVEN** produk `SKU-003` stoknya `5` (di bawah `min_buffer_stock = 20`) dan sudah muncul di daftar alert
  - **WHEN** endpoint dipanggil lagi
  - **THEN** produk tetap muncul sekali (dihitung dari stok saat ini, tidak ada penumpukan alert duplikat), indikator hilang hanya setelah stok naik di atas buffer

---

### 3.7 Modul Dashboard

#### Story 7.1: Ringkasan Stok & Valuasi
> Sebagai inventory manager, saya ingin melihat ringkasan stok dan valuasi FIFO di satu layar agar bisa lapor ke manajemen.

- **Kriteria 7.1.1 (Valuasi FIFO):**
  - **GIVEN** lot aktif: Lot-A (`SKU-001`, harga 50000, sisa 10), Lot-B (`SKU-001`, harga 55000, sisa 5)
  - **WHEN** membuka Dashboard
  - **THEN** valuasi `SKU-001` = `(50000 × 10) + (55000 × 5)` = `775.000`, dan total valuasi = jumlah seluruh produk

- **Kriteria 7.1.2 (Konsistensi read):**
  - **GIVEN** Dashboard menampilkan stok 50 unit untuk `SKU-001`
  - **WHEN** ada order baru mengalokasikan 3 unit lalu dashboard di-refresh
  - **THEN** Dashboard menampilkan `47` — angka dibaca langsung dari agregasi `inventory_lots` (tidak ada cache yang bisa tertinggal)

- **Kriteria 7.1.3 (Endpoint valuasi):**
  - **GIVEN** data stok di database
  - **WHEN** memanggil `GET /api/dashboard/stock-valuation`
  - **THEN** response `200` berisi array `{ product_id, sku, name, total_qty, total_value }` diurutkan descending by `total_value`, response ≤ 200ms

#### Story 7.2: Statistik Order
> Sebagai sales manager, saya ingin melihat distribusi order per status & kanal agar tahu performa penjualan.

- **Kriteria 7.2.1:**
  - **GIVEN** database memiliki 5 order DRAFT, 3 RESERVED, 2 PACKED, 1 SHIPPED, 1 CANCELLED
  - **WHEN** membuka Dashboard
  - **THEN** kartu statistik menampilkan jumlah per status: DRAFT=5, RESERVED=3, PACKED=2, SHIPPED=1, CANCELLED=1, total=12

---

## 4. Batasan Teknis & Keamanan (Technical & Security Constraints)

### 4.1 Batasan Performa

| Area | Metrik |
|---|---|
| Read stok (agregasi DB terindeks) | p95 ≤ 200ms |
| Endpoint valuasi stok | p95 ≤ 200ms |
| Konkurensi alokasi stok | Mendukung ≥ 50 order paralel tanpa deadlock |
| Auto-release | Eksekusi dalam ≤ 61 menit setelah timeout |
| Low stock detection | ≤ 5 menit setelah stok menyentuh buffer |
| Pagination API | Default 20/baris, maks 100 |

### 4.2 Batasan Keamanan

- Autentikasi JWT wajib di **semua** endpoint kecuali `POST /api/auth/login` (dijaga `APP_GUARD` global + `@Public()`).
- Password di-hash bcrypt (cost factor 10). Dilarang plaintext.
- Token JWT expired dalam 24 jam.
- Rate limiting: maks 10 percobaan login per IP per menit.
- Input validation via `class-validator` di semua endpoint (`whitelist: true`, `forbidNonWhitelisted: true`).
- Dilarang expose `password_hash` atau token internal di response API (output DTO terpisah).
- Secret (`DATABASE_URL`, `JWT_SECRET`) hanya di `.env`, yang diproteksi `.gitignore`.

### 4.3 Target Environment

| Komponen | Environment |
|---|---|
| Backend | Node.js 20 LTS + NestJS, long-running server |
| Frontend | Next.js App Router, browser modern (Chrome/Edge/Firefox/Safari 2 versi terakhir) |
| Database | PostgreSQL via Neon DB (pooled connection untuk app, unpooled untuk migrasi) |
| Background jobs | `@nestjs/schedule` cron in-process (scan berbasis DB, tanpa Redis/BullMQ) |
| OS Development | Windows (PowerShell) — dilarang chaining POSIX `&&` |
| Resolusi minimum | 1280×720 (dashboard desktop), responsive hingga mobile 375px |

### 4.4 Batasan Data

- `sku` unique, case-sensitive, maks 50 karakter.
- `purchase_price` `numeric(15,2)` — maks `999.999.999.999,99`.
- `available_qty` integer ≥ 0 (constraint DB-level `CHECK`).
- `requested_qty` / `allocated_qty` integer > 0.
- Nomor order format: `ORD-YYYYMMDD-XXXX` (auto-generated, unique).

---

## 5. Definition of Done (DoD)

Fitur dinyatakan selesai jika **seluruh** kriteria terpenuhi:

- [ ] Seluruh kriteria penerimaan GIVEN/WHEN/THEN lolos uji otomatis (unit/integration test).
- [ ] Typecheck `tsc --noEmit` = 0 error di `apps/backend` dan `apps/frontend`.
- [ ] Linter (`eslint`) = 0 error, 0 warning.
- [ ] Build produksi berhasil (`pnpm build` di root).
- [ ] Migrasi Drizzle Kit dijalankan terhadap Neon DB asli (Tier 2), verifikasi constraint & tipe data.
- [ ] Uji konkurensi alokasi stok: zero oversell pada 10+ order paralel.
- [ ] Tidak ada credential/secret di kode atau response API.
- [ ] Dokumentasi `docs/` diperbarui jika ada perubahan kontrak.

---

## 6. Spesifikasi Antarmuka Frontend

### 6.1 Stack & Sistem Desain

| Komponen | Teknologi |
|---|---|
| Framework | Next.js 15 App Router |
| UI Components | primitif UI tulis-tangan di `components/ui/` (Dialog, Badge, Toast, Skeleton) di atas Tailwind CSS v4 |
| Tabel data | komponen `<DataTable>` tulis-tangan, `manualPagination` server-side |
| Data fetching | TanStack Query v5 (`keepPreviousData`) |
| Forms | controlled components + validasi Zod langsung |
| Styling token | Tailwind v4 `@theme` di `app/globals.css` (dari tabel §6.2) |
| Monorepo | pnpm workspace, shared types `@repo/shared-types` |

> Catatan (deviasi D-18 s/d D-21, lihat `docs/ARCHITECTURE.md` §11): Shadcn/ui CLI, Radix,
> TanStack Table, React Hook Form, dan `@hookform/resolvers` **dikeluarkan** dari stack.
> Fungsinya digantikan implementasi minimum di atas; tidak ada perbedaan perilaku yang
> teramati pengguna dari spesifikasi §6.3–§6.8.

### 6.2 Token Desain Awal

Palet warna (dashboard inventory — fungsional, bukan dekoratif):

| Token | Hex | Fungsi |
|---|---|---|
| `--background` | `#FFFFFF` | Background utama |
| `--foreground` | `#0F172A` | Teks utama (slate-900) |
| `--muted` | `#F1F5F9` | Background baris tabel zebra, section sekunder |
| `--border` | `#E2E8F0` | Border tabel, divider |
| `--primary` | `#1E40AF` | Aksi utama (tombol Simpan, link aktif) |
| `--destructive` | `#DC2626` | Aksi hapus, status CANCELLED, error |
| `--warning` | `#D97706` | Badge "Stok Rendah", status RESERVED |
| `--success` | `#16A34A` | Status SHIPPED, stok sehat |

**Tipografi:** Satu keluarga font — `Inter` (sans-serif). Hirarki: heading 600/700, body 400, tabel 400 14px. Panjang baris body < 80 karakter.

**Anti-klise (per `skill-frontend-design`):**
- Dilarang: latar cream/terracotta, rounded-card seragam dengan shadow abu-abu, label ALL-CAPS eyebrow, animasi fade-slide berlebihan, simbol `→` menempel di tombol.
- Animasi hanya untuk respons aksi (loading spinner, skeleton tabel, toast).
- Empty state harus ajakan bertindak ("Belum ada produk. Tambahkan produk pertama Anda.").

### 6.3 Daftar Halaman

| # | Rute | Judul | Fungsi |
|---|---|---|---|
| 1 | `/login` | Login | Form username/password |
| 2 | `/` | Dashboard | Ringkasan stok, valuasi FIFO, low stock alert, statistik order |
| 3 | `/products` | Produk | Tabel CRUD produk + stok real-time + filter |
| 4 | `/products/[id]` | Detail Produk | Info produk, daftar lot aktif, histori alokasi |
| 5 | `/lots` | Inventory Lots | Tabel daftar lot, form tambah lot baru |
| 6 | `/orders` | Pesanan | Tabel order, filter status/channel, aksi transisi status |
| 7 | `/orders/[id]` | Detail Pesanan | Info order, items, alokasi lot per item, timeline status |
| 8 | `/orders/new` | Buat Pesanan | Form multi-item, pilih channel, preview alokasi |

### 6.4 Wireframe: Halaman Dashboard (`/`)

```text
┌───────────────────────────────────────────────────────────────┐
│ [☰] Automated Inventory          [Staf: staff01] [Logout]      │
├───────────────────────────────────────────────────────────────┤
│ Dashboard  Produk  Lots  Pesanan                               │
├───────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│ │ Total Stok  │ │ Valuasi     │ │ Order       │ │ Stok       │ │
│ │ 1.240 unit  │ │ Rp 245 Juta │ │ Aktif: 12   │ │ Rendah: 3  │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
│                                                                │
│ ┌──────────────────────────────┐ ┌────────────────────────────┐ │
│ │ VALUASI STOK PER PRODUK      │ │ PERINGATAN STOK RENDAH     │ │
│ │ Produk        Qty   Nilai    │ │ ⚠ SKU-003  (5 / min 20)   │ │
│ │ SKU-001       45    2.3 Jt   │ │ ⚠ SKU-007  (2 / min 10)   │ │
│ │ SKU-002       120   6.1 Jt   │ │ ⚠ SKU-012  (18 / min 20)  │ │
│ │ SKU-003       5     250 Rb   │ │                            │ │
│ │ ... (top 10 by value)        │ │                            │ │
│ └──────────────────────────────┘ └────────────────────────────┘ │
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ STATISTIK PESANAN                                          │ │
│ │ [DRAFT: 5] [RESERVED: 3] [PACKED: 2] [SHIPPED: 1]          │ │
│ │ [CANCELLED: 1]                       WEB: 7  POS: 5        │ │
│ └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### 6.5 Wireframe: Halaman Produk (`/products`)

```text
┌───────────────────────────────────────────────────────────────┐
│ Produk                                [+ Tambah Produk]        │
├───────────────────────────────────────────────────────────────┤
│ Cari: [______________] Status: [Semua ▾]                       │
├───────────────────────────────────────────────────────────────┤
│ SKU       Nama              Stok    Buffer  Status    Aksi     │
│ SKU-001   Kopi Arabika 1kg  45      10      Sehat     👁 ✏ 🗑 │
│ SKU-002   Gula Pasir 5kg    120     30      Sehat     👁 ✏ 🗑 │
│ SKU-003   Teh Hijau 500g    5       20      ⚠ Rendah  👁 ✏ 🗑 │
│ ...                                                            │
├───────────────────────────────────────────────────────────────┤
│ Menampilkan 1-20 dari 145    [< Sebelumnya] [1] 2 3 ... 8 [>] │
└───────────────────────────────────────────────────────────────┘
```

### 6.6 Wireframe: Form Buat Pesanan (`/orders/new`)

```text
┌───────────────────────────────────────────────────────────────┐
│ Buat Pesanan                                       [Batal]     │
├───────────────────────────────────────────────────────────────┤
│ Kanal: ( ) WEB   (•) POS                                       │
│                                                                │
│ Item Pesanan:                                                  │
│ ┌─────────────────────────┬──────────┬───────┐                 │
│ │ Produk [Pilih... ▾]     │ Qty [ 3] │ [ ✕ ] │                 │
│ ├─────────────────────────┼──────────┼───────┤                 │
│ │ Produk [Pilih... ▾]     │ Qty [ 1] │ [ ✕ ] │                 │
│ └─────────────────────────┴──────────┴───────┘                 │
│ [+ Tambah Item]                                                │
│                                                                │
│ Catatan: Order akan disimpan sebagai DRAFT. Stok dikunci saat  │
│          status diubah ke RESERVED.                            │
│                                                                │
│                            [Simpan Draft]  [Simpan & Reservasi]│
└───────────────────────────────────────────────────────────────┘
```

### 6.7 Perilaku Interaktif (Semua Halaman Tabel)

| State | Tampilan |
|---|---|
| Loading awal | Skeleton baris (6 baris abu-abu berkedip), bukan spinner |
| Loading ganti halaman | Tabel tetap tampil dengan data lama (`keepPreviousData`), opacity sedikit berkurang |
| Empty state | Ilustrasi minimal + ajakan: "Belum ada data. [Tombol Tambah]" |
| Error state | Banner merah di atas tabel: "Gagal memuat data. [Coba lagi]" |
| Filter aktif | Badge filter dengan tombol `[×]` untuk reset |
| Mutasi (simpan/hapus) | Tombol disabled + spinner, lalu toast "Produk ditambahkan." |
| Validasi form inline | Pesan merah di bawah field, fokus otomatis ke field pertama yang error |
| Konfirmasi hapus | Dialog konfirmasi: "Hapus SKU-001? Tindakan ini tidak bisa dibatalkan." |

### 6.8 Detail Pesanan (`/orders/[id]`) — Timeline Status

```text
Status: RESERVED → PACKED → SHIPPED
         ✓ DONE    ○ NEXT    ○

┌───────────────────────────────────────────────────────────────┐
│ Order ORD-20260927-0042   Status: [RESERVED ▾]                 │
├───────────────────────────────────────────────────────────────┤
│ Timeline:                                                      │
│  ● Dibuat     27 Sep 2026, 09:15  (DRAFT)                      │
│  ● Direservasi 27 Sep 2026, 09:20 (RESERVED)                   │
│  ○ Dipacking  —                                                │
│  ○ Dikirim    —                                                │
├───────────────────────────────────────────────────────────────┤
│ Item & Alokasi:                                                │
│ SKU-001 × 3                                                    │
│    └ Lot-A (20 Sep) × 3                                        │
│ SKU-002 × 1                                                    │
│    └ Lot-C (25 Sep) × 1                                        │
└───────────────────────────────────────────────────────────────┘
```

Dropdown status hanya menampilkan transisi valid (mis. dari RESERVED: `PACKED`, `CANCELLED`).

---

## 7. Spesifikasi API & Kontrak Data

### 7.1 Base URL & Konvensi

- Base: `/api` (di dev, Next.js rewrites ke `http://localhost:3001/api`)
- Response sukses: `{ "data": ..., "meta": { "page", "limit", "total" } }`
- Response error: `{ "error": { "code": "...", "message": "..." } }`
- Pagination: query `?page=1&limit=20`
- Sorting: query `?sort=created_at:desc`
- Filtering: query `?status=RESERVED&channel=WEB`
- Content-Type: `application/json`
- Auth: `Authorization: Bearer <JWT>`

### 7.2 Daftar Endpoint

#### Auth

| Method | Path | Deskripsi | Request Body | Response |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | Login | `{ username, password }` | `{ access_token, user }` |

#### Products

| Method | Path | Deskripsi | Request Body | Response |
|---|---|---|---|---|
| `GET` | `/api/products` | Daftar (paginasi, filter, search) | — | `ProductDto[]` + meta |
| `GET` | `/api/products/:id` | Detail + lot aktif | — | `ProductDetailDto` |
| `POST` | `/api/products` | Tambah | `CreateProductDto` | `ProductDto` (201) |
| `PATCH` | `/api/products/:id` | Update | `UpdateProductDto` | `ProductDto` |
| `DELETE` | `/api/products/:id` | Hapus (hanya jika stok 0) | — | 204 |

#### Inventory Lots

| Method | Path | Deskripsi | Request Body | Response |
|---|---|---|---|---|
| `GET` | `/api/lots` | Daftar lot (filter produk, stok>0) | — | `LotDto[]` + meta |
| `POST` | `/api/lots` | Tambah lot baru | `CreateLotDto` | `LotDto` (201) |

#### Orders

| Method | Path | Deskripsi | Request Body | Response |
|---|---|---|---|---|
| `GET` | `/api/orders` | Daftar (filter status/channel) | — | `OrderDto[]` + meta |
| `GET` | `/api/orders/:id` | Detail + items + alokasi | — | `OrderDetailDto` |
| `POST` | `/api/orders` | Buat order (status DRAFT) | `CreateOrderDto` | `OrderDto` (201) |
| `PATCH` | `/api/orders/:id/status` | Transisi status | `{ status }` | `OrderDto` |

#### Dashboard

| Method | Path | Deskripsi | Response |
|---|---|---|---|
| `GET` | `/api/dashboard/stock-summary` | Total stok per produk (agregasi `inventory_lots`) | `StockSummaryDto[]` |
| `GET` | `/api/dashboard/stock-valuation` | Valuasi FIFO per produk | `ValuationDto[]` |
| `GET` | `/api/dashboard/low-stock` | Produk di bawah `min_buffer_stock` | `LowStockDto[]` |
| `GET` | `/api/dashboard/order-stats` | Jumlah order per status & channel | `OrderStatsDto` |

### 7.3 Contoh DTO

```typescript
// CreateOrderDto
{
  channel: 'WEB' | 'POS',
  items: Array<{ product_id: string; requested_qty: number }>
}

// OrderDetailDto
{
  id: string;
  order_number: string;
  channel: 'WEB' | 'POS';
  status: 'DRAFT' | 'RESERVED' | 'PACKED' | 'SHIPPED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
  items: Array<{
    id: string;
    product_id: string;
    sku: string;
    name: string;
    requested_qty: number;
    allocations: Array<{
      lot_id: string;
      lot_received_at: string;
      allocated_qty: number;
    }>;
  }>;
}
```

### 7.4 Kode Error Standar

| Code | HTTP | Kapan |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Login salah |
| `UNAUTHORIZED` | 401 | Tanpa/expired token |
| `NOT_FOUND` | 404 | Resource tidak ada |
| `PRODUCT_NOT_FOUND` | 404 | Produk di order tidak terdaftar |
| `SKU_ALREADY_EXISTS` | 409 | SKU duplikat |
| `PRODUCT_HAS_STOCK` | 409 | Hapus produk yang masih ada stok |
| `INSUFFICIENT_STOCK` | 409 | Stok kurang dari permintaan |
| `INVALID_TRANSITION` | 409 | Transisi status tidak valid |
| `VALIDATION_ERROR` | 400 | Input tidak valid |
| `RATE_LIMITED` | 429 | Melewati batas 10 percobaan login per IP per menit |
| `INTERNAL_ERROR` | 500 | Error tak terduga |

---

## 8. Skema Database (Ringkasan)

### 8.1 Tabel

| Tabel | Kolom Inti |
|---|---|
| `users` | `id`, `username` (unique), `password_hash`, `created_at` |
| `products` | `id`, `sku` (unique), `name`, `min_buffer_stock`, `created_at`, `updated_at` |
| `inventory_lots` | `id`, `product_id` (FK), `purchase_price` `numeric(15,2)`, `initial_qty`, `available_qty`, `received_at`, `created_at` |
| `orders` | `id`, `order_number` (unique), `channel` enum, `status` enum, `created_at`, `updated_at` |
| `order_items` | `id`, `order_id` (FK), `product_id` (FK), `requested_qty` |
| `order_item_allocations` | `id`, `order_item_id` (FK), `lot_id` (FK), `allocated_qty` |

### 8.2 Constraint & Indeks

- `CHECK (available_qty >= 0 AND available_qty <= initial_qty)` — stok tidak boleh negatif atau melebihi jumlah awal lot.
- `CHECK (initial_qty > 0)`, `CHECK (purchase_price >= 0)`, `CHECK (min_buffer_stock >= 0)`.
- `CHECK (requested_qty > 0)` dan `CHECK (allocated_qty > 0)`.
- Indeks: `inventory_lots(product_id, available_qty, received_at)` — mendukung query FIFO `WHERE product_id = ? AND available_qty > 0 ORDER BY received_at ASC FOR UPDATE`.
- Indeks: `orders(status, created_at)` — mendukung scan auto-release.
- Indeks pada FK `order_items(order_id, product_id)` dan `order_item_allocations(order_item_id, lot_id)` — mempercepat rollback stok.
- Sequence `order_number_seq` → `order_number` berformat `ORD-000001`, atomik (dihentikan bila perlu nomor lebih kompleks).
- Foreign key `ON DELETE RESTRICT` untuk mencegah hapus produk yang punya lot/order.

---

## 9. State Machine Order (Ringkasan)

```text
                 ┌──────────────────────────────┐
                 ▼                              │
DRAFT ──▶ RESERVED ──▶ PACKED ──▶ SHIPPED      │
  │         │                    (FINAL)        │
  │         ▼                                   │
  └────▶ CANCELLED ◀───────────────────────────┘
              (rollback stok jika sebelum SHIPPED)
```

| Dari | Ke | Efek Stok |
|---|---|---|
| `DRAFT` | `RESERVED` | Alokasi FIFO, kurangi `available_qty`, insert `order_item_allocations` |
| `RESERVED` | `PACKED` | Tidak ada (alokasi sudah dikunci) |
| `PACKED` | `SHIPPED` | Tidak ada (final, alokasi tetap untuk audit) |
| `DRAFT` | `CANCELLED` | Tidak ada (belum ada alokasi) |
| `RESERVED` | `CANCELLED` | Kembalikan `allocated_qty` ke lot asal, hapus baris alokasi |
| `PACKED` | `CANCELLED` | Sama seperti `RESERVED` → `CANCELLED` |
| `SHIPPED` | `*` | Ditolak (final) |
