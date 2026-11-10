import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_MIRRORS, imageSources, mirrorFor, raceImageSources } from '../src/image-sources.js';

const source = './assets/hero-tianyi.webp';
const tick = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

test('all nine mirror mappings retain the original path and accept PNG or WebP names', () => {
  assert.equal(Object.keys(IMAGE_MIRRORS).length, 9);
  assert.equal(IMAGE_MIRRORS['tianyi-paint'], 'https://bee-reg-ab.imagency.cn/mr/202611/10/6af2bcad98ea7.png');
  assert.equal(mirrorFor('./assets/tianyi-paint.png'), mirrorFor('https://luoty.vip/assets/tianyi-paint.webp'));
  assert.deepEqual(imageSources(source), [source, IMAGE_MIRRORS['hero-tianyi']]);
  assert.equal(mirrorFor('./unrelated.png'), undefined);
});

test('fast primary images never request the backup', async () => {
  const calls = [];
  assert.equal(await raceImageSources(source, async candidate => { calls.push(candidate);return candidate; }, { delay: 5 }), source);
  await tick(10);
  assert.deepEqual(calls, [source]);
});

test('slow primary starts a backup after the deadline and cancels the losing attempt', async () => {
  const calls = [], signals = [];
  const result = await raceImageSources(source, async (candidate, signal) => {
    calls.push(candidate);signals.push(signal);
    if (candidate !== source) return candidate;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  }, { delay: 5 });
  assert.equal(result, IMAGE_MIRRORS['hero-tianyi']);
  assert.equal(calls.length, 2);
  assert.ok(signals.every(signal => signal.aborted));
});

test('primary errors trigger backup immediately without waiting two seconds', async () => {
  const calls = [];
  const result = await raceImageSources(source, async candidate => {
    calls.push(candidate);
    if (candidate === source) throw new Error('404');
    return 'backup';
  });
  assert.equal(result, 'backup');assert.equal(calls.length, 2);
});

test('a failing backup does not discard a still-loading primary', async () => {
  const result = await raceImageSources(source, async candidate => {
    if (candidate !== source) throw new Error('backup down');
    await tick(20);return 'primary eventually succeeds';
  }, { delay: 5 });
  assert.equal(result, 'primary eventually succeeds');
});

test('both failures terminate without retry loops and hanging images have a hard deadline', async () => {
  let calls = 0;
  await assert.rejects(raceImageSources(source, async () => { calls++;throw new Error('down'); }), /down/);
  assert.equal(calls, 2);
  await assert.rejects(raceImageSources(source, () => new Promise(() => {}), { delay: 2, timeout: 10 }), /timed out/);
});

test('caller cancellation stops pending image attempts', async () => {
  const controller = new AbortController();
  const pending = raceImageSources(source, () => new Promise(() => {}), { signal: controller.signal });
  controller.abort(new Error('page closed'));
  await assert.rejects(pending, /page closed/);
});

test('mainland country result is shared and only caches country, never the IP', async () => {
  const routing = await import('../src/image-sources.js?region-cn');
  const cached = new Map();
  let calls = 0;
  const options = {
    storage: { getItem: key => cached.get(key), setItem: (key, value) => cached.set(key, value) },
    request: async () => { calls++;return Response.json({ ip: '198.51.100.7', country: 'CN' }); }
  };
  await Promise.all([routing.checkImageRegion(options), routing.checkImageRegion(options)]);
  assert.equal(calls, 1);
  assert.equal(routing.imageSources(source)[0], IMAGE_MIRRORS['hero-tianyi']);
  const saved = [...cached.values()][0];
  assert.equal(saved.includes('198.51.100.7'), false);
  assert.equal(JSON.parse(saved).country, 'CN');
});

test('slow country lookup times out and late results cannot change routing', async () => {
  const routing = await import('../src/image-sources.js?region-slow');
  let reply, aborted = false;
  const result = await routing.checkImageRegion({
    timeout: 5, storage: {},
    request: (url, { signal }) => { signal.addEventListener('abort', () => { aborted = true; });return new Promise(resolve => { reply = resolve; }); }
  });
  assert.equal(result, null);assert.equal(aborted, true);
  reply(Response.json({ country: 'CN' }));await tick(5);
  assert.equal(routing.imageSources(source)[0], source);
});

test('valid cached mainland routing needs no IP request', async () => {
  const routing = await import('../src/image-sources.js?region-cached');
  assert.equal(await routing.checkImageRegion({ storage: { getItem: () => JSON.stringify({ country: 'CN', time: Date.now() }) }, request: () => { throw new Error('Must not request'); } }), 'CN');
  assert.equal(routing.imageSources(source)[0], IMAGE_MIRRORS['hero-tianyi']);
});

test('non-mainland country lookup keeps the original source first', async () => {
  const routing = await import('../src/image-sources.js?region-us');
  assert.equal(await routing.checkImageRegion({ storage: {}, request: async () => Response.json({ country: 'US' }) }), 'US');
  assert.equal(routing.imageSources(source)[0], source);
});
