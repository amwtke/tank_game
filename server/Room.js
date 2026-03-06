const GameState = require('./GameState');
const GameLoop = require('./GameLoop');
const MapGenerator = require('./MapGenerator');
const AIBot = require('./AIBot');
const { COUNTDOWN_SECONDS, MAX_PLAYERS } = require('./constants');

let nextRoomId = 1;

class Room {
  constructor(name, mode, io) {
    this.id = String(nextRoomId++);
    this.name = name;
    this.mode = mode; // '1v1', '2v2', '3v3'
    this.io = io;
    this.state = 'lobby'; // lobby | countdown | playing | ended
    this.players = new Map(); // socketId -> { socket, name, team, slot, ready }
    this.bots = [];
    this.gameState = null;
    this.gameLoop = null;
    this.countdownTimer = null;

    const parts = mode.split('v');
    this.teamSize = parseInt(parts[0]);
    this.maxPlayers = this.teamSize * 2;
  }

  get playerCount() { return this.players.size; }

  addPlayer(socket, name) {
    if (this.players.size >= this.maxPlayers) return false;
    if (this.state !== 'lobby') return false;

    // Assign team (balance)
    let team0 = 0, team1 = 0;
    for (const p of this.players.values()) {
      if (p.team === 0) team0++;
      else team1++;
    }
    const team = team0 <= team1 ? 0 : 1;
    const slot = team === 0 ? team0 : team1;

    this.players.set(socket.id, { socket, name, team, slot, ready: false });
    socket.join(this.id);
    this._broadcastRoomState();
    return true;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    this.players.delete(socketId);

    if (this.state === 'lobby') {
      if (this.countdownTimer) {
        clearTimeout(this.countdownTimer);
        this.countdownTimer = null;
        this.state = 'lobby';
      }
      this._broadcastRoomState();
    } else if (this.state === 'playing') {
      // Tank stays but player disconnected
      this._broadcastRoomState();
    }
  }

  setReady(socketId, ready) {
    const player = this.players.get(socketId);
    if (!player) return;
    player.ready = ready;
    this._broadcastRoomState();
  }

  startGame() {
    if (this.state !== 'lobby') return;

    // Fill empty slots with bots
    this._fillBots();

    this.state = 'countdown';
    this._broadcastRoomState();

    let count = COUNTDOWN_SECONDS;
    this.io.to(this.id).emit('countdown', count);

    this.countdownTimer = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this._beginGame();
      } else {
        this.io.to(this.id).emit('countdown', count);
      }
    }, 1000);
  }

  _fillBots() {
    let team0Count = 0, team1Count = 0;
    for (const p of this.players.values()) {
      if (p.team === 0) team0Count++;
      else team1Count++;
    }

    while (team0Count < this.teamSize) {
      const botId = `bot_${this.id}_0_${team0Count}`;
      this.bots.push({ id: botId, team: 0, slot: team0Count, name: `Bot ${team0Count + 1}` });
      team0Count++;
    }
    while (team1Count < this.teamSize) {
      const botId = `bot_${this.id}_1_${team1Count}`;
      this.bots.push({ id: botId, team: 1, slot: team1Count, name: `Bot ${team1Count + 1}` });
      team1Count++;
    }
  }

  _beginGame() {
    const map = MapGenerator.generate();
    this.gameState = new GameState(map);

    // Add player tanks
    for (const [sid, p] of this.players) {
      this.gameState.addTank(sid, p.team, p.slot);
    }

    // Add bot tanks
    const botControllers = [];
    for (const bot of this.bots) {
      this.gameState.addTank(bot.id, bot.team, bot.slot);
      botControllers.push(new AIBot(bot.id, this.gameState));
    }

    this.state = 'playing';

    // Send game_start
    const initState = this.gameState.serialize();
    const playerList = [];
    for (const [sid, p] of this.players) {
      playerList.push({ id: sid, name: p.name, team: p.team });
    }
    for (const bot of this.bots) {
      playerList.push({ id: bot.id, name: bot.name, team: bot.team, isBot: true });
    }

    for (const [sid, p] of this.players) {
      p.socket.emit('game_start', {
        map: { tiles: map.tiles, brickHP: map.brickHP },
        state: initState,
        players: playerList,
        playerId: sid,
      });
    }

    // Game loop
    this.gameLoop = new GameLoop(
      this.gameState,
      (state, events, remaining) => {
        this.io.to(this.id).emit('state_update', { state, events, remaining });
        // Update bots
        for (const bc of botControllers) {
          bc.update();
        }
      },
      (winner) => {
        this.state = 'ended';
        this.io.to(this.id).emit('game_over', { winner });
      }
    );
    this.gameLoop.start();
  }

  handleInput(socketId, input) {
    if (this.state !== 'playing' || !this.gameState) return;
    this.gameState.applyInput(socketId, input);
  }

  destroy() {
    if (this.gameLoop) this.gameLoop.stop();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  serialize() {
    const players = [];
    for (const [sid, p] of this.players) {
      players.push({ id: sid, name: p.name, team: p.team, ready: p.ready });
    }
    return {
      id: this.id,
      name: this.name,
      mode: this.mode,
      state: this.state,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
      players,
    };
  }

  _broadcastRoomState() {
    this.io.to(this.id).emit('room_update', this.serialize());
  }
}

module.exports = Room;
