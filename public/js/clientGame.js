class ClientGame {
  constructor(renderer, input, network) {
    this.renderer = renderer;
    this.input = input;
    this.network = network;

    this.playerId = null;
    this.map = null;
    this.players = [];
    this.state = null;
    this.prevState = null;
    this.interpFactor = 0;
    this.lastStateTime = 0;
    this.remaining = 180;

    // View transform: scale map to fit screen
    this.scale = 1;
    this.scaleX = 1;
    this.scaleY = 1;
    this.offsetX = 0; // letterbox offset
    this.offsetY = 0;

    this.inputSeq = 0;
    this.inputSendInterval = 1000 / 30;
    this.lastInputSentAt = 0;
    this.lastSentInput = null;
    this.currentInput = {
      moveX: 0,
      moveY: 0,
      turretAngle: 0,
      firing: false,
    };
    this.predictedTank = null;
    this.playerMap = new Map();
    this.stateTankMap = new Map();
    this.prevStateTankMap = new Map();
    this.stateBulletMap = new Map();
    this.prevStateBulletMap = new Map();
    this.facts = {
      fps: 0,
      inputsPerSec: 0,
      stateUpdatesPerSec: 0,
      snapshotAgeMs: 0,
      tanks: 0,
      bullets: 0,
    };
    this.factsWindowStartedAt = 0;
    this.framesThisWindow = 0;
    this.inputsThisWindow = 0;
    this.stateUpdatesThisWindow = 0;

    this.running = false;
    this.lastFrameTime = 0;
  }

  start(data) {
    this.playerId = data.playerId;
    this.map = data.map;
    this.players = data.players;
    this.playerMap = new Map(data.players.map(player => [player.id, player]));
    this.state = data.state;
    this.prevState = data.state;
    this.stateTankMap = this._createEntityMap(data.state.tanks);
    this.prevStateTankMap = this.stateTankMap;
    this.stateBulletMap = this._createEntityMap(data.state.bullets);
    this.prevStateBulletMap = this.stateBulletMap;
    this.lastStateTime = performance.now();
    this.running = true;
    this.lastFrameTime = performance.now();
    this.factsWindowStartedAt = this.lastFrameTime;
    this.framesThisWindow = 0;
    this.inputsThisWindow = 0;
    this.stateUpdatesThisWindow = 0;
    this.facts = {
      fps: 0,
      inputsPerSec: 0,
      stateUpdatesPerSec: 0,
      snapshotAgeMs: 0,
      tanks: data.state.tanks ? data.state.tanks.length : 0,
      bullets: data.state.bullets ? data.state.bullets.length : 0,
    };
    this._syncPredictedTank();
    this.renderer.invalidateMap();

    this._loop();
  }

  onStateUpdate(data) {
    this.prevState = this.state;
    this.prevStateTankMap = this.stateTankMap;
    this.prevStateBulletMap = this.stateBulletMap;
    this.state = data.state;
    this.stateTankMap = this._createEntityMap(data.state.tanks);
    this.stateBulletMap = this._createEntityMap(data.state.bullets);
    this.remaining = data.remaining;
    this.lastStateTime = performance.now();
    this.interpFactor = 0;
    this.stateUpdatesThisWindow++;
    this._syncPredictedTank();

    if (data.events) {
      for (const evt of data.events) {
        switch (evt.type) {
          case 'tank_destroyed': {
            const dpos = this._getTankPos(evt.tankId, data.state);
            if (dpos) this.renderer.particles.explode(dpos.x, dpos.y);
            break;
          }
          case 'tank_hit': {
            const pos = this._getTankPos(evt.tankId, data.state);
            if (pos) this.renderer.particles.bulletHit(pos.x, pos.y, 0);
            break;
          }
          case 'brick_destroyed':
            this.renderer.particles.brickBreak(
              evt.col * C.TILE_SIZE + C.TILE_SIZE / 2,
              evt.row * C.TILE_SIZE + C.TILE_SIZE / 2
            );
            if (this.map && this.map.tiles[evt.row]) {
              this.map.tiles[evt.row][evt.col] = C.TILE_EMPTY;
              this.renderer.invalidateMap();
            }
            break;
        }
      }
    }
  }

  _createEntityMap(items) {
    const map = new Map();
    if (!items) return map;
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }

  _syncPredictedTank() {
    const myTank = this.stateTankMap.get(this.playerId);
    this.predictedTank = myTank ? { ...myTank } : null;
  }

  _getTankPos(tankId, state) {
    if (!state || !state.tanks) return null;
    const t = state.tanks.find(t => t.id === tankId);
    return t ? { x: t.x, y: t.y } : null;
  }

  stop() {
    this.running = false;
  }

  _updateScale() {
    const canvas = this.renderer.canvas;
    const mapW = C.MAP_COLS * C.TILE_SIZE;
    const mapH = C.MAP_ROWS * C.TILE_SIZE;
    // Stretch to fill entire screen (no letterbox)
    this.scaleX = canvas.width / mapW;
    this.scaleY = canvas.height / mapH;
    this.scale = this.scaleX; // for input compatibility, use average
    this.offsetX = 0;
    this.offsetY = 0;
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());

    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    this._processInput(now, dt);
    this._updateInterpolation(now);
    this._updateFacts(now);
    this._render();
  }

  _processInput(now, dt) {
    const myTank = this.predictedTank || this._getMyTank();
    this.input.update(myTank, this.scaleX, this.scaleY);

    const inp = this.input.getInput();
    this.currentInput = inp;
    this._predictLocalTank(dt, inp);

    if (!this._shouldSendInput(inp, now)) return;

    const payload = {
      moveX: inp.moveX,
      moveY: inp.moveY,
      turretAngle: inp.turretAngle,
      firing: inp.firing,
      seq: this.inputSeq++,
    };
    this.network.emit('player_input', payload);
    this.lastInputSentAt = now;
    this.lastSentInput = { ...inp, firing: false };
    this.inputsThisWindow++;
  }

  _updateInterpolation(now) {
    const elapsed = now - this.lastStateTime;
    this.interpFactor = Math.min(1, elapsed / 50);
  }

  _shouldSendInput(input, now) {
    if (input.firing) return true;
    if (!this.lastSentInput) return true;

    const moveChanged = input.moveX !== this.lastSentInput.moveX ||
                        input.moveY !== this.lastSentInput.moveY;
    if (moveChanged) return true;
    if ((now - this.lastInputSentAt) < this.inputSendInterval) return false;

    return !this._anglesClose(input.turretAngle, this.lastSentInput.turretAngle);
  }

  _anglesClose(a, b) {
    let diff = a - b;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < 0.02;
  }

  _predictLocalTank(dt, input) {
    if (!this.predictedTank || !this.predictedTank.alive || !this.map) return;

    this.predictedTank.turretAngle = input.turretAngle;

    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    if (mx === 0 && my === 0) return;

    this.predictedTank.bodyAngle = Math.atan2(my, mx);
    const newX = this.predictedTank.x + mx * C.TANK_SPEED * dt;
    const newY = this.predictedTank.y + my * C.TANK_SPEED * dt;
    const resolved = this._resolveCircleVsTile(newX, newY, C.TANK_RADIUS, this.map.tiles);
    this.predictedTank.x = resolved.x;
    this.predictedTank.y = resolved.y;
  }

  _updateFacts(now) {
    this.framesThisWindow++;
    this.facts.snapshotAgeMs = Math.max(0, Math.round(now - this.lastStateTime));
    this.facts.tanks = this.state && this.state.tanks ? this.state.tanks.length : 0;
    this.facts.bullets = this.state && this.state.bullets ? this.state.bullets.length : 0;

    const elapsed = now - this.factsWindowStartedAt;
    if (elapsed < 1000) return;

    const seconds = elapsed / 1000;
    this.facts.fps = Math.round(this.framesThisWindow / seconds);
    this.facts.inputsPerSec = Math.round(this.inputsThisWindow / seconds);
    this.facts.stateUpdatesPerSec = Math.round(this.stateUpdatesThisWindow / seconds);
    this.framesThisWindow = 0;
    this.inputsThisWindow = 0;
    this.stateUpdatesThisWindow = 0;
    this.factsWindowStartedAt = now;
  }

  _resolveCircleVsTile(cx, cy, radius, tiles) {
    const minCol = Math.max(0, Math.floor((cx - radius) / C.TILE_SIZE));
    const maxCol = Math.min(C.MAP_COLS - 1, Math.floor((cx + radius) / C.TILE_SIZE));
    const minRow = Math.max(0, Math.floor((cy - radius) / C.TILE_SIZE));
    const maxRow = Math.min(C.MAP_ROWS - 1, Math.floor((cy + radius) / C.TILE_SIZE));

    const resolved = { x: cx, y: cy };

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (tiles[row][col] === C.TILE_EMPTY) continue;

        const tileLeft = col * C.TILE_SIZE;
        const tileTop = row * C.TILE_SIZE;
        const tileRight = tileLeft + C.TILE_SIZE;
        const tileBottom = tileTop + C.TILE_SIZE;

        const closestX = Math.max(tileLeft, Math.min(resolved.x, tileRight));
        const closestY = Math.max(tileTop, Math.min(resolved.y, tileBottom));

        const dx = resolved.x - closestX;
        const dy = resolved.y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq >= radius * radius) continue;

        const dist = Math.sqrt(distSq);
        if (dist > 0) {
          const overlap = radius - dist;
          resolved.x += (dx / dist) * overlap;
          resolved.y += (dy / dist) * overlap;
          continue;
        }

        const overlapLeft = resolved.x + radius - tileLeft;
        const overlapRight = tileRight - (resolved.x - radius);
        const overlapTop = resolved.y + radius - tileTop;
        const overlapBottom = tileBottom - (resolved.y - radius);
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        if (minOverlap === overlapLeft) resolved.x = tileLeft - radius;
        else if (minOverlap === overlapRight) resolved.x = tileRight + radius;
        else if (minOverlap === overlapTop) resolved.y = tileTop - radius;
        else resolved.y = tileBottom + radius;
      }
    }

    return resolved;
  }

  _getMyTank() {
    return this.stateTankMap.get(this.playerId) || null;
  }

  _getInterpTank(tankId) {
    if (!this.state || !this.prevState) return null;
    const curr = this.stateTankMap.get(tankId);
    const prev = this.prevStateTankMap.get(tankId);
    if (!curr) return null;
    if (!prev) return curr;

    const f = this.interpFactor;
    return {
      ...curr,
      x: prev.x + (curr.x - prev.x) * f,
      y: prev.y + (curr.y - prev.y) * f,
      bodyAngle: this._lerpAngle(prev.bodyAngle, curr.bodyAngle, f),
      turretAngle: this._lerpAngle(prev.turretAngle, curr.turretAngle, f),
    };
  }

  _getInterpBullet(bulletId) {
    const curr = this.stateBulletMap.get(bulletId);
    const prev = this.prevStateBulletMap.get(bulletId);
    if (!curr) return null;
    if (!prev) return curr;

    const f = this.interpFactor;
    return {
      ...curr,
      x: prev.x + (curr.x - prev.x) * f,
      y: prev.y + (curr.y - prev.y) * f,
    };
  }

  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  _render() {
    const r = this.renderer;
    const ctx = r.ctx;

    r.resize();
    this._updateScale();
    r.clear();

    if (!this.state || !this.map) return;

    const shake = r.particles.getShakeOffset();
    ctx.save();

    // Apply view transform: stretch map to fill screen
    ctx.translate(shake.x, shake.y);
    ctx.scale(this.scaleX, this.scaleY);

    // Draw map (no camera offset - drawing in world coords now)
    r.drawMap(this.map.tiles, 0, 0);

    // Draw tanks
    for (const tankData of this.state.tanks) {
      const isLocal = tankData.id === this.playerId;
      const tank = isLocal ? (this.predictedTank || tankData) : (this._getInterpTank(tankData.id) || tankData);
      const player = this.playerMap.get(tankData.id);
      const name = player ? player.name : '';
      r.drawTank(tank, 0, 0, isLocal, name);
    }

    // Draw bullets
    if (this.state.bullets) {
      for (const bullet of this.state.bullets) {
        r.drawBullet(this._getInterpBullet(bullet.id) || bullet, 0, 0);
      }
    }

    // Particles (in world space)
    r.particles.update(1 / 60);
    r.particles.draw(ctx, 0, 0);

    ctx.restore();

    // HUD (screen space, no transform)
    r.drawHUD(this.state, this.remaining, this.playerId, this.players, this.facts);

    // Mobile controls (screen space)
    this.input.drawControls(ctx);
  }
}
