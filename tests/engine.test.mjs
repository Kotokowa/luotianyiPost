import test from 'node:test';
import assert from 'node:assert/strict';
import { Runner, RULES, overlaps } from '../src/engine.js';

function setup() {
  const events = [];
  const game = new Runner({ random: () => .5, onEvent: event => events.push(event) });
  game.reset();game.obstacleTimer = 999;game.bunTimer = 999;
  return { game, events };
}
function advance(game, seconds) { for (let i = 0; i < Math.ceil(seconds * 120); i++) game.step(1 / 120); }
function obstacle(game, x = game.player.x + 8) { return { x, y: game.ground - 45, w: 32, h: 45, type: 'fork', hit: false }; }

test('three initial hearts and exact edge contact is safe', () => {
  const { game } = setup();assert.equal(game.lives, 3);
  assert.equal(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
});
test('hair and sprite padding are excluded from the collision box', () => {
  const { game } = setup();
  const box = game.playerBox();
  assert.equal(overlaps(box, { x: game.player.x, y: game.player.y, w: 10, h: 64 }), false);
  assert.equal(overlaps(box, { x: game.player.x, y: game.player.y, w: 36, h: 10 }), false);
});
test('one obstacle cannot repeatedly damage and invincibility blocks another hit', () => {
  const { game, events } = setup();const item = obstacle(game);game.obstacles.push(item);
  game.step(1 / 120);assert.equal(game.lives, 2);assert.equal(item.hit, true);
  item.x = game.player.x + 8;game.obstacles.push(obstacle(game));
  game.step(1 / 120);assert.equal(game.lives, 2);assert.equal(events.filter(e => e === 'hurt').length, 1);
  advance(game, RULES.invincibility + .05);game.obstacles = [obstacle(game)];game.step(1 / 120);assert.equal(game.lives, 1);
});
test('a bun heals once, is removed, and never exceeds three hearts', () => {
  const { game, events } = setup();game.lives = 2;
  const bun = () => ({ x: game.player.x + 10, y: game.ground - 44, w: 28, h: 24 });
  game.buns.push(bun());game.step(1 / 120);assert.equal(game.lives, 3);assert.equal(game.buns.length, 0);
  game.buns.push(bun());game.step(1 / 120);assert.equal(game.lives, 3);
  assert.deepEqual(events.filter(e => ['heal','full'].includes(e)), ['heal','full']);
});
test('jump clears a ground obstacle and holding airborne input does not double jump', () => {
  const { game } = setup();game.obstacles.push(obstacle(game, game.player.x + 115));
  game.jump();advance(game, .2);const vy = game.player.vy;
  game.jump();game.step(1 / 120);assert.ok(game.player.vy > vy);
  advance(game, .65);assert.equal(game.lives, 3);assert.equal(game.player.grounded, true);
});
test('third hit ends the run, with no scoring or collision updates afterwards', () => {
  const { game, events } = setup();
  for (let i = 0; i < 3; i++) { game.invincible = 0;game.obstacles = [obstacle(game)];game.step(1 / 120); }
  assert.equal(game.lives, 0);assert.equal(game.state, 'over');
  const distance = game.distance;advance(game, 5);assert.equal(game.distance, distance);
  assert.equal(events.filter(e => e === 'over').length, 1);
});
test('pause freezes game and speed is capped during a long run', () => {
  const { game } = setup();advance(game, 2);game.state = 'paused';
  const before = game.distance;advance(game, 2);assert.equal(game.distance, before);
  game.distance = 100000;assert.equal(game.speed, RULES.maxSpeed);
});
test('random spawn schedules always leave at least 1.45 seconds between obstacles', () => {
  for (const random of [() => 0, () => .5, () => .999]) {
    const game = new Runner({ random });game.reset();game.player.x = -1000;
    let lastSpawn = 0;let spawns = 0;
    for(let i = 0; i < 120 * 45; i++) {
      const before = game.obstacleTimer;game.step(1 / 120);
      if (game.obstacleTimer > before) { if (lastSpawn) assert.ok(game.time - lastSpawn >= 1.44);lastSpawn = game.time;spawns++; }
    }
    assert.ok(spawns > 15);
  }
});
test('resizing preserves the character altitude and grounded collision geometry', () => {
  const { game } = setup();game.jump();advance(game, .2);
  const altitude = game.ground - game.player.y;
  game.resize(360, 330);assert.equal(game.ground - game.player.y, altitude);
  advance(game, .8);assert.equal(game.player.y + 64, game.ground);
});
