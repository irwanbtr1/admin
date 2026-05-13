# TODO - Penyederhanaan Tampilan Bon Customer (Tracking + Bon Online)

## Plan (ringkas)
1. Ubah `tracking.html` + `tracking.js` agar hanya jadi 1 halaman “Bon Customer + Tracking”.
   - Tampilkan: status servis, data customer, data HP, biaya/catatan, garansi.
   - Hilangkan form “input kode” (atau jadikan opsional).
   - Hilangkan link/button menuju halaman bon online.
   - QR/URL tetap cukup di bon yang ditampilkan dari sisi admin.
2. Ubah `bon-online.html` agar ter-direct ke halaman tracking/bon customer yang baru.
3. Pastikan URL yang dipanggil admin tetap kompatibel:
   - `/customer/:id` dan `/bon/:id` tetap bisa dibuka.
4. Update styling bila perlu agar simpel dan mudah dibaca di HP.
5. Test dengan akses dari HP:
   - buka `http://<ip-server>:3000/bon/:id` -> pastikan tampil tampilan baru.
   - buka `http://<ip-server>:3000/customer/:id` -> pastikan tampil tampilan baru.

## Catatan
- Tidak perlu lagi dua tampilan terpisah.
- Jika tetap butuh cetak PDF: tombol print tetap ada di halaman gabungan.

