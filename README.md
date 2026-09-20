# Cash Plan — Analisis Kredit & Bebas dari Pinjol/Paylater

Aplikasi web untuk mencatat hutang (pinjol, paylater, hutang lain), pengeluaran, dan gaji,
lalu menghasilkan analisis strategi pelunasan hutang berbasis arus kas.

## Struktur

- `server/` — REST API (Express) + database SQLite (`node:sqlite` bawaan Node.js, tanpa native build).
- `client/` — Frontend React (Vite).

## Menjalankan

```bash
npm run install:all   # sekali saja
npm run dev            # jalankan server (port 4000) + client (port 5173) sekaligus
```

Buka http://localhost:5173

## Fitur

1. **Input hutang**: platform, jenis (pinjol/paylater/lainnya), sisa tagihan, limit & sisa limit,
   bunga (per hari/bulan/tahun), cicilan minimum, jatuh tempo.
2. **Input pengeluaran**: kategori, jumlah, tanggal, berulang atau tidak.
3. **Input pemasukan**: sumber (gaji, bonus, dll), jumlah, tanggal.
4. **Tombol Analisa** memanggil `/api/analyze` yang menghitung:
   - Ringkasan arus kas (pemasukan, pengeluaran, total hutang, dana bebas, rasio hutang/gaji).
   - Peringatan risiko (arus kas negatif, bunga sangat tinggi ciri pinjol ilegal, dsb).
   - Urutan prioritas pelunasan (kombinasi urgensi jatuh tempo + bunga tertinggi).
   - Strategi otomatis: **avalanche** (bunga tertinggi dulu) bila dana bebas cukup, atau
     **snowball** (nominal terkecil dulu) bila dana bebas terbatas.
   - Proyeksi bulanan sisa hutang sampai lunas (chart) + estimasi total bunga yang terbayar.
   - Rekomendasi apakah aman mengambil pinjaman baru (hanya untuk konsolidasi bunga rendah)
     dan berapa cicilan maksimal yang aman.

## Catatan implementasi

- Database memakai modul bawaan Node.js `node:sqlite` (butuh Node 22.5+, disarankan Node 24/26)
  supaya tidak perlu kompilasi native module seperti `better-sqlite3` yang butuh Python/toolchain.
- Data tersimpan di `server/cashplan.db` (di-ignore oleh git).
