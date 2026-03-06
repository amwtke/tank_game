const Room = require('./Room');

class GameServer {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();

    io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);

      socket.on('get_rooms', () => {
        socket.emit('room_list', this._getRoomList());
      });

      socket.on('create_room', ({ name, mode, playerName }) => {
        const room = new Room(name || `Room ${this.rooms.size + 1}`, mode || '1v1', this.io);
        this.rooms.set(room.id, room);
        room.addPlayer(socket, playerName || 'Player');
        socket.currentRoom = room.id;
        socket.emit('room_joined', room.serialize());
        this.io.emit('room_list', this._getRoomList());
      });

      socket.on('join_room', ({ roomId, playerName }) => {
        const room = this.rooms.get(roomId);
        if (!room) return socket.emit('error_msg', 'Room not found');
        if (!room.addPlayer(socket, playerName || 'Player')) {
          return socket.emit('error_msg', 'Room is full or game in progress');
        }
        socket.currentRoom = room.id;
        socket.emit('room_joined', room.serialize());
        this.io.emit('room_list', this._getRoomList());
      });

      socket.on('leave_room', () => {
        this._leaveRoom(socket);
      });

      socket.on('player_ready', ({ ready }) => {
        const room = this.rooms.get(socket.currentRoom);
        if (room) room.setReady(socket.id, ready);
      });

      socket.on('start_game', () => {
        const room = this.rooms.get(socket.currentRoom);
        if (!room) return;
        const result = room.startGame(socket.id);
        if (!result.ok) {
          socket.emit('error_msg', result.error);
        }
      });

      socket.on('player_input', (input) => {
        const room = this.rooms.get(socket.currentRoom);
        if (room) room.handleInput(socket.id, input);
      });

      socket.on('return_to_lobby', () => {
        this._leaveRoom(socket);
      });

      socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        this._leaveRoom(socket);
      });
    });
  }

  _leaveRoom(socket) {
    const roomId = socket.currentRoom;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    socket.leave(roomId);
    room.removePlayer(socket.id);
    socket.currentRoom = null;

    // Clean up empty rooms
    if (room.playerCount === 0) {
      room.destroy();
      this.rooms.delete(roomId);
    }
    this.io.emit('room_list', this._getRoomList());
  }

  _getRoomList() {
    const list = [];
    for (const room of this.rooms.values()) {
      if (room.state === 'lobby' || room.state === 'countdown') {
        list.push(room.serialize());
      }
    }
    return list;
  }
}

module.exports = GameServer;
