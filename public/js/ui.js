class UI {
  constructor(network) {
    this.network = network;
    this.currentScreen = 'menu'; // menu | lobby | game | gameover
    this.roomData = null;
    this.playerName = this._loadPlayerName();
    this.gameOverData = null;
    this._isReady = false;

    this.overlay = document.getElementById('overlay');
    this.gameCanvas = document.getElementById('gameCanvas');
  }

  showMenu(rooms) {
    this.currentScreen = 'menu';
    this.gameCanvas.style.display = 'none';

    let roomListHTML = '';
    if (rooms && rooms.length > 0) {
      for (const room of rooms) {
        roomListHTML += `
          <div class="room-item" onclick="ui.joinRoom('${room.id}')">
            <span class="room-name">${this._esc(room.name)}</span>
            <span class="room-info">${room.mode} | ${room.playerCount}/${room.maxPlayers}</span>
          </div>`;
      }
    } else {
      roomListHTML = '<div class="empty-msg">No rooms available. Create one!</div>';
    }

    this.overlay.innerHTML = `
      <div class="menu-container">
        <h1 class="game-title">TANK BATTLE</h1>
        <div class="name-input-group">
          <input type="text" id="playerName" placeholder="Your name" maxlength="12"
                 value="${this._esc(this.playerName)}" class="text-input"
                 oninput="ui.setPlayerName(this.value)" />
        </div>
        <div class="create-room-section">
          <h3>Create Room</h3>
          <input type="text" id="roomName" placeholder="Room name" maxlength="20" class="text-input" />
          <div class="mode-buttons">
            <button class="btn btn-mode" onclick="ui.createRoom('1v1')">1v1</button>
            <button class="btn btn-mode" onclick="ui.createRoom('2v2')">2v2</button>
            <button class="btn btn-mode" onclick="ui.createRoom('3v3')">3v3</button>
          </div>
        </div>
        <div class="room-list-section">
          <h3>Rooms</h3>
          <div class="room-list">${roomListHTML}</div>
          <button class="btn btn-refresh" onclick="ui.refreshRooms()">Refresh</button>
        </div>
      </div>`;
    this.overlay.style.display = 'flex';
  }

  showLobby(room) {
    this.currentScreen = 'lobby';
    this.roomData = room;
    this.gameCanvas.style.display = 'none';
    const me = room.players.find(p => p.id === this.network.id) || null;
    const isOwner = !!me && room.ownerId === me.id;
    this._isReady = !!me && me.ready;

    const team0 = room.players.filter(p => p.team === 0);
    const team1 = room.players.filter(p => p.team === 1);

    const renderTeam = (team, players, teamName) => {
      let html = `<div class="team-panel team-${team}">
        <h3>${teamName}</h3>`;
      for (const p of players) {
        const readyClass = p.ready ? 'ready' : '';
        const ownerBadge = p.id === room.ownerId ? '<span class="owner-badge">HOST</span>' : '';
        const readyMark = p.ready ? '✓' : '';
        html += `<div class="player-slot ${readyClass}">${this._esc(p.name)} ${ownerBadge} ${readyMark}</div>`;
      }
      // Empty slots
      const parts = room.mode.split('v');
      const teamSize = parseInt(parts[0]);
      for (let i = players.length; i < teamSize; i++) {
        html += `<div class="player-slot empty">AI Bot</div>`;
      }
      html += `</div>`;
      return html;
    };

    this.overlay.innerHTML = `
      <div class="lobby-container">
        <h2>${this._esc(room.name)} <span class="mode-badge">${room.mode}</span></h2>
        <div class="teams-row">
          ${renderTeam(0, team0, 'Blue Team')}
          <div class="vs-divider">VS</div>
          ${renderTeam(1, team1, 'Red Team')}
        </div>
        <div class="lobby-meta">${isOwner ? 'You are the room creator and can start the match.' : 'Only the room creator can start the match.'}</div>
        <div class="lobby-actions">
          <button class="btn btn-ready" onclick="ui.toggleReady()">${this._isReady ? 'Cancel Ready' : 'Ready'}</button>
          <button class="btn btn-start" onclick="ui.startGame()" ${isOwner ? '' : 'disabled'}>${isOwner ? 'Start Game' : 'Host Only'}</button>
          <button class="btn btn-leave" onclick="ui.leaveRoom()">Leave</button>
        </div>
      </div>`;
    this.overlay.style.display = 'flex';
  }

  showGame() {
    this.currentScreen = 'game';
    this.overlay.style.display = 'none';
    this.gameCanvas.style.display = 'block';
  }

  showCountdown(count) {
    this.overlay.innerHTML = `
      <div class="countdown-container">
        <div class="countdown-number">${count}</div>
      </div>`;
    this.overlay.style.display = 'flex';
    this.gameCanvas.style.display = 'block';
  }

  showGameOver(winner, players, playerId) {
    this.currentScreen = 'gameover';
    const myTeam = players.find(p => p.id === playerId)?.team;
    const won = myTeam === winner;

    this.overlay.innerHTML = `
      <div class="gameover-container">
        <h1 class="${won ? 'victory' : 'defeat'}">${won ? 'VICTORY!' : 'DEFEAT'}</h1>
        <p>${C.TEAM_NAMES[winner]} wins!</p>
        <button class="btn btn-primary" onclick="ui.returnToMenu()">Back to Menu</button>
      </div>`;
    this.overlay.style.display = 'flex';
  }

  // Actions
  createRoom(mode) {
    const playerName = this._resolvePlayerName();
    const roomNameInput = document.getElementById('roomName')?.value || '';
    const roomName = roomNameInput.trim() || `${playerName}'s room`;
    this.network.emit('create_room', { name: roomName, mode, playerName });
  }

  joinRoom(roomId) {
    const playerName = this._resolvePlayerName();
    this.network.emit('join_room', { roomId, playerName });
  }

  refreshRooms() {
    this.network.emit('get_rooms');
  }

  toggleReady() {
    this._isReady = !this._isReady;
    this.network.emit('player_ready', { ready: this._isReady });
  }

  startGame() {
    this.network.emit('start_game');
  }

  leaveRoom() {
    this._isReady = false;
    this.network.emit('leave_room');
    this.network.emit('get_rooms');
  }

  returnToMenu() {
    this.currentScreen = 'menu';
    this._isReady = false;
    this.gameCanvas.style.display = 'none';
    this.network.emit('return_to_lobby');
    this.network.emit('get_rooms');
  }

  setPlayerName(value) {
    this.playerName = this._normalizeName(value, false);
    try {
      localStorage.setItem('tankBattlePlayerName', this.playerName);
    } catch (err) {
      // Ignore storage failures and keep the in-memory name.
    }
  }

  _resolvePlayerName() {
    const raw = document.getElementById('playerName')?.value ?? this.playerName;
    const playerName = this._normalizeName(raw, true);
    this.setPlayerName(playerName);
    return playerName;
  }

  _normalizeName(value, fallbackToDefault) {
    const name = String(value || '').trim().slice(0, 12);
    if (name) return name;
    return fallbackToDefault ? 'Player' : '';
  }

  _loadPlayerName() {
    try {
      return this._normalizeName(localStorage.getItem('tankBattlePlayerName') || '', false);
    } catch (err) {
      return '';
    }
  }

  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
