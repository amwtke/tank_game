class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = new ParticleSystem();
    this.mapCacheCanvas = document.createElement('canvas');
    this.mapCacheCtx = this.mapCacheCanvas.getContext('2d');
    this.mapCacheDirty = true;
    this.cachedTiles = null;
    this.needsResize = true;

    window.addEventListener('resize', () => {
      this.needsResize = true;
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        this.needsResize = true;
      });
    }
  }

  resize() {
    if (!this.needsResize && this.canvas.width > 0 && this.canvas.height > 0) {
      return false;
    }

    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    let changed = false;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      changed = true;
    }
    this.needsResize = false;
    return changed;
  }

  clear() {
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  invalidateMap() {
    this.mapCacheDirty = true;
  }

  _drawTile(ctx, tile, x, y, ts) {
    if (tile === C.TILE_EMPTY) {
      ctx.fillStyle = '#2a2a4a';
      ctx.fillRect(x, y, ts, ts);
      ctx.strokeStyle = '#333355';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, ts, ts);
      return;
    }

    if (tile === C.TILE_WALL) {
      ctx.fillStyle = '#555577';
      ctx.fillRect(x, y, ts, ts);
      ctx.fillStyle = '#666688';
      ctx.fillRect(x + 2, y + 2, ts - 4, 4);
      ctx.fillRect(x + 2, y + 2, 4, ts - 4);
      ctx.fillStyle = '#444466';
      ctx.fillRect(x + 2, y + ts - 6, ts - 4, 4);
      ctx.fillRect(x + ts - 6, y + 2, 4, ts - 4);
      return;
    }

    if (tile === C.TILE_BRICK) {
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(x, y, ts, ts);
      ctx.strokeStyle = '#705510';
      ctx.lineWidth = 1;
      const brickH = ts / 4;
      for (let row = 0; row < 4; row++) {
        const by = y + row * brickH;
        ctx.strokeRect(x, by, ts, brickH);
        const offset = row % 2 === 0 ? 0 : ts / 2;
        ctx.beginPath();
        ctx.moveTo(x + ts / 2 + offset, by);
        ctx.lineTo(x + ts / 2 + offset, by + brickH);
        ctx.stroke();
      }
    }
  }

  _ensureMapCache(tiles) {
    const mapW = C.MAP_COLS * C.TILE_SIZE;
    const mapH = C.MAP_ROWS * C.TILE_SIZE;
    if (this.mapCacheCanvas.width !== mapW || this.mapCacheCanvas.height !== mapH) {
      this.mapCacheCanvas.width = mapW;
      this.mapCacheCanvas.height = mapH;
      this.mapCacheDirty = true;
    }

    if (!this.mapCacheDirty && this.cachedTiles === tiles) {
      return;
    }

    const ctx = this.mapCacheCtx;
    ctx.clearRect(0, 0, mapW, mapH);
    for (let row = 0; row < C.MAP_ROWS; row++) {
      for (let col = 0; col < C.MAP_COLS; col++) {
        this._drawTile(ctx, tiles[row][col], col * C.TILE_SIZE, row * C.TILE_SIZE, C.TILE_SIZE);
      }
    }

    this.cachedTiles = tiles;
    this.mapCacheDirty = false;
  }

  drawMap(tiles, cameraX, cameraY) {
    this._ensureMapCache(tiles);
    this.ctx.drawImage(this.mapCacheCanvas, -cameraX, -cameraY);
  }

  drawTank(tank, cameraX, cameraY, isLocal, name) {
    if (!tank.alive) return;
    const x = tank.x - cameraX;
    const y = tank.y - cameraY;
    const r = C.TANK_RADIUS;
    const color = C.TEAM_COLORS[tank.team];
    const colorLight = C.TEAM_COLORS_LIGHT[tank.team];

    this.ctx.save();

    // Tank body (circle)
    this.ctx.translate(x, y);

    // Shadow
    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(2, 3, r, r * 0.8, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Body
    this.ctx.save();
    this.ctx.rotate(tank.bodyAngle);

    // Treads
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(-r - 2, -r - 4, r * 2 + 4, 6);
    this.ctx.fillRect(-r - 2, r - 2, r * 2 + 4, 6);

    this.ctx.restore();

    // Main body circle
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, r, 0, Math.PI * 2);
    this.ctx.fill();

    // Body highlight
    this.ctx.fillStyle = colorLight;
    this.ctx.beginPath();
    this.ctx.arc(-3, -3, r * 0.6, 0, Math.PI * 2);
    this.ctx.fill();

    // Turret
    this.ctx.save();
    this.ctx.rotate(tank.turretAngle);

    // Barrel
    this.ctx.fillStyle = '#444';
    this.ctx.fillRect(0, -3, C.TURRET_LENGTH, 6);
    this.ctx.fillStyle = '#555';
    this.ctx.fillRect(C.TURRET_LENGTH - 6, -4, 6, 8);

    this.ctx.restore();

    // Center dot
    this.ctx.fillStyle = colorLight;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 5, 0, Math.PI * 2);
    this.ctx.fill();

    // Local player indicator
    if (isLocal) {
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();
      this.ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    this.ctx.restore();

    // HP bar
    if (tank.hp < 100) {
      const barW = 40;
      const barH = 4;
      const barX = x - barW / 2;
      const barY = y - r - 12;
      this.ctx.fillStyle = '#333';
      this.ctx.fillRect(barX, barY, barW, barH);
      const hpPct = tank.hp / 100;
      this.ctx.fillStyle = hpPct > 0.5 ? '#4CAF50' : hpPct > 0.25 ? '#FF9800' : '#F44336';
      this.ctx.fillRect(barX, barY, barW * hpPct, barH);
    }

    // Player name
    if (name) {
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 10px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillText(name, x, y - r - (tank.hp < 100 ? 14 : 6));
    }
  }

  drawBullet(bullet, cameraX, cameraY) {
    const x = bullet.x - cameraX;
    const y = bullet.y - cameraY;
    const color = C.TEAM_COLORS_LIGHT[bullet.team];

    // Glow
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = 0.3;
    this.ctx.beginPath();
    this.ctx.arc(x, y, C.BULLET_RADIUS * 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Core
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(x, y, C.BULLET_RADIUS, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, C.BULLET_RADIUS * 0.6, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawHUD(state, remaining, playerId, players, facts) {
    const ctx = this.ctx;
    const w = this.canvas.width;

    // Timer
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(w / 2 - 40, 8, 80, 30);
    ctx.fillStyle = remaining < 30 ? '#F44336' : '#fff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, w / 2, 23);

    // Team scores (alive counts)
    const alive = { 0: 0, 1: 0 };
    if (state && state.tanks) {
      for (const t of state.tanks) {
        if (t.alive) alive[t.team]++;
      }
    }

    // Blue team
    ctx.fillStyle = C.TEAM_COLORS[0];
    ctx.fillRect(w / 2 - 130, 8, 80, 30);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`BLUE: ${alive[0]}`, w / 2 - 90, 23);

    // Red team
    ctx.fillStyle = C.TEAM_COLORS[1];
    ctx.fillRect(w / 2 + 50, 8, 80, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(`RED: ${alive[1]}`, w / 2 + 90, 23);

    ctx.restore();
    this.drawFactsPanel(facts);
  }

  drawFactsPanel(facts) {
    if (!facts) return;

    const ctx = this.ctx;
    const panelX = 10;
    const panelY = 10;
    const panelW = 160;
    const panelH = 112;
    const lines = [
      'FACTS',
      `FPS ${facts.fps}`,
      `STATE ${facts.stateUpdatesPerSec}/s`,
      `INPUT ${facts.inputsPerSec}/s`,
      `AGE ${facts.snapshotAgeMs}ms`,
      `TANKS ${facts.tanks}`,
      `BULLETS ${facts.bullets}`,
    ];

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = '#cfe3ff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], panelX + 10, panelY + 10 + i * 14);
    }
    ctx.restore();
  }

  drawMinimap(state, playerId, tiles, cameraX, cameraY) {
    const ctx = this.ctx;
    const mmSize = 120;
    const mmX = this.canvas.width - mmSize - 10;
    const mmY = 10;
    const scale = mmSize / (C.MAP_COLS * C.TILE_SIZE);

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#111';
    ctx.fillRect(mmX, mmY, mmSize, mmSize * (C.MAP_ROWS / C.MAP_COLS));

    // Walls
    const mmH = mmSize * (C.MAP_ROWS / C.MAP_COLS);
    for (let r = 0; r < C.MAP_ROWS; r++) {
      for (let c = 0; c < C.MAP_COLS; c++) {
        if (tiles[r][c] !== C.TILE_EMPTY) {
          ctx.fillStyle = tiles[r][c] === C.TILE_WALL ? '#555' : '#8B6914';
          ctx.fillRect(
            mmX + c * C.TILE_SIZE * scale,
            mmY + r * C.TILE_SIZE * scale,
            C.TILE_SIZE * scale,
            C.TILE_SIZE * scale
          );
        }
      }
    }

    // Tanks
    if (state && state.tanks) {
      for (const t of state.tanks) {
        if (!t.alive) continue;
        ctx.fillStyle = t.id === playerId ? '#fff' : C.TEAM_COLORS[t.team];
        ctx.beginPath();
        ctx.arc(mmX + t.x * scale, mmY + t.y * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Viewport box
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mmX + cameraX * scale,
      mmY + cameraY * scale,
      this.canvas.width * scale,
      this.canvas.height * scale
    );

    ctx.restore();
  }
}
