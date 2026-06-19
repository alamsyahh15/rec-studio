# RecStudio

Aplikasi web untuk merekam layar, webcam, dan mikrofon dalam satu kanvas komposit, lalu mengekspor hasilnya sebagai MP4 atau fallback WebM.

## Menjalankan proyek

```bash
npm install
npm run dev
```

## Catatan penting

- `getDisplayMedia()` membutuhkan konteks aman pada production, jadi deploy sebaiknya memakai HTTPS.
- FFmpeg.wasm dimuat secara lazy saat proses stop recording dan memerlukan header COOP/COEP yang sudah dikonfigurasi di `vite.config.ts`.
- Browser target utama adalah Chrome 94+ dan Edge 94+ pada desktop modern.
