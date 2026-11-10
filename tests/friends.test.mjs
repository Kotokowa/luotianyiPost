import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initFriendLinks } from '../src/friends.js';

test('the final friend link opens the public feedback email address', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const list = html.match(/<div class="friends-list">([\s\S]*?)<\/div>/)[1];
  const links = [...list.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
  assert.equal(links.length, 5);
  assert.equal(links.at(-1)[1], 'mailto:feedback@luoty.vip');
  assert.equal(links.at(-1)[2], '反馈邮箱');
});

function setup(context) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const handlers = new Map(), toggleHandlers = new Map(), rootHandlers = new Map();
  const attrs = new Map();
  const panel = { inert: true };
  const toggle = { addEventListener: (name, handler) => toggleHandlers.set(name, handler), setAttribute: (name, value) => attrs.set(name, value), matches: () => false, focus() { globalThis.document.activeElement = this; } };
  const wrapper = { querySelector: selector => selector === 'button' ? toggle : panel, addEventListener: (name, handler) => handlers.set(name, handler), contains: target => [wrapper, toggle, panel].includes(target), classList: { toggle() {} } };
  const root = { querySelector: () => wrapper, addEventListener: (name, handler) => rootHandlers.set(name, handler) };
  globalThis.document = { activeElement: null };
  context.after(() => { if (original) Object.defineProperty(globalThis, 'document', original);else delete globalThis.document; });
  initFriendLinks(root);
  return { handlers, toggleHandlers, rootHandlers, attrs, panel, toggle };
}

test('mouse hover expands friends and clicking a hovered button does not immediately close it', context => {
  const menu = setup(context);
  menu.handlers.get('pointerenter')({ pointerType: 'mouse' });
  assert.equal(menu.attrs.get('aria-expanded'), 'true');
  assert.equal(menu.panel.inert, false);
  menu.toggleHandlers.get('click')({ detail: 1 });
  assert.equal(menu.attrs.get('aria-expanded'), 'true');
  menu.handlers.get('pointerleave')();
  assert.equal(menu.attrs.get('aria-expanded'), 'false');
});

test('touch opens only on tap and a second tap closes the menu', context => {
  const menu = setup(context);
  menu.handlers.get('pointerenter')({ pointerType: 'touch' });
  assert.equal(menu.panel.inert, true);
  menu.toggleHandlers.get('click')({ detail: 1 });
  assert.equal(menu.attrs.get('aria-expanded'), 'true');
  menu.toggleHandlers.get('click')({ detail: 1 });
  assert.equal(menu.attrs.get('aria-expanded'), 'false');
});

test('Escape closes the menu and returns focus to the control', context => {
  const menu = setup(context);
  menu.toggleHandlers.get('click')({ detail: 0 });
  let prevented = false;
  menu.handlers.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
  assert.equal(menu.panel.inert, true);
  assert.equal(globalThis.document.activeElement, menu.toggle);
});

test('outside clicks close friends and a page without the control remains supported', context => {
  const menu = setup(context);
  menu.toggleHandlers.get('click')({ detail: 0 });
  menu.rootHandlers.get('click')({ target: {} });
  assert.equal(menu.panel.inert, true);
  assert.doesNotThrow(() => initFriendLinks({ querySelector: () => null }));
});
