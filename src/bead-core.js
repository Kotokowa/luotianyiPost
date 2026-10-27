import { MAX_SIZE, pack, channels } from './paint-core.js';
import { BEAD_PALETTE } from './bead-palette.js';

const srgb = Float64Array.from({ length: 256 }, (_, i) => i / 255 <= .04045 ? i / 255 / 12.92 : ((i / 255 + .055) / 1.055) ** 2.4);

export function oklab(r, g, b) {
  const R = srgb[Math.round(r)], G = srgb[Math.round(g)], B = srgb[Math.round(b)];
  const l = Math.cbrt(.4122214708 * R + .5363325363 * G + .0514459929 * B);
  const m = Math.cbrt(.2119034982 * R + .6806995451 * G + .1073969566 * B);
  const s = Math.cbrt(.0883024619 * R + .2817188376 * G + .6299787005 * B);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}

export function colorDistance(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

const paletteLab = BEAD_PALETTE.map(entry => oklab(...channels(entry.color).slice(0, 3)));
const paletteByColor = new Map(BEAD_PALETTE.map((entry, index) => [entry.color, index]));
const paletteDistances = paletteLab.map(a => Float64Array.from(paletteLab, b => colorDistance(a, b)));

function closest(lab, candidates) {
  let best = candidates[0], distance = Infinity;
  for (const index of candidates) {
    const current = colorDistance(lab, paletteLab[index]);
    if (current < distance) { distance = current;best = index; }
  }
  return best;
}

const allColors = BEAD_PALETTE.map((_, index) => index);
export function nearestBead(color) {
  const exact = paletteByColor.get(color);
  return BEAD_PALETTE[exact ?? closest(oklab(...channels(color).slice(0, 3)), allColors)];
}

function neighbors(index, width, height) {
  const x = index % width, y = Math.floor(index / width), list = [];
  if (x > 0) list.push(index - 1);
  if (x < width - 1) list.push(index + 1);
  if (y > 0) list.push(index - width);
  if (y < height - 1) list.push(index + width);
  return list;
}

function protectionMask(width, height, regions) {
  const mask = new Uint8Array(width * height);
  for (const region of regions || []) {
    if (![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.width <= 0 || region.height <= 0) continue;
    const x0 = Math.min(width, Math.max(0, Math.floor(region.x * width))), y0 = Math.min(height, Math.max(0, Math.floor(region.y * height)));
    const x1 = Math.max(0, Math.min(width, Math.ceil((region.x + region.width) * width))), y1 = Math.max(0, Math.min(height, Math.ceil((region.y + region.height) * height)));
    if (x1 <= x0 || y1 <= y0) continue;
    for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1);
  }
  return mask;
}

function choosePalette(histogram, limit, threshold) {
  const available = histogram.map((entry, index) => ({ ...entry, index })).filter(entry => entry.count > 0);
  if (available.length <= limit && threshold === 0) return available.map(entry => entry.index);
  const weights = available.map(entry => entry.count ** .55 * (1 + entry.detail / entry.count * 3 + entry.protected / entry.count * 10));
  const selected = [available[weights.indexOf(Math.max(...weights))].index];
  const protectedBudget = Math.min(limit, selected.length + Math.max(1, Math.round(limit / 4)));
  while (selected.length < protectedBudget) {
    let best = -1, priority = 0;
    for (const entry of available) {
      if (!entry.protected || selected.includes(entry.index)) continue;
      const distance = Math.min(...selected.map(index => paletteDistances[entry.index][index]));
      if (distance < .025 ** 2) continue;
      const score = distance * entry.protected ** .15;
      if (score > priority) { priority = score;best = entry.index; }
    }
    if (best < 0) break;
    selected.push(best);
  }
  const distances = available.map(entry => Math.min(...selected.map(index => paletteDistances[entry.index][index])));
  while (selected.length < limit) {
    let best = -1, gain = 0;
    for (const candidate of available) {
      if (selected.includes(candidate.index)) continue;
      if (Math.min(...selected.map(index => paletteDistances[candidate.index][index])) < threshold ** 2) continue;
      let improvement = 0;
      for (let i = 0; i < available.length; i++) improvement += weights[i] * Math.max(0, distances[i] - paletteDistances[candidate.index][available[i].index]);
      if (improvement > gain) { gain = improvement;best = candidate.index; }
    }
    if (best < 0) break;
    selected.push(best);
    for (let i = 0; i < available.length; i++) distances[i] = Math.min(distances[i], paletteDistances[available[i].index][best]);
  }
  return selected;
}

export function convertToBeads(data, width, height, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE || data.length !== width * height * 4) throw new Error('拼豆图纸宽高必须是 1～256 的整数。');
  const limit = Number(options.maxColors ?? 24);
  if (!Number.isInteger(limit) || limit < 2 || limit > BEAD_PALETTE.length) throw new Error('最大颜色数必须是 2～221 的整数。');
  const shading = ['flat', 'balanced', 'rich'].includes(options.shading) ? options.shading : 'balanced';
  const cleanup = Math.max(0, Math.min(2, Math.floor(Number(options.cleanup) || 0)));
  const preserveDetails = options.preserveDetails !== false;
  const protectedMask = protectionMask(width, height, options.regions);
  const total = width * height, pixels = new Uint32Array(total), labs = new Array(total);
  for (let index = 0; index < total; index++) {
    const at = index * 4, alpha = data[at + 3];
    if (alpha < 128) continue;
    const rgb = [0, 1, 2].map(channel => Math.round(data[at + channel] * alpha / 255 + 255 - alpha));
    labs[index] = oklab(...rgb);
  }
  const contrast = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    if (!labs[i]) continue;
    for (const next of neighbors(i, width, height)) if (labs[next]) contrast[i] = Math.max(contrast[i], Math.sqrt(colorDistance(labs[i], labs[next])));
  }
  const working = labs.slice();
  const smoothing = shading === 'flat' ? .09 : shading === 'balanced' ? .05 : .025;
  for (let i = 0; i < total; i++) {
    if (!labs[i] || protectedMask[i] || preserveDetails && contrast[i] > .12) continue;
    let weight = 2;const sum = labs[i].map(value => value * weight);
    for (const next of neighbors(i, width, height)) {
      if (!labs[next] || protectedMask[next]) continue;
      const distance = colorDistance(labs[i], labs[next]);
      if (distance > smoothing ** 2 * 4) continue;
      const amount = Math.exp(-distance / (smoothing ** 2));
      weight += amount;for (let axis = 0; axis < 3; axis++) sum[axis] += labs[next][axis] * amount;
    }
    working[i] = sum.map(value => value / weight);
  }
  const histogram = BEAD_PALETTE.map(() => ({ count: 0, detail: 0, protected: 0 }));
  for (let i = 0; i < total; i++) {
    if (!working[i]) continue;
    const index = closest(working[i], allColors), entry = histogram[index];
    entry.count++;entry.detail += preserveDetails ? Math.min(1, contrast[i] / .18) : 0;entry.protected += protectedMask[i];
  }
  if (!histogram.some(entry => entry.count)) return { pixels, used: [], total: 0, unmatched: 0 };
  const threshold = options.merge === 'off' ? 0 : options.merge === 'strong' ? .07 : .035;
  const selected = choosePalette(histogram, limit, threshold);
  const indices = new Int16Array(total).fill(-1);
  for (let i = 0; i < total; i++) if (working[i]) indices[i] = closest(working[i], selected);
  if (cleanup) {
    const visited = new Uint8Array(total), cleaned = indices.slice();
    for (let start = 0; start < total; start++) {
      if (visited[start] || indices[start] < 0) continue;
      const component = [start];visited[start] = 1;
      for (let head = 0; head < component.length; head++) for (const next of neighbors(component[head], width, height)) {
        if (!visited[next] && indices[next] === indices[start]) { visited[next] = 1;component.push(next); }
      }
      if (component.length > cleanup || component.some(index => protectedMask[index] || preserveDetails && contrast[index] > .12)) continue;
      const border = new Map();
      for (const index of component) for (const next of neighbors(index, width, height)) {
        if (indices[next] >= 0 && indices[next] !== indices[start]) border.set(indices[next], (border.get(indices[next]) || 0) + 1);
      }
      const choices = [...border].sort((a, b) => b[1] - a[1]);
      if (!choices.length || choices[0][1] < 2) continue;
      const replacement = choices[0][0];
      if (component.some(index => colorDistance(labs[index], paletteLab[replacement]) > .09 ** 2)) continue;
      for (const index of component) cleaned[index] = replacement;
    }
    indices.set(cleaned);
  }
  for (let i = 0; i < total; i++) if (indices[i] >= 0) pixels[i] = BEAD_PALETTE[indices[i]].color;
  return { pixels, ...summarizeBeads(pixels) };
}

export function summarizeBeads(pixels) {
  const counts = new Uint32Array(BEAD_PALETTE.length);let total = 0, unmatched = 0;
  for (const color of pixels) {
    if (!(color & 255)) continue;
    total++;
    const index = paletteByColor.get(color);
    if (index === undefined) unmatched++;else counts[index]++;
  }
  return { total, unmatched, used: BEAD_PALETTE.flatMap((entry, index) => counts[index] ? [{ ...entry, count: counts[index] }] : []) };
}

export function beadCsv(pixels) {
  const summary = summarizeBeads(pixels);
  if (summary.unmatched) throw new Error('存在未匹配色卡的颜色，请先转换当前画稿。');
  return '\ufeff色号,HEX,颗数\r\n' + summary.used.map(entry => `${entry.code},${entry.hex},${entry.count}`).join('\r\n') + `\r\n总计,,${summary.total}\r\n`;
}
