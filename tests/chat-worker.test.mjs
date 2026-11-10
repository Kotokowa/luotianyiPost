import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

function database() {
  const rows = new Map();
  const calls = [];
  return {
    rows, calls,
    prepare(sql) {
      calls.push(sql);
      let values;
      return {
        bind(...parameters) { values = parameters;return this; },
        async run() {
          const [id, name, text, time] = values;
          if (!rows.has(id)) rows.set(id, { id, name, text, time });
          return { success: true };
        },
        async first() { return rows.get(values[0]) || null; },
        async all() { return { results: [...rows.values()].sort((first, second) => second.time - first.time || second.id.localeCompare(first.id)).slice(0, 150) }; }
      };
    }
  };
}

function request(method, body, origin = 'https://luoty.vip') {
  return new Request('https://chat.example/messages', { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

test('cloud messages are parameterized, timestamped by the server, and idempotent on retry', async () => {
  const env = { DB: database(), ALLOWED_ORIGINS: 'https://luoty.vip' };
  const message = { id: '9f989244-cd76-4bcb-91ed-b18cf28bd6c1', name: ' 小云 ', text: " 小想法'); DROP TABLE messages; -- ", time: 1, client: 'private-id' };
  const response = await worker.fetch(request('POST', message), env);
  assert.equal(response.status, 200);
  const created = (await response.json()).message;
  assert.equal(created.name, '小云');
  assert.equal(created.text, message.text.trim());
  assert.ok(created.time > 1);
  assert.equal('client' in created, false);
  const retry = await worker.fetch(request('POST', message), env);
  assert.deepEqual((await retry.json()).message, created);
  assert.equal(env.DB.rows.size, 1);
  assert.ok(env.DB.calls.every(sql => !sql.includes(message.text.trim())));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://luoty.vip');
});

test('cloud listing is bounded and chronological without deleting older history', async () => {
  const env = { DB: database(), ALLOWED_ORIGINS: 'https://luoty.vip' };
  for (let index = 0; index < 160; index++) env.DB.rows.set(String(index), { id: String(index), name: '云', text: '想法', time: index });
  const response = await worker.fetch(request('GET'), env);
  const { messages } = await response.json();
  assert.equal(messages.length, 150);
  assert.equal(messages[0].time, 10);
  assert.equal(messages[149].time, 159);
  assert.equal(env.DB.rows.size, 160);
});

test('invalid payloads and unsupported origins cannot write to D1', async () => {
  const env = { DB: database(), ALLOWED_ORIGINS: 'https://luoty.vip' };
  for (const payload of [null, {}, { id: 'bad', name: '云', text: '想法' }, { id: 'valid-id-12345678', name: '云', text: ' ' }, { id: 'valid-id-12345678', name: '云', text: '想'.repeat(501) }]) {
    assert.equal((await worker.fetch(request('POST', payload), env)).status, 400);
  }
  assert.equal((await worker.fetch(request('POST', { id: 'valid-id-12345678', name: '云', text: '想法' }, 'https://other.example'), env)).status, 403);
  assert.equal(env.DB.calls.length, 0);
  const preflight = await worker.fetch(request('OPTIONS'), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
});

test('database failure returns an error rather than a false successful send', async () => {
  const env = { DB: { prepare() { throw new Error('Daily quota exhausted'); } }, ALLOWED_ORIGINS: 'https://luoty.vip' };
  assert.equal((await worker.fetch(request('GET'), env)).status, 503);
});
