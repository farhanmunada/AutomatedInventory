# AGENTS.md

> Spesifikasi Universal Agen Coding. Wajib dibaca AI agent sebelum aksi apa pun pada repositori ini.
> Terhubung dengan Obsidian Knowledge Brain di `C:\Users\vola\agentVault`.

---

## 0. Pre-Flight Checklist (Wajib Dijalankan Pertama Kali)

> ⛔ **BLOCKING RULE:** Agen DILARANG melakukan aksi apa pun (baca file kode, eksekusi shell, tulis file) sebelum seluruh checklist di bawah ini tuntas. Pelanggaran = reset sesi.

Sebelum membaca berkas lain atau mengeksekusi shell apa pun:

- [ ] Baca berkas `AGENTS.md` ini sampai selesai.
- [ ] Identifikasi OS aktif (`win32` vs `linux/darwin`).
- [ ] **WAJIB Baca Knowledge Base (Proof-of-Reading):**
  - Baca `C:\Users\vola\agentVault\00-Brain\MOC-Master.md` — peta graf seluruh node memori.
  - Baca `C:\Users\vola\agentVault\02-Execution-Lifecycle\lifecycle-and-workflow.md` — siklus 10 fase wajib.
  - Identifikasi node vault yang relevan untuk tugas saat ini, lalu baca node tersebut.
  - **Proof-of-Reading:** Setelah membaca vault, agen WAJIB menampilkan notifikasi singkat di chat:
    ```
    ✅ Vault terbaca. Fase aktif: [nama fase]. Skill relevan: [daftar skill].
    ```
    Jika notifikasi ini tidak muncul di awal sesi = agen belum membaca vault = DILARANG lanjut.
- [ ] Periksa folder `docs/` di root projek:
  - Jika ada `docs/PRD.md` atau `docs/PRODUCT_REQUIREMENTS.md`, baca seluruhnya. Ini *Single Source of Truth* kebutuhan sistem.
  - Jika ada `docs/ARCHITECTURE.md`, baca kontrak batasan arsitektur.
  - Jika ada `docs/RESEARCH.md`, baca temuan riset yang sudah ada.
- [ ] Verifikasi proteksi secret: pastikan `.gitignore` memuat `.env`, `.env.*`.
- [ ] Deteksi framework & pola arsitektur aktif (Next.js, Vite, Express, FastAPI, Laravel, dll).
- [ ] Cek status PRD: DILARANG menulis kode sebelum PRD berstatus `APPROVED` oleh operator manusia.

---

## 1. Aturan Mutlak (Non-Negotiables)

1. **Deny-First Security:** Dilarang membaca, mengubah, mencetak, atau commit file rahasia (`.env`, `.env.*`, `*.pem`, `id_rsa`, token cloud).
2. **Anti-Reward Hacking:** Dilarang mengubah, melemahkan, atau menghapus asersi tes hanya agar tes terlihat lulus. Perbaiki kode bisnis, bukan tes.
3. **No Hallucinated Dependencies:** Dilarang menambah package (`npm i`, `pip install`) tanpa konfirmasi manusia. Turuni tangga: stdlib -> paket terpasang -> fungsi mandiri -> baru izin tambah package.
4. **3-Strike Failure Guardrail:** Jika percobaan edit pada file sama gagal 3 kali berturut-turut: STOP. Rollback via git ke commit stabil, laporkan hipotesis & kegagalan ke manusia.
5. **No Blind Completion:** Dilarang menyatakan "Tugas Selesai" jika linter, build, typecheck, atau tes masih error/warning.
6. **Direct-to-File (No Terminal Specs):** Dilarang membuang output riset, spesifikasi, PRD, atau diagram panjang ke terminal/chat. Tulis langsung ke `docs/`. Chat HANYA berisi status ringkas 3-5 baris. **Dilarang menampilkan/menduplikasi isi file yang baru ditulis ke terminal.** Cukup sebutkan path file dan status.
7. **Living Memory (`docs/` Single Source of Truth):**
   - Folder `docs/` adalah memori persisten kerja projek.
   - Setiap mulai sesi atau ganti tugas, agen WAJIB membaca file di `docs/`.
   - Jika kebutuhan berubah, perbarui dokumen di `docs/` terlebih dahulu sebelum mengubah kode.
8. **Bahasa Dokumentasi:**
   - Seluruh dokumen di folder `docs/` WAJIB ditulis dalam **Bahasa Indonesia**.
   - Istilah teknikal, identifier kode, nama fungsi, nama variabel, perintah shell, nama library tetap dalam **Bahasa Inggris**.
   - Komentar dalam kode produksi wajib ditulis dalam **Bahasa Inggris** (standar industri).
9. **Platform-Aware Shell:**
   - Windows (PowerShell/CMD): Dilarang pakai chaining POSIX `&&` (gunakan pemisah `;` atau eksekusi perintah terpisah). Dilarang pakai utilitas bash (`grep`, `cat`, `export`) jika tidak tersedia di OS.
10. **Two-Tier Verification:**
    - Tier 1: Unit test & static typecheck in-memory (`tsc --noEmit`, test runner).
    - Tier 2: Real migration & database smoke test jika ada perubahan skema (hindari ilusi tes mock).
