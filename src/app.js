import { Runner } from './engine.js';
import { characterReady, drawLandscape, drawTianyi, drawBun, drawObstacle, renderRunner } from './pixels.js';

const $ = selector => document.querySelector(selector);
const storage = {
  available: true,
  read(key, fallback) {
    try { const data = localStorage.getItem(key); return data === null ? fallback : JSON.parse(data); }
    catch { this.available = false; return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { this.available = false; return false; }
  }
};
const bestKey = 'luoty.runner.best.v1';
const storedBest = storage.read(bestKey, 0);
let best = Number.isSafeInteger(storedBest) && storedBest >= 0 ? storedBest : 0;
let openedDialog = null;
let lastFocus = null;
let toastTimer;
const gameDialog = $('#game-dialog');
const chatDialog = $('#chat-dialog');
const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const runner = new Runner({ onEvent: handleGameEvent });
let accumulator = 0;
let lastFrame = 0;
let animationId = 0;
let lastScore = -1;
const duckInputs = new Set();
let lastPace = '';

function releaseControls() {
  duckInputs.clear();
  runner.duck(false);
  $('#slide-game').setAttribute('aria-pressed', 'false');
}

function updateDuck() {
  runner.duck(duckInputs.size > 0);
  $('#slide-game').setAttribute('aria-pressed', String(runner.duckHeld));
}

function refreshPace() {
  const label = `${runner.night >= .5 ? '☾ 星星陪跑' : '☀ 晴空追风'} · ${runner.pace.toFixed(1)}×`;
  if (label !== lastPace) { $('#run-weather').textContent = label; lastPace = label; }
  $('.game-stage').classList.toggle('night', runner.night >= .5);
}

function number(value) { return String(value).padStart(5, '0'); }
function refreshHUD() {
  if (lastScore !== runner.score) { $('#score').textContent = number(runner.score); lastScore = runner.score; }
  $('#best-score').textContent = number(best);
  $('#hearts').replaceChildren(...Array.from({ length: 3 }, (_, i) => {
    const heart = document.createElement('span');
    heart.className = `heart${i >= runner.lives ? ' empty' : ''}`;
    heart.setAttribute('aria-hidden', 'true');
    return heart;
  }));
  $('#hearts').setAttribute('aria-label', `生命 ${runner.lives} / 3`);
}

function saveBest() {
  if (runner.score > best) { best = runner.score; storage.write(bestKey, best); }
  refreshHUD();
}

function handleGameEvent(event) {
  if (event === 'faster') showToast('风变快啦，跟紧小洛～');
  if (event === 'night' || event === 'day') showToast(event === 'night' ? '星星亮啦，陪你再跑一程 ✧' : '天亮啦，迎着晨光继续跑～');
  if (event === 'heal' || event === 'full') showToast(event === 'heal' ? '热乎乎的，爱心 +1 ♥' : '快乐满格，肚肚也满格 ♡');
  if (event === 'hurt') showToast('哎呀～拍拍灰，继续跑！');
  if (event === 'over') {
    releaseControls();
    clearTimeout(toastTimer);
    $('#game-toast').classList.remove('visible');
    const record = runner.score > best;
    saveBest();
    showOverlay('over', record);
    $('#pause-game').disabled = true;
  }
  if (event !== 'jump' && event !== 'reset') refreshHUD();
}

function showToast(message) {
  clearTimeout(toastTimer);
  $('#game-toast').textContent = message;
  $('#game-toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#game-toast').classList.remove('visible'), 1600);
}

