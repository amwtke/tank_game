const Physics = require('./Physics');
const { TILE_SIZE, TANK_SPEED } = require('./constants');

const STATE = {
  IDLE: 'idle',
  ROAM: 'roam',
  CHASE: 'chase',
  ATTACK: 'attack',
  FLEE: 'flee',
};

// AI fire phases: same as player — adjust turret, then tap to fire
const FIRE_PHASE = {
  IDLE: 'idle',       // not trying to fire
  AIMING: 'aiming',   // adjusting turret direction (like holding dial)
  FIRE: 'fire',       // send fire pulse (like tapping)
  COOLDOWN: 'cooldown', // wait before next shot
};

class AIBot {
  constructor(id, gameState) {
    this.id = id;
    this.gameState = gameState;
    this.state = STATE.IDLE;
    this.target = null;
    this.roamTarget = null;
    this.stateTimer = 0;
    this.lastUpdate = Date.now();
    this.aimJitter = (Math.random() - 0.5) * (Math.PI / 36);
    this.jitterTimer = 0;

    // Fire state machine (mirrors player behavior)
    this.firePhase = FIRE_PHASE.IDLE;
    this.firePhaseTimer = 0;
    this.aimTime = 0;
    this.cooldownTime = 0;

    // Stuck detection
    this.lastPosX = 0;
    this.lastPosY = 0;
    this.stuckTimer = 0;
    this.stuckEscapeAngle = 0;
    this.isStuck = false;
  }

  _startAiming() {
    this.firePhase = FIRE_PHASE.AIMING;
    this.firePhaseTimer = 0;
    // Random aim time: 0.2s ~ 0.6s (like a human adjusting the dial)
    this.aimTime = 0.2 + Math.random() * 0.4;
  }

  _startCooldown() {
    this.firePhase = FIRE_PHASE.COOLDOWN;
    this.firePhaseTimer = 0;
    // Random pause between shots: 0.3s ~ 0.8s (like human tapping rhythm)
    this.cooldownTime = 0.3 + Math.random() * 0.5;
  }

  update() {
    const now = Date.now();
    const dt = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    const tank = this.gameState.tanks.get(this.id);
    if (!tank || !tank.alive) return;

    this.stateTimer += dt;
    this.firePhaseTimer += dt;
    this.jitterTimer += dt;

    if (this.jitterTimer > 0.5) {
      this.aimJitter = (Math.random() - 0.5) * (Math.PI / 36);
      this.jitterTimer = 0;
    }

    // Find closest enemy
    let closest = null;
    let closestDist = Infinity;
    for (const other of this.gameState.tanks.values()) {
      if (other.id === this.id || !other.alive || other.team === tank.team) continue;
      const dx = other.x - tank.x;
      const dy = other.y - tank.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = other;
      }
    }

    this.target = closest;

    // State transitions
    switch (this.state) {
      case STATE.IDLE:
        if (this.stateTimer > 0.5) {
          this.state = closest ? STATE.CHASE : STATE.ROAM;
          this.stateTimer = 0;
        }
        break;
      case STATE.ROAM:
        if (closest && closestDist < 400) {
          this.state = STATE.CHASE;
          this.stateTimer = 0;
        } else if (!this.roamTarget || this.stateTimer > 3) {
          this._pickRoamTarget(tank);
          this.stateTimer = 0;
        }
        break;
      case STATE.CHASE:
        if (!closest) {
          this.state = STATE.ROAM;
          this.stateTimer = 0;
        } else if (closestDist < 250 && Physics.hasLineOfSight(
          tank.x, tank.y, closest.x, closest.y, this.gameState.map.tiles
        )) {
          this.state = STATE.ATTACK;
          this.stateTimer = 0;
        } else if (tank.hp < 30) {
          this.state = STATE.FLEE;
          this.stateTimer = 0;
        }
        break;
      case STATE.ATTACK:
        if (!closest || !closest.alive) {
          this.state = STATE.IDLE;
          this.stateTimer = 0;
        } else if (closestDist > 350) {
          this.state = STATE.CHASE;
          this.stateTimer = 0;
        } else if (tank.hp < 25) {
          this.state = STATE.FLEE;
          this.stateTimer = 0;
        }
        break;
      case STATE.FLEE:
        if (!closest || tank.hp > 50) {
          this.state = STATE.ROAM;
          this.stateTimer = 0;
        } else if (this.stateTimer > 3) {
          this.state = STATE.CHASE;
          this.stateTimer = 0;
        }
        break;
    }

    // Build input
    const input = { moveX: 0, moveY: 0, turretAngle: tank.turretAngle, firing: false };
    let canSeeEnemy = false;

    switch (this.state) {
      case STATE.IDLE:
        break;

      case STATE.ROAM:
        if (this.roamTarget) {
          const dx = this.roamTarget.x - tank.x;
          const dy = this.roamTarget.y - tank.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < TILE_SIZE) {
            this._pickRoamTarget(tank);
          } else {
            input.moveX = dx / dist;
            input.moveY = dy / dist;
          }
        }
        if (closest) {
          input.turretAngle = this._getAimAngle(tank, closest, closestDist);
          if (closestDist < 350 && Physics.hasLineOfSight(
            tank.x, tank.y, closest.x, closest.y, this.gameState.map.tiles
          )) {
            canSeeEnemy = true;
          }
        }
        break;

