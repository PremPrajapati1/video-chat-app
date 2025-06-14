const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Enable CORS for your frontend's origin
app.use(cors({
  origin: "https://video-chat-client-9k8a.onrender.com", // Replace with actual frontend URL
  methods: ["GET", "POST"]
}));

// Serve static files from React build folder
app.use(express.static(path.join(__dirname, '../client/build')));

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "https://video-chat-client-9k8a.onrender.com", // Replace with actual frontend URL
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', { id: socket.id, username });
    console.log(`${username} joined room: ${roomId}`);
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat-message', ({ roomId, username, message }) => {
    socket.to(roomId).emit('chat-message', { username, message });
  });

  socket.on('leave-room', ({ roomId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit('user-left', socket.id);
  });

  socket.on('disconnect', () => {
    io.emit('user-left', socket.id);
    console.log(`User disconnected: ${socket.id}`);
  });
});

// --- SPA Fallback ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
