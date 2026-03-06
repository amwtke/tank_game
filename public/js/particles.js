class ParticleSystem {
  constructor() {
    this.particles = [];
    this.screenShake = 0;
  }

  emit(x, y, count, color, speed, life) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: life * (0.5 + Math.random() * 0.5),
        maxLife: life,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }

  explode(x, y) {
    this.emit(x, y, 20, '#FF6600', 200, 0.6);
    this.emit(x, y, 10, '#FFAA00', 150, 0.4);
    this.emit(x, y, 5, '#FF0000', 100, 0.8);
    this.screenShake = 8;
  }

  bulletHit(x, y, team) {
    const color = team === 0 ? '#6AB0F9' : '#F96A6A';
    this.emit(x, y, 6, color, 100, 0.3);
  }

  brickBreak(x, y) {
    this.emit(x, y, 12, '#8B6914', 120, 0.5);
    this.emit(x, y, 6, '#A08050', 80, 0.4);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
    if (this.screenShake > 0) {
      this.screenShake *= 0.85;
      if (this.screenShake < 0.5) this.screenShake = 0;
    }
  }

  draw(ctx, cameraX, cameraY) {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - cameraX, p.y - cameraY, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  getShakeOffset() {
    if (this.screenShake <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.screenShake * 2,
      y: (Math.random() - 0.5) * this.screenShake * 2,
    };
  }
}
