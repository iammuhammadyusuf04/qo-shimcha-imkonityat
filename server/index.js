import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cfg } from './env.js';
import { collection } from './store.js';
import { pushProduct } from './connectors.js';
import { buildPrint } from './labels.js';

const products = collection('products');
const jobs = collection('jobs');
const TARGETS = ['pos', 'ombor'];
let agentSeen = 0;
let agent = { printers: [], selected: '', host: '', at: 0 };
const publicDir = new URL('../public/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const eq = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const authed = (req, key) => !!key && eq(String(req.headers['x-api-key'] || ''), key);

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type + '; charset=utf-8' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readJson = (req) => new Promise((resolve, reject) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 1e6) { reject(new Error('Juda katta')); req.destroy(); } });
  req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('Noto\'g\'ri JSON')); } });
});

function validate(b, partial = false) {
  const p = {};
  if (!partial || b.name !== undefined) {
    if (!String(b.name || '').trim()) throw new Error('Nomi kerak');
    p.name = String(b.name).trim();
  }
  for (const k of ['price', 'cost', 'quantity']) {
    if (!partial || b[k] !== undefined) {
      const n = Number(b[k] ?? 0);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${k} noto'g'ri`);
      p[k] = n;
    }
  }
  for (const k of ['barcode', 'sku', 'unit', 'category']) if (b[k] !== undefined) p[k] = String(b[k]).trim();
  return p;
}

async function syncProduct(id, targets = TARGETS) {
  const p = products.get(id);
  const sync = { ...(p.sync || {}) };
  for (const t of targets) sync[t] = { ...sync[t], ...(await pushProduct(t, p)) };
  return products.update(id, { sync });
}

async function route(req, res, url) {
  const { pathname: p } = url;
  const m = req.method;

  // --- Agent (kompyuter) ---
  if (p.startsWith('/api/agent/')) {
    if (!authed(req, cfg.agentKey)) return send(res, 401, { error: 'Agent kaliti noto\'g\'ri' });
    if (p === '/api/agent/jobs' && m === 'GET') {
      const queued = jobs.all().filter((j) => j.status === 'queued');
      for (const j of queued) { j.status = 'sent'; j.sentAt = new Date().toISOString(); }
      if (queued.length) jobs.save();
      return send(res, 200, queued);
    }
    if (p === '/api/agent/printers' && m === 'POST') {
      const b = await readJson(req);
      agent = { printers: (b.printers || []).map(String).slice(0, 50), selected: String(b.selected || ''), host: String(b.host || ''), at: Date.now() };
      return send(res, 200, { ok: true });
    }
    const ack = p.match(/^\/api\/agent\/jobs\/([\w-]+)\/(done|failed)$/);
    if (ack && m === 'POST') {
      const body = await readJson(req);
      const j = jobs.update(ack[1], { status: ack[2] === 'done' ? 'done' : 'failed', error: body.error });
      return j ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Topilmadi' });
    }
    return send(res, 404, { error: 'Topilmadi' });
  }

  // --- Telefon / API ---
  if (p.startsWith('/api/')) {
    if (!authed(req, cfg.apiKey)) return send(res, 401, { error: 'API kaliti noto\'g\'ri' });

    if (p === '/api/status' && m === 'GET') {
      return send(res, 200, {
        targets: Object.fromEntries(TARGETS.map((t) => [t, !!cfg.targets[t].url])),
        agentOnline: Date.now() - agentSeen < 15000,
        agent: { printers: agent.printers, selected: agent.selected, host: agent.host },
        queued: jobs.all().filter((j) => j.status === 'queued' || j.status === 'sent').length,
        label: { w: cfg.labelW, h: cfg.labelH },
      });
    }

    if (p === '/api/products' && m === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const list = products.all().filter((x) =>
        !q || [x.name, x.barcode, x.sku].some((v) => String(v || '').toLowerCase().includes(q)));
      return send(res, 200, list.slice().reverse().slice(0, 200));
    }
    if (p === '/api/products' && m === 'POST') {
      const row = products.insert({ ...validate(await readJson(req)), sync: {} });
      return send(res, 201, await syncProduct(row.id));
    }
    const one = p.match(/^\/api\/products\/([\w-]+)(\/sync)?$/);
    if (one) {
      const id = one[1];
      if (!products.get(id)) return send(res, 404, { error: 'Topilmadi' });
      if (one[2] && m === 'POST') return send(res, 200, await syncProduct(id));
      if (m === 'PUT') {
        products.update(id, validate(await readJson(req), true));
        return send(res, 200, await syncProduct(id));
      }
      if (m === 'DELETE') { products.remove(id); return send(res, 200, { ok: true }); }
      if (m === 'GET') return send(res, 200, products.get(id));
    }

    if (p === '/api/print' && m === 'POST') {
      const b = await readJson(req);
      const items = (b.items || []).map((i) => ({ product: products.get(i.productId), copies: Number(i.copies) || 1 }))
        .filter((i) => i.product);
      if (!items.length) return send(res, 400, { error: 'Tovar tanlanmagan' });
      const format = b.format === 'escpos' ? 'escpos' : 'tspl';
      const data = buildPrint(format, items, { w: cfg.labelW, h: cfg.labelH });
      const job = jobs.insert({
        status: 'queued', format, printer: String(b.printer || '').slice(0, 100),
        summary: items.map((i) => `${i.product.name} ×${i.copies}`).join(', ').slice(0, 200),
        data: data.toString('base64'),
      });
      return send(res, 202, { id: job.id, status: job.status });
    }
    if (p === '/api/jobs' && m === 'GET') {
      return send(res, 200, jobs.all().slice(-30).reverse().map(({ data, ...j }) => j));
    }
    return send(res, 404, { error: 'Topilmadi' });
  }

  // --- Statik fayllar (PWA) ---
  const file = p === '/' ? 'index.html' : p.slice(1);
  const full = path.join(publicDir, file);
  if (!full.startsWith(publicDir) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return send(res, 404, 'Topilmadi', 'text/plain');
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };
  send(res, 200, fs.readFileSync(full), types[path.extname(full)] || 'application/octet-stream');
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/agent/jobs' && authed(req, cfg.agentKey)) agentSeen = Date.now();
    await route(req, res, url);
  } catch (e) {
    send(res, e.message?.includes('kerak') || e.message?.includes('noto') ? 400 : 500, { error: e.message });
  }
});

if (process.argv[1] === new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') || process.env.RUN_SERVER) {
  if (!cfg.apiKey || !cfg.agentKey) { console.error('API_KEY va AGENT_KEY .env da to\'ldirilishi shart'); process.exit(1); }
  server.listen(cfg.port, () => console.log(`Server: http://localhost:${cfg.port}`));
}
