const Tank = require('./Tank');
const Bullet = require('./Bullet');
const Physics = require('./Physics');
const { TILE_SIZE, TILE_BRICK, TILE_EMPTY, TURRET_LENGTH, BULLET_DAMAGE, SPAWNS } = require('./constants');

class GameState {
  constructor(map) {
    this.map = map; // { tiles, brickHP }
    this.tanks = new Map();
    this.bullets = [];
    this.events = []; // events to broadcast this tick
  }

  addTank(id, team, slotIndex) {
    const spawn = SPAWNS[team][slotIndex];
    const x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    const y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    const tank = new Tank(id, x, y, team);
    // Face toward center
    tank.bodyAngle = team === 0 ? 0 : Math.PI;
    tank.turretAngle = tank.bodyAngle;
    this.tanks.set(id, tank);
    return tank;
  }

  applyInput(playerId, input) {
    const tank = this.tanks.get(playerId);
    if (!tank || !tank.alive) return;
    tank.moveX = input.moveX || 0;
    tank.moveY = input.moveY || 0;
    tank.turretAngle = input.turretAngle != null ? input.turretAngle : tank.turretAngle;
    // One-shot fire: if client sends firing=true, queue it (don't overwrite with false)
    if (input.firing) {
      tank.fireRequested = true;
    }
  }

  flushEvents() {
    const evts = this.events;
    this.events = [];
    return evts;
  }

  update(dt, now) {

    // Update tanks
    for (const tank of this.tanks.values()) {
      if (!tank.alive) continue;
      this._updateTank(tank, dt);
    }

    // Resolve tank-tank collisions
    const tankArr = [...this.tanks.values()].filter(t => t.alive);
    for (let i = 0; i < tankArr.length; i++) {
      for (let j = i + 1; j < tankArr.length; j++) {
        const res = Physics.resolveCircleVsCircle(
          tankArr[i].x, tankArr[i].y, tankArr[i].radius,
          tankArr[j].x, tankArr[j].y, tankArr[j].radius
        );
        if (res) {
          tankArr[i].x = res.x1;
          tankArr[i].y = res.y1;
          tankArr[j].x = res.x2;
          tankArr[j].y = res.y2;
        }
      }
    }

    // Fire bullets
    for (const tank of this.tanks.values()) {
      if (tank.canFire(now)) {
        this._fireBullet(tank, now);
      }
    }

    // Update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.update(dt);

      // Check wall collision
      if (Physics.pointInTile(bullet.x, bullet.y, this.map.tiles)) {
        const col = Math.floor(bullet.x / TILE_SIZE);
        const row = Math.floor(bullet.y / TILE_SIZE);
        if (row >= 0 && col >= 0 && this.map.tiles[row] && this.map.tiles[row][col] === TILE_BRICK) {
          const key = `${row},${col}`;
          this.map.brickHP[key] = (this.map.brickHP[key] || 0) - 1;
          if (this.map.brickHP[key] <= 0) {
            this.map.tiles[row][col] = TILE_EMPTY;
            this.events.push({ type: 'brick_destroyed', row, col });
          }
        }
        this._removeBullet(i, bullet);
        continue;
      }

      // Check tank collision
      let hitTank = false;
      for (const tank of this.tanks.values()) {
        if (!tank.alive) continue;
        if (tank.id === bullet.ownerId) continue;
        if (tank.team === bullet.team) continue;
        if (Physics.circleVsCircle(bullet.x, bullet.y, bullet.radius, tank.x, tank.y, tank.radius)) {
          tank.takeDamage(bullet.damage);
          this.events.push({
            type: 'tank_hit',
            tankId: tank.id,
            bulletId: bullet.id,
            hp: tank.hp,
          });
          if (!tank.alive) {
            this.events.push({
              type: 'tank_destroyed',
              tankId: tank.id,
              killerId: bullet.ownerId,
            });
          }
          this._removeBullet(i, bullet);
          hitTank = true;
          break;
        }
      }
    }
  }

  _updateTank(tank, dt) {
    if (tank.moveX === 0 && tank.moveY === 0) return;

    // Normalize diagonal movement
    let mx = tank.moveX;
    let my = tank.moveY;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) { mx /= mag; my /= mag; }

    // Update body angle to face movement direction
    tank.bodyAngle = Math.atan2(my, mx);

    const newX = tank.x + mx * tank.speed * dt;
    const newY = tank.y + my * tank.speed * dt;

    // Resolve against tiles
    const resolved = Physics.circleVsTile(newX, newY, tank.radius, this.map.tiles);
    tank.x = resolved.x;
    tank.y = resolved.y;
  }

  _fireBullet(tank, now) {
    tank.fireRequested = false; // consume one-shot
    tank.lastFireTime = now;
    tank.activeBullets++;
    const spawnDist = tank.radius + 10;
    const bx = tank.x + Math.cos(tank.turretAngle) * spawnDist;
    const by = tank.y + Math.sin(tank.turretAngle) * spawnDist;
    const bullet = new Bullet(tank.id, bx, by, tank.turretAngle, tank.team);
    this.bullets.push(bullet);
    this.events.push({
      type: 'bullet_fired',
      bullet: bullet.serialize(),
      ownerId: tank.id,
    });
  }

  _removeBullet(index, bullet) {
    bullet.alive = false;
    this.bullets.splice(index, 1);
    const tank = this.tanks.get(bullet.ownerId);
    if (tank) tank.activeBullets = Math.max(0, tank.activeBullets - 1);
  }

  checkGameOver() {
    const teamAlive = { 0: 0, 1: 0 };
    for (const tank of this.tanks.values()) {
      if (tank.alive) teamAlive[tank.team]++;
    }
    if (teamAlive[0] === 0) return { over: true, winner: 1 };
    if (teamAlive[1] === 0) return { over: true, winner: 0 };
    return { over: false };
  }

  serialize() {
    const tanks = [];
    for (const t of this.tanks.values()) {
      tanks.push(t.serialize());
    }
    const bullets = this.bullets.map(b => b.serialize());
    return { tanks, bullets };
  }
}

module.exports = GameState;