11. **Arsitektur Kontekstual:** Full-stack terpadu (Next.js/Nuxt/Laravel) gunakan 1 root tunggal standar framework. Pemisahan folder `frontend/` dan `backend/` hanya jika arsitektur memang decoupled atau diminta eksplisit.

---

## 2. Alur Eksekusi Wajib & Dua Gerbang Persetujuan Manusia

```text
[1. Intake & Living Memory Check]
       │  → Baca AGENTS.md, docs/, MOC-Master.md
       │
[2. Repository & Web Discovery]
       │  → Riset teknis & domain → Tulis ke docs/RESEARCH.md
       │
[3. Penajaman Ide (skill-grill-me)]
       │  → Wawancara intensif → Tutup semua celah ambiguitas
       │
[4. Tulis PRD ke docs/PRD.md (Bahasa Indonesia, format GIVEN/WHEN/THEN)]
       │  → Termasuk spesifikasi frontend & kontrak API
       │
[GERBANG 1: Human PRD Approval Checkpoint] ──► STOP & WAIT
       │ (Manusia setuju)
       │
[5. Task Decomposition & Desain Arsitektur ke docs/ARCHITECTURE.md]
       │
[GERBANG 2: Architecture & Plan Approval] ──► STOP & WAIT (Task ≥3 file)
       │ (Manusia setuju)
       │
[6. Implementasi Clean Code (Per-Baris & Feature-Modular)]
       │  → Baca vault: clean-code-standards, file-structure-patterns, code-ordering
       │
[7. Build & Two-Tier Verification]
       │  → Tier 1: typecheck + lint + unit test
       │  → Tier 2: real DB migration + smoke test
       │
[8. Regression & Security Review]
       │  → Jalankan full test suite, audit secret
       │
[9. Documentation Sync & Git Diff Review]
       │  → Perbarui docs/ jika kontrak berubah
       │
[10. Seal & Commit Atomik]
```

### Aturan Fase Kritis

#### Fase 2: Riset Wajib (Direct-to-File)
- Temuan riset teknis, domain, dan eksplorasi codebase WAJIB ditulis ke `docs/RESEARCH.md`.
- Gunakan `skill-agent-browser` jika perlu riset dokumentasi pustaka versi terbaru.
- Dilarang melompat ke PRD tanpa riset terdokumentasi.

#### Fase 3: Penajaman Ide (Wajib Sebelum PRD)
- Agen WAJIB menjalankan `skill-grill-me` — wawancara intensif berbasis Design Tree.
- Semua frontier questions harus terjawab sebelum PRD ditulis.
- Agen mencari fakta sendiri (baca file, cek dependensi). Keputusan strategis ditanyakan ke manusia.

#### GERBANG 1: PRD Approval Gate (STOP & WAIT)
- Setelah selesai menulis `docs/PRD.md`, agen **WAJIB BERHENTI**.
- Laporkan ringkas di chat: *"PRD selesai di docs/PRD.md. Menunggu review & persetujuan Anda."*
- Dilarang membuat file kode, skema DB, atau migrasi sebelum ada kata sepakat/approved dari manusia.
- PRD wajib memuat: User Stories (GIVEN/WHEN/THEN), spesifikasi frontend (halaman, wireframe, design token), kontrak API.

#### GERBANG 2: Architecture & Plan Approval Gate (STOP & WAIT)
- Berlaku untuk tugas dengan skala ≥ 3 file.
- Tampilkan rencana: daftar sub-tugas, file yang dibuat/diubah, pola arsitektur, dependensi baru (jika ada).
- Tunggu konfirmasi manusia sebelum eksekusi file pertama.

---

## 3. Standar Clean Code & Batas Kompleksitas (Inline Checklist)

- **Canonical File Ordering:**
  1. Imports (stdlib -> external -> internal alias -> relative).
  2. Types / Interfaces / DTOs.
  3. Constants & Enums.
  4. Helper internal.
  5. Logika utama / fungsi yang diekspor.
- **Batas Keras:**
  - File: ≤ 300 baris.
  - Fungsi: ≤ 30 baris.
  - Parameter fungsi: ≤ 3 (lebih dari 3 -> bungkus DTO/object).
  - Nesting: ≤ 2 level (gunakan early return / guard clauses).
- **Layer Separation:**
  - Route -> Controller -> Service -> Repository -> Model.
  - Service DILARANG tahu objek HTTP (`req`/`res`).
  - Controller DILARANG eksekusi query database langsung.
- **Pola Ponytail:** Solusi paling sederhana yang bekerja. stdlib > library baru. Boring code > clever code.

---

## 4. Tabel Pemanggilan Skill Otomatis

