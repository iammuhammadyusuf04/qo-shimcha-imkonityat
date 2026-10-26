import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.API_KEY = 'k1'; process.env.AGENT_KEY = 'k2'; process.env.RUN_SERVER = '';
const { server } = await import('../server/index.js');
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const call = (p, o = {}, key = 'k1') => fetch(base + p, { ...o, headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: o.body && JSON.stringify(o.body) }).then(async (r) => ({ s: r.status, j: await r.json() }));

test('auth', async () => assert.equal((await call('/api/products', {}, 'bad')).s, 401));
test('tovar -> chop -> agent', async () => {
  const p = await call('/api/products', { method: 'POST', body: { name: 'Choy', price: 12000, barcode: '123' } });
  assert.equal(p.s, 201); assert.equal(p.j.sync.pos.state, 'skipped');
  const pr = await call('/api/print', { method: 'POST', body: { items: [{ productId: p.j.id, copies: 2 }] } });
  assert.equal(pr.s, 202);
  const jobs = await call('/api/agent/jobs', {}, 'k2');
  const job = jobs.j.find((j) => j.id === pr.j.id);
  assert.match(Buffer.from(job.data, 'base64').toString(), /PRINT 2,1/);
  assert.equal((await call(`/api/agent/jobs/${job.id}/done`, { method: 'POST', body: {} }, 'k2')).s, 200);
  assert.equal((await call('/api/status')).j.agentOnline, true);
  await call(`/api/products/${p.j.id}`, { method: 'DELETE' });
});
test.after(() => server.close());
