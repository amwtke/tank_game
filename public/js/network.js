class Network {
  constructor() {
    this.socket = null;
    this.handlers = {};
  }

  connect() {
    this.socket = io();

    const events = [
      'room_list', 'room_joined', 'room_update', 'error_msg',
      'countdown', 'game_start', 'state_update', 'game_over',
    ];
    for (const evt of events) {
      this.socket.on(evt, (data) => {
        if (this.handlers[evt]) this.handlers[evt](data);
      });
    }

    this.socket.on('connect', () => {
      console.log('Connected:', this.socket.id);
      if (this.handlers.connect) this.handlers.connect();
    });
  }

  on(event, handler) {
    this.handlers[event] = handler;
  }

  emit(event, data) {
    if (this.socket) this.socket.emit(event, data);
  }

  get id() {
    return this.socket ? this.socket.id : null;
  }
}