| Kondisi / Kebutuhan | Skill yang Wajib Dibaca & Dipakai | Path Skill di Vault |
|---|---|---|
| Penajaman ide mentah / inisiasi | `skill-grill-me` | `05-Skills/skill-grill-me.md` |
| Validasi kualitas PRD | `skill-prd-validator` | `05-Skills/skill-prd-validator.md` |
| Riset internet / baca docs versi baru | `skill-agent-browser` | `05-Skills/skill-agent-browser.md` |
| Pemilihan pustaka / library | `skill-tech-selector` | `05-Skills/skill-tech-selector.md` |
| Efisiensi arsitektur & anti-bloat | `skill-ponytail` | `05-Skills/skill-ponytail.md` |
| Audit kode bersih sebelum commit | `skill-clean-coder` | `05-Skills/skill-clean-coder.md` |
| Review diff & anti-overengineering | `skill-ponytail-review` | `05-Skills/skill-ponytail-review.md` |
| Review 5-sumbu (kualitas, keamanan) | `skill-code-review-and-quality` | `05-Skills/skill-code-review-and-quality.md` |
| Perbaikan UI / Frontend bebas template klise | `skill-frontend-design` | `05-Skills/skill-frontend-design.md` |
| TDD (Red-Green-Refactor) | `skill-test-driven-development` | `05-Skills/skill-test-driven-development.md` |
| Prosedur uji bertubi-tubi | `skill-test-rigor` | `05-Skills/skill-test-rigor.md` |
| Investigasi bug rumit / 2x gagal | `skill-diagnosing-bugs` + cek `06-Bug-Solutions/` | `05-Skills/skill-diagnosing-bugs.md` |
| Dokumentasi solusi bug terverifikasi | `skill-bug-memory` | `05-Skills/skill-bug-memory.md` |
| Audit keamanan & sanitasi data | `skill-security-and-hardening` | `05-Skills/skill-security-and-hardening.md` |
| Optimasi performa / query slow | `skill-performance-optimization` | `05-Skills/skill-performance-optimization.md` |
| Observabilitas & logging terstruktur | `skill-observability-and-instrumentation` | `05-Skills/skill-observability-and-instrumentation.md` |
| Pipeline CI/CD & rollback otomatis | `skill-ci-cd-and-automation` | `05-Skills/skill-ci-cd-and-automation.md` |

---

## 5. Matriks Perizinan Perintah

| Tingkat Risiko | Aksi | Kebijakan |
|---|---|---|
| **Low Risk** | `read`, `grep`, `glob`, `git status`, `git diff`, run unit test | Auto-allow |
| **Medium Risk** | Modifikasi file kode, tambah dependensi, migrasi skema db | Warning / Konfirmasi |
| **High Risk** | `rm -rf`, `git push -f`, modifikasi file `.env`, drop database | Strictly Block / Tanya Manusia |

---

## 6. Perintah Verifikasi Projek

> *Sesuaikan perintah di bawah dengan stack repositori:*

- **Lint:** `npm run lint` / `ruff check .`
- **Typecheck:** `npx tsc --noEmit` / `mypy .`
- **Test:** `npm test` / `pytest`
- **Build:** `npm run build`

---

## 7. Rujukan Wajib ke Knowledge Base (WAJIB BACA, BUKAN OPSIONAL)

> **Instruksi:** Path di bawah BUKAN dekorasi. Agen WAJIB membaca file vault yang relevan dengan fase kerja saat ini. Jika informasi di AGENTS.md tidak cukup, AKSES path di bawah untuk mendapat detail lengkap.

| Fase Kerja | Node Vault yang WAJIB Dibaca |
|---|---|
| Sesi baru / tugas baru | `C:\Users\vola\agentVault\00-Brain\MOC-Master.md` |
| Inisiasi projek | `C:\Users\vola\agentVault\01-Initiation-and-Spec\01-project-initiation.md` |
| Riset & discovery | `C:\Users\vola\agentVault\02-Architecture-and-Tech\01-tech-stack-decision.md` |
| Penulisan PRD | `C:\Users\vola\agentVault\01-Initiation-and-Spec\02-prd-generation.md` |
| Validasi PRD | `C:\Users\vola\agentVault\01-Initiation-and-Spec\03-prd-validation-gate.md` |
| Desain arsitektur | `C:\Users\vola\agentVault\02-Architecture-and-Tech\02-system-design.md` |
| Implementasi kode | `C:\Users\vola\agentVault\03-Implementation-and-Clean-Code\` (semua file) |
| Pengujian | `C:\Users\vola\agentVault\04-Quality-and-Repeated-Testing\` (semua file) |
| Keamanan | `C:\Users\vola\agentVault\04-Security\risk-tiers-and-sandboxing.md` |
| Kegagalan / stuck | `C:\Users\vola\agentVault\03-Anti-Patterns\failure-modes-and-recovery.md` |
| Bug berulang | `C:\Users\vola\agentVault\06-Bug-Solutions\INDEX-BUGS.md` |
| Siklus hidup lengkap | `C:\Users\vola\agentVault\02-Execution-Lifecycle\lifecycle-and-workflow.md` |

- **Skill:** Semua skill ada di `C:\Users\vola\agentVault\05-Skills\`. Lihat tabel Section 4 untuk mapping kondisi → skill.
- **Jika ragu skill mana yang dipakai:** Baca `MOC-Master.md` → cari di Matriks Pemanggilan Skill.