      case STATE.CHASE:
        if (closest) {
          const dx = closest.x - tank.x;
          const dy = closest.y - tank.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          input.moveX = dx / dist;
          input.moveY = dy / dist;
          input.turretAngle = this._getAimAngle(tank, closest, dist);
          if (Physics.hasLineOfSight(tank.x, tank.y, closest.x, closest.y, this.gameState.map.tiles)) {
            canSeeEnemy = true;
          }
        }
        break;

      case STATE.ATTACK:
        if (closest) {
          const dx = closest.x - tank.x;
          const dy = closest.y - tank.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const perpX = -dy / dist;
          const perpY = dx / dist;
          const strafeDir = Math.sin(now / 1000) > 0 ? 1 : -1;
          input.moveX = perpX * strafeDir;
          input.moveY = perpY * strafeDir;
          if (dist < 120) {
            input.moveX -= dx / dist * 0.5;
            input.moveY -= dy / dist * 0.5;
          }
          input.turretAngle = this._getAimAngle(tank, closest, dist);
          if (Physics.hasLineOfSight(tank.x, tank.y, closest.x, closest.y, this.gameState.map.tiles)) {
            canSeeEnemy = true;
          }
        }
        break;

      case STATE.FLEE:
        if (closest) {
          const dx = tank.x - closest.x;
          const dy = tank.y - closest.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          input.moveX = dx / dist;
          input.moveY = dy / dist;
          input.turretAngle = Math.atan2(closest.y - tank.y, closest.x - tank.x) + this.aimJitter;
          canSeeEnemy = true;
        }
        break;
    }

    // Fire state machine: aim → tap(fire) → cooldown → aim → ...
    if (canSeeEnemy) {
      switch (this.firePhase) {
        case FIRE_PHASE.IDLE:
          this._startAiming();
          break;
        case FIRE_PHASE.AIMING:
          if (this.firePhaseTimer >= this.aimTime) {
            // Tap! Fire one shot
            this.firePhase = FIRE_PHASE.FIRE;
          }
          break;
        case FIRE_PHASE.FIRE:
          input.firing = true;
          this._startCooldown();
          break;
        case FIRE_PHASE.COOLDOWN:
          if (this.firePhaseTimer >= this.cooldownTime) {
            this._startAiming();
          }
          break;
      }
    } else {
      // Lost sight → reset
      this.firePhase = FIRE_PHASE.IDLE;
      this.firePhaseTimer = 0;
    }

    // Stuck detection: if barely moved for 1+ seconds, pick a random escape direction
    const movedDist = Math.sqrt(
      (tank.x - this.lastPosX) ** 2 + (tank.y - this.lastPosY) ** 2
    );
    if (movedDist < 2 && (input.moveX !== 0 || input.moveY !== 0)) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.0) {
        this.isStuck = true;
        this.stuckEscapeAngle = Math.random() * Math.PI * 2;
        this.stuckTimer = 0;
        // Force a new roam target
        this._pickRoamTarget(tank);
      }
    } else {
      this.stuckTimer = 0;
      this.isStuck = false;
    }
    this.lastPosX = tank.x;
    this.lastPosY = tank.y;

    // If stuck, override movement with escape direction
    if (this.isStuck) {
      input.moveX = Math.cos(this.stuckEscapeAngle);
      input.moveY = Math.sin(this.stuckEscapeAngle);
    }

    // Obstacle avoidance
    if (input.moveX !== 0 || input.moveY !== 0) {
      const checkDist = TILE_SIZE;
      const aheadX = tank.x + input.moveX * checkDist;
      const aheadY = tank.y + input.moveY * checkDist;
      if (Physics.pointInTile(aheadX, aheadY, this.gameState.map.tiles)) {
        const alt1 = { x: -input.moveY, y: input.moveX };
        const alt2 = { x: input.moveY, y: -input.moveX };
        const c1x = tank.x + alt1.x * checkDist;
        const c1y = tank.y + alt1.y * checkDist;
        const c2x = tank.x + alt2.x * checkDist;
        const c2y = tank.y + alt2.y * checkDist;
        const b1 = Physics.pointInTile(c1x, c1y, this.gameState.map.tiles);
        const b2 = Physics.pointInTile(c2x, c2y, this.gameState.map.tiles);
        if (!b1) {
          input.moveX = alt1.x;
          input.moveY = alt1.y;
        } else if (!b2) {
          input.moveX = alt2.x;
          input.moveY = alt2.y;
        } else {
          // All 3 directions blocked → reverse
          input.moveX = -input.moveX;
          input.moveY = -input.moveY;
        }
      }
    }

    this.gameState.applyInput(this.id, input);
  }

  _getAimAngle(tank, target, dist) {
    const travelTime = dist / 400;
    const predictX = target.x + (target.moveX || 0) * TANK_SPEED * travelTime;
    const predictY = target.y + (target.moveY || 0) * TANK_SPEED * travelTime;
    return Math.atan2(predictY - tank.y, predictX - tank.x) + this.aimJitter;
  }

  _pickRoamTarget(tank) {
    const { MAP_COLS, MAP_ROWS } = require('./constants');
    for (let attempt = 0; attempt < 10; attempt++) {
      const col = 2 + Math.floor(Math.random() * (MAP_COLS - 4));
      const row = 2 + Math.floor(Math.random() * (MAP_ROWS - 4));
      if (this.gameState.map.tiles[row][col] === 0) {
        this.roamTarget = {
          x: col * TILE_SIZE + TILE_SIZE / 2,
          y: row * TILE_SIZE + TILE_SIZE / 2,
        };
        return;
      }
    }
  }
}

module.exports = AIBot;