function showOverlay(mode, record = false) {
  $('#game-overlay').hidden = false;
  const over = mode === 'over';
  const paused = mode === 'paused';
  $('#overlay-icon').textContent = over ? '✧' : paused ? '☁' : '✦';
  $('#overlay-title').textContent = over ? (record ? '新纪录！小洛超棒的～' : '跑累啦，歇一小会儿～') : paused ? '风也在等你呢' : '风刚好，一起跑跑？';
  $('#overlay-text').textContent = over ? '每一步，都是一份小小的勇气。' : paused ? '准备好了，就继续追风吧。' : '刀叉跳过去，低飞云团蹲着躲，小笼包记得接住～';
  $('#start-game').replaceChildren(document.createTextNode(over ? '再跑一次 ' : paused ? '继续追风 ' : '出发啦 '));
  const arrow = document.createElement('span');arrow.textContent = '→';$('#start-game').append(arrow);
  $('#result-score').hidden = !over;
  $('#result-score').textContent = `${number(runner.score)} 分`;
  $('#storage-note').hidden = !over;
  $('#storage-note').textContent = storage.available ? '小纪录只住在这台设备的浏览器里哦，清理数据会丢失，记得保存一份～' : '浏览器的小口袋暂时打不开，纪录没能存住，记得下载一份带走～';
  $('#save-record').hidden = !over;
  if (over) $('#start-game').focus({ preventScroll: true });
}

function startGame() {
  releaseControls();
  if (runner.state === 'paused') runner.state = 'running';
  else { runner.reset(); lastScore = -1; }
  $('#game-overlay').hidden = true;
  $('#game-toast').classList.remove('visible');
  $('#pause-game').disabled = false;
  $('#pause-game').textContent = 'Ⅱ';
  $('#pause-game').setAttribute('aria-label', '暂停游戏');
  accumulator = 0;lastFrame = 0;
  canvas.focus({ preventScroll: true });
  refreshHUD();ensureFrame();
}

function pauseGame() {
  if (runner.state === 'running') {
    releaseControls();
    runner.state = 'paused';
    saveBest();showOverlay('paused');
    $('#pause-game').textContent = '▷';
    $('#pause-game').setAttribute('aria-label', '继续游戏');
  } else if (runner.state === 'paused') startGame();
}

function sizeGame() {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width === 0) return;
  canvas.width = Math.max(320, Math.round(bounds.width));
  canvas.height = Math.round(bounds.height);
  ctx.imageSmoothingEnabled = false;
  runner.resize(canvas.width, canvas.height);
  renderRunner(ctx, runner);
  refreshPace();
}

function frame(timestamp) {
  animationId = 0;
  if (!gameDialog.open) return;
  const elapsed = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .08) : 0;
  lastFrame = timestamp;
  if (runner.state === 'running') {
    accumulator += elapsed;
    while (accumulator >= 1 / 120) { runner.step(1 / 120); accumulator -= 1 / 120; }
    if (lastScore !== runner.score) { $('#score').textContent = number(runner.score); lastScore = runner.score; }
  }
  renderRunner(ctx, runner);
  refreshPace();
  if (runner.state === 'running') animationId = requestAnimationFrame(frame);
}

function ensureFrame() { if (!animationId) animationId = requestAnimationFrame(frame); }

