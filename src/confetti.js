const CONFETTI_COLORS = [
  '#f5d77f', // Gold Leaf
  '#d4a843', // Burnished Gold
  '#a62b2e', // Royal Crimson
  '#2d68a1', // Knight Sapphire
  '#35824a', // Sherwood Emerald
  '#f4ead5', // Ivory Parchment
  '#c96f2d', // Copper Amber
];

/**
 * Lightweight HiDPI canvas confetti celebration burst.
 */
export class ConfettiCannon {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.rafId = null;
    this.lastTime = 0;

    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  burst() {
    if (!this.ctx) return;
    this.resize();

    const count = Math.min(120, Math.max(60, Math.floor(this.width / 8)));
    const origins = [
      { x: this.width * 0.5, y: this.height * 0.42 },
      { x: this.width * 0.28, y: this.height * 0.48 },
      { x: this.width * 0.72, y: this.height * 0.48 },
    ];

    for (let i = 0; i < count; i++) {
      const origin = origins[i % origins.length];
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const speed = 340 + Math.random() * 520;
      const shape = Math.random() < 0.25 ? 'circle' : 'ribbon';

      this.particles.push({
        x: origin.x + (Math.random() - 0.5) * 24,
        y: origin.y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        size: 6 + Math.random() * 6,
        aspect: 0.45 + Math.random() * 0.45,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
        tiltPhase: Math.random() * Math.PI * 2,
        tiltSpeed: 6 + Math.random() * 6,
        alpha: 1,
        life: 0,
        maxLife: 2.2 + Math.random() * 1.1,
        shape,
      });
    }

    if (!this.rafId) {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  tick(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const gravity = 820;
    const drag = 0.985;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife || p.y > this.height + 40) {
        this.particles.splice(i, 1);
        continue;
      }

      p.vx *= Math.pow(drag, dt * 60);
      p.vy = p.vy * Math.pow(drag, dt * 60) + gravity * dt;
      p.x += p.vx * dt + Math.sin(p.life * 5 + p.tiltPhase) * 18 * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      p.tiltPhase += p.tiltSpeed * dt;

      const fadeStart = p.maxLife * 0.65;
      p.alpha = p.life > fadeStart ? Math.max(0, 1 - (p.life - fadeStart) / (p.maxLife - fadeStart)) : 1;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const flipScale = Math.cos(p.tiltPhase);
        ctx.scale(1, Math.max(0.2, Math.abs(flipScale)));
        ctx.fillRect(-p.size / 2, (-p.size * p.aspect) / 2, p.size, p.size * p.aspect);
      }
      ctx.restore();
    }

    if (this.particles.length > 0) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      ctx.clearRect(0, 0, this.width, this.height);
      this.rafId = null;
    }
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
