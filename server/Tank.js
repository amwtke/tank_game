const { TANK_HP, TANK_SPEED, TANK_RADIUS, FIRE_COOLDOWN, MAX_BULLETS } = require('./constants');

class Tank {
  constructor(id, x, y, team) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.team = team;
    this.hp = TANK_HP;
    this.alive = true;
    this.speed = TANK_SPEED;
    this.radius = TANK_RADIUS;

    // Movement
    this.moveX = 0;
    this.moveY = 0;
    this.bodyAngle = 0;

    // Turret
    this.turretAngle = 0;

    // Shooting - one-shot model
    this.fireRequested = false; // one-shot flag, consumed after firing
    this.lastFireTime = 0;
    this.activeBullets = 0;
  }

  canFire(now) {
    return this.alive &&
           this.fireRequested &&
           this.activeBullets < MAX_BULLETS &&
           (now - this.lastFireTime) >= FIRE_COOLDOWN;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      hp: this.hp,
      alive: this.alive,
      team: this.team,
      bodyAngle: this.bodyAngle,
      turretAngle: this.turretAngle,
    };
  }
}

module.exports = Tank;
