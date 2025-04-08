import { io } from 'socket.io-client';

// Determine the server URL based on environment
const SERVER_URL = process.env.NODE_ENV === 'production'
  ? 'https://bingo-buzz-server.vercel.app' // Production server
  : 'http://localhost:3001'; // Development server

// Create socket instance with options
export const socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['websocket', 'polling']
});

// Add global error handler
socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Log connection events in development
if (process.env.NODE_ENV !== 'production') {
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });
  
  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });
}

export default socket;
