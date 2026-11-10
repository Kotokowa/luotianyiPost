const host = 'https://bee-reg-ab.imagency.cn/mr/202611/10/';
export const IMAGE_MIRRORS = Object.freeze({
  'tianyi-paint': `${host}6af2bcad98ea7.png`,
  landscape: `${host}6af2ae0fdddb6.png`,
  'tiandian-pink-lemon': `${host}6af2ae1252832.png`,
  'tianyi-run': `${host}6af2ae15dc91d.png`,
  'hero-tianyi': `${host}6af2ae0fde89c.png`,
  'tiandian-original': `${host}6af2ae0fdc154.png`,
  'hero-keyboard': `${host}6af2ae09429cd.png`,
  favicon: `${host}6af2ae074583d.png`,
  'apple-touch-icon': `${host}6af2ae0765e5b.png`
});
export const IMAGE_FALLBACK_DELAY = 2000;
let preferMirror = false;
let regionCheck;
const listeners = new Set();

export function mirrorFor(source) {
  const match = String(source).match(/(?:^|\/)assets\/([\w-]+)\.(?:webp|png|svg)(?:[?#].*)?$/);
  return match ? IMAGE_MIRRORS[match[1]] : undefined;
}

export function imageSources(source) {
  const mirror = mirrorFor(source);
  return mirror ? (preferMirror ? [mirror, source] : [source, mirror]) : [source];
}

export function checkImageRegion({ request = fetch, storage, timeout = 300 } = {}) {
  if (regionCheck) return regionCheck;
  try { storage ??= globalThis.sessionStorage; } catch {}
  function use(country) {
    if (country !== 'CN') return;
    preferMirror = true;
    for (const listener of listeners) listener();
  }
  try {
    const cached = JSON.parse(storage?.getItem('luoty.images.region.v1') || 'null');
    if (cached && /^[A-Z]{2}$/.test(cached.country) && Date.now() - cached.time >= 0 && Date.now() - cached.time < 1800000) {
      use(cached.country);return regionCheck = Promise.resolve(cached.country);
    }
  } catch {}
  const controller = new AbortController();
  regionCheck = new Promise(resolve => {
    let settled = false;
    const finish = country => {
      if (settled) return;
      settled = true;clearTimeout(timer);controller.abort();use(country);resolve(country);
    };
    const timer = setTimeout(() => finish(null), timeout);
    Promise.resolve().then(() => request('https://api.country.is/', { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })).then(async response => {
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data.country === 'string' && /^[A-Z]{2}$/.test(data.country) ? data.country : null;
    }).then(country => {
      if (settled) return;
      if (country) { try { storage?.setItem('luoty.images.region.v1', JSON.stringify({ country, time: Date.now() })); } catch {} }
      finish(country);
    }).catch(() => finish(null));
  });
  return regionCheck;
}

export function raceImageSources(source, load, { signal, delay = IMAGE_FALLBACK_DELAY, timeout = 15000, sources = imageSources(source) } = {}) {
  return new Promise((resolve, reject) => {
    const controllers = sources.map(() => new AbortController());
    const errors = [];
    const started = new Set();
    let settled = false, fallbackTimer, deadline;
    function finish(error, result) {
      if (settled) return;
      settled = true;clearTimeout(fallbackTimer);clearTimeout(deadline);
      listeners.delete(accelerate);signal?.removeEventListener('abort', abort);
      for (const controller of controllers) controller.abort();
      if (error) reject(error);else resolve(result);
    }
    function abort() { finish(signal.reason || new DOMException('Aborted', 'AbortError')); }
    function start(index) {
      if (settled || index >= sources.length || started.has(index)) return;
      started.add(index);
      Promise.resolve().then(() => {
        controllers[index].signal.throwIfAborted();
        return load(sources[index], controllers[index].signal);
      }).then(result => finish(null, result), error => {
        if (settled) return;
        errors.push(error);
        if (errors.length === sources.length) finish(new Error(errors.map(value => value.message).join('; ')));
        else start(1);
      });
    }
    function accelerate() { if (sources[1] === mirrorFor(source)) start(1); }
    if (signal?.aborted) { abort();return; }
    signal?.addEventListener('abort', abort, { once: true });
    listeners.add(accelerate);
    deadline = setTimeout(() => finish(new Error('Image loading timed out')), timeout);
    if (sources.length > 1) fallbackTimer = setTimeout(() => start(1), delay);
    start(0);
    if (preferMirror) accelerate();
  });
}

export function decodeImage(source, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/.test(source)) image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    function cleanup() { image.onload = null;image.onerror = null;signal?.removeEventListener('abort', abort); }
    function abort() { cleanup();image.removeAttribute('src');reject(signal.reason || new DOMException('Aborted', 'AbortError')); }
    if (signal?.aborted) { abort();return; }
    signal?.addEventListener('abort', abort, { once: true });
    image.onload = async () => {
      try { await image.decode();signal?.throwIfAborted();cleanup();resolve(image); }
      catch (error) { cleanup();reject(error); }
    };
    image.onerror = () => { cleanup();reject(new Error('Image loading failed')); };
    image.src = source;
  });
}

export async function loadAssetImage(target, source, options) {
  const image = await raceImageSources(source, (candidate, signal) => decodeImage(candidate, signal), options);
  if (image.crossOrigin) target.crossOrigin = image.crossOrigin;
  target.referrerPolicy = 'no-referrer';target.src = image.src;
  return target;
}

export function initImageFallbacks(root = document) {
  void checkImageRegion();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target);load(entry.target); }
  }, { rootMargin: '200px' });
  function load(image) { void loadAssetImage(image, image.getAttribute('src')).catch(() => {}); }
  for (const image of root.querySelectorAll('img[src]')) {
    if (!mirrorFor(image.getAttribute('src'))) continue;
    if (image.loading === 'lazy') observer.observe(image);else load(image);
  }
  for (const link of root.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')) {
    const source = link.getAttribute('href');
    if (mirrorFor(source)) void raceImageSources(source, (candidate, signal) => decodeImage(candidate, signal)).then(image => { link.href = image.src; }).catch(() => {});
  }
  for (const element of root.querySelectorAll('.hero-art')) {
    const source = getComputedStyle(element).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
    if (source && mirrorFor(source)) void raceImageSources(source, (candidate, signal) => decodeImage(candidate, signal)).then(image => { element.style.backgroundImage = `url("${image.src}")`; }).catch(() => {});
  }
}
