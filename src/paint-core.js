export const MAX_SIZE = 256;

export function pack(r, g, b, a = 255) {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

export function channels(color) {
  return [color >>> 24, (color >>> 16) & 255, (color >>> 8) & 255, color & 255];
}

export function colorHex(color) {
  return '#' + channels(color).slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('');
}

export function parseColor(text) {
  const value = text.trim();
  if (/^#[\da-f]{3}$/i.test(value)) return parseColor('#' + [...value.slice(1)].map(c => c + c).join(''));
  if (/^#[\da-f]{6}$/i.test(value)) return pack(...[1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)));
  const match = value.match(/^(?:(?:s?rgb)\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)?$/i);
  if (match && match.slice(1).every(part => +part <= 255)) return pack(...match.slice(1).map(Number));
  return null;
}

export function hsvColor(hue, saturation, value) {
  const c = value * saturation, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = value - c;
  const rgb = hue < 60 ? [c,x,0] : hue < 120 ? [x,c,0] : hue < 180 ? [0,c,x] : hue < 240 ? [0,x,c] : hue < 300 ? [x,0,c] : [c,0,x];
  return pack(...rgb.map(channel => Math.round((channel + m) * 255)));
}

export function colorHSV(color) {
  const rgb = channels(color).slice(0,3).map(channel => channel / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
  let hue = 0;
  if (delta) hue = max === rgb[0] ? 60 * (((rgb[1] - rgb[2]) / delta) % 6) : max === rgb[1] ? 60 * ((rgb[2] - rgb[0]) / delta + 2) : 60 * ((rgb[0] - rgb[1]) / delta + 4);
  return [(hue + 360) % 360, max ? delta / max : 0, max];
}

export class PixelArt {
  constructor(width = 32, height = 32) {
    this.width = width;this.height = height;
    this.pixels = new Uint32Array(width * height);
    this.past = [];this.future = [];this.before = null;
  }
  snapshot() { return { width: this.width, height: this.height, pixels: this.pixels.slice() }; }
  restore(state) { this.width = state.width;this.height = state.height;this.pixels = Uint32Array.from(state.pixels); }
  begin() { if (!this.before) this.before = this.snapshot(); }
  commit() {
    if (!this.before) return false;
    const before = this.before;this.before = null;
    const changed = before.width !== this.width || before.height !== this.height || before.pixels.some((pixel, i) => pixel !== this.pixels[i]);
    if (!changed) return false;
    this.past.push(before);if (this.past.length > 40) this.past.shift();this.future = [];
    return true;
  }
  undo() {
    if (!this.past.length) return false;
    this.future.push(this.snapshot());this.restore(this.past.pop());return true;
  }
  redo() {
    if (!this.future.length) return false;
    this.past.push(this.snapshot());this.restore(this.future.pop());return true;
  }
  replace(width, height, pixels = null) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE || (pixels && pixels.length !== width * height)) throw new Error('画布边长可以是 1～256 格哦～');
    pixels ||= new Uint32Array(width * height);
    this.begin();this.restore({ width, height, pixels });return this.commit();
  }
  point(x, y, color, size = 1) {
    const start = Math.floor((size - 1) / 2);
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const px = x + dx - start, py = y + dy - start;
      if (px >= 0 && py >= 0 && px < this.width && py < this.height) this.pixels[py * this.width + px] = color;
    }
  }
  line(x0, y0, x1, y1, color, size = 1) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.point(x0, y0, color, size);
      if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy;x0 += sx; }
      if (twice <= dx) { error += dx;y0 += sy; }
    }
  }
  fill(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const target = this.pixels[y * this.width + x];if (target === color) return;
    const queue = [y * this.width + x];this.pixels[queue[0]] = color;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head], px = index % this.width, py = Math.floor(index / this.width);
      for (const next of [px > 0 ? index - 1 : -1, px < this.width - 1 ? index + 1 : -1, py > 0 ? index - this.width : -1, py < this.height - 1 ? index + this.width : -1]) {
        if (next >= 0 && this.pixels[next] === target) { this.pixels[next] = color;queue.push(next); }
      }
    }
  }
  rgba() {
    const data = new Uint8ClampedArray(this.pixels.length * 4);
    for (let i=0;i<this.pixels.length;i++) {
      const color=this.pixels[i],at=i*4;
      data[at]=color>>>24;data[at+1]=(color>>>16)&255;data[at+2]=(color>>>8)&255;data[at+3]=color&255;
    }
    return data;
  }
  project() { return { format: 'luoty-pixel', version: 1, width: this.width, height: this.height, pixels: Array.from(this.pixels) }; }
}

