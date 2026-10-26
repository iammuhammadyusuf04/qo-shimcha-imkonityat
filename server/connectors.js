import { cfg } from './env.js';

// Tashqi tizimlar kutadigan umumiy format. API aniq bo'lgach faqat toWire() ni moslang.
export function toWire(p) {
  return {
    name: p.name,
    barcode: p.barcode || undefined,
    sku: p.sku || undefined,
    price: p.price,
    cost: p.cost,
    quantity: p.quantity,
    unit: p.unit || 'dona',
    category: p.category || undefined,
  };
}

async function call(target, method, urlPath, body) {
  const t = cfg.targets[target];
  const res = await fetch(t.url.replace(/\/$/, '') + urlPath, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(t.token ? { authorization: `Bearer ${t.token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${target} ${res.status}: ${String(text).slice(0, 200)}`);
  return data;
}

// Tashqi ID javobdan olinadi (id | _id | data.id)
const extractId = (d) => d?.id ?? d?._id ?? d?.data?.id ?? d?.data?._id ?? null;

export async function pushProduct(target, product) {
  const t = cfg.targets[target];
  if (!t.url) return { state: 'skipped', error: 'URL sozlanmagan' };
  try {
    const ext = product.sync?.[target]?.externalId;
    const data = ext
      ? await call(target, 'PUT', t.updatePath.replace('{id}', encodeURIComponent(ext)), toWire(product))
      : await call(target, 'POST', t.path, toWire(product));
    return { state: 'ok', externalId: ext ?? extractId(data), at: new Date().toISOString() };
  } catch (e) {
    return { state: 'error', error: e.message, at: new Date().toISOString() };
  }
}
