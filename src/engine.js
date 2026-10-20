export const RULES = Object.freeze({ gravity: 1540, jump: -600, maxLives: 3, invincibility: 1.45, baseSpeed: 230, maxSpeed: 450, playerHeight: 88, slideHeight: 34, obstacleGap: 1.45 });

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class Runner {
  constructor({ width = 960, height = 390, random = Math.random, onEvent = () => {} } = {}) {
    this.width = width;
    this.height = height;
    this.random = random;
    this.onEvent = onEvent;
    this.reset();
    this.state = 'idle';
  }
  get ground() { return this.height - 65; }
  get score() { return Math.floor(this.distance / 12); }
  get speed() { return Math.min(RULES.maxSpeed, RULES.baseSpeed + this.score * .16) * this.viewportPace; }
  get viewportPace() { return Math.min(1, Math.max(.66, this.width / 720)); }
  get pace() { return Math.min(RULES.maxSpeed, RULES.baseSpeed + this.score * .16) / RULES.baseSpeed; }
  get ducking() { return this.duckHeld && this.player.grounded; }
  get night() {
    const cycle = this.score % 800;
    const value = Math.max(0, Math.min(1, (cycle - 300) / 40, (600 - cycle) / 40));
    return value * value * (3 - 2 * value);
  }
  reset() {
    this.state = 'running';
    this.distance = 0;
    this.time = 0;
    this.lives = 3;
    this.invincible = 0;
    this.player = { x: Math.min(100, this.width * .15), y: this.ground - RULES.playerHeight, vy: 0, grounded: true };
    this.obstacles = [];
    this.buns = [];
    this.particles = [];
    this.obstacleTimer = 1.8;
    this.bunTimer = 3.6;
    this.jumpBuffer = 0;
    this.duckHeld = false;
    this.milestone = 0;
    this.wasNight = false;
    this.onEvent('reset');
  }
  resize(width, height) {
    const difference = height - this.height;
    this.width = width;
    this.height = height;
    this.player.x = Math.min(100, width * .15);
    this.player.y += difference;
    for (const item of [...this.obstacles, ...this.buns, ...this.particles]) {
      item.y += difference;
      if (Number.isFinite(item.baseY)) item.baseY += difference;
    }
  }
  jump() {
    if (this.state !== 'running' || this.duckHeld) return;
    this.jumpBuffer = .12;
  }
  duck(held) {
    this.duckHeld = Boolean(held) && this.state === 'running';
    if (this.duckHeld) this.jumpBuffer = 0;
  }
  playerBox() {
    if (this.ducking) return { x: this.player.x + 28, y: this.ground - RULES.slideHeight, w: 48, h: RULES.slideHeight - 2 };
    return { x: this.player.x + 36, y: this.player.y + 14, w: 28, h: RULES.playerHeight - 16 };
  }
  obstacleBox(item) {
    if (item.type === 'cloud') return { x: item.x + 8, y: item.y + 6, w: item.w - 16, h: item.h - 11 };
    return { x: item.x + 7, y: item.y + 5, w: item.w - 14, h: item.h - 5 };
  }
  bunBox(item) {
    return { x: item.x - 3, y: item.y - 3, w: 34, h: 30 };
  }
  burst(x, y, color, count = 9) {
    for (let i = 0; i < count; i++) this.particles.push({ x, y, vx: (this.random() - .5) * 150, vy: -35 - this.random() * 110, life: .6, color });
  }
  step(dt) {
    if (this.state !== 'running') return;
    dt = Math.min(Math.max(dt, 0), 1 / 60);
    this.time += dt;
    const move = this.speed * dt;
    this.distance += move;
    const milestone = Math.floor(this.score / 200);
    if (milestone > this.milestone) { this.milestone = milestone; this.onEvent('faster'); }
    const isNight = this.night >= .5;
    if (isNight !== this.wasNight) { this.wasNight = isNight; this.onEvent(isNight ? 'night' : 'day'); }
    this.invincible = Math.max(0, this.invincible - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    const p = this.player;
    if (this.jumpBuffer > 0 && p.grounded) {
      p.vy = RULES.jump;
      p.grounded = false;
      this.jumpBuffer = 0;
      this.onEvent('jump');
    }
    p.vy += RULES.gravity * dt;
    if (this.duckHeld && !p.grounded) p.vy += RULES.gravity * 1.6 * dt;
    p.y += p.vy * dt;
    if (p.y >= this.ground - RULES.playerHeight) {
      p.y = this.ground - RULES.playerHeight;
      p.vy = 0;
      p.grounded = true;
    }
    this.obstacleTimer -= dt;
    this.bunTimer -= dt;
    if (this.obstacleTimer <= 0) {
      const flying = this.score >= 70 && this.random() < .38;
      const type = flying ? 'cloud' : this.random() < .52 ? 'fork' : 'knife';
      const h = flying ? 34 : type === 'fork' ? 45 : 41;
      const baseY = flying ? this.ground - (this.score >= 160 && this.random() < .25 ? 126 : 77) : this.ground - h;
      this.obstacles.push({ x: this.width + 40, y: baseY, baseY, w: flying ? 64 : 32, h, type, hit: false, phase: this.random() * Math.PI * 2 });
      this.obstacleTimer = RULES.obstacleGap + this.random() * .7;
    }
    if (this.bunTimer <= 0 && this.obstacleTimer > .75) {
      const elevation = this.random() < .5 ? 48 : 132;
      this.buns.push({ x: this.width + 40, y: this.ground - elevation, w: 28, h: 24, phase: this.random() * Math.PI * 2 });
      this.bunTimer = 4.4 + this.random() * 2.6;
    }
    for (const o of this.obstacles) {
      o.x -= move;
      if (o.type === 'cloud' && Number.isFinite(o.baseY)) o.y = o.baseY + Math.sin(this.time * 4 + o.phase) * 3;
    }
    for (const b of this.buns) b.x -= move;
    const box = this.playerBox();
    for (const bun of this.buns) {
      if (!bun.collected && overlaps(box, this.bunBox(bun))) {
        bun.collected = true;
        const before = this.lives;
        this.lives = Math.min(RULES.maxLives, this.lives + 1);
        this.burst(bun.x + 14, bun.y, '#ffce83');
        this.onEvent(this.lives > before ? 'heal' : 'full');
      }
    }
    for (const obstacle of this.obstacles) {
      if (!obstacle.hit && this.invincible <= 0 && overlaps(box, this.obstacleBox(obstacle))) {
        obstacle.hit = true;
        this.lives--;
        this.invincible = RULES.invincibility;
        this.burst(p.x + 25, p.y + 32, '#6cf', 12);
        this.onEvent('hurt');
        if (this.lives <= 0) {
          this.state = 'over';
          this.onEvent('over');
          break;
        }
      }
    }
    this.obstacles = this.obstacles.filter(o => o.x + o.w > -30);
    this.buns = this.buns.filter(b => b.x + b.w > -30 && !b.collected);
    for (const item of this.particles) {
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vy += 260 * dt;
      item.life -= dt;
    }
    this.particles = this.particles.filter(particle => particle.life > 0);
  }
}
