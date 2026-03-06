let network, ui, renderer, input, clientGame;

window.addEventListener('load', () => {
  const canvas = document.getElementById('gameCanvas');

  network = new Network();
  renderer = new Renderer(canvas);
  input = new InputManager(canvas);
  ui = new UI(network);
  clientGame = new ClientGame(renderer, input, network);

  // Make ui global for onclick handlers
  window.ui = ui;

  // Network handlers
  network.on('connect', () => {
    network.emit('get_rooms');
  });

  network.on('room_list', (rooms) => {
    if (ui.currentScreen === 'menu') {
      ui.showMenu(rooms);
    }
  });

  network.on('room_joined', (room) => {
    ui.showLobby(room);
  });

  network.on('room_update', (room) => {
    if (ui.currentScreen === 'lobby') {
      ui.showLobby(room);
    }
  });

  network.on('error_msg', (msg) => {
    alert(msg);
  });

  network.on('countdown', (count) => {
    ui.showCountdown(count);
  });

  network.on('game_start', (data) => {
    ui.showGame();
    clientGame.start(data);
  });

  network.on('state_update', (data) => {
    clientGame.onStateUpdate(data);
  });

  network.on('game_over', (data) => {
    clientGame.stop();
    ui.showGameOver(data.winner, clientGame.players, clientGame.playerId);
  });

  // Handle resize
  window.addEventListener('resize', () => {
    renderer.resize();
  });

  network.connect();
  ui.showMenu([]);
});
