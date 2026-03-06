const { TICK_RATE, BROADCAST_RATE, GAME_DURATION } = require('./constants');

class GameLoop {
  constructor(gameState, broadcastFn, gameOverFn) {
    this.gameState = gameState;
    this.broadcastFn = broadcastFn;
    this.gameOverFn = gameOverFn;
    this.running = false;
    this.tickInterval = null;
    this.broadcastInterval = null;
    this.startTime = 0;
    this.tickDt = 1 / TICK_RATE;
  }

  start() {
    this.running = true;
    this.startTime = Date.now();

    this.tickInterval = setInterval(() => {
      if (!this.running) return;
      const now = Date.now();
      this.gameState.update(this.tickDt, now);

      // Check game over
      const result = this.gameState.checkGameOver();
      const elapsed = (now - this.startTime) / 1000;
      if (result.over) {
        this.gameOverFn(result.winner);
        this.stop();
      } else if (elapsed >= GAME_DURATION) {
        // Time up - team with more total HP wins
        let hp0 = 0, hp1 = 0;
        for (const t of this.gameState.tanks.values()) {
          if (t.alive) {
            if (t.team === 0) hp0 += t.hp;
            else hp1 += t.hp;
          }
        }
        this.gameOverFn(hp0 >= hp1 ? 0 : 1);
        this.stop();
      }
    }, 1000 / TICK_RATE);

    this.broadcastInterval = setInterval(() => {
      if (!this.running) return;
      const elapsed = (Date.now() - this.startTime) / 1000;
      const remaining = Math.max(0, GAME_DURATION - elapsed);
      this.broadcastFn(this.gameState.serialize(), this.gameState.flushEvents(), remaining);
    }, 1000 / BROADCAST_RATE);
  }

  stop() {
    this.running = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
  }
}

module.exports = GameLoop;
