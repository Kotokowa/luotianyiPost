import test from 'node:test';
import assert from 'node:assert/strict';
import { initBeadRoom } from '../src/bead-room.js';
import { BEAD_PALETTE_ID, BEAD_PALETTE } from '../src/bead-palette.js';
import { channels } from '../src/paint-core.js';

class Element {
  constructor() {
    this.children = [];this.style = {};this.dataset = {};this.attributes = new Map();this.events = new Map();this.value = '';this.checked = false;
    this.classList = { add() {}, remove() {} };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, handler) { this.events.set(name, handler); }
}

class Canvas extends Element {
  constructor() { super();this._width = 64;this._height = 64;this.frame = null; }
  get width() { return this._width; }
  set width(value) { this._width = value;this.frame = null; }
  get height() { return this._height; }
  set height(value) { this._height = value;this.frame = null; }
  getContext() { return { putImageData: image => { this.frame = Array.from(image.data); } }; }
}

test('preview updates retain the displayed image, reject stale results, and avoid rebuilding unchanged swatches', async t => {
  const originals = Object.fromEntries(['document', 'ImageData', 'Worker'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor);else delete globalThis[key]; } });
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, ['#bead-source', '#bead-result'].includes(selector) ? new Canvas() : new Element());
    return nodes.get(selector);
  };
  const optionIds = ['#bead-max-colors', '#bead-shading', '#bead-merge', '#bead-cleanup', '#bead-details'];
  optionIds.forEach((id, index) => { node(id).value = ['24', 'balanced', 'normal', '1', ''][index]; });
  node('#bead-details').checked = true;
  const workers = [];
  globalThis.document = { createElement: () => new Element() };
  globalThis.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
  globalThis.Worker = class {
    constructor() { workers.push(this); }
    postMessage(request) { this.request = request; }
    terminate() { this.terminated = true; }
    reply(colors, width = 2, height = 1) {
      this.onmessage({ data: { id: this.request.id, result: { pixels: Uint32Array.from(colors), used: [], total: width * height } } });
    }
  };
  const colors = [BEAD_PALETTE[0].color, BEAD_PALETTE[1].color];
  let sample = { width: 2, height: 1, data: Uint8ClampedArray.from(colors.flatMap(channels)) };
  const room = initBeadRoom({
    dialog: { querySelector: node, querySelectorAll: () => optionIds.map(node), classList: { add() {}, remove() {} } },
    art: { pixels: Uint32Array.from(colors) }, sample: () => sample, hasImage: () => true,
    finish() {}, render() {}, fit() {}, save() {}, setColor() {}, download() {}, status() {},
    initial: { enabled: true, palette: BEAD_PALETTE_ID }
  });
  t.after(() => room.closePreview());
  const waitForWorker = () => new Promise(resolve => setTimeout(resolve, 115));
  room.preview();await waitForWorker();workers[0].reply(colors);
  const displayed = node('#bead-result').frame.slice();
  room.preview();
  assert.deepEqual(node('#bead-result').frame, displayed);
  assert.equal(node('#bead-apply').disabled, true);
  assert.equal(node('#bead-preview-panel').attributes.get('aria-busy'), 'true');
  await waitForWorker();
  const updated = [colors[1], colors[0]];
  workers[0].reply(updated);
  assert.deepEqual(node('#bead-result').frame, displayed);
  workers[1].reply(updated);
  assert.deepEqual(node('#bead-result').frame, updated.flatMap(channels));
  assert.equal(node('#bead-apply').disabled, false);
  assert.equal(node('#bead-preview-panel').attributes.get('aria-busy'), 'false');
  const previousSizeFrame = node('#bead-result').frame.slice();
  sample = { width: 3, height: 2, data: new Uint8ClampedArray(24) };
  room.preview();
  assert.equal(node('#bead-result').width, 2);
  assert.deepEqual(node('#bead-result').frame, previousSizeFrame);
  await waitForWorker();room.closePreview();workers[2].reply(Array(6).fill(colors[0]), 3, 2);
  assert.deepEqual(node('#bead-result').frame, previousSizeFrame);
  room.refresh();const swatch = node('#bead-used').children[0];room.refresh();
  assert.equal(node('#bead-used').children[0], swatch);
});
