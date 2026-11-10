import { CHAT_API } from './chat-config.js';

const chatKey = 'luoty.chat.messages.v1';
const ownKey = 'luoty.chat.shared.v1';

export function validMessage(value) {
  return value && typeof value.id === 'string' && value.id.length <= 100 && typeof value.name === 'string' && value.name.length <= 16 && typeof value.text === 'string' && value.text.length <= 500 && Number.isSafeInteger(value.time) && value.time >= 0;
}

export function initChatRoom(dialog, { storage, endpoint = CHAT_API, request = fetch } = {}) {
  const find = selector => dialog.querySelector(selector);
  const content = find('#chat-content');
  const consent = find('#chat-consent');
  const form = find('#chat-form');
  const input = find('#message-input');
  const nickname = find('#nickname');
  const send = find('#chat-send');
  const toggle = find('#chat-send-toggle');
  const menu = find('#chat-send-menu');
  const log = find('#messages');
  const saved = storage.read(chatKey, []);
  let localMessages = Array.isArray(saved) ? saved.filter(validMessage).slice(-150) : [];
  let cloudMessages = [];
  const storedOwn = storage.read(ownKey, []);
  const ownIds = new Set(Array.isArray(storedOwn) ? storedOwn.filter(value => typeof value === 'string').slice(-150) : []);
  const storedName = storage.read('luoty.chat.nickname.v1', '');
  nickname.value = typeof storedName === 'string' ? storedName.slice(0, 16) : '';
  let clientId;
  try { clientId = sessionStorage.getItem('luoty.chat.client') || crypto.randomUUID();sessionStorage.setItem('luoty.chat.client', clientId); }
  catch { clientId = crypto.randomUUID(); }
  let choice = null, mode = 'local', active = false, busy = false, polling = null, loading = null, pending = null;
  let channel;
  try { channel = new BroadcastChannel('luoty-chat');channel.onmessage = event => receiveLocal(event.data); } catch {}

  function render() {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const messages = choice === 'cloud' ? [...localMessages, ...cloudMessages].sort((first, second) => first.time - second.time || first.id.localeCompare(second.id)) : localMessages;
    log.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement('div');empty.className = 'empty-chat';
      const flower = document.createElement('span');flower.textContent = '✿';
      const text = document.createElement('div');text.textContent = '第一朵小心情，等你来种下。';
      empty.append(flower, text);log.append(empty);
    }
    for (const message of messages) {
      const row = document.createElement('div');row.className = `message${message.client === clientId || ownIds.has(message.id) ? ' own' : ''}`;
      const meta = document.createElement('div');meta.className = 'message-meta';
      meta.textContent = `${message.name} · ${new Date(message.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      const text = document.createElement('p');text.className = 'message-text';text.textContent = message.text;
      row.append(meta, text);log.append(row);
    }
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }

  function receiveLocal(message) {
    if (!validMessage(message) || localMessages.some(value => value.id === message.id)) return;
    localMessages = [...localMessages, message].sort((first, second) => first.time - second.time).slice(-150);
    storage.write(chatKey, localMessages);render();
  }

  function setMode(value) {
    mode = choice === 'cloud' && value === 'cloud' ? 'cloud' : 'local';
    find('#chat-send-label').textContent = mode === 'cloud' ? '分享小想法' : '记在小天地';
    find('#chat-web-icon').toggleAttribute('hidden', mode !== 'cloud');
    toggle.hidden = choice !== 'cloud';
    menu.hidden = true;toggle.setAttribute('aria-expanded', 'false');
    find('#chat-location').textContent = choice === 'cloud' ? '云边小窝' : '本机小窝';
    input.setCustomValidity('');
  }

  async function api(method, body) {
    if (!endpoint) throw new Error('云端暂时无法连接');
    const response = await request(`${endpoint.replace(/\/$/, '')}/messages`, {
      method, credentials: 'omit', signal: AbortSignal.timeout(15000),
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error('云端暂时无法连接');
    return response.json();
  }

  async function refresh() {
    if (choice !== 'cloud' || !active || document.hidden || loading) return;
    loading = (async () => {
      try {
        const data = await api('GET');
        if (!Array.isArray(data.messages)) return;
        const received = data.messages.filter(validMessage);
        cloudMessages = [...new Map([...received, ...cloudMessages].map(message => [message.id, message])).values()].sort((first, second) => first.time - second.time || first.id.localeCompare(second.id)).slice(-150);
        render();
      } catch {} finally { loading = null; }
    })();
    await loading;
  }

  function choose(value) {
    choice = value === 'cloud' ? 'cloud' : 'local';
    content.inert = false;consent.hidden = true;
    setMode(choice);render();
    if (choice === 'cloud') { void refresh();startPolling(); }
    input.focus({ preventScroll: true });
  }

  function startPolling() {
    clearInterval(polling);
    if (active && choice === 'cloud') polling = setInterval(() => void refresh(), 30000);
  }

  find('#chat-consent-cloud').addEventListener('click', () => choose('cloud'));
  find('#chat-consent-local').addEventListener('click', () => choose('local'));
  toggle.addEventListener('click', () => {
    menu.hidden = !menu.hidden;toggle.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('button').focus();
  });
  for (const button of menu.querySelectorAll('button')) button.addEventListener('click', () => { setMode(button.dataset.chatMode);send.focus(); });
  dialog.addEventListener('click', event => {
    if (!event.target.closest('.chat-send-group')) { menu.hidden = true;toggle.setAttribute('aria-expanded', 'false'); }
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();event.stopPropagation();setMode(mode);toggle.focus();
    }
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
  send.addEventListener('click', () => input.setCustomValidity(''));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const text = input.value.trim();
    const name = nickname.value.trim() || '路过的小云朵';
    if (!text || text.length > 500 || name.length > 16) return;
    storage.write('luoty.chat.nickname.v1', name);
    const share = choice === 'cloud' && mode === 'cloud';
    if (!pending || pending.text !== text || pending.name !== name || pending.share !== share) pending = { id: crypto.randomUUID(), name, text, share };
    const message = { id: pending.id, name, text, time: Date.now() };
    busy = true;send.disabled = true;toggle.disabled = true;
    try {
      if (share) {
        const data = await api('POST', { id: message.id, name, text });
        if (!validMessage(data.message)) throw new Error('云端暂时无法连接');
        cloudMessages = [...cloudMessages.filter(value => value.id !== data.message.id), data.message].slice(-150);
        ownIds.add(data.message.id);
        storage.write(ownKey, [...ownIds].slice(-150));render();
      } else {
        message.client = clientId;receiveLocal(message);channel?.postMessage(message);
      }
      pending = null;
      if (input.value.trim() === text) input.value = '';
      log.scrollTop = log.scrollHeight;
      if (active) input.focus();
    } catch (error) {
      input.setCustomValidity(error.message || '云端暂时无法连接');
      if (active) input.reportValidity();
    } finally { busy = false;send.disabled = false;toggle.disabled = false; }
  });
  window.addEventListener('storage', event => {
    if (event.key !== chatKey) return;
    const messages = storage.read(chatKey, []);
    if (Array.isArray(messages)) { localMessages = messages.filter(validMessage).slice(-150);render(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  window.addEventListener('pagehide', () => { active = false;clearInterval(polling);polling = null; });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    choice = null;cloudMessages = [];active = dialog.open;
    content.inert = true;consent.hidden = false;setMode('local');render();
    if (active && dialog.contains(consent)) find('#chat-consent-cloud').focus({ preventScroll: true });
    else if (!dialog.contains(consent)) choose('local');
  });
  new MutationObserver(() => {
    if (choice === null && (!dialog.contains(consent) || consent.hidden)) choose('local');
  }).observe(dialog, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  setMode('local');render();

  return {
    open() {
      active = true;
      if (choice === null && !dialog.contains(consent)) choose('local');
      content.inert = choice === null;
      consent.hidden = choice !== null;
      render();log.scrollTop = log.scrollHeight;
      if (choice === null) find('#chat-consent-cloud').focus({ preventScroll: true });
      else { void refresh();startPolling(); }
    },
    close() { active = false;clearInterval(polling);polling = null;menu.hidden = true;toggle.setAttribute('aria-expanded', 'false'); }
  };
}
