const { TILE_SIZE, TILE_EMPTY, TILE_WALL, TILE_BRICK, MAP_COLS, MAP_ROWS } = require('./constants');

class Physics {
  static circleVsTile(cx, cy, radius, tiles) {
    // Check all tiles the circle could overlap
    const minCol = Math.max(0, Math.floor((cx - radius) / TILE_SIZE));
    const maxCol = Math.min(MAP_COLS - 1, Math.floor((cx + radius) / TILE_SIZE));
    const minRow = Math.max(0, Math.floor((cy - radius) / TILE_SIZE));
    const maxRow = Math.min(MAP_ROWS - 1, Math.floor((cy + radius) / TILE_SIZE));

    let resolved = { x: cx, y: cy, hit: false, hitTiles: [] };

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (tiles[r][c] === TILE_EMPTY) continue;

        const tileLeft = c * TILE_SIZE;
        const tileTop = r * TILE_SIZE;
        const tileRight = tileLeft + TILE_SIZE;
        const tileBottom = tileTop + TILE_SIZE;

        // Find closest point on tile rect to circle center
        const closestX = Math.max(tileLeft, Math.min(resolved.x, tileRight));
        const closestY = Math.max(tileTop, Math.min(resolved.y, tileBottom));

        const dx = resolved.x - closestX;
        const dy = resolved.y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < radius * radius) {
          resolved.hit = true;
          resolved.hitTiles.push({ r, c, type: tiles[r][c] });

          // Push circle out of tile
          const dist = Math.sqrt(distSq);
          if (dist > 0) {
            const overlap = radius - dist;
            resolved.x += (dx / dist) * overlap;
            resolved.y += (dy / dist) * overlap;
          } else {
            // Circle center is inside tile, push out on shortest axis
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
      }
    }

    return resolved;
  }

  static circleVsCircle(x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distSq = dx * dx + dy * dy;
    const minDist = r1 + r2;
    return distSq < minDist * minDist;
  }

  static pointInTile(x, y, tiles) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return true;
    return tiles[row][col] !== TILE_EMPTY;
  }

  static resolveCircleVsCircle(x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = r1 + r2;
    if (dist >= minDist || dist === 0) return null;
    const overlap = minDist - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    return {
      x1: x1 - nx * overlap * 0.5,
      y1: y1 - ny * overlap * 0.5,
      x2: x2 + nx * overlap * 0.5,
      y2: y2 + ny * overlap * 0.5,
    };
  }

  static hasLineOfSight(x1, y1, x2, y2, tiles) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(dist / (TILE_SIZE * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      if (Physics.pointInTile(px, py, tiles)) return false;
    }
    return true;
  }
}

module.exports = Physics;
