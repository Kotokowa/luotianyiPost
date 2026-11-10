import test from 'node:test';
import assert from 'node:assert/strict';
import { initChatRoom, validMessage } from '../src/chat.js';

class Element {
  constructor() { this.events = new Map();this.children = [];this.hidden = false;this.value = '';this.dataset = {};this.scrollHeight = 0;this.scrollTop = 0;this.clientHeight = 200; }
  addEventListener(name, handler) { this.events.set(name, handler); }
  setAttribute() {}
  toggleAttribute(name, value) { this[name] = value; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  setCustomValidity(value) { this.validation = value; }
  reportValidity() {}
  focus() {}
  querySelector() { return this.children[0]; }
  querySelectorAll() { return this.children; }
}

function setup(context) {
  const originals = Object.fromEntries(['document', 'window', 'sessionStorage', 'BroadcastChannel', 'MutationObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  context.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  globalThis.document = Object.assign(new Element(), { createElement: () => new Element(), hidden: false });
  globalThis.window = new Element();
  globalThis.sessionStorage = { getItem: () => 'local-client', setItem() {} };
  globalThis.BroadcastChannel = class { postMessage() {} };
  let observe;
  globalThis.MutationObserver = class { constructor(callback) { observe = callback; } observe() {} };
  const elements = new Map();
  const node = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const cloud = new Element();cloud.dataset.chatMode = 'cloud';
  const local = new Element();local.dataset.chatMode = 'local';
  node('#chat-send-menu').children = [cloud, local];
  const values = new Map();
  const storage = { read: (key, fallback) => values.get(key) ?? fallback, write: (key, value) => { values.set(key, value);return true; } };
  const dialog = Object.assign(new Element(), { querySelector: node, contains: () => true, open: true });
  const requests = [];
  const room = initChatRoom(dialog, {
    storage, endpoint: 'https://chat.example',
    request: async (url, options) => {
      requests.push(options);
      const data = options.body ? { message: { ...JSON.parse(options.body), time: Date.now() } } : { messages: [] };
      return Response.json(data);
    }
  });
  context.after(() => room.close());
  const click = selector => node(selector).events.get('click')();
  const submit = async text => { node('#message-input').value = text;await node('#chat-form').events.get('submit')({ preventDefault() {} }); };
  return { room, node, values, dialog, requests, click, submit, observe: () => observe(), cloud, local };
}

test('local consent persists across dialog openings but resets for a new page instance', async context => {
  const chat = setup(context);
  chat.room.open();
  assert.equal(chat.node('#chat-content').inert, true);
  chat.click('#chat-consent-local');
  assert.equal(chat.node('#chat-send-label').textContent, '记在小天地');
  assert.equal(chat.node('#chat-send-toggle').hidden, true);
  await chat.submit('只留本地');
  assert.equal(chat.requests.length, 0);
  assert.equal(chat.values.get('luoty.chat.messages.v1')[0].text, '只留本地');
  chat.room.close();chat.room.open();
  assert.equal(chat.node('#chat-consent').hidden, true);
  globalThis.window.events.get('pageshow')({ persisted: true });
  assert.equal(chat.node('#chat-consent').hidden, false);
  assert.equal(chat.node('#chat-content').inert, true);
});

test('removing consent defaults to usable local-only mode without any cloud requests', async context => {
  const chat = setup(context);
  chat.room.open();chat.dialog.contains = () => false;chat.observe();
  assert.equal(chat.node('#chat-content').inert, false);
  assert.equal(chat.node('#chat-send-toggle').hidden, true);
  await chat.submit('删除遮罩后也仅本地');
  assert.equal(chat.requests.length, 0);
  assert.equal(chat.values.get('luoty.chat.messages.v1').length, 1);
});

test('cloud consent permits sharing while the dropdown can still save privately', async context => {
  const chat = setup(context);
  chat.room.open();chat.click('#chat-consent-cloud');
  assert.equal(chat.node('#chat-send-label').textContent, '分享小想法');
  assert.equal(chat.node('#chat-web-icon').hidden, false);
  assert.equal(chat.node('#chat-send-toggle').hidden, false);
  await chat.submit('分享');
  assert.equal(chat.requests.filter(request => request.method === 'POST').length, 1);
  assert.equal(chat.values.has('luoty.chat.messages.v1'), false);
  chat.local.events.get('click')();
  assert.equal(chat.node('#chat-send-label').textContent, '记在小天地');
  assert.equal(chat.node('#chat-web-icon').hidden, true);
  await chat.submit('私藏');
  assert.equal(chat.requests.filter(request => request.method === 'POST').length, 1);
  assert.equal(chat.values.get('luoty.chat.messages.v1')[0].text, '私藏');
});

test('malformed cached messages are not rendered', () => {
  assert.equal(Boolean(validMessage({ id: 'test', name: '云', text: '想法', time: NaN })), false);
  assert.equal(Boolean(validMessage({ id: 'test', name: '云', text: '想'.repeat(501), time: 1 })), false);
});
