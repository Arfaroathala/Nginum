/* =====================================================================
   NGINUM POS — SERVICE WORKER
   Tugasnya cuma satu: bikin aplikasi kebuka instan & tetap tampil rapi
   walau sinyal jelek.

   YANG TIDAK DILAKUKAN FILE INI (penting, jangan salah paham):
   - TIDAK bikin POS jalan offline. Semua transaksi tetap butuh internet,
     karena harga & total dihitung di server Supabase.
   - TIDAK pernah nyimpen data transaksi di HP.
   ===================================================================== */

const VERSION = 'nginum-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

/* ===== PASANG: simpan kerangka aplikasi ===== */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL).catch(() => {}))   // 1 file gagal jangan gagalin semua
      .then(() => self.skipWaiting())
  );
});

/* ===== AKTIF: buang cache versi lama ===== */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ===== AMBIL DATA ===== */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1. Bukan GET (transaksi, login, RPC) -> langsung ke jaringan, jangan disentuh
  if (req.method !== 'GET') return;

  // 2. Semua panggilan Supabase -> WAJIB fresh, tidak pernah di-cache.
  //    Data kasir basi jauh lebih berbahaya daripada loading sedikit lebih lama.
  if (url.hostname.endsWith('supabase.co')) return;

  // 3. Buka halaman -> jaringan dulu, cache cuma jadi jaring pengaman.
  //    Supaya update aplikasi selalu kebaca, bukan nyangkut versi lama.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((hit) => hit || offlinePage())
        )
    );
    return;
  }

  // 4. Sisanya (ikon, qris.png, font, library CDN) -> tampilkan dari cache biar
  //    instan, sambil diam-diam ambil versi baru buat dipakai lain kali.
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});

/* ===== Halaman darurat kalau benar-benar tidak ada apa-apa ===== */
function offlinePage() {
  return new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Nginum POS — Offline</title>
     <style>
       body{font-family:system-ui,-apple-system,sans-serif;background:#F5F8F3;color:#1B2A20;
            display:flex;align-items:center;justify-content:center;height:100dvh;margin:0;padding:24px;text-align:center}
       .b{background:#fff;border-radius:18px;padding:30px 24px;max-width:340px;box-shadow:0 4px 18px rgba(27,42,32,.1)}
       h1{font-size:19px;margin:0 0 8px}
       p{color:#66766B;font-size:14px;line-height:1.55;margin:0 0 18px}
       button{background:#137A44;color:#fff;border:0;border-radius:12px;
              padding:13px 22px;font-size:15px;font-weight:700;width:100%}
     </style></head><body>
     <div class="b">
       <div style="font-size:40px">📡</div>
       <h1>Ga ada koneksi</h1>
       <p>Nginum POS butuh internet buat nyimpen transaksi. Cek WiFi atau data seluler, terus coba lagi.</p>
       <button onclick="location.reload()">Coba lagi</button>
     </div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
