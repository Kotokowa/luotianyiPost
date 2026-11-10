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

function setup(context, initial = new Map(), remoteMessages = []) {
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
  const values = initial;
  const storage = { read: (key, fallback) => values.get(key) ?? fallback, write: (key, value) => { values.set(key, value);return true; } };
  const dialog = Object.assign(new Element(), { querySelector: node, contains: () => true, open: true });
  const requests = [];
  const room = initChatRoom(dialog, {
    storage, endpoint: 'https://chat.example',
    request: async (url, options) => {
      requests.push(options);
      const data = options.body ? { message: { ...JSON.parse(options.body), time: Date.now() } } : { messages: remoteMessages };
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
  assert.equal(chat.values.get('luoty.chat.own-messages.v1')[0].text, '分享');
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

test('local mode shows own cloud-message backups but never other peoples cached messages', async context => {
  const mine = { id: 'own-cloud-message', name: '我', text: '自己曾经分享的想法', time: 1 };
  const other = { id: 'other-cloud-message', name: '别人', text: '缓存中的他人留言', time: 2 };
  const initial = new Map([
    ['luoty.chat.own-messages.v1', [mine]],
    ['luoty.chat.cloud-cache.v1', [other]],
    ['luoty.chat.messages.v1', [{ id: 'private-message', name: '我', text: '私藏想法', time: 3 }]]
  ]);
  const chat = setup(context, initial, [mine, other]);
  chat.room.open();chat.click('#chat-consent-local');
  assert.equal(chat.requests.length, 0);
  const displayed = chat.node('#messages').children.map(row => row.children[1]?.textContent);
  assert.deepEqual(displayed, [mine.text, '私藏想法']);
  await chat.submit('新增私藏');assert.equal(chat.requests.length, 0);
});

test('old own-message IDs recover only their own bodies when the user consents to cloud access', async context => {
  const mine = { id: 'legacy-own', name: '我', text: '旧版分享', time: 1 };
  const other = { id: 'not-mine', name: '别人', text: '别人的内容', time: 2 };
  const chat = setup(context, new Map([['luoty.chat.shared.v1', [mine.id]]]), [mine, other]);
  chat.room.open();chat.click('#chat-consent-cloud');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(chat.values.get('luoty.chat.own-messages.v1'), [mine]);
  globalThis.window.events.get('pageshow')({ persisted: true });
  chat.click('#chat-consent-local');
  assert.deepEqual(chat.node('#messages').children.map(row => row.children[1]?.textContent), [mine.text]);
  assert.equal(chat.requests.filter(request => request.method === 'GET').length, 1);
});
