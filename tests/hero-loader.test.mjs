import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHeroImages } from '../src/hero-loader.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('combined progress follows received bytes and completes only after both images decode', async () => {
  const streams = new Map();
  const decoders = [];
  const images = [900, 300].map((bytes, index) => ({
    dataset: { src: `image-${index}`, bytes: String(bytes) },
    decode: () => new Promise(resolve => { decoders[index] = resolve; })
  }));
  const progress = [];
  const revoked = [];
  const blobs = [];
  const loading = loadHeroImages(images, value => progress.push(value), {
    request: async url => new Response(new ReadableStream({ start(controller) { streams.set(url, controller); } }), {
      headers: { 'Content-Length': images.find(image => image.dataset.src === url).dataset.bytes, 'Content-Type': 'image/webp' }
    }),
    urls: { createObjectURL(blob) { blobs.push(blob);return `blob:${blobs.length}`; }, revokeObjectURL(url) { revoked.push(url); } }
  });
  await tick();
  streams.get('image-1').enqueue(new Uint8Array(300));streams.get('image-1').close();
  await tick();
  assert.equal(progress.at(-1), 25);
  assert.equal(images[0].src, undefined);
  streams.get('image-0').enqueue(new Uint8Array(450));
  await tick();
  assert.equal(progress.at(-1), 62.5);
  streams.get('image-0').enqueue(new Uint8Array(450));streams.get('image-0').close();
  await tick();
  assert.equal(progress.at(-1), 99);
  assert.deepEqual(blobs.map(blob => blob.size), [900, 300]);
  decoders[0]();await tick();
  assert.equal(progress.at(-1), 99);
  decoders[1]();await loading;
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.every((value, i) => !i || value >= progress[i - 1]));
  assert.deepEqual(revoked, ['blob:1', 'blob:2']);
});

test('a failed download cancels its sibling without declaring the artwork ready', async () => {
  const signals = [];
  const progress = [];
  const images = ['failed', 'pending'].map(src => ({ dataset: { src, bytes: '10' }, decode() { throw new Error('Must not decode'); } }));
  await assert.rejects(loadHeroImages(images, value => progress.push(value), {
    request: async (url, { signal }) => {
      signals.push(signal);
      if (url === 'failed') return new Response(null, { status: 503 });
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }
  }), /503/);
  assert.ok(signals.every(signal => signal.aborted));
  assert.ok(!progress.includes(100));
  assert.ok(images.every(image => !image.src));
});

test('invalid image data cannot complete loading and temporary URLs are released', async () => {
  const revoked = [];
  const progress = [];
  const image = { dataset: { src: 'invalid.webp', bytes: '1' }, decode: async () => { throw new Error('Decode failed'); } };
  await assert.rejects(loadHeroImages([image], value => progress.push(value), {
    request: async () => new Response(new Uint8Array([1])),
    urls: { createObjectURL: () => 'blob:invalid', revokeObjectURL: url => revoked.push(url) }
  }), /Decode failed/);
  assert.ok(!progress.includes(100));
  assert.deepEqual(revoked, ['blob:invalid']);
});
