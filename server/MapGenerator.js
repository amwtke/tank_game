const { MAP_COLS, MAP_ROWS, TILE_EMPTY, TILE_WALL, TILE_BRICK, BRICK_HP } = require('./constants');

class MapGenerator {
  static generate() {
    // Create empty map
    const tiles = [];
    for (let r = 0; r < MAP_ROWS; r++) {
      tiles[r] = [];
      for (let c = 0; c < MAP_COLS; c++) {
        tiles[r][c] = TILE_EMPTY;
      }
    }

    // Border walls
    for (let c = 0; c < MAP_COLS; c++) {
      tiles[0][c] = TILE_WALL;
      tiles[MAP_ROWS - 1][c] = TILE_WALL;
    }
    for (let r = 0; r < MAP_ROWS; r++) {
      tiles[r][0] = TILE_WALL;
      tiles[r][MAP_COLS - 1] = TILE_WALL;
    }

    // Symmetric obstacles - design left half, mirror to right
    const halfCol = Math.floor(MAP_COLS / 2);

    // Predefined symmetric layout
    const structures = [
      // Central pillars
      { r: 3, c: 5, type: TILE_WALL },
      { r: 4, c: 5, type: TILE_WALL },
      { r: 10, c: 5, type: TILE_WALL },
      { r: 11, c: 5, type: TILE_WALL },

      // Brick clusters near center
      { r: 3, c: 8, type: TILE_BRICK },
      { r: 4, c: 8, type: TILE_BRICK },
      { r: 5, c: 8, type: TILE_BRICK },
      { r: 9, c: 8, type: TILE_BRICK },
      { r: 10, c: 8, type: TILE_BRICK },
      { r: 11, c: 8, type: TILE_BRICK },

      // Center wall
      { r: 6, c: 9, type: TILE_WALL },
      { r: 7, c: 9, type: TILE_WALL },
      { r: 8, c: 9, type: TILE_WALL },

      // Side bricks
      { r: 7, c: 4, type: TILE_BRICK },
      { r: 7, c: 5, type: TILE_BRICK },

      // Cover near spawns
      { r: 2, c: 4, type: TILE_BRICK },
      { r: 12, c: 4, type: TILE_BRICK },

      // Additional obstacles
      { r: 5, c: 6, type: TILE_BRICK },
      { r: 9, c: 6, type: TILE_BRICK },
      { r: 7, c: 7, type: TILE_BRICK },
    ];

    // Place left half and mirror to right
    for (const s of structures) {
      tiles[s.r][s.c] = s.type;
      const mirrorCol = MAP_COLS - 1 - s.c;
      tiles[s.r][mirrorCol] = s.type;
    }

    // Generate brick HP map
    const brickHP = {};
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (tiles[r][c] === TILE_BRICK) {
          brickHP[`${r},${c}`] = BRICK_HP;
        }
      }
    }

    return { tiles, brickHP };
  }
}

module.exports = MapGenerator;