export function readProject(value) {
  if (!value || value.format !== 'luoty-pixel' || value.version !== 1 || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || value.width > MAX_SIZE || value.height > MAX_SIZE || !Array.isArray(value.pixels) || value.pixels.length !== value.width * value.height || !value.pixels.every(pixel => Number.isInteger(pixel) && pixel >= 0 && pixel <= 0xffffffff)) throw new Error('这份画稿好像没装完整，换一份试试吧～');
  return { width: value.width, height: value.height, pixels: Uint32Array.from(value.pixels) };
}

export function detectGrid(data, width, height) {
  function axis(horizontal) {
    const length = horizontal ? width : height, other = horizontal ? height : width, edges = [];
    for (let at = 1; at < length; at++) {
      let changed = 0, total = 0;
      for (let cross = 0; cross < other; cross += Math.max(1, Math.floor(other / 100))) {
        const current = (horizontal ? cross * width + at : at * width + cross) * 4;
        const previous = current - (horizontal ? 4 : width * 4);
        if (Math.abs(data[current] - data[previous]) + Math.abs(data[current+1] - data[previous+1]) + Math.abs(data[current+2] - data[previous+2]) + Math.abs(data[current+3] - data[previous+3]) > 12) changed++;
        total++;
      }
      if (changed / total > .05) edges.push(at);
    }
    if (edges.length < 3) return 1;
    for (let scale = Math.min(32, Math.floor(length / 4)); scale >= 2; scale--) {
      const phases = new Uint32Array(scale);for (const edge of edges) phases[edge % scale]++;
      if (Math.max(...phases) / edges.length >= .96) return scale;
    }
    return 1;
  }
  const sx = axis(true), sy = axis(false);
  const scale = sx > 1 && sy > 1 ? Math.min(sx, sy) : Math.max(sx, sy);
  const colors = new Set();
  for (let i = 0; i < data.length && colors.size <= 256; i += 4) colors.add(pack(data[i],data[i+1],data[i+2],data[i+3]));
  const pixel = (scale > 1 || colors.size <= 256) && Math.ceil(width / scale) <= MAX_SIZE && Math.ceil(height / scale) <= MAX_SIZE;
  if (pixel) return { width: Math.ceil(width / scale), height: Math.ceil(height / scale), scale, pixel: true };
  const ratio = Math.min(1, 64 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), scale: 1, pixel: false };
}

export function quantize(data, count) {
  const histogram = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] === 0) continue;
    const key = (data[i] << 16) | (data[i+1] << 8) | data[i+2];
    const entry = histogram.get(key);
    if (entry) entry.weight++;else histogram.set(key, { rgb: [data[i],data[i+1],data[i+2]], weight: 1 });
  }
  if (!count || histogram.size <= count) return Uint32Array.from({ length: data.length / 4 }, (_, i) => data[i*4+3] ? pack(...data.slice(i*4,i*4+4)) : 0);
  const describe = entries => {
    const ranges = [0,1,2].map(axis => {
      let min=255,max=0;for (const entry of entries) { min=Math.min(min,entry.rgb[axis]);max=Math.max(max,entry.rgb[axis]); }return max-min;
    });
    return { entries, axis: ranges.indexOf(Math.max(...ranges)), priority: Math.max(...ranges) * Math.sqrt(entries.reduce((sum,entry)=>sum+entry.weight,0)) };
  };
  const boxes = [describe([...histogram.values()])];
  while (boxes.length < count) {
    boxes.sort((a,b)=>b.priority-a.priority);
    const index = boxes.findIndex(box=>box.entries.length>1);if (index < 0) break;
    const box = boxes.splice(index,1)[0];box.entries.sort((a,b)=>a.rgb[box.axis]-b.rgb[box.axis]);
    const total = box.entries.reduce((sum,entry)=>sum+entry.weight,0);let sum=0,split=0;
    while (split < box.entries.length-1 && sum < total/2) sum += box.entries[split++].weight;
    split = Math.max(1,Math.min(box.entries.length-1,split));
    boxes.push(describe(box.entries.slice(0,split)),describe(box.entries.slice(split)));
  }
  const lookup = new Map();
  for (const box of boxes) {
    const weight = box.entries.reduce((sum,entry)=>sum+entry.weight,0);
    const rgb = [0,1,2].map(axis=>Math.round(box.entries.reduce((sum,entry)=>sum+entry.rgb[axis]*entry.weight,0)/weight));
    for (const entry of box.entries) lookup.set((entry.rgb[0]<<16)|(entry.rgb[1]<<8)|entry.rgb[2],rgb);
  }
  return Uint32Array.from({ length: data.length/4 },(_,i)=>data[i*4+3] ? pack(...lookup.get((data[i*4]<<16)|(data[i*4+1]<<8)|data[i*4+2]),data[i*4+3]) : 0);
}
