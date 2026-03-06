module.exports = {
  // Server
  TICK_RATE: 60,
  BROADCAST_RATE: 20,
  PORT: 3000,

  // Map
  TILE_SIZE: 64,
  MAP_COLS: 20,
  MAP_ROWS: 15,
  TILE_EMPTY: 0,
  TILE_WALL: 1,         // indestructible
  TILE_BRICK: 2,        // destructible
  BRICK_HP: 3,

  // Tank
  TANK_HP: 100,
  TANK_SPEED: 150,       // px/s
  TANK_RADIUS: 20,
  TURRET_LENGTH: 28,

  // Bullet
  BULLET_SPEED: 400,     // px/s
  BULLET_RADIUS: 4,
  BULLET_DAMAGE: 25,
  FIRE_COOLDOWN: 500,    // ms
  MAX_BULLETS: 3,

  // Game
  GAME_DURATION: 180,    // seconds (3 min)
  COUNTDOWN_SECONDS: 3,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 6,

  // Team colors
  TEAM_COLORS: {
    0: '#4A90D9',  // blue team
    1: '#D94A4A',  // red team
  },

  // Spawn points per team (in tile coords)
  SPAWNS: {
    0: [
      { col: 2, row: 2 },
      { col: 2, row: 7 },
      { col: 2, row: 12 },
    ],
    1: [
      { col: 17, row: 2 },
      { col: 17, row: 7 },
      { col: 17, row: 12 },
    ],
  },
};
