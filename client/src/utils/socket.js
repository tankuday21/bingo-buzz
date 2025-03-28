import io from 'socket.io-client';
import { toast } from 'react-hot-toast';

// Remove any trailing slashes from the URL
const baseUrl = (process.env.REACT_APP_SERVER_URL || 'https://bingo-buzz.up.railway.app').replace(/\/$/, '');
const SOCKET_URL = baseUrl;

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'], // Add polling as fallback
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity, // Keep trying to reconnect
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  pingTimeout: 30000,
  pingInterval: 10000
});

// Connection event handlers
socket.on('connect', () => {
  console.log('Socket connected');
  toast.success('Connected to game server');
});

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason);
  toast.error('Connection lost. Attempting to reconnect...');
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Socket reconnected after', attemptNumber, 'attempts');
  toast.success('Reconnected to game server');
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log('Attempting to reconnect:', attemptNumber);
});

socket.on('reconnect_error', (error) => {
  console.error('Reconnection error:', error);
  toast.error('Failed to reconnect. Please refresh the page.');
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect');
  toast.error('Connection failed. Please refresh the page.');
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
  toast.error('Connection error. Please refresh the page.');
});

// Ping mechanism to keep connection alive
setInterval(() => {
  if (socket.connected) {
    socket.emit('ping');
  }
}, 25000);

export default socket;
