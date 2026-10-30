import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_MOTION, swingAt } from '../src/hero.js';

test('both layers share an opposite phase and the same decay at every point', () => {
  for (let t = 0; t <= HERO_MOTION.duration; t += .017) {
    const value = swingAt(t);
    assert.ok(Math.abs(value.tianyi / HERO_MOTION.tianyiAngle + value.keyboard / HERO_MOTION.keyboardAngle) < 1e-12);
    assert.ok(Math.abs(value.tianyi) <= HERO_MOTION.tianyiAngle * Math.exp(-t / HERO_MOTION.damping) + 1e-12);
  }
});

test('the pivot is on the keyboard body and both layers settle without a final jump', () => {
  assert.ok(HERO_MOTION.pivotY > HERO_MOTION.height / 2);
  assert.ok(HERO_MOTION.pivotX > 335 && HERO_MOTION.pivotX < 2243);
  for (const t of [HERO_MOTION.duration, HERO_MOTION.duration + 1]) {
    const value = swingAt(t);
    assert.equal(Math.abs(value.tianyi), 0);
    assert.equal(Math.abs(value.keyboard), 0);
  }
  assert.ok(Math.abs(swingAt(HERO_MOTION.duration - .001).tianyi) < 1e-6);
});

test('the keyboard fade overlaps the character fade', () => {
  assert.ok(HERO_MOTION.keyboardDelay > 0);
  assert.ok(HERO_MOTION.keyboardDelay < HERO_MOTION.tianyiFade);
  assert.ok(HERO_MOTION.periodEnd > HERO_MOTION.periodStart);
});
