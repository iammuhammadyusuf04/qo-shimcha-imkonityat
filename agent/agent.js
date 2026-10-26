// Kompyuterda (Windows) ishlaydi: serverdan print-vazifalarni oladi va printerga yuboradi.
// Ishga tushirish: SERVER_URL=https://... AGENT_KEY=... PRINTER_NAME="XP-365B" node agent/agent.js
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = (process.env.SERVER_URL || 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.AGENT_KEY || '';
const DEFAULT_PRINTER = process.env.PRINTER_NAME || '';
const ps1 = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rawprint.ps1');
const headers = { 'x-api-key': KEY, 'content-type': 'application/json' };

function printRaw(printer, buf) {
  const tmp = path.join(os.tmpdir(), `job-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(tmp, buf);
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Printer', printer, '-File', tmp];
    const p = spawn('powershell.exe', args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => { fs.rmSync(tmp, { force: true }); code === 0 ? resolve() : reject(new Error(err.trim() || `exit ${code}`)); });
  });
}

const ack = (id, ok, error) =>
  fetch(`${SERVER}/api/agent/jobs/${id}/${ok ? 'done' : 'failed'}`, { method: 'POST', headers, body: JSON.stringify({ error }) });

async function tick() {
  const res = await fetch(`${SERVER}/api/agent/jobs`, { headers, signal: AbortSignal.timeout(10000) });
  if (res.status === 401) throw new Error('AGENT_KEY noto\'g\'ri');
  if (!res.ok) throw new Error(`Server ${res.status}`);
  for (const job of await res.json()) {
    try {
      await printRaw(job.printer || DEFAULT_PRINTER, Buffer.from(job.data, 'base64'));
      await ack(job.id, true);
      console.log('Chop etildi:', job.summary);
    } catch (e) {
      console.error('Xato:', e.message);
      await ack(job.id, false, e.message);
    }
  }
}

if (!KEY) { console.error('AGENT_KEY kerak'); process.exit(1); }
console.log(`Agent ishga tushdi → ${SERVER}`);
(async function loop() {
  for (;;) {
    try { await tick(); } catch (e) { console.error(e.message); }
    await new Promise((r) => setTimeout(r, 2000));
  }
})();
