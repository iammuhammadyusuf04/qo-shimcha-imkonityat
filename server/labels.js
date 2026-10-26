// Printer uchun xom (raw) baytlar: TSPL (etiketka) va ESC/POS (chek).
const MM_DOT = 8; // 203 dpi ≈ 8 nuqta/mm

const money = (n) => new Intl.NumberFormat('ru-RU').format(Number(n) || 0);
const clean = (s) => String(s ?? '').replace(/["\r\n]/g, ' ').slice(0, 40);

export function tsplLabel(items, { w, h }) {
  let out = `SIZE ${w} mm,${h} mm\r\nGAP 2 mm,0\r\nDIRECTION 1\r\nCODEPAGE 1252\r\n`;
  for (const { product, copies } of items) {
    out += `CLS\r\n`;
    out += `TEXT 8,8,"3",0,1,1,"${clean(product.name).slice(0, Math.floor(w * 0.6))}"\r\n`;
    out += `TEXT 8,${Math.round(h * MM_DOT * 0.3)},"4",0,1,1,"${money(product.price)} so'm"\r\n`;
    if (product.barcode) {
      out += `BARCODE 8,${Math.round(h * MM_DOT * 0.6)},"128",${Math.round(h * MM_DOT * 0.25)},1,0,2,2,"${clean(product.barcode)}"\r\n`;
    }
    out += `PRINT ${Math.max(1, copies | 0)},1\r\n`;
  }
  return Buffer.from(out, 'latin1');
}

export function escposLabel(items) {
  const parts = [Buffer.from([0x1b, 0x40])]; // init
  for (const { product, copies } of items) {
    for (let i = 0; i < Math.max(1, copies | 0); i++) {
      parts.push(Buffer.from([0x1b, 0x61, 1]));                  // center
      parts.push(Buffer.from(clean(product.name) + '\n', 'latin1'));
      parts.push(Buffer.from([0x1d, 0x21, 0x11]));               // 2x size
      parts.push(Buffer.from(money(product.price) + " so'm\n", 'latin1'));
      parts.push(Buffer.from([0x1d, 0x21, 0x00]));
      if (product.barcode) {
        parts.push(Buffer.from([0x1d, 0x68, 60, 0x1d, 0x77, 2, 0x1d, 0x48, 2])); // height, width, HRI below
        const code = Buffer.from(String(product.barcode), 'latin1');
        parts.push(Buffer.from([0x1d, 0x6b, 73, code.length + 2, 0x7b, 0x42]), code); // CODE128-B
      }
      parts.push(Buffer.from('\n\n\n'), Buffer.from([0x1d, 0x56, 0x42, 0x00])); // feed + cut
    }
  }
  return Buffer.concat(parts);
}

export function buildPrint(format, items, size) {
  return format === 'escpos' ? escposLabel(items) : tsplLabel(items, size);
}
