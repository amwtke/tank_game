const express = require('express');
const http = require('http');
const os = require('os');
const { Server } = require('socket.io');
const GameServer = require('./server/GameServer');
const { PORT } = require('./server/constants');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(express.static('public'));

new GameServer(io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tank Battle server running on:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  // Print all LAN IPs
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  LAN:     http://${net.address}:${PORT}`);
      }
    }
  }
});
