// Kompyuter dasturi (Windows): serverdan print-vazifalarni oladi, tanlangan printerdan chiqaradi.
// Sozlash oynasi: http://127.0.0.1:3777 (brauzerda/PWA sifatida ochiladi). Sozlamalar agent/config.json da.
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ps1 = path.join(dir, 'rawprint.ps1');
const cfgFile = path.join(dir, 'config.json');
const UI_PORT = Number(process.env.AGENT_UI_PORT || 3777);
const isWin = process.platform === 'win32';

let cfg = { serverUrl: process.env.SERVER_URL || '', agentKey: process.env.AGENT_KEY || '', printer: process.env.PRINTER_NAME || '' };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch {}
const saveCfg = () => fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));

const state = { connected: false, error: '', printers: [], log: [], printed: 0 };
const log = (text, ok = true) => { state.log.unshift({ at: new Date().toISOString(), text, ok }); state.log.length = Math.min(state.log.length, 30); };

function listPrinters() {
  if (!isWin) return Promise.resolve(process.env.FAKE_PRINTERS ? process.env.FAKE_PRINTERS.split(',') : []);
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress'],
      { windowsHide: true, timeout: 15000 }, (err, out) => {
        if (err) return resolve([]);
        try { const j = JSON.parse(out); resolve(Array.isArray(j) ? j : [j]); } catch { resolve([]); }
      });
  });
}

function printRaw(printer, buf) {
  if (!isWin) return Promise.reject(new Error('Chop etish faqat Windows da ishlaydi'));
  const tmp = path.join(os.tmpdir(), `job-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(tmp, buf);
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Printer', printer, '-File', tmp], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => { fs.rmSync(tmp, { force: true }); code === 0 ? resolve() : reject(new Error(err.trim().slice(0, 200) || `exit ${code}`)); });
  });
}

const server = () => cfg.serverUrl.replace(/\/$/, '');
const hdr = () => ({ 'x-api-key': cfg.agentKey, 'content-type': 'application/json' });
const ack = (id, ok, error) => fetch(`${server()}/api/agent/jobs/${id}/${ok ? 'done' : 'failed'}`, { method: 'POST', headers: hdr(), body: JSON.stringify({ error }), signal: AbortSignal.timeout(10000) });

async function tick() {
  if (!cfg.serverUrl || !cfg.agentKey) { state.connected = false; state.error = 'Server manzili va kalit kiritilmagan'; return; }
  const res = await fetch(`${server()}/api/agent/jobs`, { headers: hdr(), signal: AbortSignal.timeout(10000) });
  if (res.status === 401) throw new Error('Agent kaliti noto\'g\'ri');
  if (!res.ok) throw new Error(`Server javobi: ${res.status}`);
  state.connected = true; state.error = '';
  for (const job of await res.json()) {
    const printer = job.printer || cfg.printer;
    try {
      if (!printer) throw new Error('Printer tanlanmagan');
      await printRaw(printer, Buffer.from(job.data, 'base64'));
      state.printed++; log(`${job.summary} → ${printer}`);
      await ack(job.id, true);
    } catch (e) {
      log(`${job.summary}: ${e.message}`, false);
      await ack(job.id, false, e.message).catch(() => {});
    }
  }
}

let lastReport = 0;
async function reportPrinters(force) {
  if (!state.connected || (!force && Date.now() - lastReport < 30000)) return;
  lastReport = Date.now();
  state.printers = await listPrinters();
  await fetch(`${server()}/api/agent/printers`, { method: 'POST', headers: hdr(), body: JSON.stringify({ printers: state.printers, selected: cfg.printer, host: os.hostname() }), signal: AbortSignal.timeout(10000) }).catch(() => {});
}

(async function loop() {
  for (;;) {
    try { await tick(); await reportPrinters(); } catch (e) { state.connected = false; state.error = e.message; }
    await new Promise((r) => setTimeout(r, 2000));
  }
})();

// ---- Mahalliy sozlash oynasi (faqat shu kompyuterdan) ----
const types = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript' };
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } }); });

http.createServer(async (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') { res.writeHead(403); return res.end(); } // DNS-rebinding himoyasi
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/state' && req.method === 'GET') return json(res, 200, { ...state, config: { serverUrl: cfg.serverUrl, printer: cfg.printer, hasKey: !!cfg.agentKey }, host: os.hostname(), isWin });
  if (req.method === 'POST') {
    if (!String(req.headers['content-type']).includes('application/json')) { res.writeHead(415); return res.end(); }
    const b = await readBody(req);
    if (p === '/config') {
      if (typeof b.serverUrl === 'string') cfg.serverUrl = b.serverUrl.trim();
      if (b.agentKey) cfg.agentKey = String(b.agentKey).trim();
      if (typeof b.printer === 'string') cfg.printer = b.printer;
      saveCfg(); lastReport = 0; return json(res, 200, { ok: true });
    }
    if (p === '/refresh') { state.printers = await listPrinters(); await reportPrinters(true); return json(res, 200, { printers: state.printers }); }
    if (p === '/test') {
      try {
        if (!cfg.printer) throw new Error('Avval printerni tanlang');
        const { tsplLabel } = await import('../server/labels.js');
        const buf = tsplLabel([{ product: { name: 'TEST CHOP', price: 12345, barcode: '1234567890' }, copies: 1 }], { w: 40, h: 30 });
        await printRaw(cfg.printer, buf); log(`Sinov etiketkasi → ${cfg.printer}`);
        return json(res, 200, { ok: true });
      } catch (e) { log(`Sinov: ${e.message}`, false); return json(res, 500, { error: e.message }); }
    }
    return json(res, 404, {});
  }
  const f = path.join(dir, 'ui', p === '/' ? 'index.html' : p.slice(1));
  if (!f.startsWith(path.join(dir, 'ui')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(UI_PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${UI_PORT}`;
  console.log(`Agent ishga tushdi. Oyna: ${url}`);
  if (isWin && !process.env.NO_OPEN) spawn('cmd', ['/c', 'start', '', 'msedge', `--app=${url}`], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
});
