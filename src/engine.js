export const RULES = Object.freeze({ gravity: 1540, jump: -600, maxLives: 3, invincibility: 1.45, maxSpeed: 390 });

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
  get speed() { return Math.min(RULES.maxSpeed, 215 + this.distance / 210); }
  reset() {
    this.state = 'running';
    this.distance = 0;
    this.time = 0;
    this.lives = 3;
    this.invincible = 0;
    this.player = { x: Math.min(115, this.width * .19), y: this.ground - 64, vy: 0, grounded: true };
    this.obstacles = [];
    this.buns = [];
    this.particles = [];
    this.obstacleTimer = 1.8;
    this.bunTimer = 3.6;
    this.jumpBuffer = 0;
    this.onEvent('reset');
  }
  resize(width, height) {
    const difference = height - this.height;
    this.width = width;
    this.height = height;
    this.player.x = Math.min(115, width * .19);
    this.player.y += difference;
    for (const item of [...this.obstacles, ...this.buns, ...this.particles]) item.y += difference;
  }
  jump() {
    if (this.state !== 'running') return;
    this.jumpBuffer = .12;
  }
  playerBox() {
    return { x: this.player.x + 13, y: this.player.y + 14, w: 24, h: 48 };
  }
  obstacleBox(item) {
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
    p.y += p.vy * dt;
    if (p.y >= this.ground - 64) {
      p.y = this.ground - 64;
      p.vy = 0;
      p.grounded = true;
    }
    this.obstacleTimer -= dt;
    this.bunTimer -= dt;
    if (this.obstacleTimer <= 0) {
      const type = this.random() < .52 ? 'fork' : 'knife';
      const h = type === 'fork' ? 45 : 41;
      this.obstacles.push({ x: this.width + 40, y: this.ground - h, w: 32, h, type, hit: false });
      this.obstacleTimer = 1.45 + this.random() * .7;
    }
    if (this.bunTimer <= 0 && this.obstacleTimer > .75) {
      const elevation = this.random() < .5 ? 48 : 93;
      this.buns.push({ x: this.width + 40, y: this.ground - elevation, w: 28, h: 24, phase: this.random() * Math.PI * 2 });
      this.bunTimer = 4.4 + this.random() * 2.6;
    }
    for (const o of this.obstacles) o.x -= move;
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
