export const HERO_MOTION = Object.freeze({
  width: 2560,
  height: 1664,
  pivotX: 1290,
  pivotY: 1050,
  duration: 15,
  periodStart: 1.4,
  periodEnd: 7.12,
  damping: 6,
  settle: 2.2,
  tianyiAngle: 2.4,
  keyboardAngle: 1.6,
  tianyiFade: 1,
  keyboardFade: .9,
  keyboardDelay: .22,
  mobileCrop: .12
});

export function swingAt(seconds, config = HERO_MOTION) {
  const t = Math.max(0, Math.min(config.duration, seconds));
  const frequencyStart = 1 / config.periodStart;
  const frequencyEnd = 1 / config.periodEnd;
  const phase = 2 * Math.PI * (frequencyStart * t + (frequencyEnd - frequencyStart) * t * t / (2 * config.duration));
  const tail = Math.max(0, Math.min(1, (config.duration - t) / config.settle));
  const envelope = Math.exp(-t / config.damping) * tail * tail * (3 - 2 * tail);
  const swing = Math.cos(phase) * envelope;
  return { tianyi: swing * config.tianyiAngle, keyboard: -swing * config.keyboardAngle };
}

function previewConfig() {
  const config = { ...HERO_MOTION };
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) return config;
  const query = new URLSearchParams(location.search);
  const ranges = {
    pivotX: [0, 2560], pivotY: [0, 1664], duration: [2, 30],
    periodStart: [1, 10], periodEnd: [1, 15], damping: [1, 15], settle: [.3, 3],
    tianyiAngle: [0, 8], keyboardAngle: [0, 8], tianyiFade: [.2, 5],
    keyboardFade: [.2, 5], keyboardDelay: [0, 2], mobileCrop: [0, .25]
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = Number(query.get(`hero-${key}`));
    if (query.has(`hero-${key}`) && Number.isFinite(value)) config[key] = Math.min(max, Math.max(min, value));
  }
  return config;
}

export async function initHero(hero) {
  if (!hero) return;
  const tianyi = hero.querySelector('.hero-tianyi');
  const keyboard = hero.querySelector('.hero-keyboard');
  const config = previewConfig();
  hero.style.setProperty('--hero-pivot-x', `${config.pivotX / config.width * 100}%`);
  hero.style.setProperty('--hero-pivot-y', `${config.pivotY / config.height * 100}%`);
  hero.style.setProperty('--hero-mobile-crop', config.mobileCrop);
  const mobile = matchMedia('(max-width: 680px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const earlyFades = mobile.matches && !reduced.matches && tianyi.animate
    ? [tianyi, keyboard].map(image => image.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'both' }))
    : [];
  await Promise.allSettled([tianyi.decode(), keyboard.decode()]);
  let animations = [];
  let version = 0;

  function stop() {
    version++;
    for (const animation of [...earlyFades, ...animations]) animation.cancel();
    animations = [];
    hero.classList.remove('is-animating');
  }

  function start() {
    stop();
    if (reduced.matches || !tianyi.animate) return;
    const run = version;
    hero.classList.add('is-animating');
    if (mobile.matches) {
      animations = [
        tianyi.animate([{ opacity: 0 }, { opacity: 1 }], { duration: config.tianyiFade * 1000, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'both' }),
        keyboard.animate([{ opacity: 0 }, { opacity: 1 }], { duration: config.keyboardFade * 1000, delay: config.keyboardDelay * 1000, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'both' })
      ];
    } else {
      const count = Math.ceil(config.duration * 30);
      const frames = Array.from({ length: count + 1 }, (_, i) => swingAt(config.duration * i / count, config));
      animations = [
        tianyi.animate(frames.map(value => ({ transform: `rotate(${value.tianyi}deg)` })), { duration: config.duration * 1000, easing: 'linear', fill: 'both' }),
        keyboard.animate(frames.map(value => ({ transform: `rotate(${value.keyboard}deg)` })), { duration: config.duration * 1000, easing: 'linear', fill: 'both' })
      ];
    }
    const sharedStart = document.timeline.currentTime;
    for (const animation of animations) animation.startTime = sharedStart;
    Promise.allSettled(animations.map(animation => animation.finished)).then(() => { if (run === version) stop(); });
    syncVisibility();
  }

  function syncVisibility() {
    for (const animation of animations) {
      if (document.hidden && animation.playState === 'running') animation.pause();
      else if (!document.hidden && animation.playState === 'paused') animation.play();
    }
  }

  mobile.addEventListener('change', start);
  reduced.addEventListener('change', start);
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pagehide', stop);
  start();
}
