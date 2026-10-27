import test from 'node:test';
import assert from 'node:assert/strict';
import { channels, pack, PixelArt, readProject } from '../src/paint-core.js';
import { BEAD_PALETTE } from '../src/bead-palette.js';
import { convertToBeads, nearestBead, summarizeBeads, beadCsv } from '../src/bead-core.js';

const bead = code => BEAD_PALETTE.find(entry => entry.code === code);
const rgba = colors => Uint8ClampedArray.from(colors.flatMap(channels));
const full = { maxColors: 221, merge: 'off', shading: 'rich', cleanup: 0 };

test('the provided chart has 221 distinct codes and its printed HEX values are used', () => {
  assert.equal(BEAD_PALETTE.length, 221);
  assert.equal(new Set(BEAD_PALETTE.map(entry => entry.code)).size, 221);
  assert.equal(bead('A2').hex, '#ffffd5');assert.equal(bead('C4').hex, '#41ccff');
  assert.equal(bead('B32').hex, '#9cab5a');assert.equal(bead('H7').color, pack(0, 0, 0));
  const colors = BEAD_PALETTE.map(entry => entry.color);
  const result = convertToBeads(rgba(colors), 221, 1, { ...full, regions: [{ x: 0, y: 0, width: 1, height: 1 }] });
  assert.deepEqual(Array.from(result.pixels), colors);
});

test('transparent cells stay empty and partially opaque cells become physical opaque bead colors', () => {
  const result = convertToBeads(rgba([pack(255, 0, 0, 0), pack(0, 0, 0, 127), pack(0, 0, 0, 128), pack(0, 0, 0)]), 4, 1, full);
  assert.equal(result.pixels[0], 0);assert.equal(result.pixels[1], 0);
  assert.equal(result.pixels[2] & 255, 255);assert.equal(result.pixels[3], bead('H7').color);
  assert.equal(result.total, 2);assert.equal(result.unmatched, 0);
});

test('the color budget is obeyed and merging reduces similar shades while retaining dark outlines', () => {
  const colors = ['H2', 'H1', 'H9', 'H10', 'H7'].flatMap(code => Array(12).fill(bead(code).color));
  const original = rgba(colors), saved = original.slice();
  const unmerged = convertToBeads(original, 12, 5, full);
  const merged = convertToBeads(original, 12, 5, { ...full, merge: 'strong' });
  assert.ok(merged.used.length < unmerged.used.length);
  assert.ok(merged.used.some(entry => entry.code === 'H7'));
  const limited = convertToBeads(original, 12, 5, { ...full, maxColors: 2 });
  assert.ok(limited.used.length <= 2);assert.equal(limited.unmatched, 0);
  assert.deepEqual(original, saved);
});

test('low contrast isolated specks are cleaned while a protected pixel survives', () => {
  const colors = Array(49).fill(bead('C4').color);colors[24] = bead('C24').color;
  const data = rgba(colors), options = { ...full, cleanup: 1, preserveDetails: false };
  assert.equal(convertToBeads(data, 7, 7, full).pixels[24], bead('C24').color);
  assert.equal(convertToBeads(data, 7, 7, options).pixels[24], bead('C4').color);
  const protectedResult = convertToBeads(data, 7, 7, { ...options, regions: [{ x: 3 / 7, y: 3 / 7, width: 1 / 7, height: 1 / 7 }] });
  assert.equal(protectedResult.pixels[24], bead('C24').color);
});

test('small contrasting eye highlights, green irises, and hair outlines survive default cleanup', () => {
  const colors = Array(81).fill(bead('D11').color);
  for (const index of [10, 11, 12, 13, 14, 15, 16, 19, 25, 28, 34]) colors[index] = bead('H7').color;
  colors[30] = bead('B4').color;colors[32] = bead('B4').color;
  colors[31] = bead('H2').color;
  const result = convertToBeads(rgba(colors), 9, 9, { ...full, maxColors: 4, cleanup: 2 });
  assert.equal(result.pixels[30], bead('B4').color);assert.equal(result.pixels[31], bead('H2').color);
  assert.equal(result.pixels[19], bead('H7').color);
});

test('bead counts and CSV match edited pixels, including opaque black and transparent blanks', () => {
  const colors = [bead('C4').color, bead('H7').color, 0, bead('C4').color];
  const result = summarizeBeads(colors);assert.equal(result.total, 3);assert.equal(result.unmatched, 0);
  assert.equal(result.used.find(entry => entry.code === 'C4').count, 2);
  const csv = beadCsv(colors);assert.ok(csv.includes('C4,#41ccff,2'));assert.ok(csv.includes('H7,#000000,1'));assert.ok(csv.includes('总计,,3'));
  assert.throws(() => beadCsv([pack(12, 34, 56)]));
  assert.equal(nearestBead(pack(65, 204, 255)).code, 'C4');
});

test('conversion is deterministic, empty inputs work, and invalid dimensions are rejected', () => {
  const data = new Uint8ClampedArray(24 * 24 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([i % 251, i * 7 % 253, i * 11 % 255, 255], i);
  const options = { maxColors: 12, merge: 'normal', shading: 'balanced', cleanup: 1 };
  const first = convertToBeads(data, 24, 24, options), second = convertToBeads(data, 24, 24, options);
  assert.deepEqual(first.pixels, second.pixels);assert.ok(first.used.length <= 12);
  assert.equal(convertToBeads(new Uint8ClampedArray(16), 2, 2).total, 0);
  assert.doesNotThrow(() => convertToBeads(data, 24, 24, { ...options, regions: [{ x: 2, y: -3, width: .5, height: .1 }] }));
  assert.throws(() => convertToBeads(data, 257, 24));assert.throws(() => convertToBeads(data, 24, 24, { maxColors: 0 }));
});

test('a converted drawing can be undone and exported through the existing editable project format', () => {
  const art = new PixelArt(7, 7), original = pack(12, 34, 56);art.pixels.fill(original);
  const result = convertToBeads(art.rgba(), 7, 7);
  art.replace(7, 7, result.pixels);assert.equal(summarizeBeads(art.pixels).unmatched, 0);
  const loaded = readProject(JSON.parse(JSON.stringify(art.project())));assert.deepEqual(loaded.pixels, art.pixels);
  assert.equal(art.undo(), true);assert.ok(art.pixels.every(color => color === original));
});
