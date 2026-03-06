const { BULLET_SPEED, BULLET_RADIUS, BULLET_DAMAGE } = require('./constants');

let nextBulletId = 0;

class Bullet {
  constructor(ownerId, x, y, angle, team) {
    this.id = nextBulletId++;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.team = team;
    this.speed = BULLET_SPEED;
    this.radius = BULLET_RADIUS;
    this.damage = BULLET_DAMAGE;
    this.alive = true;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      ownerId: this.ownerId,
      team: this.team,
    };
  }
}

module.exports = Bullet;
