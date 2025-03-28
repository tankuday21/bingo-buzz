import io from 'socket.io-client';
import { toast } from 'react-hot-toast';

// Remove any trailing slashes from the URL
const baseUrl = (process.env.REACT_APP_SERVER_URL || 'https://bingo-buzz.up.railway.app').replace(/\/$/, '');
const SOCKET_URL = baseUrl;

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'], // Add polling as fallback
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  pingTimeout: 30000,
  pingInterval: 10000,
  forceNew: true,
  auth: {
    timestamp: Date.now()
  }
});

// Connection event handlers
socket.on('connect', () => {
  console.log('Socket connected with ID:', socket.id);
  reconnectAttempts = 0;
  toast.success('Connected to game server');
});

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason, 'Socket ID:', socket.id);
  
  // Handle different disconnect reasons
  if (reason === 'io server disconnect') {
    // Server initiated disconnect, try reconnecting
    socket.connect();
  } else if (reason === 'transport close' || reason === 'ping timeout') {
    toast.error('Connection lost. Attempting to reconnect...');
  } else {
    toast.error('Disconnected from server. Please refresh the page.');
  }
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Socket reconnected after', attemptNumber, 'attempts. New Socket ID:', socket.id);
  reconnectAttempts = 0;
  toast.success('Reconnected to game server');
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log('Attempting to reconnect:', attemptNumber, 'of', MAX_RECONNECT_ATTEMPTS);
  reconnectAttempts = attemptNumber;
  
  // Update auth data on reconnect attempt
  socket.auth = {
    timestamp: Date.now()
  };
});

socket.on('reconnect_error', (error) => {
  console.error('Reconnection error:', error);
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    toast.error('Unable to reconnect. Please refresh the page.');
  } else {
    toast.error(`Reconnection failed (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  }
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect after', MAX_RECONNECT_ATTEMPTS, 'attempts');
  toast.error('Connection failed. Please refresh the page.');
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
  toast.error('Connection error. Please refresh the page.');
});

// Connection health check
const healthCheck = setInterval(() => {
  if (socket.connected) {
    socket.emit('ping');
  } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    clearInterval(healthCheck);
    toast.error('Connection lost. Please refresh the page.');
  }
}, 25000);

// Clean up on unmount
window.addEventListener('beforeunload', () => {
  clearInterval(healthCheck);
  socket.disconnect();
});

export default socket;
