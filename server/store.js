import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(dir, { recursive: true });

// Oddiy JSON-fayl ombori (yozishlar atomik: tmp -> rename)
export function collection(name) {
  const file = path.join(dir, `${name}.json`);
  let items = [];
  try { items = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => {
    fs.writeFileSync(file + '.tmp', JSON.stringify(items, null, 2));
    fs.renameSync(file + '.tmp', file);
  };
  return {
    all: () => items,
    get: (id) => items.find((x) => x.id === id),
    insert(obj) {
      const row = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...obj };
      items.push(row); save(); return row;
    },
    update(id, patch) {
      const row = items.find((x) => x.id === id);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: new Date().toISOString() }); save(); return row;
    },
    remove(id) {
      const n = items.length; items = items.filter((x) => x.id !== id); save(); return items.length < n;
    },
    save,
  };
}
