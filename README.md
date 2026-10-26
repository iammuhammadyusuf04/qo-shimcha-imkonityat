# Ombor va Chop

Telefondan tovar qo'shish (POS + omborzaxirasi.online ga) va narx/shtrix-kod etiketkasini kompyuterdagi printerdan chiqarish.

```
Telefon (PWA) ──► Server (Node) ◄── Agent (Windows kompyuter) ──► Termal printer
                     │
                     ├──► POS API
                     └──► omborzaxirasi.online API
```

Tashqi kutubxonalar yo'q, Node 18+ yetarli.

## Server
1. `cp .env.example .env`, `API_KEY` va `AGENT_KEY` ni o'zgartiring, POS/Ombor URL va tokenlarini kiriting.
2. `npm start`, so'ng telefonda `http://<server>:3000` ni oching (HTTPS orqasida bo'lsa "Bosh ekranga qo'shish" mumkin) va API kalitni kiriting.

## Windows agent (printer ulangan kompyuter)
```
set SERVER_URL=https://sizning-server
set AGENT_KEY=...
set PRINTER_NAME=XP-365B     (bo'sh bo'lsa standart printer)
node agent\agent.js
```
Agent serverga o'zi ulanadi, shuning uchun kompyuterda port ochish shart emas. Etiketka o'lchami `.env` da `LABEL_WIDTH_MM` / `LABEL_HEIGHT_MM`.

## API moslash
Tashqi tizim API si aniq bo'lgach `server/connectors.js` dagi `toWire()` (maydon nomlari) va `.env` dagi `*_PRODUCTS_PATH` / `*_UPDATE_PATH` ni o'zgartiring. Yuborish xatosi bo'lsa tovar baribir saqlanadi, ro'yxatda ↻ tugmasi bilan qayta yuboriladi.

## Telefon API
`x-api-key` sarlavhasi bilan: `GET/POST /api/products`, `PUT/DELETE /api/products/:id`, `POST /api/products/:id/sync`, `POST /api/print` (`{items:[{productId,copies}], format:"tspl"|"escpos"}`), `GET /api/jobs`, `GET /api/status`.

## PWA o'rnatish
Telefonda HTTPS manzilni oching (Chrome: "O'rnatish" tugmasi yoki menyu → "Ilovani o'rnatish"; iPhone Safari: Ulashish → "Bosh ekranga qo'shish"). Oflayn ham ochiladi, lekin tovar saqlash va chop etish uchun internet kerak. HTTPS uchun masalan Cloudflare Tunnel yoki reverse proxy ishlating.

## Xprinter
Etiketka modellari (XP-365B, XP-420B, …) uchun "Etiketka (TSPL)", chek modellari (XP-58, XP-80, …) uchun "Chek (ESC/POS)" ni tanlang. `agent/start-agent.bat` ni to'ldirib, Windows ishga tushishiga qo'shing.
