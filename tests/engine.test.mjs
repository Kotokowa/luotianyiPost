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
function obstacle(game, x = game.player.x + 31) { return { x, y: game.ground - 45, w: 32, h: 45, type: 'fork', hit: false }; }

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
  item.x = game.player.x + 31;game.obstacles.push(obstacle(game));
  game.step(1 / 120);assert.equal(game.lives, 2);assert.equal(events.filter(e => e === 'hurt').length, 1);
  advance(game, RULES.invincibility + .05);game.obstacles = [obstacle(game)];game.step(1 / 120);assert.equal(game.lives, 1);
});
test('a bun heals once, is removed, and never exceeds three hearts', () => {
  const { game, events } = setup();game.lives = 2;
  const bun = () => ({ x: game.player.x + 36, y: game.ground - 44, w: 28, h: 24 });
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
test('random spawn schedules keep the late-run interval above the density cap', () => {
  for (const random of [() => 0, () => .5, () => .999]) {
    const game = new Runner({ random });game.reset();game.player.x = -1000;
    let lastSpawn = 0;let spawns = 0;
    for(let i = 0; i < 120 * 45; i++) {
      const before = game.obstacleTimer;game.step(1 / 120);
      if (game.obstacleTimer > before) { if (lastSpawn) assert.ok(game.time - lastSpawn >= RULES.obstacleGap / 1.5 - .01);lastSpawn = game.time;spawns++; }
    }
    assert.ok(spawns > 15);
  }
});
test('resizing preserves the character altitude and grounded collision geometry', () => {
  const { game } = setup();game.jump();advance(game, .2);
  const altitude = game.ground - game.player.y;
  game.resize(360, 330);assert.equal(game.ground - game.player.y, altitude);
  advance(game, .8);assert.equal(game.player.y + RULES.playerHeight, game.ground);
});

function cloud(game, height = 77) {
  return { x: game.player.x + 31, y: game.ground - height, w: 64, h: 34, type: 'cloud', hit: false };
}

test('low flying clouds hit standing players, clear slides, and hit again after standing up', () => {
  const standing = setup().game;
  standing.obstacles.push(cloud(standing));standing.step(1 / 120);
  assert.equal(standing.lives, 2);
  const sliding = setup().game;
  sliding.duck(true);sliding.obstacles.push(cloud(sliding));sliding.step(1 / 120);
  assert.equal(sliding.lives, 3);assert.equal(sliding.ducking, true);
  assert.equal(sliding.playerBox().h, RULES.slideHeight - 2);
  sliding.duck(false);sliding.step(1 / 120);
  assert.equal(sliding.lives, 2);assert.equal(sliding.ducking, false);
});

test('sliding does not avoid cutlery, and held duck input cannot queue a jump', () => {
  const { game } = setup();game.duck(true);game.jump();game.step(1 / 120);
  assert.equal(game.player.grounded, true);
  game.obstacles.push(obstacle(game));game.step(1 / 120);assert.equal(game.lives, 2);
  game.duck(false);advance(game, .2);assert.equal(game.player.grounded, true);
});

test('high clouds clear a standing player but can hit a jumping player', () => {
  const { game } = setup();game.obstacles.push(cloud(game, 126));game.step(1 / 120);
  assert.equal(game.lives, 3);
  game.jump();advance(game, .12);
  game.obstacles = [cloud(game, 126)];game.step(1 / 120);
  assert.equal(game.lives, 2);
});

test('airborne duck accelerates landing without using the ground slide collision box', () => {
  const normal = setup().game, fast = setup().game;
  normal.jump();fast.jump();advance(normal, .2);advance(fast, .2);
  fast.duck(true);assert.equal(fast.ducking, false);
  advance(normal, .15);advance(fast, .15);
  assert.ok(fast.player.vy > normal.player.vy);
  assert.ok(fast.player.y > normal.player.y);
  advance(fast, .6);assert.equal(fast.ducking, true);
});

test('speed rises with score, mobile pace leaves reaction time, and reset restores daytime', () => {
  const { game } = setup();const initial = game.speed;
  game.distance = 400 * 12;assert.ok(game.speed > initial);assert.equal(game.night, 1);
  game.distance = 620 * 12;assert.equal(game.night, 0);
  game.resize(320, 330);game.distance = 100000;
  assert.ok((game.width - game.player.x - 64) / game.speed > .38);
  assert.equal(game.pace,3.5);assert.equal(game.density,1.5);
  game.duck(true);game.reset();assert.equal(game.night, 0);assert.equal(game.duckHeld, false);
});

test('late-run density grows to 1.5 while bun cadence stays unchanged', () => {
  const counts=[];
  for (const score of [0,2000]) {
    const game = new Runner({ random:()=>.5 });game.reset();game.player.x=-10000;
    let obstacles=0,buns=0;
    for (let i=0;i<120*60;i++) {
      game.distance=score*12;
      const beforeObstacle=game.obstacleTimer,beforeBun=game.bunTimer;
      game.step(1/120);
      if (game.obstacleTimer>beforeObstacle) obstacles++;
      if (game.bunTimer>beforeBun) buns++;
    }
    counts.push({obstacles,buns});
  }
  assert.equal(counts[0].buns,counts[1].buns);
  assert.ok(counts[1].obstacles/counts[0].obstacles>1.4 && counts[1].obstacles/counts[0].obstacles<1.6);
  const {game}=setup();game.distance=1000*12;
  assert.equal(game.density,1.25);game.distance=0;assert.equal(game.density,1);
});

test('night transitions are gradual, repeat, and emit one event per boundary', () => {
  const { game, events } = setup();
  game.distance = 320 * 12;assert.equal(game.night, .5);game.step(1 / 120);game.step(1 / 120);
  assert.equal(events.filter(e => e === 'night').length, 1);
  game.distance = 581 * 12;game.step(1 / 120);game.step(1 / 120);
  assert.equal(events.filter(e => e === 'day').length, 1);
  game.distance = 1200 * 12;assert.equal(game.night, 1);
});

test('flying cloud bobbing keeps collision boxes below standing heads and above slides after resize', () => {
  const game = new Runner({ random: () => 0 });game.reset();game.distance = 100 * 12;
  game.obstacleTimer = 0;game.bunTimer = 999;game.step(1 / 120);
  const flying = game.obstacles[0];assert.equal(flying.type, 'cloud');
  game.resize(360, 330);const base = flying.baseY;
  for (let i = 0; i < 120; i++) {
    flying.x = game.width;game.step(1 / 120);
    assert.ok(Math.abs(flying.y - base) <= 3);
    game.duck(true);assert.ok(game.obstacleBox(flying).y + game.obstacleBox(flying).h < game.playerBox().y);
    game.duck(false);
  }
});

test('mixed obstacle runs remain playable through acceleration and night on desktop and mobile', () => {
  for (const width of [960, 360]) {
    let seed = 317;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const game = new Runner({ width, random });game.reset();
    let sawCloud = false, sawNight = false;
    for (let i = 0; i < 120 * 100; i++) {
      const box = game.playerBox();
      const next = game.obstacles.find(item => item.x + item.w > box.x && !item.hit);
      if (next) {
        const gap = game.obstacleBox(next).x - (game.player.x + 64);
        const arrival = gap / game.speed;
        const lowCloud = next.type === 'cloud' && next.y > game.ground - 100;
        game.duck(lowCloud && arrival < .55);
        if (next.type !== 'cloud' && arrival < .28 && arrival > 0 && game.player.grounded) game.jump();
        sawCloud ||= next.type === 'cloud';
      } else game.duck(false);
      game.step(1 / 120);
      sawNight ||= game.night === 1;
      assert.equal(game.lives, 3, `width ${width}, score ${game.score}`);
    }
    assert.ok(sawCloud && sawNight);assert.ok(game.score > 1200);
  }
});
