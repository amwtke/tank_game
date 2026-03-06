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
    this.offsetX = 0; // letterbox offset
    this.offsetY = 0;

    this.pendingInputs = [];
    this.inputSeq = 0;

    this.running = false;
    this.lastFrameTime = 0;
  }

  start(data) {
    this.playerId = data.playerId;
    this.map = data.map;
    this.players = data.players;
    this.state = data.state;
    this.prevState = data.state;
    this.lastStateTime = performance.now();
    this.running = true;
    this.lastFrameTime = performance.now();

    this._loop();
  }

  onStateUpdate(data) {
    this.prevState = this.state;
    this.state = data.state;
    this.remaining = data.remaining;
    this.lastStateTime = performance.now();
    this.interpFactor = 0;

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
            }
            break;
        }
      }
    }
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

    this._processInput();
    this._updateInterpolation(now);
    this._render();
  }

  _processInput() {
    const myTank = this._getMyTank();
    this.input.update(myTank, this.scaleX, this.scaleY);

    const inp = this.input.getInput();
    inp.seq = this.inputSeq++;

    this.network.emit('player_input', inp);
  }

  _updateInterpolation(now) {
    const elapsed = now - this.lastStateTime;
    this.interpFactor = Math.min(1, elapsed / 50);
  }

  _getMyTank() {
    if (!this.state || !this.state.tanks) return null;
    return this.state.tanks.find(t => t.id === this.playerId);
  }

  _getInterpTank(tankId) {
    if (!this.state || !this.prevState) return null;
    const curr = this.state.tanks.find(t => t.id === tankId);
    const prev = this.prevState.tanks.find(t => t.id === tankId);
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
      const tank = isLocal ? tankData : (this._getInterpTank(tankData.id) || tankData);
      const player = this.players.find(p => p.id === tankData.id);
      const name = player ? player.name : '';
      r.drawTank(tank, 0, 0, isLocal, name);
    }

    // Draw bullets
    if (this.state.bullets) {
      for (const bullet of this.state.bullets) {
        r.drawBullet(bullet, 0, 0);
      }
    }

    // Particles (in world space)
    r.particles.update(1 / 60);
    r.particles.draw(ctx, 0, 0);

    ctx.restore();

    // HUD (screen space, no transform)
    r.drawHUD(this.state, this.remaining, this.playerId, this.players);

    // Mobile controls (screen space)
    this.input.drawControls(ctx);
  }
}
