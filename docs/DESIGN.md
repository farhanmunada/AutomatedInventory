# Desain Visual — Automated Inventory Dashboard

> Mengikuti `skill-frontend-design` (vault): Fase 1 rencana token → Fase 2 implementasi.
> Bahasa dokumen: Indonesia; identifier & nilai token tetap Bahasa Inggris.

---

## 1. Konsep

**"Ruang kendali gudang / manifest kertas."**

Alat kerja operator yang dipakai seharian, mata lelah, keputusan cepat.
Bukan landing page SaaS. Prinsip:

- Kertas hangat sebagai medium; tinta gelap sebagai dominan.
- Warna **hanya** sinyal fungsi: hijau = stok aman/selesai, kuning = buffer menipis,
  merah = kritis/batal/gagal. Elemen netral tidak boleh memakai warna aksen.
- Satu elemen berani: **baris stok menipis** di semua tabel punya tanda kiri merah +
  angka merah. Itu yang pertama dilihat mata. Sisanya hening dan teratur.

## 2. Color (token `@theme` Tailwind v4)

| Token | Hex | Fungsi |
|---|---|---|
| `--color-paper` | `#faf9f5` | Latar (hangat, bukan putih bersih ala SaaS) |
| `--color-surface` | `#ffffff` | Permukaan tabel/form |
| `--color-ink` | `#1c1917` | Teks utama (warm black) |
| `--color-ink-muted` | `#57534e` | Teks sekunder, label kolom |
| `--color-line` | `#e7e5e0` | Garis pemisah struktural |
| `--color-flag-critical` | `#b42318` | Oversell risk, CANCELLED, error |
| `--color-flag-warn` | `#b45309` | Stok ≤ buffer, RESERVED |
| `--color-flag-ok` | `#15803d` | SHIPPED, stok aman |

Aksi tunggal memakai **tinta solid** (bukan biru generik): tombol primer hitam tinta,
tautan digarisbawahi.

## 3. Type

Dua keluarga dengan kontras tegas (aturan skill: maks 2, kontras harus jelas):

| Peran | Font | Contoh pemakaian |
|---|---|---|
| Data & identitas | `IBM Plex Mono` | SKU, `order_number`, qty, harga, valuasi, timestamp |
| Teks kerja | `Inter` | Nama produk, kalimat, tombol, heading |

- Semua angka `font-variant-numeric: tabular-nums`.
- Heading halaman: 15px semibold uppercase-tracking lebar kecil (gaya header manifest),
  bukan `text-lg` generik.
- Body 13.5px, baris tabel 12.5–13px — alat kerja = rapat, informatif.

## 4. Layout

- Kerangka: header strip atas (logo teks + username + logout), konten full-width,
  tanpa sidebar mengambang.
- **Tabel adalah bintang**, bukan kartu-kartu identik. Batas bawah tipis per baris,
  header kolom digarisbawahi ganda (gaya kertas karbon).
- Metrik dashboard: satu strip horizontal dengan garis vertikal pemisah (bukan 4 kartu
  rounded sama persis → hindari "SaaS-Card Kit Monoton").
- Pemisah memisahkan konteks logis: form dialog pakai blok berlabel, bukan divider dekoratif.

## 5. AI Tells checklist (self-critique sebelum koding)

- [x] Tidak ada cream `#F4F1EA` + terracotta `#D97757` — paper di sini medium fungsional,
      aksen bukan tanah liat dekoratif; warna fungsi = merah/kuning/hijau sinyal gudang.
- [x] Tidak semua konten jadi rounded card seragam → tabel telanjang + strip metrik.
- [x] Tidak ada label eyebrow ALL-CAPS di setiap heading; heading halaman memang gaya
      manifest, dipakai konsisten sebagai bahasa desain, bukan tempelan.
- [x] Tidak ada panah `→` di tombol.
- [x] Tidak ada fade-slide-up di tiap section; animasi hanya pulse skeleton saat load.
- [x] Copywriting: "Simpan", "Reservasi stok", "Batalkan order" — kata kerja aktif;
      toast memakai bentuk lampau yang sama ("Order dibatalkan").

## 6. Aksesibilitas (wajib, tanpa kompromi)

- Focus ring terlihat: `outline 2px solid ink`, offset 2px, di semua kontrol.
- `prefers-reduced-motion`: matikan pulse skeleton.
- Kontras WCAG AA: token di atas ≥ 4.5:1 di atas paper (`ink-muted` 5.9:1,
  `flag-*` ≥ 4.8:1).
- Tabel: `<th scope="col">`, status badge punya teks, bukan hanya warna.
- Responsif: tabel boleh horizontal-scroll di ponsel, form menumpuk 1 kolom.