$('#start-game').addEventListener('click', startGame);
$('#pause-game').addEventListener('click', pauseGame);
canvas.addEventListener('pointerdown', event => {
  if (event.button > 0) return;
  if (runner.state === 'running') { event.preventDefault(); canvas.focus({ preventScroll: true });runner.jump(); }
});
document.addEventListener('keydown', event => {
  if (!gameDialog.open || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    if (runner.state === 'running') { event.preventDefault(); if (!event.repeat) runner.jump(); }
  } else if (['ControlLeft', 'ControlRight', 'ArrowDown'].includes(event.code)) {
    event.preventDefault();duckInputs.add(event.code);updateDuck();
  } else if (event.code === 'KeyP' && !event.repeat) { event.preventDefault();pauseGame(); }
});
document.addEventListener('keyup', event => {
  if (duckInputs.delete(event.code)) { event.preventDefault();updateDuck(); }
});
const slideButton = $('#slide-game');
slideButton.addEventListener('pointerdown', event => {
  if (event.button > 0 || runner.state !== 'running') return;
  event.preventDefault();slideButton.setPointerCapture(event.pointerId);
  duckInputs.add(`pointer-${event.pointerId}`);updateDuck();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) slideButton.addEventListener(name, event => {
  duckInputs.delete(`pointer-${event.pointerId}`);updateDuck();
});
slideButton.addEventListener('keydown', event => {
  if (['Space', 'Enter'].includes(event.code)) { event.preventDefault();event.stopPropagation();duckInputs.add('slide-button');updateDuck(); }
});
slideButton.addEventListener('keyup', event => {
  if (['Space', 'Enter'].includes(event.code)) { event.preventDefault();event.stopPropagation();duckInputs.delete('slide-button');updateDuck(); }
});
slideButton.addEventListener('blur', () => { duckInputs.delete('slide-button');updateDuck(); });
$('#jump-game').addEventListener('pointerdown', event => {
  if (event.button > 0) return;
  event.preventDefault();runner.jump();
});
$('#jump-game').addEventListener('click', event => { if (event.detail === 0) runner.jump(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && runner.state === 'running' && gameDialog.open) pauseGame(); });
window.addEventListener('blur', () => { releaseControls();if (runner.state === 'running' && gameDialog.open) pauseGame(); });
window.addEventListener('pagehide', saveBest);
new ResizeObserver(sizeGame).observe(canvas);

$('#save-record').addEventListener('click', () => {
  const content = `洛的小天地 · 小洛快跑\n\n本次成绩：${runner.score}\n本机最高分：${best}\n保存时间：${new Date().toLocaleString('zh-CN')}\n\n每一步，都是一份小小的勇气。\nhttps://luoty.vip\n`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');link.href = url;link.download = `小洛的跑跑纪录-${best}.txt`;link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const chatKey = 'luoty.chat.messages.v1';
let messages = storage.read(chatKey, []);
if (!Array.isArray(messages)) messages = [];
messages = messages.filter(validMessage).slice(-150);
let nickname = storage.read('luoty.chat.nickname.v1', '');
$('#nickname').value = typeof nickname === 'string' ? nickname.slice(0, 16) : '';
let clientId;
try { clientId = sessionStorage.getItem('luoty.chat.client') || crypto.randomUUID();sessionStorage.setItem('luoty.chat.client', clientId); }
catch { clientId = `cloud-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
let channel;
try { channel = new BroadcastChannel('luoty-chat');channel.onmessage = event => receiveMessage(event.data); } catch {}

function validMessage(value) {
  return value && typeof value.id === 'string' && typeof value.text === 'string' && value.text.length <= 500 && typeof value.name === 'string' && value.name.length <= 16 && typeof value.client === 'string' && Number.isFinite(value.time);
}

function renderMessages() {
  const log = $('#messages');
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('div');empty.className = 'empty-chat';
    const flower = document.createElement('span');flower.textContent = '✿';
    const text = document.createElement('div');text.textContent = '第一朵小心情，等你来种下。';
    empty.append(flower, text);log.append(empty);return;
  }
  for (const message of messages) {
    const row = document.createElement('div');row.className = `message${message.client === clientId ? ' own' : ''}`;
    const meta = document.createElement('div');meta.className = 'message-meta';
    meta.textContent = `${message.name} · ${new Date(message.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    const text = document.createElement('p');text.className = 'message-text';text.textContent = message.text;
    row.append(meta, text);log.append(row);
  }
  if (nearBottom) log.scrollTop = log.scrollHeight;
}

function receiveMessage(message) {
  if (!validMessage(message) || messages.some(m => m.id === message.id)) return;
  messages = [...messages, message].sort((a, b) => a.time - b.time).slice(-150);
  storage.write(chatKey, messages);renderMessages();
}

$('#chat-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#message-input');const text = input.value.trim();
  if (!text) { input.focus();return; }
  const name = $('#nickname').value.trim() || '路过的小云朵';
  storage.write('luoty.chat.nickname.v1', name);
  const message = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, client: clientId, name, text, time: Date.now() };
  receiveMessage(message);channel?.postMessage(message);
  input.value = '';$('#messages').scrollTop = $('#messages').scrollHeight;input.focus();
  if (!storage.available) $('.chat-footnote').textContent = '浏览器的小口袋打不开，离开前记得把悄悄话带走哦。';
});

window.addEventListener('storage', event => {
  if (event.key === bestKey) {
    const value = storage.read(bestKey, 0);
    if (Number.isSafeInteger(value) && value > best) { best = value;refreshHUD(); }
  }
  if (event.key === chatKey && !channel) {
    const value = storage.read(chatKey, []);
    if (Array.isArray(value)) for (const message of value) receiveMessage(message);
  }
});

function openDialog(dialog) {
  if (openedDialog === dialog) return;
  if (openedDialog) closeDialog(false);
  lastFocus = document.activeElement;
  openedDialog = dialog;
  document.documentElement.style.setProperty('--scrollbar', `${window.innerWidth - document.documentElement.clientWidth}px`);
  document.body.classList.add('dialog-open');
  dialog.showModal();
  if (dialog === gameDialog) {
    releaseControls();
    sizeGame();refreshHUD();
    if (runner.state === 'running') runner.state = 'paused';
    showOverlay(runner.state === 'over' ? 'over' : runner.state === 'paused' ? 'paused' : 'idle');
    renderRunner(ctx, runner);
  } else { renderMessages();$('#messages').scrollTop = $('#messages').scrollHeight; }
}

function closeDialog(updateHash = true) {
  if (!openedDialog) return;
  if (openedDialog === gameDialog) {
    releaseControls();
    if (runner.state === 'running') runner.state = 'paused';
    saveBest();cancelAnimationFrame(animationId);animationId = 0;lastFrame = 0;
  }
  const dialog = openedDialog;openedDialog = null;dialog.close();
  document.body.classList.remove('dialog-open');
  if (updateHash) history.replaceState(null, '', `${location.pathname}${location.search}#explore`);
  if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
}

function route() {
  if (location.hash === '#chat') openDialog(chatDialog);
  else if (location.hash === '#run') openDialog(gameDialog);
  else closeDialog(false);
}

for (const button of document.querySelectorAll('.close-dialog')) button.addEventListener('click', () => closeDialog());
for (const dialog of [chatDialog, gameDialog]) {
  dialog.addEventListener('cancel', event => { event.preventDefault();closeDialog(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
  });
}
for (const link of document.querySelectorAll('a[href="#run"],a[href="#chat"]')) link.addEventListener('click', event => {
  event.preventDefault();const hash = link.getAttribute('href');
  if (location.hash !== hash) history.pushState(null, '', hash);
  route();
});
window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
function updateNavigation() {
  const scrolled = window.scrollY > 24;
  $('#topbar').classList.toggle('scrolled', scrolled);
  const explored = window.scrollY > window.innerHeight * .5;
  const links = document.querySelectorAll('.nav-link');
  links[0].classList.toggle('active', !explored);links[1].classList.toggle('active', explored);
}
window.addEventListener('scroll', updateNavigation, { passive: true });
updateNavigation();

const card = $('#card-scene');const cardCtx = card.getContext('2d');
cardCtx.imageSmoothingEnabled = false;
function drawCard() {
  drawLandscape(cardCtx,660,300,95);
  drawTianyi(cardCtx,240,112,{scale:1.4,frame:0});
  drawBun(cardCtx,425,168,1.35);
  drawObstacle(cardCtx,{x:540,y:190,type:'fork'});
  drawObstacle(cardCtx,{x:385,y:94,type:'cloud'});
}
drawCard();
characterReady.then(() => {
  $('#start-game').disabled = false;
  drawCard();renderRunner(ctx, runner);
}).catch(error => { $('#overlay-text').textContent = error.message; });
refreshHUD();renderMessages();route();
